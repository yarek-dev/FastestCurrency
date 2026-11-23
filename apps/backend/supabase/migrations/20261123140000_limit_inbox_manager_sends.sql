alter table private.inbox_manager_actions add column reserved_at timestamptz;
update private.inbox_manager_actions set reserved_at = expires_at - interval '45 seconds';
alter table private.inbox_manager_actions alter column reserved_at set not null;
alter table private.inbox_manager_actions alter column reserved_at set default clock_timestamp();

create index inbox_manager_actions_reserved_at_idx
    on private.inbox_manager_actions (reserved_at desc);
create index inbox_manager_actions_actor_reserved_at_idx
    on private.inbox_manager_actions (actor_id, reserved_at desc);

create or replace function public.begin_inbox_manager_action(
    p_client_id bigint, p_request_id uuid, p_actor_id uuid, p_action text, p_body text
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
    target public.clients%rowtype;
    previous private.inbox_manager_actions%rowtype;
    reservation_time timestamptz;
    rate_window constant interval := interval '1 minute';
    admin_limit constant integer := 15;
    bot_limit constant integer := 60;
    admin_cutoff timestamptz;
    bot_cutoff timestamptz;
    retry_at timestamptz;
begin
    if not exists (select 1 from public.inbox_admins where user_id = p_actor_id) then
        return jsonb_build_object('status', 'forbidden');
    end if;
    select * into target from public.clients where id = p_client_id for update;
    if not found then
        return jsonb_build_object('status', 'missing');
    end if;

    update private.inbox_manager_actions set state = 'unknown', body = null
        where client_id = p_client_id and state = 'pending' and expires_at <= clock_timestamp();
    select * into previous from private.inbox_manager_actions
        where client_id = p_client_id and request_id = p_request_id;
    if found then
        if previous.actor_id <> p_actor_id or previous.action <> p_action
            or previous.body_hash <> sha256(convert_to(p_body, 'UTF8')) then
            return jsonb_build_object('status', 'conflict');
        end if;
        return jsonb_build_object('status', previous.state);
    end if;

    if exists (select 1 from private.inbox_manager_actions where client_id = p_client_id and state = 'pending')
        or (p_action = 'connect' and target.manager_user_id is not null)
        or (p_action in ('send', 'finish') and target.manager_user_id is distinct from p_actor_id) then
        return jsonb_build_object('status', 'conflict');
    end if;

    -- One bot per project. Hold the lock only while checking and recording the reservation.
    perform pg_advisory_xact_lock(hashtextextended('fullstack-bot:inbox-manager-send', 0));
    reservation_time := clock_timestamp();
    select reserved_at into admin_cutoff from private.inbox_manager_actions
        where actor_id = p_actor_id and reserved_at > reservation_time - rate_window
        order by reserved_at desc offset (admin_limit - 1) limit 1;
    select reserved_at into bot_cutoff from private.inbox_manager_actions
        where reserved_at > reservation_time - rate_window
        order by reserved_at desc offset (bot_limit - 1) limit 1;

    retry_at := greatest(admin_cutoff, bot_cutoff) + rate_window;
    if retry_at is not null then
        return jsonb_build_object('status', 'rate_limited', 'retry_after',
            ceil(extract(epoch from retry_at - reservation_time))::integer);
    end if;

    insert into private.inbox_manager_actions
        (client_id, request_id, actor_id, action, body, body_hash, reserved_at, expires_at)
        values (p_client_id, p_request_id, p_actor_id, p_action, p_body, sha256(convert_to(p_body, 'UTF8')),
            reservation_time, reservation_time + interval '45 seconds');
    return jsonb_build_object('status', 'ready', 'chat_id', target.user_telegram_id);
end;
$$;

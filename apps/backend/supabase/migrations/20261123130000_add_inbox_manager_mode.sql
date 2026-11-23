alter table public.clients add column manager_user_id uuid
    references public.inbox_admins (user_id) on delete set null;

alter table public.messages add column manager_kind text
    check (manager_kind in ('reply', 'notice'));

create table private.inbox_manager_actions (
    client_id bigint not null references public.clients (id) on delete cascade,
    request_id uuid not null,
    actor_id uuid not null,
    action text not null check (action in ('connect', 'send', 'finish')),
    body text,
    body_hash bytea not null,
    state text not null default 'pending' check (state in ('pending', 'done', 'failed', 'unknown')),
    expires_at timestamptz not null default (clock_timestamp() + interval '45 seconds'),
    primary key (client_id, request_id)
);

create unique index inbox_manager_one_pending_action
    on private.inbox_manager_actions (client_id) where state = 'pending';

create function public.begin_inbox_manager_action(
    p_client_id bigint, p_request_id uuid, p_actor_id uuid, p_action text, p_body text
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
    target public.clients%rowtype;
    previous private.inbox_manager_actions%rowtype;
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

    insert into private.inbox_manager_actions (client_id, request_id, actor_id, action, body, body_hash)
        values (p_client_id, p_request_id, p_actor_id, p_action, p_body, sha256(convert_to(p_body, 'UTF8')));
    return jsonb_build_object('status', 'ready', 'chat_id', target.user_telegram_id);
end;
$$;

create function public.complete_inbox_manager_action(
    p_client_id bigint, p_request_id uuid, p_delivery text
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
    operation private.inbox_manager_actions%rowtype;
    target public.clients%rowtype;
    saved public.messages%rowtype;
begin
    select * into target from public.clients where id = p_client_id for update;
    select * into operation from private.inbox_manager_actions
        where client_id = p_client_id and request_id = p_request_id;
    if not found or operation.state <> 'pending' then
        return null;
    end if;
    if p_delivery in ('failed', 'unknown') or operation.expires_at <= clock_timestamp() then
        update private.inbox_manager_actions set body = null, state =
            case when p_delivery = 'failed' then 'failed' else 'unknown' end
            where client_id = p_client_id and request_id = p_request_id;
        return null;
    end if;
    if p_delivery is distinct from 'done' then
        raise exception 'Invalid delivery outcome';
    end if;

    insert into public.messages (client_id, author, body, messenger_user_id, messenger_type, manager_kind)
    values (p_client_id, 'manager', operation.body, target.user_telegram_id, 'telegram',
        case when operation.action = 'send' then 'reply' else 'notice' end)
    returning * into saved;

    update public.clients set
        manager_user_id = case
            when operation.action = 'connect' then (
                select user_id from public.inbox_admins where user_id = operation.actor_id
            )
            when operation.action = 'finish' then null
            else manager_user_id
        end,
        last_message_at = greatest(last_message_at, saved.created_at)
        where id = p_client_id;
    update private.inbox_manager_actions set state = 'done', body = null
        where client_id = p_client_id and request_id = p_request_id;

    return jsonb_build_object('id', saved.id::text, 'client_id', saved.client_id::text,
        'created_at', saved.created_at, 'author', saved.author, 'body', saved.body,
        'manager_kind', saved.manager_kind);
end;
$$;

create function public.inbox_manager_is_active(p_user_telegram_id varchar)
returns boolean
language sql stable security definer set search_path = ''
as $$
    select exists (
        select 1 from public.clients c where c.user_telegram_id = p_user_telegram_id
            and (c.manager_user_id is not null or exists (
                select 1 from private.inbox_manager_actions a
                where a.client_id = c.id and a.state = 'pending'
                    and a.action = 'connect' and a.expires_at > statement_timestamp()
            ))
    );
$$;

revoke all on function public.begin_inbox_manager_action(bigint, uuid, uuid, text, text),
    public.complete_inbox_manager_action(bigint, uuid, text),
    public.inbox_manager_is_active(varchar) from public, anon, authenticated;
grant execute on function public.begin_inbox_manager_action(bigint, uuid, uuid, text, text),
    public.complete_inbox_manager_action(bigint, uuid, text),
    public.inbox_manager_is_active(varchar) to service_role;

create or replace function public.list_inbox_clients()
returns jsonb
language sql stable security invoker set search_path = ''
as $$
    select coalesce(jsonb_agg(row_data order by last_message_at desc, id), '[]'::jsonb)
    from (
        select c.id, c.last_message_at,
            jsonb_build_object(
                'id', c.id::text,
                'user_telegram_id', c.user_telegram_id,
                'first_name', c.first_name,
                'last_name', c.last_name,
                'last_message_at', c.last_message_at,
                'manager_user_id', c.manager_user_id,
                'last_message', latest.message
            ) as row_data
        from public.clients c
        left join lateral (
            select jsonb_build_object(
                'id', m.id::text, 'client_id', m.client_id::text,
                'created_at', m.created_at, 'author', m.author, 'body', m.body,
                'manager_kind', m.manager_kind
            ) as message
            from public.messages m
            where m.client_id = c.id
            order by m.created_at desc, m.id desc
            limit 1
        ) latest on true
    ) clients;
$$;

drop function public.inbox_message_page(bigint, timestamptz, bigint, text);
create function public.inbox_message_page(
    p_client_id bigint,
    p_created_at timestamptz default null,
    p_id bigint default null,
    p_direction text default 'before'
)
returns table (id text, client_id text, created_at timestamptz, author varchar, body text, manager_kind text)
language plpgsql stable security invoker set search_path = ''
as $$
begin
    if p_direction = 'before' then
        if p_created_at is null then
            return query
            select m.id::text, m.client_id::text, m.created_at, m.author, m.body, m.manager_kind
            from public.messages m
            where m.client_id = p_client_id
            order by m.created_at desc, m.id desc
            limit 21;
            return;
        end if;
        return query
        select m.id::text, m.client_id::text, m.created_at, m.author, m.body, m.manager_kind
        from public.messages m
        where m.client_id = p_client_id
            and (m.created_at, m.id) < (p_created_at, p_id)
        order by m.created_at desc, m.id desc
        limit 21;
    elsif p_direction = 'after' then
        if p_created_at is null then
            return query
            select m.id::text, m.client_id::text, m.created_at, m.author, m.body, m.manager_kind
            from public.messages m
            where m.client_id = p_client_id
            order by m.created_at asc, m.id asc
            limit 21;
            return;
        end if;
        return query
        select m.id::text, m.client_id::text, m.created_at, m.author, m.body, m.manager_kind
        from public.messages m
        where m.client_id = p_client_id
            and (m.created_at, m.id) > (p_created_at, p_id)
        order by m.created_at asc, m.id asc
        limit 21;
    else
        raise exception 'Invalid cursor direction';
    end if;
end;
$$;

revoke all on function public.inbox_message_page(bigint, timestamptz, bigint, text) from public, anon, authenticated;
grant execute on function public.inbox_message_page(bigint, timestamptz, bigint, text) to service_role;

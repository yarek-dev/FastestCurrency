create table public.clients (
    id uuid primary key default gen_random_uuid(),
    created_at timestamptz not null default now(),
    user_telegram_id bigint not null unique,
    first_name text not null,
    last_name text,
    last_messenger_at timestamptz not null default now(),
    constraint clients_first_name_not_blank
        check (length(btrim(first_name)) > 0)
);

create table public.messages (
    id uuid primary key default gen_random_uuid(),
    created_at timestamptz not null,
    author text not null,
    body text not null,
    messenger_user_id text not null,
    messenger_type text not null,
    client_id uuid not null references public.clients (id),
    constraint messages_author_not_blank
        check (length(btrim(author)) > 0),
    constraint messages_messenger_user_id_not_blank
        check (length(btrim(messenger_user_id)) > 0),
    constraint messages_messenger_type_not_blank
        check (length(btrim(messenger_type)) > 0)
);

create index clients_last_messenger_at_idx
    on public.clients (last_messenger_at desc);

create index messages_created_at_idx
    on public.messages (created_at desc);

create index messages_client_id_created_at_idx
    on public.messages (client_id, created_at desc);

alter table public.clients enable row level security;
alter table public.messages enable row level security;

revoke all on table public.clients from anon, authenticated;
revoke all on table public.messages from anon, authenticated;

grant select, insert, update, delete on table public.clients to service_role;
grant select, insert, update, delete on table public.messages to service_role;

create or replace function public.save_incoming_message(
    p_user_telegram_id bigint,
    p_first_name text,
    p_last_name text,
    p_username text,
    p_body text,
    p_message_at timestamptz,
    p_messenger_type text default 'telegram'
)
returns table (
    client_id uuid,
    message_id uuid
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
    v_client_id uuid;
    v_message_id uuid;
    v_author text;
begin
    if p_user_telegram_id is null then
        raise exception 'user_telegram_id is required';
    end if;

    if nullif(btrim(p_first_name), '') is null then
        raise exception 'first_name is required';
    end if;

    if p_body is null then
        raise exception 'body is required';
    end if;

    if p_message_at is null then
        raise exception 'message_at is required';
    end if;

    if nullif(btrim(p_messenger_type), '') is null then
        raise exception 'messenger_type is required';
    end if;

    v_author := coalesce(
        nullif(ltrim(btrim(p_username), '@'), ''),
        split_part(btrim(p_first_name), ' ', 1)
    );

    insert into public.clients as existing_client (
        user_telegram_id,
        first_name,
        last_name,
        last_messenger_at
    )
    values (
        p_user_telegram_id,
        btrim(p_first_name),
        nullif(btrim(p_last_name), ''),
        p_message_at
    )
    on conflict (user_telegram_id) do update
    set
        first_name = excluded.first_name,
        last_name = excluded.last_name,
        last_messenger_at = greatest(
            existing_client.last_messenger_at,
            excluded.last_messenger_at
        )
    returning id into v_client_id;

    insert into public.messages (
        created_at,
        author,
        body,
        messenger_user_id,
        messenger_type,
        client_id
    )
    values (
        p_message_at,
        v_author,
        p_body,
        p_user_telegram_id::text,
        lower(btrim(p_messenger_type)),
        v_client_id
    )
    returning id into v_message_id;

    return query
    select v_client_id, v_message_id;
end;
$$;

revoke all on function public.save_incoming_message(
    bigint,
    text,
    text,
    text,
    text,
    timestamptz,
    text
) from public;

grant execute on function public.save_incoming_message(
    bigint,
    text,
    text,
    text,
    text,
    timestamptz,
    text
) to service_role;

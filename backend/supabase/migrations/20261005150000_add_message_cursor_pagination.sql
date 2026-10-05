create index messages_client_history_idx
    on public.messages (client_id, created_at desc, id desc);

-- The list only needs the latest message, not the entire history of every client.
create function public.list_inbox_clients()
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
                'last_message', latest.message
            ) as row_data
        from public.clients c
        left join lateral (
            select jsonb_build_object(
                'id', m.id::text, 'client_id', m.client_id::text,
                'created_at', m.created_at, 'author', m.author, 'body', m.body
            ) as message
            from public.messages m
            where m.client_id = c.id
            order by m.created_at desc, m.id desc
            limit 1
        ) latest on true
    ) clients;
$$;

-- Return one extra row so the Edge Function can detect the next page.
-- Text IDs preserve bigint precision in JavaScript; timestamps retain microseconds.
create function public.inbox_message_page(
    p_client_id bigint,
    p_created_at timestamptz default null,
    p_id bigint default null,
    p_direction text default 'before'
)
returns table (id text, client_id text, created_at timestamptz, author varchar, body text)
language plpgsql stable security invoker set search_path = ''
as $$
begin
    if p_direction = 'before' then
        if p_created_at is null then
            return query
            select m.id::text, m.client_id::text, m.created_at, m.author, m.body
            from public.messages m
            where m.client_id = p_client_id
            order by m.created_at desc, m.id desc
            limit 21;
            return;
        end if;
        return query
        select m.id::text, m.client_id::text, m.created_at, m.author, m.body
        from public.messages m
        where m.client_id = p_client_id
          and (m.created_at, m.id) < (p_created_at, p_id)
        order by m.created_at desc, m.id desc
        limit 21;
    elsif p_direction = 'after' then
        if p_created_at is null then
            return query
            select m.id::text, m.client_id::text, m.created_at, m.author, m.body
            from public.messages m
            where m.client_id = p_client_id
            order by m.created_at asc, m.id asc
            limit 21;
            return;
        end if;
        return query
        select m.id::text, m.client_id::text, m.created_at, m.author, m.body
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

-- Supabase may grant function access directly through default privileges.
revoke all on function public.list_inbox_clients() from public, anon, authenticated;
revoke all on function public.inbox_message_page(bigint, timestamptz, bigint, text) from public, anon, authenticated;
revoke all on function public.save_message(varchar, varchar, varchar, varchar, text, varchar, timestamptz) from anon, authenticated;
grant execute on function public.list_inbox_clients() to service_role;
grant execute on function public.inbox_message_page(bigint, timestamptz, bigint, text) to service_role;

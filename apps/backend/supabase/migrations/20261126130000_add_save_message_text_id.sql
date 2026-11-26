create function public.save_message_text_id(
    p_user_telegram_id varchar,
    p_first_name varchar,
    p_last_name varchar,
    p_author varchar,
    p_body text,
    p_messenger_type varchar,
    p_created_at timestamptz
)
returns text
language sql
security invoker
set search_path = ''
as $$
    select public.save_message(
        p_user_telegram_id, p_first_name, p_last_name, p_author,
        p_body, p_messenger_type, p_created_at
    )::text;
$$;

revoke all on function public.save_message_text_id(varchar, varchar, varchar, varchar, text, varchar, timestamptz)
    from public, anon, authenticated;
grant execute on function public.save_message_text_id(varchar, varchar, varchar, varchar, text, varchar, timestamptz)
    to service_role;

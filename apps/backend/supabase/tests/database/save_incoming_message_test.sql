begin;

select plan(21);

select has_table('public', 'clients', 'clients table should exist');
select has_table('public', 'messages', 'messages table should exist');

select has_column(
    'public',
    'clients',
    'user_telegram_id',
    'clients.user_telegram_id should exist'
);

select has_column(
    'public',
    'clients',
    'last_message_at',
    'clients.last_message_at should exist'
);

select has_column(
    'public',
    'messages',
    'author',
    'messages.author should exist'
);

select has_column(
    'public',
    'messages',
    'body',
    'messages.body should exist'
);

select has_column(
    'public',
    'messages',
    'messenger_user_id',
    'messages.messenger_user_id should exist'
);

select has_column(
    'public',
    'messages',
    'messenger_type',
    'messages.messenger_type should exist'
);

select has_column(
    'public',
    'messages',
    'client_id',
    'messages.client_id should exist'
);

insert into public.clients (
    user_telegram_id,
    first_name,
    last_name,
    last_message_at
)
values (
    '9000000001',
    'Yaroslav',
    'Developer',
    '2026-09-17 10:05:00+00'
);

select is(
    (select count(*)::integer from public.clients),
    1,
    'one client should be stored'
);

insert into public.messages (
    created_at,
    author,
    body,
    messenger_user_id,
    messenger_type,
    client_id
)
values
    (
        '2026-09-17 10:00:00+00',
        'yarek_dev',
        '/start',
        '9000000001',
        'telegram',
        (select id from public.clients where user_telegram_id = '9000000001')
    ),
    (
        '2026-09-17 10:05:00+00',
        'bot',
        'Hello!',
        '9000000001',
        'telegram',
        (select id from public.clients where user_telegram_id = '9000000001')
    );

select is(
    (select count(*)::integer from public.messages),
    2,
    'client and bot messages should be stored'
);

select is(
    (select last_message_at
     from public.clients
     where user_telegram_id = '9000000001'),
    '2026-09-17 10:05:00+00'::timestamptz,
    'client should contain the last message time'
);

select is(
    (select client_id from public.messages where body = '/start'),
    (select id from public.clients where user_telegram_id = '9000000001'),
    'message should reference its client'
);

select lives_ok(
    $$select public.save_message(
        '9000000001',
        'Yaroslav',
        'Updated',
        'yarek_dev',
        'Saved through RPC',
        'telegram',
        '2026-09-17 10:10:00+00'
    )$$,
    'save_message should save a message for an existing client'
);

select is(
    (select count(*)::integer
     from public.clients
     where user_telegram_id = '9000000001'),
    1,
    'save_message should reuse an existing client'
);

select is(
    (select last_message_at
     from public.clients
     where user_telegram_id = '9000000001'),
    '2026-09-17 10:10:00+00'::timestamptz,
    'save_message should update the last message time'
);

create function pg_temp.reject_message_insert()
returns trigger
language plpgsql
as $$
begin
    raise exception 'forced message insert failure';
end;
$$;

create trigger reject_message_insert
before insert on public.messages
for each row
execute function pg_temp.reject_message_insert();

select throws_ok(
    $$select public.save_message(
        '9000000002',
        'Rollback',
        'Test',
        'rollback_test',
        'Must not persist',
        'telegram',
        '2026-09-17 10:15:00+00'
    )$$,
    'P0001',
    'forced message insert failure',
    'message failure should abort save_message'
);

drop trigger reject_message_insert on public.messages;

select is(
    (select count(*)::integer
     from public.clients
     where user_telegram_id = '9000000002'),
    0,
    'failed message insert should roll back the new client'
);

create temporary table saved_message_id as
select public.save_message_text_id(
    '9000000001', 'Yaroslav', 'Updated', 'yarek_dev',
    'Saved with text ID', 'telegram', '2026-09-17 10:20:00+00'
) as id;

select is(
    (select id from saved_message_id),
    (select id::text from public.messages where body = 'Saved with text ID'),
    'save_message_text_id returns the exact ID of the persisted message as text'
);

select ok(
    has_function_privilege('service_role', 'public.save_message_text_id(varchar,varchar,varchar,varchar,text,varchar,timestamptz)', 'execute'),
    'service_role can save a message with a text ID'
);

select ok(
    not has_function_privilege('anon', 'public.save_message_text_id(varchar,varchar,varchar,varchar,text,varchar,timestamptz)', 'execute')
    and not has_function_privilege('authenticated', 'public.save_message_text_id(varchar,varchar,varchar,varchar,text,varchar,timestamptz)', 'execute'),
    'browser roles cannot save a message with a text ID'
);

select * from finish();
rollback;

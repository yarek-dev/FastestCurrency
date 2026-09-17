begin;

select plan(22);

select has_table(
    'public',
    'clients',
    'clients table should exist'
);

select has_table(
    'public',
    'messages',
    'messages table should exist'
);

select lives_ok(
    $$select *
      from public.save_incoming_message(
          9000000001,
          'Yaroslav',
          'Developer',
          '@yarek_dev',
          '/start',
          '2026-09-17 10:00:00+00'::timestamptz,
          'Telegram'
      )$$,
    'first incoming message should be saved'
);

select is(
    (select count(*)::integer
     from public.clients
     where user_telegram_id = 9000000001),
    1,
    'first message should create one client'
);

select is(
    (select count(*)::integer
     from public.messages
     where messenger_user_id = '9000000001'),
    1,
    'first message should create one message'
);

select is(
    (select author
     from public.messages
     where messenger_user_id = '9000000001'
       and body = '/start'),
    'yarek_dev',
    'author should use Telegram username without @'
);

select is(
    (select messenger_type
     from public.messages
     where messenger_user_id = '9000000001'
       and body = '/start'),
    'telegram',
    'messenger type should be normalized to lowercase'
);

select is(
    (select client_id
     from public.messages
     where messenger_user_id = '9000000001'
       and body = '/start'),
    (select id
     from public.clients
     where user_telegram_id = 9000000001),
    'message should reference the created client'
);

select lives_ok(
    $$select *
      from public.save_incoming_message(
          9000000001,
          'Yaroslav',
          'Updated',
          '@yarek_dev',
          'second message',
          '2026-09-17 10:05:00+00'::timestamptz,
          'telegram'
      )$$,
    'second incoming message should be saved'
);

select is(
    (select count(*)::integer
     from public.clients
     where user_telegram_id = 9000000001),
    1,
    'second message should reuse the existing client'
);

select is(
    (select count(*)::integer
     from public.messages
     where messenger_user_id = '9000000001'),
    2,
    'second message should add another message'
);

select is(
    (select first_name
     from public.clients
     where user_telegram_id = 9000000001),
    'Yaroslav',
    'existing client first name should be updated'
);

select is(
    (select last_name
     from public.clients
     where user_telegram_id = 9000000001),
    'Updated',
    'existing client last name should be updated'
);

select is(
    (select last_messenger_at
     from public.clients
     where user_telegram_id = 9000000001),
    '2026-09-17 10:05:00+00'::timestamptz,
    'last messenger time should move forward'
);

select lives_ok(
    $$select *
      from public.save_incoming_message(
          9000000001,
          'Fallback Author',
          null,
          null,
          'delayed message',
          '2026-09-17 09:55:00+00'::timestamptz,
          'telegram'
      )$$,
    'delayed incoming message should be saved'
);

select is(
    (select count(*)::integer
     from public.messages
     where messenger_user_id = '9000000001'),
    3,
    'delayed message should still be stored'
);

select is(
    (select author
     from public.messages
     where messenger_user_id = '9000000001'
       and body = 'delayed message'),
    'Fallback',
    'author should fall back to the first word of first name'
);

select is(
    (select last_messenger_at
     from public.clients
     where user_telegram_id = 9000000001),
    '2026-09-17 10:05:00+00'::timestamptz,
    'delayed message should not move last messenger time backwards'
);

select is(
    (select created_at
     from public.messages
     where messenger_user_id = '9000000001'
       and body = 'delayed message'),
    '2026-09-17 09:55:00+00'::timestamptz,
    'message creation time should come from Telegram'
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
    $$select *
      from public.save_incoming_message(
          9000000002,
          'Rollback',
          'Test',
          '@rollback_test',
          'must not persist',
          '2026-09-17 10:10:00+00'::timestamptz,
          'telegram'
      )$$,
    'P0001',
    'forced message insert failure',
    'message insert failure should abort the RPC'
);

drop trigger reject_message_insert on public.messages;

select is(
    (select count(*)::integer
     from public.clients
     where user_telegram_id = 9000000002),
    0,
    'failed message insert should roll back the client upsert'
);

select is(
    (select count(*)::integer
     from public.messages
     where messenger_user_id = '9000000002'),
    0,
    'failed message insert should not create a message'
);

select * from finish();
rollback;

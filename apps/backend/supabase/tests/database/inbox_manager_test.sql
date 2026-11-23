begin;
select plan(31);

insert into auth.users (id, email) values
    ('00000000-0000-4000-8000-000000000101', 'manager-one@example.test'),
    ('00000000-0000-4000-8000-000000000102', 'manager-two@example.test'),
    ('00000000-0000-4000-8000-000000000103', 'manager-member@example.test');
insert into public.inbox_admins (user_id) values
    ('00000000-0000-4000-8000-000000000101'), ('00000000-0000-4000-8000-000000000102');
insert into public.clients (id, user_telegram_id) values (101, '111'), (102, '222');

create function pg_temp.begin_action(
    action text, operation int, actor int default 1, client bigint default 101, body text default 'test'
)
returns text language sql as $$
    select public.begin_inbox_manager_action(client,
        ('00000000-0000-4000-8000-' || lpad(operation::text, 12, '0'))::uuid,
        ('00000000-0000-4000-8000-' || lpad((100 + actor)::text, 12, '0'))::uuid,
        action, body)->>'status';
$$;

create function pg_temp.complete_action(operation int, delivery text default 'done', client bigint default 101)
returns jsonb language sql as $$
    select public.complete_inbox_manager_action(client,
        ('00000000-0000-4000-8000-' || lpad(operation::text, 12, '0'))::uuid, delivery);
$$;

select ok(not has_function_privilege('authenticated', 'public.begin_inbox_manager_action(bigint,uuid,uuid,text,text)', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public.complete_inbox_manager_action(bigint,uuid,text)', 'EXECUTE'),
    'authenticated users cannot write to conversations through RPC');
select is(pg_temp.begin_action('connect', 1, 3), 'forbidden', 'ordinary user cannot take over');
select is(pg_temp.begin_action('send', 1), 'conflict', 'reply requires prior takeover');
select is(pg_temp.begin_action('connect', 2), 'ready', 'first admin reserves the chat');
select is(pg_temp.begin_action('connect', 3, 2), 'conflict', 'second admin cannot take the same chat');
select ok(public.inbox_manager_is_active('111'), 'automatic replies pause during the connection notice');
select ok(not public.inbox_manager_is_active('222'), 'another chat is unaffected');
select is(pg_temp.complete_action(2)->>'manager_kind', 'notice', 'successful connection saves a notice');
select is(pg_temp.begin_action('connect', 2), 'done', 'retry of the same request does not send the notice again');
select is(pg_temp.begin_action('connect', 2, 1, 101, 'changed'), 'conflict', 'a reused id cannot change the message');
select is(pg_temp.begin_action('send', 4, 2), 'conflict', 'another admin cannot send to the chat');
select is(pg_temp.begin_action('finish', 4, 2), 'conflict', 'another admin cannot close the chat');
select is(pg_temp.begin_action('send', 5, 1, 101, 'manual answer'), 'ready', 'the owner can send a message');
select is(pg_temp.complete_action(5)->>'manager_kind', 'reply', 'successful reply is saved as a manager message');
select is(pg_temp.complete_action(5), null::jsonb, 'completion is idempotent');
select is(pg_temp.begin_action('finish', 6), 'ready', 'the owner can finish');
select is(pg_temp.complete_action(6, 'failed'), null::jsonb, 'Telegram rejection does not save a notice');
select ok(public.inbox_manager_is_active('111'), 'unsuccessful finish preserves the takeover');
select is(pg_temp.begin_action('finish', 7), 'ready', 'a new finish is allowed after rejection');
select is(pg_temp.complete_action(7)->>'manager_kind', 'notice', 'successful finish saves a notice');
select ok(not public.inbox_manager_is_active('111'), 'automatic replies resume after a successful finish');
select is((select manager_kind from public.inbox_message_page(101) where body = 'manual answer'), 'reply',
    'the message page exposes the reply type');
select is((select row->>'manager_user_id' from jsonb_array_elements(public.list_inbox_clients()) row
    where row->>'id' = '101'), null::text, 'client list reflects release of the chat');
select is(pg_temp.begin_action('connect', 8), 'ready', 'a released chat can be reserved again');
update private.inbox_manager_actions set expires_at = clock_timestamp() - interval '1 second'
    where client_id = 101 and state = 'pending';
select ok(not public.inbox_manager_is_active('111'), 'expired reservation does not pause automatic replies');
select is(pg_temp.begin_action('connect', 8), 'unknown', 'a timed-out request is never sent a second time');
select is(pg_temp.begin_action('connect', 9, 2), 'ready', 'another admin can take over after expiry');
select is(pg_temp.complete_action(9)->>'manager_kind', 'notice', 'the second admin connects successfully');
select ok(public.inbox_manager_is_active('111'), 'the second admin pauses automatic replies');
delete from public.inbox_admins where user_id = '00000000-0000-4000-8000-000000000102';
select ok(not public.inbox_manager_is_active('111'), 'revoking the manager releases the chat');
select is((select count(*)::int from public.messages where client_id = 101 and manager_kind is not null),
    4, 'history contains only confirmed and unique sends');

select * from finish();
rollback;

begin;
select plan(12);

create function pg_temp.test_uuid(n int)
returns uuid language sql immutable as $$
    select ('00000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid;
$$;

insert into auth.users (id, email)
select pg_temp.test_uuid(n), 'rate-limit-' || n || '@example.test' from generate_series(1, 5) n;
insert into public.inbox_admins (user_id)
select pg_temp.test_uuid(n) from generate_series(1, 5) n;
insert into public.clients (id, user_telegram_id, manager_user_id)
select 100 + n, (100 + n)::text, pg_temp.test_uuid(n) from generate_series(1, 5) n;

create function pg_temp.try_send(operation int, actor int)
returns jsonb language sql as $$
    select public.begin_inbox_manager_action(100 + actor,
        pg_temp.test_uuid(operation), pg_temp.test_uuid(actor), 'send', 'test');
$$;

insert into private.inbox_manager_actions (client_id, request_id, actor_id, action, body_hash, state, reserved_at)
select 101, pg_temp.test_uuid(100 + n), pg_temp.test_uuid(1), 'send', sha256(convert_to('test', 'UTF8')),
    'done', clock_timestamp() - interval '5 seconds'
from generate_series(1, 14) n;

select is(pg_temp.try_send(115, 1)->>'status', 'ready', 'the 15th reservation is accepted');
select is(public.complete_inbox_manager_action(101, pg_temp.test_uuid(115), 'failed'),
    null::jsonb, 'Telegram rejection does not create history');
select is(pg_temp.try_send(116, 1)->>'status', 'rate_limited', 'failed delivery still uses a slot');
select ok((pg_temp.try_send(116, 1)->>'retry_after')::int between 1 and 60,
    'the administrator limit returns a wait time');
select is(pg_temp.try_send(101, 1)->>'status', 'done', 'replays bypass the rate check without making a new reservation');
select is((select count(*)::int from private.inbox_manager_actions where client_id = 101), 15,
    'rejected and replayed requests create no reservation');
select is(pg_temp.try_send(201, 2)->>'status', 'ready', 'another administrator has their own limit');
select is(public.complete_inbox_manager_action(102, pg_temp.test_uuid(201), 'unknown'),
    null::jsonb, 'uncertain delivery also keeps its reservation');

insert into private.inbox_manager_actions (client_id, request_id, actor_id, action, body_hash, state, reserved_at)
select 100 + actor, pg_temp.test_uuid(1000 + actor * 100 + n), pg_temp.test_uuid(actor),
    'connect', sha256(convert_to('test', 'UTF8')), 'done', clock_timestamp() - interval '10 seconds'
from generate_series(2, 4) actor
cross join lateral generate_series(1, case when actor = 2 then 14 else 15 end) n;

select is(pg_temp.try_send(501, 5)->>'status', 'rate_limited', 'the 61st reservation is blocked across administrators');
select ok((pg_temp.try_send(501, 5)->>'retry_after')::int between 1 and 60, 'the global limit returns a wait time');
select is((select count(*)::int from private.inbox_manager_actions where client_id between 101 and 105), 60,
    'only accepted reservations consume the global quota');

update private.inbox_manager_actions set reserved_at = clock_timestamp() - interval '61 seconds'
    where client_id between 101 and 105;
select is(pg_temp.try_send(501, 5)->>'status', 'ready', 'a blocked request can be reserved when the window expires');

select * from finish();
rollback;

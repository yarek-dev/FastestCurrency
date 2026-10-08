begin;
select plan(10);

insert into public.clients (id, user_telegram_id, first_name)
values (9007199254741000, 'pagination-test', 'Pagination'),
       (9007199254741001, 'pagination-other', 'Other');
insert into public.messages (id, client_id, created_at, body)
select 9007199254741000 + n, 9007199254741000,
       '2026-10-05T10:00:00.123456Z'::timestamptz, 'Message ' || n
from generate_series(1, 45) n;
insert into public.messages (id, client_id, created_at, body)
values (9007199254741100, 9007199254741001, '2026-10-05T11:00:00Z', 'Other client');

select ok(exists(select 1 from pg_indexes where schemaname = 'public' and indexname = 'messages_client_history_idx'), 'client history index exists');
select ok(not has_function_privilege('anon', 'public.inbox_message_page(bigint,timestamptz,bigint,text)', 'EXECUTE'), 'anonymous cannot call the RPC');
select is((select count(*)::integer from public.inbox_message_page(9007199254741000)), 21, 'latest page includes one lookahead row');
select is((select max(id::bigint)::text from public.inbox_message_page(9007199254741000)), '9007199254741045', 'latest ID retains bigint precision');
select is((select min(id::bigint)::text from public.inbox_message_page(9007199254741000, '2026-10-05T10:00:00.123456Z', 9007199254741026)), '9007199254741005', 'equal timestamps use ID to paginate');
select is((select count(*)::integer from public.inbox_message_page(9007199254741000, '2026-10-05T10:00:00.123456Z', 9007199254741006)), 5, 'final page has remaining rows');
select is((select count(*)::integer from public.inbox_message_page(9007199254741000, '2026-10-05T10:00:00.123456Z', 9007199254741020, 'after')), 21, 'recovery walks forward with lookahead');
select is((select min(id::bigint)::text from public.inbox_message_page(9007199254741000, '2026-10-05T10:00:00.123456Z', 9007199254741020, 'after')), '9007199254741021', 'recovery starts after the cursor');
select is((select count(*)::integer from public.inbox_message_page(9007199254741001)), 1, 'pages do not include another client');
select is((select item->'last_message'->>'id' from jsonb_array_elements(public.list_inbox_clients()) item where item->>'id' = '9007199254741000'), '9007199254741045', 'client preview uses the latest message');

select * from finish();
rollback;

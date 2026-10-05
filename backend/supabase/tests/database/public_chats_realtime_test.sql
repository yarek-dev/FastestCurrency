begin;
select plan(10);

select ok(has_table_privilege('anon', 'public.clients', 'SELECT'), 'public clients can be read');
select ok(has_table_privilege('anon', 'public.messages', 'SELECT'), 'public messages can be read');
select ok(not has_table_privilege('anon', 'public.clients', 'INSERT,UPDATE,DELETE'), 'public clients cannot be written');
select ok(not has_table_privilege('anon', 'public.messages', 'INSERT,UPDATE,DELETE'), 'public messages cannot be written');
select ok(not has_function_privilege('anon', 'public.save_message(character varying,character varying,character varying,character varying,text,character varying,timestamp with time zone)', 'EXECUTE'), 'public cannot save messages through RPC');
select ok((select relrowsecurity from pg_class where oid = 'public.clients'::regclass), 'clients RLS stays enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.messages'::regclass), 'messages RLS stays enabled');
select is((select count(*)::integer from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename in ('clients', 'messages')), 2, 'both tables publish realtime changes');

insert into public.clients (user_telegram_id, first_name) values ('realtime-test', 'Realtime');
insert into public.messages (client_id, body) values ((select id from public.clients where user_telegram_id = 'realtime-test'), 'Realtime test');
set local role anon;
select is((select count(*)::integer from public.clients where user_telegram_id = 'realtime-test'), 1, 'anon sees clients through RLS');
select is((select count(*)::integer from public.messages where body = 'Realtime test'), 1, 'anon sees messages through RLS');
reset role;

select * from finish();
rollback;

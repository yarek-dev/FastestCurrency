begin;
select plan(15);

select ok(not has_table_privilege('anon', 'public.clients', 'SELECT'), 'anon cannot read clients');
select ok(not has_table_privilege('anon', 'public.messages', 'SELECT'), 'anon cannot read messages');
select ok(not has_table_privilege('anon', 'public.clients', 'INSERT,UPDATE,DELETE'), 'public clients cannot be written');
select ok(not has_table_privilege('anon', 'public.messages', 'INSERT,UPDATE,DELETE'), 'public messages cannot be written');
select ok(not has_function_privilege('anon', 'public.save_message(character varying,character varying,character varying,character varying,text,character varying,timestamp with time zone)', 'EXECUTE'), 'public cannot save messages through RPC');
select ok((select relrowsecurity from pg_class where oid = 'public.clients'::regclass), 'clients RLS stays enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.messages'::regclass), 'messages RLS stays enabled');
select is((select count(*)::integer from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename in ('clients', 'messages')), 2, 'both tables publish realtime changes');
select ok(not has_table_privilege('authenticated', 'public.inbox_admins', 'SELECT,INSERT,UPDATE,DELETE'), 'authenticated users cannot inspect or edit the admin list');
select ok(not has_table_privilege('authenticated', 'public.clients', 'INSERT,UPDATE,DELETE')
    and not has_table_privilege('authenticated', 'public.messages', 'INSERT,UPDATE,DELETE'), 'inbox data stays read-only for signed-in users');

insert into auth.users (id, email) values
    ('00000000-0000-4000-8000-000000000001', 'inbox-admin@example.test'),
    ('00000000-0000-4000-8000-000000000002', 'inbox-member@example.test');
insert into public.inbox_admins (user_id) values ('00000000-0000-4000-8000-000000000001');
insert into public.clients (user_telegram_id, first_name) values ('realtime-test', 'Realtime');
insert into public.messages (client_id, body) values ((select id from public.clients where user_telegram_id = 'realtime-test'), 'Realtime test');
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000000002';
select is((select count(*)::integer from public.clients where user_telegram_id = 'realtime-test'), 0, 'a regular user cannot read clients');
select is((select count(*)::integer from public.messages where body = 'Realtime test'), 0, 'a regular user cannot read messages');
set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000000001';
select is((select count(*)::integer from public.clients where user_telegram_id = 'realtime-test'), 1, 'an admin can read clients');
select is((select count(*)::integer from public.messages where body = 'Realtime test'), 1, 'an admin can read messages');
reset role;
delete from public.inbox_admins where user_id = '00000000-0000-4000-8000-000000000001';
set local role authenticated;
select is((select count(*)::integer from public.messages where body = 'Realtime test'), 0, 'the same JWT subject loses access after revocation');
reset role;

select * from finish();
rollback;

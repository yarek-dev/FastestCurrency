begin;
select plan(10);

insert into public.articles (id, title, body)
values (9007199254741000, 'Article title', 'Article body');

select is(
    (select created_at from public.articles where id = 9007199254741000),
    now(),
    'creation timestamp defaults to the current time'
);
select is(
    (select updated_at from public.articles where id = 9007199254741000),
    now(),
    'edit timestamp defaults to the current time'
);
select throws_ok(
    $$insert into public.articles (title, body) values (null, 'Body')$$,
    '23502', null, 'title is required'
);
select throws_ok(
    $$insert into public.articles (title, body) values ('Title', null)$$,
    '23502', null, 'body is required'
);

update public.articles
set title = 'Edited title', body = 'Edited body', updated_at = '2000-01-01T00:00:00Z'
where id = 9007199254741000;

select is(
    (select updated_at from public.articles where id = 9007199254741000),
    now(),
    'update trigger replaces a stale edit timestamp'
);
select is(
    (select created_at from public.articles where id = 9007199254741000),
    now(),
    'editing content preserves the creation timestamp'
);
select ok(
    (select relrowsecurity from pg_class where oid = 'public.articles'::regclass),
    'articles have RLS enabled'
);
select ok(
    not has_table_privilege('anon', 'public.articles', 'SELECT,INSERT,UPDATE,DELETE'),
    'anonymous clients have no article access'
);
select ok(
    not has_table_privilege('authenticated', 'public.articles', 'SELECT,INSERT,UPDATE,DELETE'),
    'authenticated clients have no article access by default'
);
select ok(
    has_table_privilege('service_role', 'public.articles', 'SELECT')
    and has_table_privilege('service_role', 'public.articles', 'INSERT')
    and has_table_privilege('service_role', 'public.articles', 'UPDATE')
    and has_table_privilege('service_role', 'public.articles', 'DELETE'),
    'server role can manage articles'
);

select * from finish();
rollback;

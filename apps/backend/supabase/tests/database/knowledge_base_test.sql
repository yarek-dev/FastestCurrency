begin;
select plan(14);

set local role service_role;
insert into public.knowledge_sources (url, title, kind) values
    ('https://example.test/knowledge-a', 'Первая страница', 'page'),
    ('https://example.test/knowledge-b', 'Вторая страница', 'page');
insert into public.knowledge_chunks (source_id, position, heading, body)
select id, 0, 'Запись к гинекологу', 'Для записи позвоните в регистратуру.'
from public.knowledge_sources where url = 'https://example.test/knowledge-a';
insert into public.knowledge_tariffs (source_id, source_key, service_name, price_label, source_value, price_type, amount, currency)
select id, 'table-1:row-1:price-1', 'Консультация гинеколога', 'Стоимость', 'от 1400', 'from', 1400, 'BYN'
from public.knowledge_sources where url = 'https://example.test/knowledge-a'
union all
select id, 'table-1:row-1:price-1', 'Консультация гинеколога', 'Стоимость', 'от 1550', 'from', 1550, 'BYN'
from public.knowledge_sources where url = 'https://example.test/knowledge-b';
reset role;

select is((select count(*)::int from pg_class where oid in (
    'public.knowledge_sources'::regclass, 'public.knowledge_chunks'::regclass, 'public.knowledge_tariffs'::regclass
) and relrowsecurity), 3, 'RLS is enabled for all knowledge tables');
select ok(not exists (
    select 1 from unnest(array['anon', 'authenticated']) as r(role_name)
    cross join unnest(array['public.knowledge_sources', 'public.knowledge_chunks', 'public.knowledge_tariffs']) as t(table_name)
    where has_table_privilege(role_name, table_name, 'SELECT,INSERT,UPDATE,DELETE')
), 'browser roles cannot access the knowledge tables');
select ok(not has_sequence_privilege('authenticated', 'public.knowledge_sources_id_seq', 'USAGE,SELECT,UPDATE'),
    'authenticated users cannot access the source sequence');
select is((select array_agg(t.amount order by t.amount) from public.knowledge_tariffs t
    join public.knowledge_sources s on t.source_id = s.id
    where s.url in ('https://example.test/knowledge-a', 'https://example.test/knowledge-b')),
    array[1400.00,1550.00]::numeric[], 'the same service can have different prices at different sources');
select throws_ok(
    $$insert into public.knowledge_sources (url, title, kind) values ('https://example.test/knowledge-a', 'Duplicate', 'page')$$,
    '23505', null, 'one row per source URL'
);
select throws_ok(
    $$insert into public.knowledge_chunks (source_id, position, body)
      select id, 0, 'Duplicate' from public.knowledge_sources where url = 'https://example.test/knowledge-a'$$,
    '23505', null, 'the same chunk position cannot be inserted twice for one source'
);
select throws_ok(
    $$insert into public.knowledge_tariffs (source_id, source_key, service_name, price_label, source_value, price_type, amount)
      select id, 'table-1:row-1:price-1', 'Duplicate', 'Стоимость', '1', 'fixed', 1
      from public.knowledge_sources where url = 'https://example.test/knowledge-a'$$,
    '23505', null, 'upserts can use the stable tariff key per source'
);
select throws_ok(
    $$insert into public.knowledge_chunks (source_id, position, body) values (-1, 0, 'Orphan')$$,
    '23503', null, 'each chunk requires a source'
);
select throws_ok(
    $$insert into public.knowledge_tariffs (source_id, source_key, service_name, price_label, source_value, price_type, amount, max_amount)
      select id, 'reversed-range', 'Обследование', 'Стоимость', 'от 115 до 100', 'range', 115, 100
      from public.knowledge_sources where url = 'https://example.test/knowledge-a'$$,
    '23514', null, 'a tariff range cannot be reversed'
);
select throws_ok(
    $$insert into public.knowledge_tariffs (source_id, source_key, service_name, price_label, source_value, price_type, amount)
      select id, 'incomplete-range', 'Обследование', 'Стоимость', 'от 100 до', 'range', 100
      from public.knowledge_sources where url = 'https://example.test/knowledge-a'$$,
    '23514', null, 'a range requires an upper bound'
);
select throws_ok(
    $$insert into public.knowledge_tariffs (source_id, source_key, service_name, price_label, source_value, price_type, amount, max_amount)
      select id, 'fixed-with-maximum', 'Обследование', 'Стоимость', '100', 'fixed', 100, 115
      from public.knowledge_sources where url = 'https://example.test/knowledge-a'$$,
    '23514', null, 'a fixed price cannot have an upper bound'
);
insert into public.knowledge_tariffs (source_id, source_key, service_name, price_label, source_value, price_type, amount, max_amount)
select id, 'range', 'Обследование', 'Стоимость', 'от 100 до 115', 'range', 100, 115
from public.knowledge_sources where url = 'https://example.test/knowledge-a';
select ok(exists(select 1 from public.knowledge_tariffs t
    join public.knowledge_sources s on t.source_id = s.id
    where s.url = 'https://example.test/knowledge-a' and t.source_key = 'range' and currency is null and max_amount = 115),
    'valid ranges can be stored even when the source does not specify a currency');

delete from public.knowledge_sources where url = 'https://example.test/knowledge-a';
select is((select count(*)::int from public.knowledge_chunks
    where body = 'Для записи позвоните в регистратуру.'), 0, 'deleting a source removes its chunks');
select is((select count(*)::int from public.knowledge_tariffs
    where source_key in ('range', 'table-1:row-1:price-1') and source_value in ('от 1400', 'от 100 до 115')),
    0, 'deleting a source removes its tariffs');

select * from finish();
rollback;

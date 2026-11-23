begin;
select plan(11);

select ok(not has_function_privilege('anon', 'public.search_knowledge_vector(extensions.vector)', 'EXECUTE'),
    'anonymous users cannot call vector search');
select ok(not has_function_privilege('authenticated', 'public.pending_knowledge_embeddings(integer)', 'EXECUTE'),
    'browser users cannot enumerate embedding inputs');
select ok(not has_table_privilege('authenticated', 'public.knowledge_embeddings', 'SELECT'),
    'browser users cannot read embeddings');

set local role service_role;
insert into public.knowledge_sources (url, title, kind)
values ('https://example.test/vector-test', 'Тест векторного поиска', 'page');

insert into public.knowledge_chunks (source_id, position, heading, body)
select id, 0, 'Тестовая инструкция по оплате', 'Номер договора используется для оплаты.'
from public.knowledge_sources where url = 'https://example.test/vector-test';

insert into public.knowledge_tariffs (
    source_id, source_key, service_name, section, audience, price_label, source_value, price_type, amount, currency
)
select id, tariff_key, 'Тестовая гистероскопия', 'Эндоскопия', audience, 'Цена', price::text, 'fixed', price, 'BYN'
from public.knowledge_sources
cross join (values ('a', 'resident', 100), ('b', 'foreign', 200)) prices(tariff_key, audience, price)
where url = 'https://example.test/vector-test';

select is((select count(distinct content_hash)::integer
    from public.knowledge_embedding_inputs where kind = 'tariff' and content like 'title: Тестовая гистероскопия%'),
    1, 'tariff variants share an embedding');

insert into public.knowledge_embeddings (content_hash, embedding)
select distinct content_hash,
    (array[1::real] || array_fill(0::real, array[767]))::extensions.vector
from public.knowledge_embedding_inputs
where content like 'title: Тестовая гистероскопия%' or content like 'title: Тестовая инструкция по оплате%';

select ok(public.search_knowledge_vector(
    (array[1::real] || array_fill(0::real, array[767]))::extensions.vector)->'tariffs'
    @> '[{"amount":"100.00","currency":"BYN"},{"amount":"200.00","currency":"BYN"}]'::jsonb,
    'vector-only matches return both structured tariff variants');
select ok(public.search_knowledge_vector(
    (array[1::real] || array_fill(0::real, array[767]))::extensions.vector)->'chunks'
    @> '[{"heading":"Тестовая инструкция по оплате"}]'::jsonb,
    'vector-only matching finds a chunk without a keyword overlap');
select ok(not (public.search_knowledge_vector(
    (array[-1::real] || array_fill(0::real, array[767]))::extensions.vector)->'chunks'
    @> '[{"heading":"Тестовая инструкция по оплате"}]'::jsonb),
    'a distant vector does not match');

update public.knowledge_chunks set body = 'Новый текст инструкции.'
where heading = 'Тестовая инструкция по оплате';

select ok(not (public.search_knowledge_vector(
    (array[1::real] || array_fill(0::real, array[767]))::extensions.vector)->'chunks'
    @> '[{"heading":"Тестовая инструкция по оплате"}]'::jsonb),
    'editing content invalidates its vector immediately');
select is(public.search_knowledge_vector(null), '{"tariffs":[],"chunks":[]}'::jsonb,
    'a missing vector returns empty results');
select ok(to_regprocedure('public.search_knowledge(text)') is null
    and to_regprocedure('public.search_knowledge_hybrid(text,extensions.vector)') is null,
    'previous search RPCs are removed');
select ok(not exists (
    select 1 from pg_attribute
    where attrelid in ('public.knowledge_chunks'::regclass, 'public.knowledge_tariffs'::regclass)
        and attname = 'search_text' and not attisdropped
), 'previous search columns are removed');

select * from finish();
rollback;

begin;
select plan(18);

select ok(not has_function_privilege('anon', 'public.search_knowledge_vector(extensions.vector)', 'EXECUTE'),
    'anonymous users cannot call vector search');
select ok(not has_function_privilege('authenticated', 'public.pending_knowledge_embeddings(integer)', 'EXECUTE'),
    'browser users cannot enumerate embedding inputs');
select ok(not has_column_privilege('authenticated', 'public.knowledge_tariffs', 'embedding', 'SELECT')
    and not has_column_privilege('authenticated', 'public.knowledge_chunks', 'embedding', 'SELECT'),
    'browser users cannot read embeddings');
select ok(not has_function_privilege('authenticated', 'public.save_knowledge_embeddings(jsonb)', 'EXECUTE'),
    'browser users cannot save embeddings');

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

select is((select count(*)::integer from public.pending_knowledge_embeddings(50)
    where content like 'title: Тестовая гистероскопия%'),
    1, 'tariff variants are embedded together');

select lives_ok($$
    select public.save_knowledge_embeddings(jsonb_agg(jsonb_build_object(
        'content', content,
        'embedding', ((array[1::real] || array_fill(0::real, array[767]))::extensions.vector)::text
    )))
    from public.pending_knowledge_embeddings(50)
    where content like 'title: Тестовая гистероскопия%' or content like 'title: Тестовая инструкция по оплате%'
$$, 'one batch saves both types of embeddings');

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

update public.knowledge_tariffs set amount = 101
where service_name = 'Тестовая гистероскопия' and source_key = 'a';

select ok(public.search_knowledge_vector(
    (array[1::real] || array_fill(0::real, array[767]))::extensions.vector)->'tariffs'
    @> '[{"amount":"101.00","currency":"BYN"}]'::jsonb,
    'changing the price alone preserves its vector');

update public.knowledge_tariffs set section = 'Другой раздел'
where service_name = 'Тестовая гистероскопия' and source_key = 'a';

select ok((select embedding is null from public.knowledge_tariffs
    where service_name = 'Тестовая гистероскопия' and source_key = 'a'),
    'changing tariff text clears its vector');

update public.knowledge_chunks set body = 'Новый текст инструкции.'
where heading = 'Тестовая инструкция по оплате';

select lives_ok($$
    select public.save_knowledge_embeddings(jsonb_build_array(jsonb_build_object(
        'content', 'title: Тестовая инструкция по оплате | text: Номер договора используется для оплаты.',
        'embedding', ((array[1::real] || array_fill(0::real, array[767]))::extensions.vector)::text
    )))
$$, 'an indexing batch can finish after its source text changes');

select ok(not (public.search_knowledge_vector(
    (array[1::real] || array_fill(0::real, array[767]))::extensions.vector)->'chunks'
    @> '[{"heading":"Тестовая инструкция по оплате"}]'::jsonb),
    'a stale indexing batch cannot restore the old vector');
select ok(exists (select 1 from public.pending_knowledge_embeddings(50)
    where content = 'title: Тестовая инструкция по оплате | text: Новый текст инструкции.'),
    'edited content is queued for indexing');
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
select ok(to_regclass('public.knowledge_embeddings') is null
    and to_regclass('public.knowledge_embedding_inputs') is null,
    'vectors no longer use a separate table or view');

select * from finish();
rollback;

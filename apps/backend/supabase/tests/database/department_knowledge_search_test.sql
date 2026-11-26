begin;
select plan(10);

select ok(to_regclass('public.knowledge_sources') is null
    and to_regclass('public.knowledge_chunks') is null
    and to_regclass('public.knowledge_tariffs') is null
    and to_regclass('public.knowledge_embeddings') is null
    and to_regclass('public.knowledge_embedding_inputs') is null,
    'legacy knowledge relations are absent');

select ok(to_regprocedure('public.search_knowledge_vector(extensions.vector)') is null
    and to_regprocedure('public.pending_knowledge_embeddings(integer)') is null
    and to_regprocedure('public.save_knowledge_embeddings(jsonb)') is null
    and to_regprocedure('public.knowledge_tariff_embedding_text(text,text)') is null
    and to_regprocedure('public.knowledge_chunk_embedding_text(text,text)') is null,
    'legacy search and indexing functions are absent');

select ok(has_function_privilege('service_role', 'public.search_department_knowledge(extensions.vector)', 'EXECUTE')
    and not has_function_privilege('anon', 'public.search_department_knowledge(extensions.vector)', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public.search_department_knowledge(extensions.vector)', 'EXECUTE'),
    'only the server role can search the department tables');

create temp table department_search_vectors as
select (array[1::real] || array_fill(0::real, array[767]))::extensions.vector as query,
    (array[-1::real] || array_fill(0::real, array[767]))::extensions.vector as opposite;
grant select on department_search_vectors to service_role;

set local role service_role;

insert into public.paid_services (kind, title, audience, price_type, amount, max_amount, embedding)
select 'tariff', 'Test scan', 'foreign_patients', 'range', 100, 125, query from department_search_vectors;
insert into public.paid_services (kind, title, body, embedding)
select 'booking_rule', 'Test booking', 'Book by phone', query from department_search_vectors;
insert into public.research_department (kind, title, body, embedding)
select 'research_area', 'Test lab', 'Research profile', query from department_search_vectors
union all select 'project', 'Unrelated project', 'Different topic', opposite from department_search_vectors;
insert into public.clinical_department (kind, title, body, embedding)
select 'schedule', 'Test schedule', 'Monday to Friday', query from department_search_vectors
union all select 'contact', 'Unindexed contact', 'No vector assigned', null from department_search_vectors;

create temp table department_search_result as
select public.search_department_knowledge(query) as result from department_search_vectors;

select ok((select result->'paidServices' from department_search_result) @>
    '[{"title":"Test scan","audience":"foreign_patients","price_type":"range","amount":"100.00","max_amount":"125.00"}]',
    'the search preserves the tariff, audience, and price range');
select ok((select result->'paidServices' from department_search_result) @>
    '[{"kind":"booking_rule","title":"Test booking","body":"Book by phone"}]', 'booking rules are returned with paid services');
select ok((select result->'researchDepartment' from department_search_result) @>
    '[{"kind":"research_area","title":"Test lab"}]', 'the research table is searchable');
select ok((select result->'clinicalDepartment' from department_search_result) @>
    '[{"kind":"schedule","title":"Test schedule","body":"Monday to Friday"}]', 'the clinical table is searchable');
select ok(not ((select result->'researchDepartment' from department_search_result) @>
    '[{"title":"Unrelated project"}]'), 'distant matches are excluded');
select ok(not ((select result->'clinicalDepartment' from department_search_result) @>
    '[{"title":"Unindexed contact"}]'), 'records without an embedding are excluded');
select is(public.search_department_knowledge(null),
    '{"paidServices":[],"researchDepartment":[],"clinicalDepartment":[]}'::jsonb, 'null queries return empty results');

select * from finish();
rollback;

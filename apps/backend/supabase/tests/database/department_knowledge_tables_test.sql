begin;
select plan(16);

select is((select count(*)::int from pg_class where relrowsecurity and oid in (
    'public.paid_services'::regclass, 'public.research_department'::regclass, 'public.clinical_department'::regclass
)), 3, 'RLS is enabled for the three department tables');

select ok(not exists (
    select 1 from unnest(array['anon', 'authenticated']) as r(role_name)
    cross join unnest(array['public.paid_services', 'public.research_department', 'public.clinical_department']) as t(table_name)
    where has_table_privilege(role_name, table_name, 'SELECT,INSERT,UPDATE,DELETE')
), 'browser roles cannot access department knowledge');

set local role service_role;

select is((select count(*)::int from public.paid_services where guidance_key is not null
    and extensions.vector_dims(embedding) = 768 and extensions.vector_norm(embedding) > 0),
    9, 'the nine paid service guidance records have searchable embeddings');
select is((select array_agg(amount order by amount) from public.paid_services
    where guidance_key in ('maternity_foreign_natural', 'maternity_foreign_cesarean')
        and kind = 'tariff' and audience = 'foreign_patients' and price_type = 'from'),
    array[2000.00,4500.00]::numeric[], 'foreign maternity programs have separate package prices');
select ok((select kind = 'availability_rule' and amount is null and audience = 'belarus_citizens'
    from public.paid_services where guidance_key = 'belarus_child_paid_services'),
    'the restriction for children is accessible by key independently of search ranking');
select ok((select public.search_department_knowledge(embedding) -> 'paidServices'
    from public.paid_services where guidance_key = 'ivf_booking') @>
    '[{"kind":"booking_rule","title":"Запись на консультацию по ЭКО"}]',
    'IVF booking can also be found by vector search');

insert into public.paid_services (kind, title, audience, price_type, amount, max_amount, embedding) values
    ('tariff', 'Consultation', 'Adults', 'range', 100, 150, ('[1' || repeat(',0', 767) || ']')::extensions.vector),
    ('tariff', 'Consultation', 'Children', 'fixed', 80, null, null);
insert into public.paid_services (kind, title, body) values ('payment_rule', 'Payment', 'Pay at the reception desk.');
insert into public.research_department (kind, title, body, embedding) values
    ('project', 'Research project', 'Project description', ('[1' || repeat(',0', 767) || ']')::extensions.vector);
insert into public.clinical_department (kind, title, body, embedding) values
    ('schedule', 'Reception', 'Monday to Friday', ('[1' || repeat(',0', 767) || ']')::extensions.vector);

select is((select array_agg(amount order by amount) from public.paid_services where title = 'Consultation'),
    array[80.00,100.00]::numeric[], 'a service can have multiple tariff variants');

select throws_ok(
    $$insert into public.paid_services (kind, title, amount) values ('tariff', 'Missing price type', 100)$$,
    '23514', null, 'tariffs require a price type'
);
select throws_ok(
    $$insert into public.paid_services (kind, title, price_type, amount) values ('tariff', 'Incomplete range', 'range', 100)$$,
    '23514', null, 'range tariffs require a maximum amount'
);
select throws_ok(
    $$insert into public.paid_services (kind, title, price_type, amount, max_amount)
      values ('tariff', 'Reversed range', 'range', 150, 100)$$,
    '23514', null, 'the upper bound cannot be lower than the amount'
);
select throws_ok(
    $$insert into public.paid_services (kind, title) values ('booking_rule', 'Missing text')$$,
    '23514', null, 'booking rules require a body'
);
select throws_ok(
    $$insert into public.clinical_department (kind, title, body, embedding) values ('unit', 'Unit', 'Description', '[1,0]')$$,
    '22000', null, 'clinical embeddings must have 768 dimensions'
);

update public.paid_services set amount = 120 where title = 'Consultation' and audience = 'Adults';
select ok((select embedding is not null from public.paid_services where title = 'Consultation' and audience = 'Adults'),
    'changing the price preserves the embedding');
update public.paid_services set audience = 'All ages' where title = 'Consultation' and audience = 'Adults';
select ok((select embedding is null from public.paid_services where title = 'Consultation' and audience = 'All ages'),
    'changing tariff search text clears the embedding');
update public.research_department set title = 'Renamed project' where title = 'Research project';
select ok((select embedding is null from public.research_department where title = 'Renamed project'),
    'renaming a research entry clears the embedding');
update public.clinical_department set body = 'Monday to Thursday' where title = 'Reception';
select ok((select embedding is null from public.clinical_department where title = 'Reception'),
    'editing clinical text clears the embedding');

reset role;
select * from finish();
rollback;

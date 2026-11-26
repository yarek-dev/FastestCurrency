create function public.search_department_knowledge(p_embedding extensions.vector)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
    with paid as (
        select p.id::text as id, p.kind, p.title, p.body, p.section, p.audience, p.unit,
            p.price_label, p.price_type, p.amount::text, p.max_amount::text, p.effective_from,
            p.embedding operator(extensions.<=>) p_embedding::extensions.vector(768) as distance
        from public.paid_services p
        where p.embedding is not null and p_embedding is not null
        order by distance, p.id
        limit 8
    ), research as (
        select r.id::text as id, r.kind, r.title, left(r.body, 2500) as body,
            r.embedding operator(extensions.<=>) p_embedding::extensions.vector(768) as distance
        from public.research_department r
        where r.embedding is not null and p_embedding is not null
        order by distance, r.id
        limit 4
    ), clinical as (
        select c.id::text as id, c.kind, c.title, left(c.body, 2500) as body,
            c.embedding operator(extensions.<=>) p_embedding::extensions.vector(768) as distance
        from public.clinical_department c
        where c.embedding is not null and p_embedding is not null
        order by distance, c.id
        limit 5
    )
    select jsonb_build_object(
        'paidServices', coalesce((select jsonb_agg(to_jsonb(p) - 'distance' order by p.distance, p.id::bigint)
            from paid p where p.distance <= 0.55), '[]'::jsonb),
        'researchDepartment', coalesce((select jsonb_agg(to_jsonb(r) - 'distance' order by r.distance, r.id::bigint)
            from research r where r.distance <= 0.55), '[]'::jsonb),
        'clinicalDepartment', coalesce((select jsonb_agg(to_jsonb(c) - 'distance' order by c.distance, c.id::bigint)
            from clinical c where c.distance <= 0.55), '[]'::jsonb)
    );
$$;

revoke execute on function public.search_department_knowledge(extensions.vector) from public, anon, authenticated;
grant execute on function public.search_department_knowledge(extensions.vector) to service_role;

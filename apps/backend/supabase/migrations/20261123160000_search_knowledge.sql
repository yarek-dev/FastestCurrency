create function public.search_knowledge(p_query text)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
    with query as (
        select to_tsquery('pg_catalog.russian'::regconfig, string_agg(quote_literal(term), ' | ')) as terms
        from unnest(tsvector_to_array(to_tsvector('pg_catalog.russian'::regconfig, left(p_query, 240)))) as t(term)
    ),
    tariffs as (
        select t.service_name, t.section, t.audience, t.unit, t.price_label, t.source_value,
            t.price_type, t.amount::text, t.max_amount::text, t.currency, t.effective_date,
            ts_rank(t.search_text, q.terms) as rank, t.id
        from public.knowledge_tariffs t cross join query q
        where t.search_text @@ q.terms
        order by rank desc, t.id
        limit 12
    ),
    chunks as (
        select c.heading, left(c.body, 2500) as body, ts_rank(c.search_text, q.terms) as rank, c.id
        from public.knowledge_chunks c cross join query q
        where c.search_text @@ q.terms
        order by rank desc, c.id
        limit 4
    )
    select jsonb_build_object(
        'tariffs', coalesce((select jsonb_agg(to_jsonb(t) - 'rank' - 'id' order by t.rank desc, t.id) from tariffs t), '[]'::jsonb),
        'chunks', coalesce((select jsonb_agg(to_jsonb(c) - 'rank' - 'id' order by c.rank desc, c.id) from chunks c), '[]'::jsonb)
    );
$$;

revoke execute on function public.search_knowledge(text) from public, anon, authenticated;
grant execute on function public.search_knowledge(text) to service_role;

create function public.search_knowledge_vector(p_embedding extensions.vector)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
    with matches as (
        select i.kind, i.id, e.embedding operator(extensions.<=>) p_embedding::extensions.vector(768) as distance
        from public.knowledge_embedding_inputs i join public.knowledge_embeddings e using (content_hash)
        where p_embedding is not null
    ),
    tariffs as (
        select t.service_name, t.section, t.audience, t.unit, t.price_label, t.source_value,
            t.price_type, t.amount::text, t.max_amount::text, t.currency, t.effective_date,
            m.distance, t.id
        from matches m join public.knowledge_tariffs t on m.kind = 'tariff' and m.id = t.id
        where m.distance <= 0.55
        order by m.distance, t.id
        limit 12
    ),
    chunks as (
        select c.heading, left(c.body, 2500) as body, m.distance, c.id
        from matches m join public.knowledge_chunks c on m.kind = 'chunk' and m.id = c.id
        where m.distance <= 0.55
        order by m.distance, c.id
        limit 4
    )
    select jsonb_build_object(
        'tariffs', coalesce((select jsonb_agg(to_jsonb(t) - 'distance' - 'id' order by t.distance, t.id) from tariffs t), '[]'::jsonb),
        'chunks', coalesce((select jsonb_agg(to_jsonb(c) - 'distance' - 'id' order by c.distance, c.id) from chunks c), '[]'::jsonb)
    );
$$;

revoke execute on function public.search_knowledge_vector(extensions.vector) from public, anon, authenticated;
grant execute on function public.search_knowledge_vector(extensions.vector) to service_role;

drop function public.search_knowledge(text);
drop function public.search_knowledge_hybrid(text, extensions.vector);

-- Dropping the generated columns also removes their GIN indexes.
alter table public.knowledge_chunks drop column search_text;
alter table public.knowledge_tariffs drop column search_text;

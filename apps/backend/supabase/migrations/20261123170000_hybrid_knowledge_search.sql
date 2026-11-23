create extension if not exists vector with schema extensions;

create table public.knowledge_embeddings (
    content_hash text primary key check (content_hash ~ '^[a-f0-9]{64}$'),
    embedding extensions.vector(768) not null check (extensions.vector_norm(embedding) > 0)
);

alter table public.knowledge_embeddings enable row level security;
revoke all on public.knowledge_embeddings from public, anon, authenticated;
grant select, insert on public.knowledge_embeddings to service_role;

-- Identical service descriptions share a vector. The current text determines the
-- key, so an import that changes the text immediately stops using the old vector.
create view public.knowledge_embedding_inputs with (security_invoker = true) as
select kind, id, content,
    encode(sha256(convert_to('gemini-embedding-2:768:' || content, 'UTF8')), 'hex') as content_hash
from (
    select 'tariff'::text as kind, id,
        'title: ' || service_name || ' | text: ' || coalesce(section, service_name) as content
    from public.knowledge_tariffs
    union all
    select 'chunk', id, 'title: ' || coalesce(heading, 'none') || ' | text: ' || left(body, 2500)
    from public.knowledge_chunks
) inputs;

revoke all on public.knowledge_embedding_inputs from public, anon, authenticated;
grant select on public.knowledge_embedding_inputs to service_role;

create function public.pending_knowledge_embeddings(p_limit integer)
returns table (content_hash text, content text)
language sql
stable
security invoker
set search_path = ''
as $$
    select distinct i.content_hash, i.content
    from public.knowledge_embedding_inputs i
    where not exists (select 1 from public.knowledge_embeddings e where e.content_hash = i.content_hash)
    order by i.content_hash
    limit greatest(1, least(coalesce(p_limit, 16), 50));
$$;

create function public.search_knowledge_hybrid(p_query text, p_embedding extensions.vector)
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
    keyword_scores as (
        select 'tariff'::text as kind, t.id, ts_rank(t.search_text, q.terms) as score
        from public.knowledge_tariffs t cross join query q
        where t.search_text @@ q.terms
        union all
        select 'chunk', c.id, ts_rank(c.search_text, q.terms)
        from public.knowledge_chunks c cross join query q
        where c.search_text @@ q.terms
    ),
    semantic_scores as (
        select i.kind, i.id, e.embedding operator(extensions.<=>) p_embedding::extensions.vector(768) as distance
        from public.knowledge_embedding_inputs i join public.knowledge_embeddings e using (content_hash)
        where p_embedding is not null
    ),
    rankings as (
        select kind, id, row_number() over (partition by kind order by score desc, id) as position
        from keyword_scores
        union all
        select kind, id, row_number() over (partition by kind order by distance, id)
        from semantic_scores
        where distance <= 0.55
    ),
    combined as (
        select kind, id, sum(1.0 / (60 + position)) as score
        from rankings
        where position <= 24
        group by kind, id
    ),
    tariffs as (
        select t.service_name, t.section, t.audience, t.unit, t.price_label, t.source_value,
            t.price_type, t.amount::text, t.max_amount::text, t.currency, t.effective_date,
            r.score, t.id
        from combined r join public.knowledge_tariffs t on r.kind = 'tariff' and r.id = t.id
        order by r.score desc, t.id
        limit 12
    ),
    chunks as (
        select c.heading, left(c.body, 2500) as body, r.score, c.id
        from combined r join public.knowledge_chunks c on r.kind = 'chunk' and r.id = c.id
        order by r.score desc, c.id
        limit 4
    )
    select jsonb_build_object(
        'tariffs', coalesce((select jsonb_agg(to_jsonb(t) - 'score' - 'id' order by t.score desc, t.id) from tariffs t), '[]'::jsonb),
        'chunks', coalesce((select jsonb_agg(to_jsonb(c) - 'score' - 'id' order by c.score desc, c.id) from chunks c), '[]'::jsonb)
    );
$$;

create or replace function public.search_knowledge(p_query text)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
    select public.search_knowledge_hybrid(p_query, null::extensions.vector);
$$;

revoke execute on function public.pending_knowledge_embeddings(integer),
    public.search_knowledge_hybrid(text, extensions.vector) from public, anon, authenticated;
grant execute on function public.pending_knowledge_embeddings(integer),
    public.search_knowledge_hybrid(text, extensions.vector) to service_role;

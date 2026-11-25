alter table public.knowledge_tariffs add column embedding extensions.vector(768)
    check (extensions.vector_norm(embedding) > 0);
alter table public.knowledge_chunks add column embedding extensions.vector(768)
    check (extensions.vector_norm(embedding) > 0);

update public.knowledge_tariffs t set embedding = e.embedding
from public.knowledge_embedding_inputs i join public.knowledge_embeddings e using (content_hash)
where i.kind = 'tariff' and i.id = t.id;

update public.knowledge_chunks c set embedding = e.embedding
from public.knowledge_embedding_inputs i join public.knowledge_embeddings e using (content_hash)
where i.kind = 'chunk' and i.id = c.id;

create function public.knowledge_tariff_embedding_text(p_service_name text, p_section text)
returns text
language sql
immutable
set search_path = ''
as $$
    select 'title: ' || p_service_name || ' | text: ' || coalesce(p_section, p_service_name);
$$;

create function public.knowledge_chunk_embedding_text(p_heading text, p_body text)
returns text
language sql
immutable
set search_path = ''
as $$
    select 'title: ' || coalesce(p_heading, 'none') || ' | text: ' || left(p_body, 2500);
$$;

create function public.clear_knowledge_embedding()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    new.embedding := null;
    return new;
end;
$$;

create trigger clear_tariff_embedding
before update on public.knowledge_tariffs
for each row when (
    old.embedding is not null and
    public.knowledge_tariff_embedding_text(old.service_name, old.section) is distinct from
    public.knowledge_tariff_embedding_text(new.service_name, new.section)
)
execute function public.clear_knowledge_embedding();

create trigger clear_chunk_embedding
before update on public.knowledge_chunks
for each row when (
    old.embedding is not null and
    public.knowledge_chunk_embedding_text(old.heading, old.body) is distinct from
    public.knowledge_chunk_embedding_text(new.heading, new.body)
)
execute function public.clear_knowledge_embedding();

drop function public.pending_knowledge_embeddings(integer);

create function public.pending_knowledge_embeddings(p_limit integer)
returns table (content text)
language sql
stable
set search_path = ''
as $$
    select public.knowledge_tariff_embedding_text(service_name, section) as content
    from public.knowledge_tariffs where embedding is null
    union
    select public.knowledge_chunk_embedding_text(heading, body)
    from public.knowledge_chunks where embedding is null
    order by content
    limit greatest(1, least(coalesce(p_limit, 16), 50));
$$;

create function public.save_knowledge_embeddings(p_rows jsonb)
returns void
language sql
set search_path = ''
as $$
    with vectors as (
        select r.content, r.embedding
        from jsonb_to_recordset(p_rows) as r(content text, embedding extensions.vector(768))
    ), indexed_tariffs as (
        update public.knowledge_tariffs t set embedding = v.embedding
        from vectors v
        where t.embedding is null
            and public.knowledge_tariff_embedding_text(t.service_name, t.section) = v.content
    )
    update public.knowledge_chunks c set embedding = v.embedding
    from vectors v
    where c.embedding is null
        and public.knowledge_chunk_embedding_text(c.heading, c.body) = v.content;
$$;

create or replace function public.search_knowledge_vector(p_embedding extensions.vector)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
    with tariffs as (
        select t.service_name, t.section, t.audience, t.unit, t.price_label, t.source_value,
            t.price_type, t.amount::text, t.max_amount::text, t.currency, t.effective_date,
            t.embedding operator(extensions.<=>) p_embedding::extensions.vector(768) as distance, t.id
        from public.knowledge_tariffs t
        where t.embedding is not null and p_embedding is not null
        order by distance, t.id
        limit 12
    ), chunks as (
        select c.heading, left(c.body, 2500) as body,
            c.embedding operator(extensions.<=>) p_embedding::extensions.vector(768) as distance, c.id
        from public.knowledge_chunks c
        where c.embedding is not null and p_embedding is not null
        order by distance, c.id
        limit 4
    )
    select jsonb_build_object(
        'tariffs', coalesce((select jsonb_agg(to_jsonb(t) - 'distance' - 'id' order by t.distance, t.id)
            from tariffs t where t.distance <= 0.55), '[]'::jsonb),
        'chunks', coalesce((select jsonb_agg(to_jsonb(c) - 'distance' - 'id' order by c.distance, c.id)
            from chunks c where c.distance <= 0.55), '[]'::jsonb)
    );
$$;

revoke execute on function public.knowledge_tariff_embedding_text(text, text),
    public.knowledge_chunk_embedding_text(text, text), public.clear_knowledge_embedding(),
    public.pending_knowledge_embeddings(integer), public.save_knowledge_embeddings(jsonb)
    from public, anon, authenticated;
grant execute on function public.knowledge_tariff_embedding_text(text, text),
    public.knowledge_chunk_embedding_text(text, text),
    public.pending_knowledge_embeddings(integer), public.save_knowledge_embeddings(jsonb)
    to service_role;

drop view public.knowledge_embedding_inputs;
drop table public.knowledge_embeddings;

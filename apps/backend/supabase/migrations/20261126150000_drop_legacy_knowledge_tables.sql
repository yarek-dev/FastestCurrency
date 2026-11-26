drop function public.search_knowledge_vector(extensions.vector);
drop function public.pending_knowledge_embeddings(integer);
drop function public.save_knowledge_embeddings(jsonb);

drop table public.knowledge_chunks, public.knowledge_tariffs, public.knowledge_sources;

drop function public.knowledge_tariff_embedding_text(text, text);
drop function public.knowledge_chunk_embedding_text(text, text);

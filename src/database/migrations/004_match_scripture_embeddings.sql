-- ==============================================================================
-- Migration: 004_match_scripture_embeddings.sql
-- Description: RPC function for cosine similarity vector search on scripture_embeddings
-- Step 09: Semantic Vector Search with pgvector for Madhav.ai
-- ==============================================================================

-- Create or replace the match_scripture_embeddings function
-- Uses cosine distance operator (<=>) where similarity = 1 - (embedding <=> query_embedding)
CREATE OR REPLACE FUNCTION public.match_scripture_embeddings(
    query_embedding vector(768),
    match_threshold float DEFAULT 0.0,
    match_count int DEFAULT 5,
    filter_language text DEFAULT NULL
)
RETURNS TABLE (
    id text,
    verse_id text,
    translation_id text,
    source_id text,
    model text,
    similarity float,
    input_text text,
    metadata jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT
        se.id,
        se.verse_id,
        se.translation_id,
        se.source_id,
        se.model,
        (1 - (se.embedding <=> query_embedding))::float AS similarity,
        se.input_text,
        se.metadata
    FROM public.scripture_embeddings se
    LEFT JOIN public.scripture_translations st ON st.id = se.translation_id
    WHERE
        (filter_language IS NULL OR st.language = filter_language OR se.translation_id IS NULL)
        AND (1 - (se.embedding <=> query_embedding)) >= match_threshold
    ORDER BY se.embedding <=> query_embedding ASC
    LIMIT match_count;
END;
$$;

-- Grant execution permissions
GRANT EXECUTE ON FUNCTION public.match_scripture_embeddings TO anon, authenticated, service_role;

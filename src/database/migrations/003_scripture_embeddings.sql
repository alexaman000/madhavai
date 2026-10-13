-- ==============================================================================
-- Migration: 003_scripture_embeddings.sql
-- Description: pgvector extension and scripture_embeddings table
-- Step 08: Generate, store, and validate embeddings for Bhagavad Gita Knowledge Base
-- ==============================================================================

-- 1. Enable pgvector extension (Supabase supports pgvector natively)
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Scripture Embeddings Table
-- Model: text-embedding-004 / gemini-embedding-001 (dimension 768 recommended standard)
CREATE TABLE IF NOT EXISTS public.scripture_embeddings (
    id TEXT PRIMARY KEY, -- e.g. 'emb-BG-2.47-src_sivananda_1942-en-gemini-embedding-001'
    verse_id TEXT NOT NULL REFERENCES public.scripture_verses(id) ON DELETE CASCADE,
    translation_id TEXT REFERENCES public.scripture_translations(id) ON DELETE CASCADE,
    source_id TEXT REFERENCES public.scripture_sources(id) ON DELETE SET NULL,
    provider TEXT NOT NULL DEFAULT 'google',
    model TEXT NOT NULL, -- e.g. 'gemini-embedding-001' or 'text-embedding-004'
    dimension INTEGER NOT NULL DEFAULT 768,
    content_hash TEXT NOT NULL, -- SHA-256 hash of deterministic input text
    input_text TEXT NOT NULL, -- Normalized input text that was embedded
    embedding vector(768) NOT NULL, -- Vector column enforced to 768 dimensions
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_verse_translation_model UNIQUE (verse_id, translation_id, model)
);

-- 3. Performance Indexes
CREATE INDEX IF NOT EXISTS idx_scripture_embeddings_verse_id 
ON public.scripture_embeddings (verse_id);

CREATE INDEX IF NOT EXISTS idx_scripture_embeddings_model 
ON public.scripture_embeddings (model);

CREATE INDEX IF NOT EXISTS idx_scripture_embeddings_content_hash 
ON public.scripture_embeddings (content_hash);

-- HNSW Vector Index for efficient similarity search (ready for future retrieval)
CREATE INDEX IF NOT EXISTS idx_scripture_embeddings_vector_hnsw 
ON public.scripture_embeddings USING hnsw (embedding vector_cosine_ops);

-- 4. Row Level Security (RLS)
ALTER TABLE public.scripture_embeddings ENABLE ROW LEVEL SECURITY;

-- 5. Policies: Public read, backend service / anon controlled write
DROP POLICY IF EXISTS "Public can read scripture embeddings" ON public.scripture_embeddings;
CREATE POLICY "Public can read scripture embeddings" ON public.scripture_embeddings FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow backend insert on scripture_embeddings" ON public.scripture_embeddings;
CREATE POLICY "Allow backend insert on scripture_embeddings" ON public.scripture_embeddings FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Allow backend update on scripture_embeddings" ON public.scripture_embeddings;
CREATE POLICY "Allow backend update on scripture_embeddings" ON public.scripture_embeddings FOR UPDATE USING (true);

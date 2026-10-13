-- ==============================================================================
-- Migration: 002_scriptures_schema.sql
-- Description: Structured, normalized schema for Bhagavad Gita Knowledge Base
-- Step 07: Scriptures, Chapters, Verses, Translations, and Sources
-- ==============================================================================

-- 1. Scripture Sources Table (Tracks provenance, editions, licenses, and rights)
CREATE TABLE IF NOT EXISTS public.scripture_sources (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    author_or_translator TEXT NOT NULL,
    license TEXT NOT NULL, -- e.g. 'Public Domain', 'CC-BY-SA 4.0'
    publication_year INTEGER,
    publisher TEXT,
    source_url TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 2. Scripture Chapters Table
CREATE TABLE IF NOT EXISTS public.scripture_chapters (
    id TEXT PRIMARY KEY, -- e.g. 'BG-2'
    scripture_id TEXT NOT NULL DEFAULT 'bhagavad-gita',
    chapter_number INTEGER NOT NULL,
    name_sanskrit TEXT NOT NULL,
    name_transliterated TEXT NOT NULL,
    name_english TEXT NOT NULL,
    verse_count INTEGER NOT NULL,
    summary TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_scripture_chapter UNIQUE (scripture_id, chapter_number)
);

-- 3. Scripture Verses Table
CREATE TABLE IF NOT EXISTS public.scripture_verses (
    id TEXT PRIMARY KEY, -- Stable verse ID e.g. 'BG-2.47'
    scripture_id TEXT NOT NULL DEFAULT 'bhagavad-gita',
    chapter_number INTEGER NOT NULL,
    verse_number INTEGER NOT NULL,
    sanskrit_devanagari TEXT NOT NULL,
    transliteration_iast TEXT NOT NULL,
    verification_status TEXT NOT NULL DEFAULT 'verified', -- 'verified', 'pending', 'unverified'
    verified_by TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_scripture_verse UNIQUE (scripture_id, chapter_number, verse_number)
);

-- 4. Scripture Translations Table
CREATE TABLE IF NOT EXISTS public.scripture_translations (
    id TEXT PRIMARY KEY, -- e.g. 'BG-2.47-sivananda-en'
    verse_id TEXT NOT NULL REFERENCES public.scripture_verses(id) ON DELETE CASCADE,
    source_id TEXT NOT NULL REFERENCES public.scripture_sources(id) ON DELETE RESTRICT,
    language TEXT NOT NULL DEFAULT 'en', -- ISO 639-1 code
    translation_text TEXT NOT NULL,
    word_meanings JSONB, -- Optional word-by-word meanings
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_verse_source_lang UNIQUE (verse_id, source_id, language)
);

-- 5. Indexes for optimal query performance
CREATE INDEX IF NOT EXISTS idx_scripture_verses_lookup 
ON public.scripture_verses (scripture_id, chapter_number, verse_number);

CREATE INDEX IF NOT EXISTS idx_scripture_translations_verse 
ON public.scripture_translations (verse_id);

CREATE INDEX IF NOT EXISTS idx_scripture_chapters_lookup 
ON public.scripture_chapters (scripture_id, chapter_number);

-- 6. Enable Row Level Security (RLS)
ALTER TABLE public.scripture_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scripture_chapters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scripture_verses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scripture_translations ENABLE ROW LEVEL SECURITY;

-- 7. Public read policies (Knowledge base is publicly readable, write restricted to service role)
DROP POLICY IF EXISTS "Public can read scripture sources" ON public.scripture_sources;
CREATE POLICY "Public can read scripture sources" ON public.scripture_sources FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public can read scripture chapters" ON public.scripture_chapters;
CREATE POLICY "Public can read scripture chapters" ON public.scripture_chapters FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public can read scripture verses" ON public.scripture_verses;
CREATE POLICY "Public can read scripture verses" ON public.scripture_verses FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public can read scripture translations" ON public.scripture_translations;
CREATE POLICY "Public can read scripture translations" ON public.scripture_translations FOR SELECT USING (true);

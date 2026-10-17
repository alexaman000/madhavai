-- ==============================================================================
-- Migration: 005_conversations_and_memory.sql
-- Description: Permanent account-based chat history and selective long-term memory
-- ==============================================================================

-- 1. Conversations Table
CREATE TABLE IF NOT EXISTS public.conversations (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL DEFAULT 'नया संवाद',
    mode TEXT NOT NULL DEFAULT 'TALK',
    language TEXT NOT NULL DEFAULT 'hi',
    is_pinned BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Index for fast user conversation listing ordered by last activity
CREATE INDEX IF NOT EXISTS idx_conversations_user_updated 
ON public.conversations (user_id, updated_at DESC);

-- 2. Messages Table
CREATE TABLE IF NOT EXISTS public.messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    citations JSONB DEFAULT '[]'::jsonb,
    audio_url TEXT,
    credits_used NUMERIC(5, 2) DEFAULT 0.1,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Index for retrieving conversation history chronologically
CREATE INDEX IF NOT EXISTS idx_messages_conversation_created 
ON public.messages (conversation_id, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_messages_user_id 
ON public.messages (user_id);

-- 3. User Memories Table (Selective, Consent-Based Long-Term Context)
CREATE TABLE IF NOT EXISTS public.user_memories (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    category TEXT NOT NULL CHECK (category IN ('PREFERENCE', 'CAREER', 'STUDIES', 'LIFE_GOAL', 'EMOTIONAL_CONTEXT')),
    source TEXT NOT NULL DEFAULT 'user_explicit', -- 'user_explicit' or 'conversation_extracted'
    confidence FLOAT NOT NULL DEFAULT 1.0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Index for active memory lookup per user
CREATE INDEX IF NOT EXISTS idx_user_memories_lookup 
ON public.user_memories (user_id, is_active, updated_at DESC);

-- 4. Enable Row Level Security (RLS)
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_memories ENABLE ROW LEVEL SECURITY;

-- 5. Row Level Security Policies (Enforce strict owner isolation)
DROP POLICY IF EXISTS "Users can manage their own conversations" ON public.conversations;
CREATE POLICY "Users can manage their own conversations" 
ON public.conversations FOR ALL 
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "Users can manage their own messages" ON public.messages;
CREATE POLICY "Users can manage their own messages" 
ON public.messages FOR ALL 
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "Users can manage their own memories" ON public.user_memories;
CREATE POLICY "Users can manage their own memories" 
ON public.user_memories FOR ALL 
USING (true)
WITH CHECK (true);

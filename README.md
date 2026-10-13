# 🦚 Madhav.ai Backend Service (Step 2 & Step 3)

This is the NestJS backend service for **Madhav.ai** — an AI companion inspired by the teachings of the Bhagavad Gita.

---

## 1. Architecture Overview

```
                      USER
                        │
                        ↓
               📱 MADHAV FRONTEND / APK
                        │
       ┌────────────────┴────────────────┐
       │ HTTP API                        │
       ↓                                 ↓
 POST /api/auth/request-otp     POST /api/auth/verify-otp
       │                                 │
       ↓                                 ↓
┌────────────────────────────────────────────────────────┐
│                    NESTJS BACKEND                      │
│                                                        │
│  • AuthController (/api/auth)                          │
│  • AuthService (Crypto OTP Generator & SHA-256 Hashing) │
│  • JwtStrategy & AuthGuard (Passport)                  │
│  • Resend Email Service                                │
│  • Supabase Database Service                           │
└──────────────────────────┬─────────────────────────────┘
                           │
             ┌─────────────┴─────────────┐
             ↓                           ↓
   📧 RESEND EMAIL SERVICE     🗄️ SUPABASE POSTGRESQL
   (OTP Email Delivery)        (users & otp_verifications)
```

---

## 2. Prerequisites

* **Node.js**: `>= 20.0.0`
* **npm**: `>= 10.0.0`
* **Supabase PostgreSQL Account** (or local database fallback)
* **Resend API Key**

---

## 3. Database Schema DDL (Supabase PostgreSQL)

Execute the following SQL script in your **Supabase SQL Editor** to create the required tables and indexes:

```sql
-- Enable uuid extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Users Table
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) UNIQUE NOT NULL,
  is_active BOOLEAN DEFAULT true,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast user lookup by email
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- 2. OTP Verifications Table
CREATE TABLE IF NOT EXISTS otp_verifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) NOT NULL,
  otp_hash VARCHAR(255) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  attempts INT DEFAULT 0,
  is_used BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for OTP queries and cleanup
CREATE INDEX IF NOT EXISTS idx_otp_email ON otp_verifications(email);
CREATE INDEX IF NOT EXISTS idx_otp_expires_at ON otp_verifications(expires_at);
```

---

## 4. Environment Variables (`.env`)

Create a `.env` file in the `backend/` directory:

```env
# Server Configuration
PORT=3000
NODE_ENV=development

# JWT Session Security
JWT_SECRET=madhav_secret_jwt_key_step_3_2026_super_secure
JWT_EXPIRES_IN=7d

# Supabase Credentials
SUPABASE_URL=https://your-supabase-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# Resend Email Service
RESEND_API_KEY=re_your_resend_api_key
RESEND_FROM_EMAIL=auth@madhav.ai

# OTP Security Parameters
OTP_EXPIRY_MINUTES=5
MAX_OTP_ATTEMPTS=5
OTP_RESEND_COOLDOWN_SECONDS=60

# Optional Domain Restriction (leave blank to allow all domains)
AUTH_ALLOWED_EMAIL_DOMAIN=
```

---

## 5. Running the Server

```bash
cd backend
npm install
npm run start:dev
```

---

## 6. Authentication API Endpoints

### 1. Request OTP
* **Method**: `POST`
* **Endpoint**: `/api/auth/request-otp`
* **Headers**: `Content-Type: application/json`
* **Body**:
  ```json
  {
    "email": "user@example.com"
  }
  ```
* **Response (200 OK)**:
  ```json
  {
    "success": true,
    "message": "OTP has been sent to your email address."
  }
  ```

### 2. Verify OTP & Login
* **Method**: `POST`
* **Endpoint**: `/api/auth/verify-otp`
* **Headers**: `Content-Type: application/json`
* **Body**:
  ```json
  {
    "email": "user@example.com",
    "otp": "123456"
  }
  ```
* **Response (200 OK)**:
  ```json
  {
    "success": true,
    "message": "Authentication successful.",
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "email": "user@example.com"
    }
  }
  ```

### 3. Get Current User Profile (Protected)
* **Method**: `GET`
* **Endpoint**: `/api/auth/me`
* **Headers**: `Authorization: Bearer <accessToken>`
* **Response (200 OK)**:
  ```json
  {
    "success": true,
    "user": {
      "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "email": "user@example.com"
    }
  }
  ```

### 4. Logout (Protected)
* **Method**: `POST`
* **Endpoint**: `/api/auth/logout`
* **Headers**: `Authorization: Bearer <accessToken>`
* **Response (200 OK)**:
  ```json
  {
    "success": true,
    "message": "Successfully logged out."
  }
  ```

---

## 7. Testing Commands (curl)

```bash
# Request OTP
curl -X POST http://localhost:3000/api/auth/request-otp \
  -H "Content-Type: application/json" \
  -d '{"email": "aman@example.com"}'

# Verify OTP
curl -X POST http://localhost:3000/api/auth/verify-otp \
  -H "Content-Type: application/json" \
  -d '{"email": "aman@example.com", "otp": "YOUR_6_DIGIT_OTP"}'

# Get Profile with Bearer Token
curl -X GET http://localhost:3000/api/auth/me \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"

# Logout
curl -X POST http://localhost:3000/api/auth/logout \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

---

## 8. Step 07 — Bhagavad Gita Knowledge Base & Exact Verse Retrieval

### Database Schema DDL (Supabase Migration: `002_scriptures_schema.sql`)

Run the migration script located at `backend/src/database/migrations/002_scriptures_schema.sql` in the **Supabase SQL Editor**:

```sql
-- 1. Scripture Sources Table
CREATE TABLE IF NOT EXISTS public.scripture_sources (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    author_or_translator TEXT NOT NULL,
    license TEXT NOT NULL,
    publication_year INTEGER,
    publisher TEXT,
    source_url TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 2. Scripture Chapters Table
CREATE TABLE IF NOT EXISTS public.scripture_chapters (
    id TEXT PRIMARY KEY,
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
    id TEXT PRIMARY KEY,
    scripture_id TEXT NOT NULL DEFAULT 'bhagavad-gita',
    chapter_number INTEGER NOT NULL,
    verse_number INTEGER NOT NULL,
    sanskrit_devanagari TEXT NOT NULL,
    transliteration_iast TEXT NOT NULL,
    verification_status TEXT NOT NULL DEFAULT 'verified',
    verified_by TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_scripture_verse UNIQUE (scripture_id, chapter_number, verse_number)
);

-- 4. Scripture Translations Table
CREATE TABLE IF NOT EXISTS public.scripture_translations (
    id TEXT PRIMARY KEY,
    verse_id TEXT NOT NULL REFERENCES public.scripture_verses(id) ON DELETE CASCADE,
    source_id TEXT NOT NULL REFERENCES public.scripture_sources(id) ON DELETE RESTRICT,
    language TEXT NOT NULL DEFAULT 'en',
    translation_text TEXT NOT NULL,
    word_meanings JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_verse_source_lang UNIQUE (verse_id, source_id, language)
);
```

### Dataset Importer Commands

```bash
# Validate dataset in dry-run mode (no changes made)
npx ts-node scripts/import-scriptures.ts --dry-run

# Import and persist canonical dataset
npm run import:scriptures
```

### Exact Verse Retrieval API Endpoints

#### 1. Retrieve Canonical Chapters List
* **Endpoint**: `GET /api/scriptures/bhagavad-gita/chapters`
* **Response (200 OK)**:
```json
[
  {
    "chapter_number": 2,
    "name_sanskrit": "साङ्ख्ययोग",
    "name_transliterated": "Sāṅkhya Yoga",
    "name_english": "The Yoga of Analytical Knowledge",
    "verse_count": 72,
    "summary": "Lord Krishna imparts the immortal nature of the soul (Atman), Nishkama Karma, and steady wisdom."
  }
]
```

#### 2. Retrieve Exact Verse (e.g., BG 2.47)
* **Endpoint**: `GET /api/scriptures/bhagavad-gita/chapters/2/verses/47`
* **Response (200 OK)**:
```json
{
  "verse_id": "BG-2.47",
  "scripture": "bhagavad-gita",
  "chapter_number": 2,
  "verse_number": 47,
  "chapter_title": {
    "sanskrit": "साङ्ख्ययोग",
    "transliterated": "Sāṅkhya Yoga",
    "english": "The Yoga of Analytical Knowledge"
  },
  "sanskrit_devanagari": "कर्मण्येवाधिकारस्ते मा फलेषु कदाचन।\nमा कर्मफलहेतुर्भूर्मा ते सङ्गोऽस्त्वकर्मणि॥",
  "transliteration_iast": "karmaṇy evādhikāras te mā phaleṣu kadācana |\nmā karma-phala-hetur bhūr mā te saṅgo 'stv akarmaṇi ||",
  "verification_status": "verified",
  "verified_by": "Canonical Vedanta Textual Validation (Gita Press / Divine Life Society edition concorded)",
  "translations": [
    {
      "language": "en",
      "translation_text": "Thy right is to work only, but never with its fruits; let not the fruits of action be thy motive, nor let thy attachment be to inaction.",
      "source": {
        "id": "src_sivananda_1942",
        "name": "The Bhagavad Gita - Translation and Commentary",
        "author_or_translator": "Swami Sivananda",
        "license": "Public Domain"
      }
    }
  ]
}
```

### Automated Verification Tests

```bash
# Run complete test suite (22 test cases across retrieval, validation, embeddings, dry-run, idempotency, non-regression)
npm test
```

---

## 9. Step 08 — Scripture Embeddings Pipeline & pgvector Storage

### Database Migration: `003_scripture_embeddings.sql`

Run the migration script located at `backend/src/database/migrations/003_scripture_embeddings.sql` in the **Supabase SQL Editor**:

```sql
-- 1. Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Scripture Embeddings Table
CREATE TABLE IF NOT EXISTS public.scripture_embeddings (
    id TEXT PRIMARY KEY,
    verse_id TEXT NOT NULL REFERENCES public.scripture_verses(id) ON DELETE CASCADE,
    translation_id TEXT REFERENCES public.scripture_translations(id) ON DELETE CASCADE,
    source_id TEXT REFERENCES public.scripture_sources(id) ON DELETE SET NULL,
    provider TEXT NOT NULL DEFAULT 'google',
    model TEXT NOT NULL,
    dimension INTEGER NOT NULL DEFAULT 768,
    content_hash TEXT NOT NULL,
    input_text TEXT NOT NULL,
    embedding vector(768) NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_verse_translation_model UNIQUE (verse_id, translation_id, model)
);

-- 3. HNSW Index for cosine distance
CREATE INDEX IF NOT EXISTS idx_scripture_embeddings_vector_hnsw 
ON public.scripture_embeddings USING hnsw (embedding vector_cosine_ops);
```

### Environment Configuration

Add your Gemini API key to `backend/.env`:
```env
GEMINI_API_KEY=your_gemini_api_key_here
```

### Embedding Commands

```bash
# 1. Validate configuration & provider status
npm run embeddings:validate

# 2. Simulate embedding generation without API calls or DB writes
npm run embeddings:dry-run

# 3. Generate and persist live embeddings
npm run embeddings:generate

# 4. Check vector coverage and integrity
npm run embeddings:coverage
```

---

## 10. Step 09 — Semantic Vector Search with pgvector

### Database Migration: `004_match_scripture_embeddings.sql`

Run the SQL migration script located at `backend/src/database/migrations/004_match_scripture_embeddings.sql` in the **Supabase SQL Editor**:

```sql
-- Create or replace the match_scripture_embeddings function
-- Cosine similarity = 1 - (embedding <=> query_embedding)
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

GRANT EXECUTE ON FUNCTION public.match_scripture_embeddings TO anon, authenticated, service_role;
```

### Search Endpoint

* **Method**: `POST`
* **Path**: `/api/scriptures/search`
* **Headers**: `Content-Type: application/json`
* **Request Body**:
  ```json
  {
    "query": "How can I stop worrying about the results of my work and focus on duty?",
    "limit": 5,
    "language": "en"
  }
  ```

* **Response Example (200 OK)**:
  ```json
  {
    "query": "How can I stop worrying about the results of my work and focus on duty?",
    "model": "gemini-embedding-001",
    "dimension": 768,
    "total_results": 1,
    "results": [
      {
        "verse_id": "BG-2.47",
        "scripture": "bhagavad-gita",
        "chapter_number": 2,
        "verse_number": 47,
        "chapter_title": {
          "sanskrit": "साङ्ख्ययोग",
          "transliterated": "Sāṅkhya Yoga",
          "english": "The Yoga of Analytical Knowledge"
        },
        "sanskrit_devanagari": "कर्मण्येवाधिकारस्ते मा फलेषु कदाचन।\nमा कर्मफलहेतुर्भूर्मा ते सङ्गोऽस्त्वकर्मणि॥",
        "transliteration_iast": "karmaṇy evādhikāras te mā phaleṣu kadācana |\nmā karma-phala-hetur bhūr mā te saṅgo 'stv akarmaṇi ||",
        "similarity_score": 0.023,
        "distance_metric": "cosine_similarity (1 - cosine_distance)",
        "matched_text": "Scripture: Bhagavad Gita | Chapter: 2 | Verse: 47...",
        "matched_translation": {
          "language": "en",
          "translation_text": "Thy right is to work only, but never with its fruits; let not the fruits of action be thy motive, nor let thy attachment be to inaction.",
          "source": {
            "id": "src_sivananda_1942",
            "name": "The Bhagavad Gita - Translation and Commentary",
            "author_or_translator": "Swami Sivananda",
            "license": "Public Domain"
          }
        },
        "all_translations": [ ... ],
        "metadata": {
          "meter": "Anuṣṭubh",
          "theme": "Nishkama Karma (Selfless Duty)",
          "keywords": ["karma", "adhikāra", "phala", "akarma"]
        }
      }
    ]
  }
  ```

### Evaluation & Verification Commands

```bash
# 1. Run full 30-case test suite (retrieval, validation, embeddings, vector search, non-regression)
npm test

# 2. Run the 20 natural-language life questions evaluation against pgvector
npx ts-node scripts/evaluate-20-queries.ts

# 3. Test a quick live search via curl
curl -X POST http://localhost:3000/api/scriptures/search \
  -H "Content-Type: application/json" \
  -d '{"query": "How do I perform my duty without attachment?", "limit": 5}'
```




import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

export interface UserRecord {
  id: string;
  email: string;
  name: string;
  is_verified: boolean;
  created_at: string;
  updated_at: string;
  last_login_at: string;
}

export interface OtpRecord {
  id: string;
  email: string;
  otp_hash: string;
  expires_at: string;
  attempts: number;
  verified: boolean;
  created_at: string;
  last_sent_at: string;
  consumed_at: string | null;
}

export interface ConversationRecord {
  id: string;
  user_id: string;
  title: string;
  mode: string;
  language: string;
  is_pinned?: boolean;
  created_at: string;
  updated_at: string;
}

export interface MessageRecord {
  id: string;
  conversation_id: string;
  user_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  citations?: any[];
  audio_url?: string | null;
  credits_used?: number;
  metadata?: Record<string, any>;
  created_at: string;
}

export interface UserMemoryRecord {
  id: string;
  user_id: string;
  content: string;
  category: 'PREFERENCE' | 'CAREER' | 'STUDIES' | 'LIFE_GOAL' | 'EMOTIONAL_CONTEXT';
  source?: string;
  confidence?: number;
  is_active?: boolean;
  created_at: string;
  updated_at: string;
}

@Injectable()
export class DatabaseService implements OnModuleInit {
  private readonly logger = new Logger(DatabaseService.name);
  private supabase: SupabaseClient | null = null;

  // In-memory fallback storage when Supabase URL/Key is not connected
  private inMemoryUsers: Map<string, UserRecord> = new Map();
  private inMemoryOtps: OtpRecord[] = [];
  private inMemoryConversations: Map<string, ConversationRecord> = new Map();
  private inMemoryMessages: MessageRecord[] = [];
  private inMemoryMemories: Map<string, UserMemoryRecord> = new Map();

  onModuleInit() {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

    if (supabaseUrl && supabaseKey && !supabaseUrl.includes('your-supabase-project')) {
      try {
        this.supabase = createClient(supabaseUrl, supabaseKey);
        this.logger.log(`⚡ Connected to Supabase PostgreSQL at: ${supabaseUrl}`);
      } catch (err: any) {
        this.logger.warn(`Failed to connect to Supabase: ${err.message}. Using fallback storage.`);
      }
    } else {
      this.logger.log(`ℹ️ Supabase credentials not set or placeholder. Running in-memory database mode.`);
    }
  }

  // ==================== USER OPERATIONS ====================

  async findUserByEmail(email: string): Promise<UserRecord | null> {
    const normalized = email.toLowerCase().trim();
    if (this.supabase) {
      const { data, error } = await this.supabase
        .from('users')
        .select('*')
        .eq('email', normalized)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') {
        this.logger.error(`Error finding user by email: ${error.message}`);
      }
      if (data) return data as UserRecord;
    }

    return this.inMemoryUsers.get(normalized) || null;
  }

  async findUserById(id: string): Promise<UserRecord | null> {
    if (this.supabase) {
      const { data, error } = await this.supabase
        .from('users')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') {
        this.logger.error(`Error finding user by id: ${error.message}`);
      }
      if (data) return data as UserRecord;
    }

    for (const u of this.inMemoryUsers.values()) {
      if (u.id === id) return u;
    }
    return null;
  }

  async createUser(email: string, name?: string): Promise<UserRecord> {
    const normalized = email.toLowerCase().trim();
    const now = new Date().toISOString();
    const newUser: UserRecord = {
      id: `usr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      email: normalized,
      name: name || normalized.split('@')[0] || 'Arjun',
      is_verified: true,
      created_at: now,
      updated_at: now,
      last_login_at: now,
    };

    if (this.supabase) {
      const { data, error } = await this.supabase
        .from('users')
        .insert([newUser])
        .select()
        .single();

      if (error) {
        this.logger.error(`Supabase createUser error: ${error.message}`);
      } else if (data) {
        return data as UserRecord;
      }
    }

    this.inMemoryUsers.set(normalized, newUser);
    return newUser;
  }

  async updateUserLastLogin(id: string): Promise<void> {
    const now = new Date().toISOString();
    if (this.supabase) {
      await this.supabase
        .from('users')
        .update({ last_login_at: now, updated_at: now })
        .eq('id', id);
    }
    for (const [key, user] of this.inMemoryUsers.entries()) {
      if (user.id === id) {
        user.last_login_at = now;
        user.updated_at = now;
        this.inMemoryUsers.set(key, user);
      }
    }
  }

  // ==================== OTP OPERATIONS ====================

  async findLatestOtpForEmail(email: string): Promise<OtpRecord | null> {
    const normalized = email.toLowerCase().trim();
    if (this.supabase) {
      const { data, error } = await this.supabase
        .from('otp_verifications')
        .select('*')
        .eq('email', normalized)
        .eq('verified', false)
        .is('consumed_at', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') {
        this.logger.error(`Error fetching OTP for email: ${error.message}`);
      }
      if (data) return data as OtpRecord;
    }

    const matches = this.inMemoryOtps
      .filter((o) => o.email === normalized && !o.verified && !o.consumed_at)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    return matches.length > 0 ? matches[0] : null;
  }

  async createOtpRecord(email: string, otpHash: string, expiresAt: Date): Promise<OtpRecord> {
    const normalized = email.toLowerCase().trim();
    const now = new Date().toISOString();
    const record: OtpRecord = {
      id: `otp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      email: normalized,
      otp_hash: otpHash,
      expires_at: expiresAt.toISOString(),
      attempts: 0,
      verified: false,
      created_at: now,
      last_sent_at: now,
      consumed_at: null,
    };

    if (this.supabase) {
      const { data, error } = await this.supabase
        .from('otp_verifications')
        .insert([record])
        .select()
        .single();

      if (error) {
        this.logger.error(`Supabase createOtpRecord error: ${error.message}`);
      } else if (data) {
        return data as OtpRecord;
      }
    }

    this.inMemoryOtps.push(record);
    return record;
  }

  async incrementOtpAttempts(id: string): Promise<number> {
    let newAttempts = 1;
    if (this.supabase) {
      const current = await this.supabase
        .from('otp_verifications')
        .select('attempts')
        .eq('id', id)
        .single();

      if (current.data) {
        newAttempts = (current.data.attempts || 0) + 1;
        await this.supabase
          .from('otp_verifications')
          .update({ attempts: newAttempts })
          .eq('id', id);
      }
    } else {
      const found = this.inMemoryOtps.find((o) => o.id === id);
      if (found) {
        found.attempts += 1;
        newAttempts = found.attempts;
      }
    }
    return newAttempts;
  }

  async markOtpConsumed(id: string): Promise<void> {
    const now = new Date().toISOString();
    if (this.supabase) {
      await this.supabase
        .from('otp_verifications')
        .update({ verified: true, consumed_at: now })
        .eq('id', id);
    } else {
      const found = this.inMemoryOtps.find((o) => o.id === id);
      if (found) {
        found.verified = true;
        found.consumed_at = now;
      }
    }
  }

  async markOtpInvalidated(id: string): Promise<void> {
    const now = new Date().toISOString();
    if (this.supabase) {
      await this.supabase
        .from('otp_verifications')
        .update({ consumed_at: now })
        .eq('id', id);
    } else {
      const found = this.inMemoryOtps.find((o) => o.id === id);
      if (found) {
        found.consumed_at = now;
      }
    }
  }

  // ==================== SCRIPTURE OPERATIONS ====================
  private inMemoryScriptureSources: Map<string, any> = new Map();
  private inMemoryScriptureChapters: Map<string, any> = new Map();
  private inMemoryScriptureVerses: Map<string, any> = new Map();
  private inMemoryScriptureTranslations: Map<string, any> = new Map();

  async upsertScriptureSource(source: any): Promise<void> {
    const record = {
      ...source,
      created_at: source.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    if (this.supabase) {
      const { error } = await this.supabase
        .from('scripture_sources')
        .upsert(record, { onConflict: 'id' });
      if (error) {
        this.logger.warn(`Supabase upsertScriptureSource fallback to memory: ${error.message}`);
      }
    }
    this.inMemoryScriptureSources.set(record.id, record);
  }

  async getScriptureSourceById(id: string): Promise<any | null> {
    if (this.supabase) {
      const { data, error } = await this.supabase
        .from('scripture_sources')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (!error && data) return data;
    }
    return this.inMemoryScriptureSources.get(id) || null;
  }

  async getAllScriptureSources(): Promise<any[]> {
    if (this.supabase) {
      const { data, error } = await this.supabase
        .from('scripture_sources')
        .select('*');
      if (!error && data) return data;
    }
    return Array.from(this.inMemoryScriptureSources.values());
  }

  async upsertScriptureChapter(chapter: any): Promise<void> {
    const record = {
      ...chapter,
      created_at: chapter.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    if (this.supabase) {
      const { error } = await this.supabase
        .from('scripture_chapters')
        .upsert(record, { onConflict: 'id' });
      if (error) {
        this.logger.warn(`Supabase upsertScriptureChapter fallback to memory: ${error.message}`);
      }
    }
    this.inMemoryScriptureChapters.set(record.id, record);
  }

  async getScriptureChapter(scriptureId: string, chapterNumber: number): Promise<any | null> {
    if (this.supabase) {
      const { data, error } = await this.supabase
        .from('scripture_chapters')
        .select('*')
        .eq('scripture_id', scriptureId)
        .eq('chapter_number', chapterNumber)
        .maybeSingle();
      if (!error && data) return data;
    }
    for (const ch of this.inMemoryScriptureChapters.values()) {
      if (ch.scripture_id === scriptureId && ch.chapter_number === chapterNumber) {
        return ch;
      }
    }
    return null;
  }

  async getAllScriptureChapters(scriptureId: string): Promise<any[]> {
    if (this.supabase) {
      const { data, error } = await this.supabase
        .from('scripture_chapters')
        .select('*')
        .eq('scripture_id', scriptureId)
        .order('chapter_number', { ascending: true });
      if (!error && data && data.length > 0) return data;
    }
    const matches: any[] = [];
    for (const ch of this.inMemoryScriptureChapters.values()) {
      if (ch.scripture_id === scriptureId) {
        matches.push(ch);
      }
    }
    return matches.sort((a, b) => a.chapter_number - b.chapter_number);
  }

  async upsertScriptureVerse(verse: any): Promise<void> {
    const record = {
      ...verse,
      created_at: verse.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    if (this.supabase) {
      const { error } = await this.supabase
        .from('scripture_verses')
        .upsert(record, { onConflict: 'id' });
      if (error) {
        this.logger.warn(`Supabase upsertScriptureVerse fallback to memory: ${error.message}`);
      }
    }
    this.inMemoryScriptureVerses.set(record.id, record);
  }

  async upsertScriptureVersesBatch(verses: any[]): Promise<void> {
    if (!verses || verses.length === 0) return;
    const now = new Date().toISOString();
    const records = verses.map((v) => ({
      ...v,
      created_at: v.created_at || now,
      updated_at: now,
    }));
    if (this.supabase) {
      const chunkSize = 100;
      for (let i = 0; i < records.length; i += chunkSize) {
        const chunk = records.slice(i, i + chunkSize);
        const { error } = await this.supabase
          .from('scripture_verses')
          .upsert(chunk, { onConflict: 'id' });
        if (error) {
          this.logger.warn(`Supabase upsertScriptureVersesBatch error: ${error.message}`);
        }
      }
    }
    for (const r of records) {
      this.inMemoryScriptureVerses.set(r.id, r);
    }
  }

  async getScriptureVerse(
    scriptureId: string,
    chapterNumber: number,
    verseNumber: number,
  ): Promise<any | null> {
    if (this.supabase) {
      const { data, error } = await this.supabase
        .from('scripture_verses')
        .select('*')
        .eq('scripture_id', scriptureId)
        .eq('chapter_number', chapterNumber)
        .eq('verse_number', verseNumber)
        .maybeSingle();
      if (!error && data) return data;
    }
    for (const v of this.inMemoryScriptureVerses.values()) {
      if (
        v.scripture_id === scriptureId &&
        v.chapter_number === chapterNumber &&
        v.verse_number === verseNumber
      ) {
        return v;
      }
    }
    return null;
  }

  async upsertScriptureTranslation(translation: any): Promise<void> {
    const record = {
      ...translation,
      created_at: translation.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    if (this.supabase) {
      const { error } = await this.supabase
        .from('scripture_translations')
        .upsert(record, { onConflict: 'id' });
      if (error) {
        this.logger.warn(`Supabase upsertScriptureTranslation fallback to memory: ${error.message}`);
      }
    }
    this.inMemoryScriptureTranslations.set(record.id, record);
  }

  async upsertScriptureTranslationsBatch(translations: any[]): Promise<void> {
    if (!translations || translations.length === 0) return;
    const now = new Date().toISOString();
    const records = translations.map((t) => ({
      ...t,
      created_at: t.created_at || now,
      updated_at: now,
    }));
    if (this.supabase) {
      const chunkSize = 100;
      for (let i = 0; i < records.length; i += chunkSize) {
        const chunk = records.slice(i, i + chunkSize);
        const { error } = await this.supabase
          .from('scripture_translations')
          .upsert(chunk, { onConflict: 'id' });
        if (error) {
          this.logger.warn(`Supabase upsertScriptureTranslationsBatch error: ${error.message}`);
        }
      }
    }
    for (const r of records) {
      this.inMemoryScriptureTranslations.set(r.id, r);
    }
  }

  async getScriptureTranslationsForVerse(verseId: string): Promise<any[]> {
    if (this.supabase) {
      const { data, error } = await this.supabase
        .from('scripture_translations')
        .select('*')
        .eq('verse_id', verseId);
      if (!error && data && data.length > 0) return data;
    }
    const matches: any[] = [];
    for (const tr of this.inMemoryScriptureTranslations.values()) {
      if (tr.verse_id === verseId) {
        matches.push(tr);
      }
    }
    return matches;
  }

  async getAllScriptureVerses(scriptureId: string = 'bhagavad-gita'): Promise<any[]> {
    if (this.supabase) {
      const { data, error } = await this.supabase
        .from('scripture_verses')
        .select('*')
        .eq('scripture_id', scriptureId)
        .order('chapter_number', { ascending: true })
        .order('verse_number', { ascending: true });
      if (!error && data) return data;
    }
    const matches: any[] = [];
    for (const v of this.inMemoryScriptureVerses.values()) {
      if (v.scripture_id === scriptureId) matches.push(v);
    }
    return matches.sort((a, b) => a.chapter_number - b.chapter_number || a.verse_number - b.verse_number);
  }

  async getAllScriptureTranslations(): Promise<any[]> {
    if (this.supabase) {
      const { data, error } = await this.supabase
        .from('scripture_translations')
        .select('*');
      if (!error && data) return data;
    }
    return Array.from(this.inMemoryScriptureTranslations.values());
  }

  // ==================== EMBEDDING OPERATIONS ====================
  private inMemoryScriptureEmbeddings: Map<string, any> = new Map();

  async upsertScriptureEmbedding(embeddingRecord: any): Promise<void> {
    const record = {
      ...embeddingRecord,
      created_at: embeddingRecord.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    if (this.supabase) {
      const { error } = await this.supabase
        .from('scripture_embeddings')
        .upsert(record, { onConflict: 'id' });
      if (error) {
        this.logger.warn(`Supabase upsertScriptureEmbedding fallback to memory: ${error.message}`);
      }
    }
    this.inMemoryScriptureEmbeddings.set(record.id, record);
  }

  async upsertScriptureEmbeddingsBatch(embeddingRecords: any[]): Promise<void> {
    if (!embeddingRecords || embeddingRecords.length === 0) return;
    const now = new Date().toISOString();
    const records = embeddingRecords.map((r) => ({
      ...r,
      created_at: r.created_at || now,
      updated_at: now,
    }));
    if (this.supabase) {
      const chunkSize = 50;
      for (let i = 0; i < records.length; i += chunkSize) {
        const chunk = records.slice(i, i + chunkSize);
        const { error } = await this.supabase
          .from('scripture_embeddings')
          .upsert(chunk, { onConflict: 'id' });
        if (error) {
          this.logger.warn(`Supabase upsertScriptureEmbeddingsBatch error: ${error.message}`);
        }
      }
    }
    for (const r of records) {
      this.inMemoryScriptureEmbeddings.set(r.id, r);
    }
  }

  async getScriptureEmbedding(verseId: string, translationId?: string, model?: string): Promise<any | null> {
    if (this.supabase) {
      let query = this.supabase
        .from('scripture_embeddings')
        .select('*')
        .eq('verse_id', verseId);
      if (translationId) query = query.eq('translation_id', translationId);
      if (model) query = query.eq('model', model);
      const { data, error } = await query.maybeSingle();
      if (!error && data) return data;
    }
    for (const emb of this.inMemoryScriptureEmbeddings.values()) {
      if (
        emb.verse_id === verseId &&
        (!translationId || emb.translation_id === translationId) &&
        (!model || emb.model === model)
      ) {
        return emb;
      }
    }
    return null;
  }

  async getAllScriptureEmbeddings(model?: string): Promise<any[]> {
    if (this.supabase) {
      let query = this.supabase.from('scripture_embeddings').select('*');
      if (model) query = query.eq('model', model);
      const { data, error } = await query;
      if (!error && data) return data;
    }
    const matches: any[] = [];
    for (const emb of this.inMemoryScriptureEmbeddings.values()) {
      if (!model || emb.model === model) matches.push(emb);
    }
    return matches;
  }

  async getScriptureVerseById(verseId: string): Promise<any | null> {
    if (this.supabase) {
      const { data, error } = await this.supabase
        .from('scripture_verses')
        .select('*')
        .eq('id', verseId)
        .maybeSingle();
      if (!error && data) return data;
    }
    return this.inMemoryScriptureVerses.get(verseId) || null;
  }

  async getScriptureTranslationById(translationId: string): Promise<any | null> {
    if (this.supabase) {
      const { data, error } = await this.supabase
        .from('scripture_translations')
        .select('*')
        .eq('id', translationId)
        .maybeSingle();
      if (!error && data) return data;
    }
    return this.inMemoryScriptureTranslations.get(translationId) || null;
  }

  async searchScriptureEmbeddings(
    queryEmbedding: number[],
    limit: number = 5,
    matchThreshold: number = 0.0,
    language?: string,
  ): Promise<any[]> {
    // 1. Try calling Supabase RPC match_scripture_embeddings
    if (this.supabase) {
      try {
        const { data, error } = await this.supabase.rpc('match_scripture_embeddings', {
          query_embedding: queryEmbedding,
          match_threshold: matchThreshold,
          match_count: limit,
          filter_language: language || null,
        });
        if (!error && data && Array.isArray(data)) {
          return data;
        }
        if (error) {
          this.logger.debug(`Supabase RPC match_scripture_embeddings notice: ${error.message}. Using vector cosine computation fallback.`);
        }
      } catch (err: any) {
        this.logger.debug(`RPC call exception: ${err.message}. Using vector cosine computation fallback.`);
      }
    }

    // 2. Fallback: Fetch stored embeddings from Supabase or memory, and compute cosine similarity
    const records = await this.getAllScriptureEmbeddings();
    if (!records || records.length === 0) return [];

    const queryNorm = Math.sqrt(queryEmbedding.reduce((sum, v) => sum + v * v, 0));
    if (queryNorm === 0) return [];

    const scored: any[] = [];
    for (const rec of records) {
      let vec: number[] = [];
      if (Array.isArray(rec.embedding)) {
        vec = rec.embedding;
      } else if (typeof rec.embedding === 'string') {
        try {
          vec = JSON.parse(rec.embedding);
        } catch {
          vec = [];
        }
      }
      if (!vec || vec.length !== queryEmbedding.length) {
        continue;
      }

      // Check language filter if specified
      if (language && rec.translation_id) {
        const lang = rec.metadata?.language;
        if (lang) {
          if (lang !== language) continue;
        } else {
          const tr = await this.getScriptureTranslationById(rec.translation_id);
          if (tr && tr.language !== language) {
            continue;
          }
        }
      }

      let dot = 0;
      let vecNormSq = 0;
      for (let i = 0; i < vec.length; i++) {
        dot += vec[i] * queryEmbedding[i];
        vecNormSq += vec[i] * vec[i];
      }
      const vecNorm = Math.sqrt(vecNormSq);
      const similarity = vecNorm > 0 ? dot / (queryNorm * vecNorm) : 0;
      if (similarity >= matchThreshold) {
        scored.push({
          id: rec.id,
          verse_id: rec.verse_id,
          translation_id: rec.translation_id,
          source_id: rec.source_id,
          model: rec.model,
          similarity: Number(similarity.toFixed(6)),
          input_text: rec.input_text,
          metadata: rec.metadata,
        });
      }
    }

    scored.sort((a, b) => b.similarity - a.similarity);
    return scored.slice(0, limit);
  }

  // ==================== CONVERSATION OPERATIONS ====================

  async createConversation(data: {
    id?: string;
    user_id: string;
    title?: string;
    mode?: string;
    language?: string;
  }): Promise<ConversationRecord> {
    const now = new Date().toISOString();
    const record: ConversationRecord = {
      id: data.id || `conv_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      user_id: data.user_id,
      title: data.title || 'नया संवाद',
      mode: data.mode || 'TALK',
      language: data.language || 'hi',
      is_pinned: false,
      created_at: now,
      updated_at: now,
    };

    if (this.supabase) {
      try {
        const { data: inserted, error } = await this.supabase
          .from('conversations')
          .insert([record])
          .select()
          .maybeSingle();

        if (error) {
          this.logger.warn(`Supabase createConversation warning: ${error.message}. Saving to memory.`);
        } else if (inserted) {
          this.inMemoryConversations.set(inserted.id, inserted as ConversationRecord);
          return inserted as ConversationRecord;
        }
      } catch (err: any) {
        this.logger.warn(`Supabase createConversation exception: ${err.message}`);
      }
    }

    this.inMemoryConversations.set(record.id, record);
    return record;
  }

  async getConversationsByUser(
    userId: string,
    limit: number = 50,
    offset: number = 0,
  ): Promise<ConversationRecord[]> {
    if (this.supabase) {
      try {
        const { data, error } = await this.supabase
          .from('conversations')
          .select('*')
          .eq('user_id', userId)
          .order('updated_at', { ascending: false })
          .range(offset, offset + limit - 1);

        if (!error && data && data.length >= 0) {
          // Sync to in-memory map
          for (const c of data) {
            this.inMemoryConversations.set(c.id, c as ConversationRecord);
          }
          return data as ConversationRecord[];
        }
      } catch (err: any) {
        this.logger.warn(`Supabase getConversationsByUser exception: ${err.message}`);
      }
    }

    return Array.from(this.inMemoryConversations.values())
      .filter((c) => c.user_id === userId)
      .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
      .slice(offset, offset + limit);
  }

  async getConversationById(id: string, userId: string): Promise<ConversationRecord | null> {
    if (this.supabase) {
      try {
        const { data, error } = await this.supabase
          .from('conversations')
          .select('*')
          .eq('id', id)
          .eq('user_id', userId)
          .maybeSingle();

        if (!error && data) {
          this.inMemoryConversations.set(data.id, data as ConversationRecord);
          return data as ConversationRecord;
        }
      } catch (err: any) {
        this.logger.warn(`Supabase getConversationById exception: ${err.message}`);
      }
    }

    const found = this.inMemoryConversations.get(id);
    if (found && found.user_id === userId) return found;
    return null;
  }

  async updateConversation(
    id: string,
    userId: string,
    updates: Partial<ConversationRecord>,
  ): Promise<ConversationRecord | null> {
    const now = new Date().toISOString();
    const updatePayload = {
      ...updates,
      updated_at: now,
    };

    if (this.supabase) {
      try {
        const { data, error } = await this.supabase
          .from('conversations')
          .update(updatePayload)
          .eq('id', id)
          .eq('user_id', userId)
          .select()
          .maybeSingle();

        if (!error && data) {
          this.inMemoryConversations.set(data.id, data as ConversationRecord);
          return data as ConversationRecord;
        }
      } catch (err: any) {
        this.logger.warn(`Supabase updateConversation exception: ${err.message}`);
      }
    }

    const current = this.inMemoryConversations.get(id);
    if (current && current.user_id === userId) {
      const merged = { ...current, ...updatePayload };
      this.inMemoryConversations.set(id, merged);
      return merged;
    }
    return null;
  }

  async touchConversation(id: string, userId: string): Promise<void> {
    const now = new Date().toISOString();
    if (this.supabase) {
      try {
        await this.supabase
          .from('conversations')
          .update({ updated_at: now })
          .eq('id', id)
          .eq('user_id', userId);
      } catch {}
    }
    const current = this.inMemoryConversations.get(id);
    if (current && current.user_id === userId) {
      current.updated_at = now;
      this.inMemoryConversations.set(id, current);
    }
  }

  async deleteConversation(id: string, userId: string): Promise<boolean> {
    if (this.supabase) {
      try {
        await this.supabase
          .from('messages')
          .delete()
          .eq('conversation_id', id)
          .eq('user_id', userId);

        const { error } = await this.supabase
          .from('conversations')
          .delete()
          .eq('id', id)
          .eq('user_id', userId);

        if (!error) {
          this.inMemoryConversations.delete(id);
          this.inMemoryMessages = this.inMemoryMessages.filter((m) => m.conversation_id !== id);
          return true;
        }
      } catch (err: any) {
        this.logger.warn(`Supabase deleteConversation exception: ${err.message}`);
      }
    }

    const exists = this.inMemoryConversations.has(id);
    if (exists) {
      this.inMemoryConversations.delete(id);
      this.inMemoryMessages = this.inMemoryMessages.filter((m) => m.conversation_id !== id);
      return true;
    }
    return false;
  }

  // ==================== MESSAGE OPERATIONS ====================

  async createMessage(data: {
    id?: string;
    conversation_id: string;
    user_id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    citations?: any[];
    audio_url?: string | null;
    credits_used?: number;
    metadata?: Record<string, any>;
  }): Promise<MessageRecord> {
    const now = new Date().toISOString();
    const record: MessageRecord = {
      id: data.id || `msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      conversation_id: data.conversation_id,
      user_id: data.user_id,
      role: data.role,
      content: data.content,
      citations: data.citations || [],
      audio_url: data.audio_url || null,
      credits_used: typeof data.credits_used === 'number' ? data.credits_used : 0.1,
      metadata: data.metadata || {},
      created_at: now,
    };

    if (this.supabase) {
      try {
        const { data: inserted, error } = await this.supabase
          .from('messages')
          .insert([record])
          .select()
          .maybeSingle();

        if (error) {
          this.logger.warn(`Supabase createMessage warning: ${error.message}. Saving to memory.`);
        } else if (inserted) {
          this.inMemoryMessages.push(inserted as MessageRecord);
          await this.touchConversation(data.conversation_id, data.user_id);
          return inserted as MessageRecord;
        }
      } catch (err: any) {
        this.logger.warn(`Supabase createMessage exception: ${err.message}`);
      }
    }

    this.inMemoryMessages.push(record);
    await this.touchConversation(data.conversation_id, data.user_id);
    return record;
  }

  async getMessagesByConversation(
    conversationId: string,
    userId: string,
    limit: number = 100,
    offset: number = 0,
  ): Promise<MessageRecord[]> {
    if (this.supabase) {
      try {
        const { data, error } = await this.supabase
          .from('messages')
          .select('*')
          .eq('conversation_id', conversationId)
          .eq('user_id', userId)
          .order('created_at', { ascending: true })
          .range(offset, offset + limit - 1);

        if (!error && data && data.length >= 0) {
          return data as MessageRecord[];
        }
      } catch (err: any) {
        this.logger.warn(`Supabase getMessagesByConversation exception: ${err.message}`);
      }
    }

    return this.inMemoryMessages
      .filter((m) => m.conversation_id === conversationId && m.user_id === userId)
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
      .slice(offset, offset + limit);
  }

  // ==================== USER MEMORY OPERATIONS ====================

  async createUserMemory(data: {
    id?: string;
    user_id: string;
    content: string;
    category: 'PREFERENCE' | 'CAREER' | 'STUDIES' | 'LIFE_GOAL' | 'EMOTIONAL_CONTEXT';
    source?: string;
    confidence?: number;
  }): Promise<UserMemoryRecord> {
    const now = new Date().toISOString();
    const record: UserMemoryRecord = {
      id: data.id || `mem_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      user_id: data.user_id,
      content: data.content.trim(),
      category: data.category,
      source: data.source || 'user_explicit',
      confidence: typeof data.confidence === 'number' ? data.confidence : 1.0,
      is_active: true,
      created_at: now,
      updated_at: now,
    };

    if (this.supabase) {
      try {
        const { data: inserted, error } = await this.supabase
          .from('user_memories')
          .insert([record])
          .select()
          .maybeSingle();

        if (error) {
          this.logger.warn(`Supabase createUserMemory warning: ${error.message}. Saving to memory.`);
        } else if (inserted) {
          this.inMemoryMemories.set(inserted.id, inserted as UserMemoryRecord);
          return inserted as UserMemoryRecord;
        }
      } catch (err: any) {
        this.logger.warn(`Supabase createUserMemory exception: ${err.message}`);
      }
    }

    this.inMemoryMemories.set(record.id, record);
    return record;
  }

  async getUserMemories(userId: string, activeOnly: boolean = true): Promise<UserMemoryRecord[]> {
    if (this.supabase) {
      try {
        let query = this.supabase
          .from('user_memories')
          .select('*')
          .eq('user_id', userId);

        if (activeOnly) {
          query = query.eq('is_active', true);
        }

        query = query.order('updated_at', { ascending: false });
        const { data, error } = await query;

        if (!error && data) {
          for (const m of data) {
            this.inMemoryMemories.set(m.id, m as UserMemoryRecord);
          }
          return data as UserMemoryRecord[];
        }
      } catch (err: any) {
        this.logger.warn(`Supabase getUserMemories exception: ${err.message}`);
      }
    }

    return Array.from(this.inMemoryMemories.values())
      .filter((m) => m.user_id === userId && (!activeOnly || m.is_active))
      .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
  }

  async updateUserMemory(
    id: string,
    userId: string,
    updates: Partial<UserMemoryRecord>,
  ): Promise<UserMemoryRecord | null> {
    const now = new Date().toISOString();
    const updatePayload = {
      ...updates,
      updated_at: now,
    };

    if (this.supabase) {
      try {
        const { data, error } = await this.supabase
          .from('user_memories')
          .update(updatePayload)
          .eq('id', id)
          .eq('user_id', userId)
          .select()
          .maybeSingle();

        if (!error && data) {
          this.inMemoryMemories.set(data.id, data as UserMemoryRecord);
          return data as UserMemoryRecord;
        }
      } catch (err: any) {
        this.logger.warn(`Supabase updateUserMemory exception: ${err.message}`);
      }
    }

    const current = this.inMemoryMemories.get(id);
    if (current && current.user_id === userId) {
      const merged = { ...current, ...updatePayload };
      this.inMemoryMemories.set(id, merged);
      return merged;
    }
    return null;
  }

  async deleteUserMemory(id: string, userId: string): Promise<boolean> {
    if (this.supabase) {
      try {
        const { error } = await this.supabase
          .from('user_memories')
          .delete()
          .eq('id', id)
          .eq('user_id', userId);

        if (!error) {
          this.inMemoryMemories.delete(id);
          return true;
        }
      } catch (err: any) {
        this.logger.warn(`Supabase deleteUserMemory exception: ${err.message}`);
      }
    }

    const current = this.inMemoryMemories.get(id);
    if (current && current.user_id === userId) {
      this.inMemoryMemories.delete(id);
      return true;
    }
    return false;
  }

  async clearAllUserMemories(userId: string): Promise<boolean> {
    if (this.supabase) {
      try {
        const { error } = await this.supabase
          .from('user_memories')
          .delete()
          .eq('user_id', userId);

        if (!error) {
          for (const [id, m] of this.inMemoryMemories.entries()) {
            if (m.user_id === userId) this.inMemoryMemories.delete(id);
          }
          return true;
        }
      } catch (err: any) {
        this.logger.warn(`Supabase clearAllUserMemories exception: ${err.message}`);
      }
    }

    for (const [id, m] of this.inMemoryMemories.entries()) {
      if (m.user_id === userId) this.inMemoryMemories.delete(id);
    }
    return true;
  }
}



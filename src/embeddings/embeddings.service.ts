import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import { DatabaseService } from '../database/database.service';
import { GeminiEmbeddingProvider } from './gemini-embedding.provider';
import {
  SearchableScriptureChunk,
  EmbeddingGenerationOptions,
  EmbeddingGenerationReport,
  EmbeddingIntegrityReport,
} from './embeddings.interfaces';

@Injectable()
export class EmbeddingsService {
  private readonly logger = new Logger(EmbeddingsService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly provider: GeminiEmbeddingProvider,
  ) {}

  /**
   * Deterministically builds the input text to be embedded for a scripture record.
   * Format:
   * "Scripture: Bhagavad Gita | Chapter: {N} | Verse: {M} | Sanskrit: {Text} | Transliteration: {Text} | Translation ({Language}, by {Translator}): {Translation}"
   */
  buildDeterministicInputText(params: {
    scriptureTitle: string;
    chapterNumber: number;
    verseNumber: number;
    sanskritDevanagari: string;
    transliterationIast: string;
    translationText?: string;
    language?: string;
    translator?: string;
  }): string {
    const parts = [
      `Scripture: ${params.scriptureTitle}`,
      `Chapter: ${params.chapterNumber}`,
      `Verse: ${params.verseNumber}`,
      `Sanskrit: ${params.sanskritDevanagari.replace(/\r?\n/g, ' ').trim()}`,
      `Transliteration: ${params.transliterationIast.replace(/\r?\n/g, ' ').trim()}`,
    ];

    if (params.translationText) {
      const lang = params.language || 'en';
      const author = params.translator || 'Canonical Translation';
      parts.push(`Translation (${lang}, by ${author}): ${params.translationText.trim()}`);
    }

    return parts.join(' | ');
  }

  /**
   * Generates a stable SHA-256 hash of deterministic text to detect unchanged records.
   */
  computeContentHash(text: string): string {
    return crypto.createHash('sha256').update(text.trim(), 'utf8').digest('hex');
  }

  /**
   * Loads all eligible searchable records from persistent Supabase PostgreSQL.
   * If a verse has multiple translations, each translation produces a separate distinct searchable chunk.
   */
  async getEligibleSearchableChunks(scriptureId: string = 'bhagavad-gita'): Promise<SearchableScriptureChunk[]> {
    const [verses, allTranslations, allSources] = await Promise.all([
      this.db.getAllScriptureVerses(scriptureId),
      this.db.getAllScriptureTranslations(),
      this.db.getAllScriptureSources(),
    ]);

    const sourcesMap = new Map<string, any>(allSources.map((s) => [s.id, s]));
    const translationsByVerse = new Map<string, any[]>();
    for (const tr of allTranslations) {
      if (!translationsByVerse.has(tr.verse_id)) {
        translationsByVerse.set(tr.verse_id, []);
      }
      translationsByVerse.get(tr.verse_id)!.push(tr);
    }

    const chunks: SearchableScriptureChunk[] = [];

    for (const v of verses) {
      const translations = translationsByVerse.get(v.id) || [];

      if (translations && translations.length > 0) {
        for (const tr of translations) {
          const source = sourcesMap.get(tr.source_id);
          const chunkId = `emb-${v.id}-${tr.source_id}-${tr.language}`;
          const inputText = this.buildDeterministicInputText({
            scriptureTitle: 'Bhagavad Gita',
            chapterNumber: v.chapter_number,
            verseNumber: v.verse_number,
            sanskritDevanagari: v.sanskrit_devanagari,
            transliterationIast: v.transliteration_iast,
            translationText: tr.translation_text,
            language: tr.language,
            translator: source?.author_or_translator,
          });

          chunks.push({
            chunk_id: chunkId,
            verse_id: v.id,
            translation_id: tr.id,
            source_id: tr.source_id,
            scripture_id: v.scripture_id,
            chapter_number: v.chapter_number,
            verse_number: v.verse_number,
            sanskrit_devanagari: v.sanskrit_devanagari,
            transliteration_iast: v.transliteration_iast,
            translation_text: tr.translation_text,
            language: tr.language,
            translator: source?.author_or_translator,
            source_name: source?.name,
            deterministic_input_text: inputText,
            content_hash: this.computeContentHash(inputText),
          });
        }
      } else {
        // Untranslated verse chunk
        const chunkId = `emb-${v.id}-original`;
        const inputText = this.buildDeterministicInputText({
          scriptureTitle: 'Bhagavad Gita',
          chapterNumber: v.chapter_number,
          verseNumber: v.verse_number,
          sanskritDevanagari: v.sanskrit_devanagari,
          transliterationIast: v.transliteration_iast,
        });

        chunks.push({
          chunk_id: chunkId,
          verse_id: v.id,
          scripture_id: v.scripture_id,
          chapter_number: v.chapter_number,
          verse_number: v.verse_number,
          sanskrit_devanagari: v.sanskrit_devanagari,
          transliteration_iast: v.transliteration_iast,
          language: 'sa',
          deterministic_input_text: inputText,
          content_hash: this.computeContentHash(inputText),
        });
      }
    }

    return chunks;
  }

  /**
   * Generates and persists embeddings with idempotency, content hashing, and bounded batching.
   */
  async generateEmbeddings(options: EmbeddingGenerationOptions = {}): Promise<EmbeddingGenerationReport> {
    const {
      dryRun = false,
      model = this.provider.defaultModel,
      batchSize = 5,
      forceRegenerate = false,
    } = options;

    const chunks = await this.getEligibleSearchableChunks('bhagavad-gita');
    const existingEmbeddings = await this.db.getAllScriptureEmbeddings(model);
    const existingMap = new Map<string, any>(
      existingEmbeddings.map((e) => [`${e.verse_id}:${e.translation_id || ''}`, e]),
    );

    let alreadyEmbedded = 0;
    let successfullyEmbedded = 0;
    let skippedUnchanged = 0;
    let failedCount = 0;
    const errors: Array<{ chunk_id: string; error: string }> = [];

    this.logger.log(`=================================================================`);
    this.logger.log(`🔮 Starting embedding generation process`);
    this.logger.log(`Mode:             ${dryRun ? '🔍 DRY RUN (no API calls, no DB writes)' : '💾 LIVE GENERATION'}`);
    this.logger.log(`Model:            ${model} (dimension: ${this.provider.targetDimension})`);
    this.logger.log(`Eligible Chunks:  ${chunks.length}`);
    this.logger.log(`=================================================================`);

    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize);
      const toEmbed: SearchableScriptureChunk[] = [];

      for (const chunk of batch) {
        const key = `${chunk.verse_id}:${chunk.translation_id || ''}`;
        const existing = existingMap.get(key);

        if (existing) {
          alreadyEmbedded++;
          if (!forceRegenerate && existing.content_hash === chunk.content_hash && existing.model === model) {
            skippedUnchanged++;
            continue;
          }
        }

        if (dryRun) {
          successfullyEmbedded++;
          continue;
        }

        toEmbed.push(chunk);
      }

      if (dryRun || toEmbed.length === 0) continue;

      const recordsToUpsert: any[] = [];
      await Promise.all(
        toEmbed.map(async (chunk) => {
          try {
            const providerResult = await this.provider.generateEmbedding(
              chunk.deterministic_input_text,
              model,
            );

            recordsToUpsert.push({
              id: `${chunk.chunk_id}-${model}`,
              verse_id: chunk.verse_id,
              translation_id: chunk.translation_id || null,
              source_id: chunk.source_id || null,
              provider: 'google',
              model,
              dimension: providerResult.dimension,
              content_hash: chunk.content_hash,
              input_text: chunk.deterministic_input_text,
              embedding: providerResult.embedding,
              metadata: {
                chapter_number: chunk.chapter_number,
                verse_number: chunk.verse_number,
                language: chunk.language,
                translator: chunk.translator || null,
              },
            });

            successfullyEmbedded++;
            this.logger.log(`✅ Embedded: [${chunk.chunk_id}] (dim: ${providerResult.dimension})`);
          } catch (err: any) {
            failedCount++;
            errors.push({ chunk_id: chunk.chunk_id, error: err.message });
            this.logger.error(`❌ Failed to embed chunk [${chunk.chunk_id}]: ${err.message}`);
          }
        }),
      );

      if (recordsToUpsert.length > 0) {
        await this.db.upsertScriptureEmbeddingsBatch(recordsToUpsert);
      }

      // Throttle between batches only when live requests were made to respect 100 RPM limit
      if (toEmbed.length > 0 && i + batchSize < chunks.length) {
        await new Promise((resolve) => setTimeout(resolve, 1200));
      }
    }

    const missingEmbeddings = chunks.length - (skippedUnchanged + successfullyEmbedded);

    return {
      success: failedCount === 0,
      dryRun,
      provider: 'google',
      model,
      dimension: this.provider.targetDimension,
      eligibleRecords: chunks.length,
      alreadyEmbedded,
      successfullyEmbedded,
      skippedUnchanged,
      failedCount,
      missingEmbeddings: Math.max(0, missingEmbeddings),
      errors,
      isComplete: failedCount === 0 && missingEmbeddings <= 0,
    };
  }

  /**
   * Generates coverage and integrity analysis of scripture embeddings.
   */
  async verifyIntegrity(model: string = this.provider.defaultModel): Promise<{
    coverage: EmbeddingGenerationReport;
    integrity: EmbeddingIntegrityReport;
  }> {
    const chunks = await this.getEligibleSearchableChunks('bhagavad-gita');
    const existing = await this.db.getAllScriptureEmbeddings();

    const chunkKeySet = new Set(chunks.map((c) => `${c.verse_id}:${c.translation_id || ''}`));
    const chunkHashMap = new Map(chunks.map((c) => [`${c.verse_id}:${c.translation_id || ''}`, c.content_hash]));

    let invalidVectors = 0;
    let dimensionMismatches = 0;
    let orphanedRows = 0;
    let staleRows = 0;
    let wrongModelRows = 0;
    const modelsUsed: Record<string, number> = {};
    const seenKeys = new Set<string>();
    let duplicateRows = 0;

    for (const emb of existing) {
      modelsUsed[emb.model] = (modelsUsed[emb.model] || 0) + 1;
      const key = `${emb.verse_id}:${emb.translation_id || ''}:${emb.model}`;
      if (seenKeys.has(key)) {
        duplicateRows++;
      }
      seenKeys.add(key);

      if (emb.model !== model) {
        wrongModelRows++;
      }

      // Check vector validity (pgvector returns vectors as string format '[...]' in PostgREST or array in memory)
      let vec: number[] = [];
      if (Array.isArray(emb.embedding)) {
        vec = emb.embedding;
      } else if (typeof emb.embedding === 'string') {
        try {
          vec = JSON.parse(emb.embedding);
        } catch {
          try {
            vec = emb.embedding
              .replace(/^[\[\(]/, '')
              .replace(/[\]\)]$/, '')
              .split(',')
              .map((n: string) => parseFloat(n.trim()));
          } catch {
            vec = [];
          }
        }
      }

      if (!vec || vec.length === 0 || vec.some((n) => typeof n !== 'number' || isNaN(n) || !isFinite(n))) {
        invalidVectors++;
      } else if (vec.length !== this.provider.targetDimension) {
        dimensionMismatches++;
      }

      // Check orphaned rows
      const targetChunkKey = `${emb.verse_id}:${emb.translation_id || ''}`;
      if (!chunkKeySet.has(targetChunkKey)) {
        orphanedRows++;
      } else {
        const expectedHash = chunkHashMap.get(targetChunkKey);
        if (expectedHash && expectedHash !== emb.content_hash) {
          staleRows++;
        }
      }
    }

    const currentModelEmbs = existing.filter((e) => e.model === model);
    const coveredKeySet = new Set(currentModelEmbs.map((e) => `${e.verse_id}:${e.translation_id || ''}`));
    let coveredCount = 0;
    for (const chunk of chunks) {
      if (coveredKeySet.has(`${chunk.verse_id}:${chunk.translation_id || ''}`)) {
        coveredCount++;
      }
    }

    const coverageReport: EmbeddingGenerationReport = {
      success: true,
      dryRun: false,
      provider: 'google',
      model,
      dimension: this.provider.targetDimension,
      eligibleRecords: chunks.length,
      alreadyEmbedded: coveredCount,
      successfullyEmbedded: coveredCount,
      skippedUnchanged: coveredCount,
      failedCount: 0,
      missingEmbeddings: Math.max(0, chunks.length - coveredCount),
      errors: [],
      isComplete: coveredCount >= chunks.length && chunks.length > 0,
    };

    const integrityReport: EmbeddingIntegrityReport = {
      totalRecordsInDb: existing.length,
      invalidVectors,
      dimensionMismatches,
      orphanedRows,
      duplicateRows,
      staleRows,
      wrongModelRows,
      modelsUsed,
    };

    return {
      coverage: coverageReport,
      integrity: integrityReport,
    };
  }
}

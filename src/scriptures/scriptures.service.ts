import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ServiceUnavailableException,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { ScriptureImportService } from './scripture-import.service';
import { GeminiEmbeddingProvider } from '../embeddings/gemini-embedding.provider';
import {
  VerseResponseDto,
  ChapterSummaryDto,
  ScriptureSearchResponseDto,
  ScriptureSearchResultItem,
} from './scriptures.interfaces';
import { SearchScripturesDto } from './dto/search-scriptures.dto';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class ScripturesService implements OnModuleInit {
  private readonly logger = new Logger(ScripturesService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly importService: ScriptureImportService,
    private readonly embeddingProvider: GeminiEmbeddingProvider = new GeminiEmbeddingProvider(),
  ) {}

  async onModuleInit() {
    // Seed canonical Bhagavad Gita initial verified verses and chapters if not present
    await this.seedCanonicalDatasetIfNeeded();
  }

  async seedCanonicalDatasetIfNeeded() {
    try {
      const existingVerse = await this.db.getScriptureVerse('bhagavad-gita', 2, 47);
      if (!existingVerse) {
        this.logger.log('Seeding canonical Bhagavad Gita dataset from local fixture...');
        const datasetPath = path.resolve(__dirname, '../../data/bhagavad_gita_canonical.json');
        if (fs.existsSync(datasetPath)) {
          const raw = fs.readFileSync(datasetPath, 'utf8');
          const dataset = JSON.parse(raw);
          const result = await this.importService.importDataset(dataset, { dryRun: false });
          this.logger.log(`Seed result: processed ${result.recordsProcessed.verses} verse(s).`);
        } else {
          this.logger.warn(`Canonical dataset not found at ${datasetPath}`);
        }
      }
    } catch (err: any) {
      this.logger.warn(`Failed during scripture seed: ${err.message}`);
    }
  }

  /**
   * Performs semantic vector search over the scripture knowledge base using pgvector embeddings.
   * Converts user query into a 768-dim vector, runs cosine similarity matching,
   * deduplicates results at the verse level, and hydrates full provenance metadata.
   */
  async search(dto: SearchScripturesDto): Promise<ScriptureSearchResponseDto> {
    const rawQuery = dto.query ? dto.query.trim() : '';
    if (!rawQuery || rawQuery.length < 2) {
      throw new BadRequestException('Search query must be at least 2 characters long.');
    }
    if (rawQuery.length > 500) {
      throw new BadRequestException('Search query cannot exceed 500 characters.');
    }

    const requestedLimit = Number(dto.limit);
    const limit =
      Number.isInteger(requestedLimit) && requestedLimit >= 1 && requestedLimit <= 10
        ? requestedLimit
        : 5;

    // Check embedding provider configuration
    if (!this.embeddingProvider.isConfigured()) {
      throw new ServiceUnavailableException(
        'Embedding provider is not configured. Please ensure GEMINI_API_KEY is configured in backend/.env.',
      );
    }

    // 1. Generate query embedding
    let embResult;
    try {
      embResult = await this.embeddingProvider.generateEmbedding(rawQuery);
    } catch (err: any) {
      this.logger.error(`Failed to generate query embedding: ${err.message}`);
      throw new ServiceUnavailableException(`Embedding provider error: ${err.message}`);
    }

    if (!embResult || !Array.isArray(embResult.embedding) || embResult.embedding.length !== 768) {
      throw new ServiceUnavailableException(
        `Generated embedding has invalid dimensions or structure (expected 768, got ${embResult?.dimension}).`,
      );
    }

    // 2. Perform vector search in database (fetch up to limit * 3 candidates to allow verse deduplication)
    const candidates = await this.db.searchScriptureEmbeddings(
      embResult.embedding,
      limit * 3,
      0.0,
      dto.language,
    );

    if (!candidates || candidates.length === 0) {
      return {
        query: rawQuery,
        model: this.embeddingProvider.defaultModel,
        dimension: this.embeddingProvider.targetDimension,
        total_results: 0,
        results: [],
      };
    }

    // 3. Deduplicate by verse_id and hydrate full verse records
    const results: ScriptureSearchResultItem[] = [];
    const seenVerses = new Set<string>();

    for (const match of candidates) {
      if (seenVerses.has(match.verse_id)) {
        continue;
      }
      seenVerses.add(match.verse_id);

      const verse = await this.db.getScriptureVerseById(match.verse_id);
      if (!verse) continue;

      const chapter = await this.db.getScriptureChapter(verse.scripture_id, verse.chapter_number);
      const rawTranslations = await this.db.getScriptureTranslationsForVerse(verse.id);

      // Hydrate all translations with source metadata
      const translationsWithSources = await Promise.all(
        rawTranslations.map(async (tr) => {
          const source = await this.db.getScriptureSourceById(tr.source_id);
          return {
            language: tr.language,
            translation_text: tr.translation_text,
            word_meanings: tr.word_meanings || undefined,
            source: source
              ? {
                  id: source.id,
                  name: source.name,
                  author_or_translator: source.author_or_translator,
                  license: source.license,
                  publisher: source.publisher || undefined,
                  publication_year: source.publication_year || undefined,
                  source_url: source.source_url || undefined,
                }
              : {
                  id: tr.source_id,
                  name: 'Unknown Source',
                  author_or_translator: 'Unknown',
                  license: 'Unspecified',
                },
          };
        }),
      );

      // Identify the matched translation specifically
      let matchedTranslation: any = undefined;
      if (match.translation_id) {
        const trRecord = rawTranslations.find((t) => t.id === match.translation_id);
        if (trRecord) {
          const source = await this.db.getScriptureSourceById(trRecord.source_id);
          matchedTranslation = {
            language: trRecord.language,
            translation_text: trRecord.translation_text,
            word_meanings: trRecord.word_meanings || undefined,
            source: source
              ? {
                  id: source.id,
                  name: source.name,
                  author_or_translator: source.author_or_translator,
                  license: source.license,
                  publisher: source.publisher || undefined,
                  publication_year: source.publication_year || undefined,
                  source_url: source.source_url || undefined,
                }
              : {
                  id: trRecord.source_id,
                  name: 'Unknown Source',
                  author_or_translator: 'Unknown',
                  license: 'Unspecified',
                },
          };
        }
      }

      // Fallback matched translation if not directly found
      if (!matchedTranslation && translationsWithSources.length > 0) {
        matchedTranslation =
          translationsWithSources.find((t) => !dto.language || t.language === dto.language) ||
          translationsWithSources[0];
      }

      results.push({
        verse_id: verse.id,
        scripture: verse.scripture_id,
        chapter_number: verse.chapter_number,
        verse_number: verse.verse_number,
        chapter_title: {
          sanskrit: chapter?.name_sanskrit || '',
          transliterated: chapter?.name_transliterated || '',
          english: chapter?.name_english || '',
        },
        sanskrit_devanagari: verse.sanskrit_devanagari,
        transliteration_iast: verse.transliteration_iast,
        similarity_score: match.similarity,
        distance_metric: 'cosine_similarity (1 - cosine_distance)',
        matched_text: match.input_text || '',
        matched_translation: matchedTranslation,
        all_translations: translationsWithSources,
        metadata: verse.metadata || undefined,
      });

      if (results.length >= limit) {
        break;
      }
    }

    return {
      query: rawQuery,
      model: this.embeddingProvider.defaultModel,
      dimension: this.embeddingProvider.targetDimension,
      total_results: results.length,
      results,
    };
  }

  /**
   * Retrieves an exact verse with its Sanskrit text, transliteration,
   * verification status, and all attributed translations.
   */
  async getVerse(
    scriptureId: string,
    chapterParam: string | number,
    verseParam: string | number,
  ): Promise<VerseResponseDto> {
    const chapterNum = Number(chapterParam);
    const verseNum = Number(verseParam);

    if (!Number.isInteger(chapterNum) || chapterNum < 1 || chapterNum > 18) {
      throw new BadRequestException(
        `Invalid chapter number '${chapterParam}'. Bhagavad Gita chapters range from 1 to 18.`,
      );
    }

    if (!Number.isInteger(verseNum) || verseNum < 1) {
      throw new BadRequestException(
        `Invalid verse number '${verseParam}'. Verse must be a positive integer.`,
      );
    }

    const normalizedScripture = (scriptureId || 'bhagavad-gita').toLowerCase().trim();

    // 1. Fetch Chapter Metadata
    const chapter = await this.db.getScriptureChapter(normalizedScripture, chapterNum);

    // 2. Fetch Verse Record
    const verse = await this.db.getScriptureVerse(normalizedScripture, chapterNum, verseNum);
    if (!verse) {
      throw new NotFoundException(
        `Verse not found for scripture '${normalizedScripture}', Chapter ${chapterNum}, Verse ${verseNum}.`,
      );
    }

    // 3. Fetch Translations & hydrate sources
    const rawTranslations = await this.db.getScriptureTranslationsForVerse(verse.id);
    const translationsWithSources = await Promise.all(
      rawTranslations.map(async (tr) => {
        const source = await this.db.getScriptureSourceById(tr.source_id);
        return {
          language: tr.language,
          translation_text: tr.translation_text,
          word_meanings: tr.word_meanings || undefined,
          source: source
            ? {
                id: source.id,
                name: source.name,
                author_or_translator: source.author_or_translator,
                license: source.license,
                publisher: source.publisher || undefined,
                publication_year: source.publication_year || undefined,
                source_url: source.source_url || undefined,
              }
            : {
                id: tr.source_id,
                name: 'Unknown Source',
                author_or_translator: 'Unknown',
                license: 'Unspecified',
              },
        };
      }),
    );

    return {
      verse_id: verse.id,
      scripture: verse.scripture_id,
      chapter_number: verse.chapter_number,
      verse_number: verse.verse_number,
      chapter_title: {
        sanskrit: chapter?.name_sanskrit || '',
        transliterated: chapter?.name_transliterated || '',
        english: chapter?.name_english || '',
      },
      sanskrit_devanagari: verse.sanskrit_devanagari,
      transliteration_iast: verse.transliteration_iast,
      verification_status: verse.verification_status,
      verified_by: verse.verified_by || undefined,
      metadata: verse.metadata || undefined,
      translations: translationsWithSources,
    };
  }

  /**
   * Retrieves all chapters for the scripture.
   */
  async getChapters(scriptureId: string = 'bhagavad-gita'): Promise<ChapterSummaryDto[]> {
    const chapters = await this.db.getAllScriptureChapters(scriptureId);
    return chapters.map((c) => ({
      chapter_number: c.chapter_number,
      name_sanskrit: c.name_sanskrit,
      name_transliterated: c.name_transliterated,
      name_english: c.name_english,
      verse_count: c.verse_count,
      summary: c.summary || undefined,
    }));
  }

  /**
   * Retrieves a single chapter metadata summary.
   */
  async getChapter(
    scriptureId: string = 'bhagavad-gita',
    chapterParam: string | number,
  ): Promise<ChapterSummaryDto> {
    const chapterNum = Number(chapterParam);
    if (!Number.isInteger(chapterNum) || chapterNum < 1 || chapterNum > 18) {
      throw new BadRequestException(`Invalid chapter number '${chapterParam}'.`);
    }

    const chapter = await this.db.getScriptureChapter(scriptureId, chapterNum);
    if (!chapter) {
      throw new NotFoundException(`Chapter ${chapterNum} not found.`);
    }

    return {
      chapter_number: chapter.chapter_number,
      name_sanskrit: chapter.name_sanskrit,
      name_transliterated: chapter.name_transliterated,
      name_english: chapter.name_english,
      verse_count: chapter.verse_count,
      summary: chapter.summary || undefined,
    };
  }
}

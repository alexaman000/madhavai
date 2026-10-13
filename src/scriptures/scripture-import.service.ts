import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import {
  ScriptureSource,
  ScriptureChapter,
  ScriptureVerse,
  ScriptureTranslation,
} from './scriptures.interfaces';

export interface ImportDataset {
  scripture: {
    id: string;
    title: string;
    tradition: string;
    canonical_chapters: number;
    canonical_verses: number;
  };
  sources: ScriptureSource[];
  chapters: ScriptureChapter[];
  verses: Array<ScriptureVerse & { translations?: ScriptureTranslation[] }>;
}

export interface ImportValidationIssue {
  type: 'error' | 'warning';
  entity: string;
  id: string;
  message: string;
}

export interface ImportResult {
  success: boolean;
  dryRun: boolean;
  recordsProcessed: {
    sources: number;
    chapters: number;
    verses: number;
    translations: number;
  };
  errors: ImportValidationIssue[];
  warnings: ImportValidationIssue[];
}

@Injectable()
export class ScriptureImportService {
  private readonly logger = new Logger(ScriptureImportService.name);

  constructor(private readonly db: DatabaseService) {}

  /**
   * Validates dataset integrity before applying changes.
   */
  validateDataset(dataset: ImportDataset): {
    isValid: boolean;
    issues: ImportValidationIssue[];
  } {
    const issues: ImportValidationIssue[] = [];

    if (!dataset.scripture || !dataset.scripture.id) {
      issues.push({
        type: 'error',
        entity: 'scripture',
        id: 'root',
        message: 'Missing root scripture identifier',
      });
    }

    // Validate Sources
    const sourceIds = new Set<string>();
    if (!dataset.sources || !Array.isArray(dataset.sources)) {
      issues.push({
        type: 'error',
        entity: 'sources',
        id: 'sources',
        message: 'Sources must be a non-empty array',
      });
    } else {
      for (const src of dataset.sources) {
        if (!src.id || !src.name || !src.author_or_translator || !src.license) {
          issues.push({
            type: 'error',
            entity: 'source',
            id: src.id || 'unknown',
            message: 'Source is missing required fields (id, name, author_or_translator, license)',
          });
        }
        if (sourceIds.has(src.id)) {
          issues.push({
            type: 'error',
            entity: 'source',
            id: src.id,
            message: `Duplicate source id: ${src.id}`,
          });
        }
        sourceIds.add(src.id);
      }
    }

    // Validate Chapters
    const chapterNumbers = new Set<number>();
    if (dataset.chapters && Array.isArray(dataset.chapters)) {
      for (const ch of dataset.chapters) {
        if (ch.chapter_number < 1 || ch.chapter_number > 18) {
          issues.push({
            type: 'error',
            entity: 'chapter',
            id: ch.id,
            message: `Invalid chapter number: ${ch.chapter_number}. Must be between 1 and 18 for Bhagavad Gita.`,
          });
        }
        if (!ch.name_sanskrit || !ch.name_english) {
          issues.push({
            type: 'warning',
            entity: 'chapter',
            id: ch.id,
            message: `Chapter ${ch.chapter_number} missing Sanskrit or English title`,
          });
        }
        if (chapterNumbers.has(ch.chapter_number)) {
          issues.push({
            type: 'error',
            entity: 'chapter',
            id: ch.id,
            message: `Duplicate chapter number: ${ch.chapter_number}`,
          });
        }
        chapterNumbers.add(ch.chapter_number);
      }
    }

    // Validate Verses & Translations
    const verseIds = new Set<string>();
    if (dataset.verses && Array.isArray(dataset.verses)) {
      for (const v of dataset.verses) {
        if (!v.id || !v.chapter_number || !v.verse_number) {
          issues.push({
            type: 'error',
            entity: 'verse',
            id: v.id || 'unknown',
            message: 'Verse must have id, chapter_number, and verse_number',
          });
        }
        if (verseIds.has(v.id)) {
          issues.push({
            type: 'error',
            entity: 'verse',
            id: v.id,
            message: `Duplicate verse id: ${v.id}`,
          });
        }
        verseIds.add(v.id);

        if (!v.sanskrit_devanagari || v.sanskrit_devanagari.trim().length === 0) {
          issues.push({
            type: 'error',
            entity: 'verse',
            id: v.id,
            message: 'Verse must have non-empty sanskrit_devanagari text',
          });
        }

        if (!v.transliteration_iast || v.transliteration_iast.trim().length === 0) {
          issues.push({
            type: 'error',
            entity: 'verse',
            id: v.id,
            message: 'Verse must have non-empty transliteration_iast text',
          });
        }

        // Validate nested translations
        if (v.translations && Array.isArray(v.translations)) {
          for (const tr of v.translations) {
            if (!tr.id || !tr.source_id || !tr.language || !tr.translation_text) {
              issues.push({
                type: 'error',
                entity: 'translation',
                id: tr.id || 'unknown',
                message: 'Translation missing required fields (id, source_id, language, translation_text)',
              });
            }
            if (!sourceIds.has(tr.source_id)) {
              issues.push({
                type: 'error',
                entity: 'translation',
                id: tr.id,
                message: `Translation references unknown source_id: ${tr.source_id}`,
              });
            }
          }
        }
      }
    }

    const hasErrors = issues.some((i) => i.type === 'error');
    return {
      isValid: !hasErrors,
      issues,
    };
  }

  /**
   * Executes dataset import with optional dryRun mode.
   * Employs upsert operations for true idempotency.
   */
  async importDataset(
    dataset: ImportDataset,
    options: { dryRun?: boolean } = { dryRun: false },
  ): Promise<ImportResult> {
    const { dryRun } = options;
    const validation = this.validateDataset(dataset);

    const errors = validation.issues.filter((i) => i.type === 'error');
    const warnings = validation.issues.filter((i) => i.type === 'warning');

    if (!validation.isValid) {
      this.logger.error(`Import validation failed with ${errors.length} error(s).`);
      return {
        success: false,
        dryRun: !!dryRun,
        recordsProcessed: { sources: 0, chapters: 0, verses: 0, translations: 0 },
        errors,
        warnings,
      };
    }

    let sourcesCount = 0;
    let chaptersCount = 0;
    let versesCount = 0;
    let translationsCount = 0;

    if (!dryRun) {
      // 1. Upsert Sources
      for (const src of dataset.sources || []) {
        await this.db.upsertScriptureSource(src);
        sourcesCount++;
      }

      // 2. Upsert Chapters
      for (const ch of dataset.chapters || []) {
        await this.db.upsertScriptureChapter(ch);
        chaptersCount++;
      }

      // 3. Upsert Verses & Translations in batches
      const versesToUpsert: any[] = [];
      const translationsToUpsert: any[] = [];

      for (const v of dataset.verses || []) {
        const { translations, ...verseData } = v;
        versesToUpsert.push(verseData);
        versesCount++;

        if (translations && Array.isArray(translations)) {
          for (const tr of translations) {
            translationsToUpsert.push({
              ...tr,
              verse_id: v.id,
            });
            translationsCount++;
          }
        }
      }

      await this.db.upsertScriptureVersesBatch(versesToUpsert);
      await this.db.upsertScriptureTranslationsBatch(translationsToUpsert);

      this.logger.log(
        `Import complete: ${sourcesCount} sources, ${chaptersCount} chapters, ${versesCount} verses, ${translationsCount} translations.`,
      );
    } else {
      sourcesCount = dataset.sources?.length || 0;
      chaptersCount = dataset.chapters?.length || 0;
      versesCount = dataset.verses?.length || 0;
      translationsCount =
        dataset.verses?.reduce(
          (acc, v) => acc + (v.translations ? v.translations.length : 0),
          0,
        ) || 0;

      this.logger.log(
        `DRY-RUN validated: ${sourcesCount} sources, ${chaptersCount} chapters, ${versesCount} verses, ${translationsCount} translations. No database modifications performed.`,
      );
    }

    return {
      success: true,
      dryRun: !!dryRun,
      recordsProcessed: {
        sources: sourcesCount,
        chapters: chaptersCount,
        verses: versesCount,
        translations: translationsCount,
      },
      errors,
      warnings,
    };
  }
}

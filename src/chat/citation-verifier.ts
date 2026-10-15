import * as fs from 'fs';
import * as path from 'path';
import { ScriptureCitationDto } from './chat.interfaces';
import { QueryIntent } from './query-intent.classifier';

export interface CanonicalVerseRecord {
  id: string;
  scripture_id: string;
  chapter_number: number;
  verse_number: number;
  sanskrit_devanagari: string;
  transliteration_iast?: string;
  translations?: Array<{
    id: string;
    source_id: string;
    language: string;
    translation_text: string;
    word_meanings?: any;
  }>;
  metadata?: {
    theme?: string;
    keywords?: string[];
  };
}

export interface VerificationResult {
  verifiedCitations: ScriptureCitationDto[];
  rejectedCitations: Array<{
    reference: string;
    reason: string;
  }>;
  cleanedAnswer: string;
}

export class CitationVerifier {
  private static canonicalVersesMap: Map<string, CanonicalVerseRecord> = new Map();
  private static chapterMaxVerses: Map<number, number> = new Map();
  private static chapterTitles: Map<number, { sanskrit: string; english: string }> = new Map();
  private static isInitialized = false;

  /**
   * Initializes canonical Bhagavad Gita verified records from local canonical dataset
   */
  public static init() {
    if (this.isInitialized) return;

    try {
      const datasetPath = path.resolve(__dirname, '../../data/bhagavad_gita_canonical.json');
      if (fs.existsSync(datasetPath)) {
        const raw = fs.readFileSync(datasetPath, 'utf8');
        const dataset = JSON.parse(raw);

        if (Array.isArray(dataset.chapters)) {
          for (const ch of dataset.chapters) {
            this.chapterTitles.set(ch.chapter_number, {
              sanskrit: ch.name_sanskrit || '',
              english: ch.name_english || '',
            });
          }
        }

        if (Array.isArray(dataset.verses)) {
          for (const v of dataset.verses) {
            const key = `${v.chapter_number}:${v.verse_number}`;
            this.canonicalVersesMap.set(key, v);

            const currMax = this.chapterMaxVerses.get(v.chapter_number) || 0;
            if (v.verse_number > currMax) {
              this.chapterMaxVerses.set(v.chapter_number, v.verse_number);
            }
          }
        }
        this.isInitialized = true;
      }
    } catch (err: any) {
      console.warn(`CitationVerifier: Could not load canonical dataset: ${err.message}`);
    }
  }

  /**
   * Check whether a specific chapter and verse exists in canonical scripture records
   */
  public static isValidCanonicalVerse(chapter: number, verse: number): boolean {
    this.init();
    if (!Number.isInteger(chapter) || !Number.isInteger(verse)) return false;
    if (chapter < 1 || chapter > 18) return false;

    const maxVerse = this.chapterMaxVerses.get(chapter);
    if (!maxVerse || verse < 1 || verse > maxVerse) return false;

    return this.canonicalVersesMap.has(`${chapter}:${verse}`);
  }

  /**
   * Fetch a verified canonical verse record
   */
  public static getCanonicalVerse(chapter: number, verse: number): CanonicalVerseRecord | null {
    this.init();
    return this.canonicalVersesMap.get(`${chapter}:${verse}`) || null;
  }

  /**
   * Check whether the generated answer meaningfully references or supports the cited verse.
   * Prevents attaching irrelevant retrieved candidates that the LLM never actually used.
   */
  public static checkClaimSupport(
    generatedAnswer: string,
    verse: CanonicalVerseRecord,
  ): boolean {
    const text = generatedAnswer.toLowerCase();
    const ch = verse.chapter_number;
    const v = verse.verse_number;

    // 1. Direct reference by chapter and verse numbers
    const directPatterns = [
      new RegExp(`chapter\\s*${ch}[,\\s]+verse\\s*${v}\\b`, 'i'),
      new RegExp(`अध्याय\\s*${ch}[,\\s]+श्लोक\\s*${v}\\b`, 'i'),
      new RegExp(`\\b${ch}\\.${v}\\b`),
      new RegExp(`\\b${ch}:${v}\\b`),
      new RegExp(`bg[- ]?${ch}[\\.:]${v}\\b`, 'i'),
    ];
    if (directPatterns.some((p) => p.test(text))) {
      return true;
    }

    // 2. Sanskrit key terms quotation (at least one key phrase or distinctive Sanskrit word)
    if (verse.sanskrit_devanagari) {
      const devWords = verse.sanskrit_devanagari
        .replace(/[।॥\n\r,]/g, ' ')
        .split(/\s+/)
        .map((w) => w.trim())
        .filter((w) => w.length >= 4);

      let matchingWords = 0;
      for (const dw of devWords) {
        if (text.includes(dw.toLowerCase())) {
          matchingWords++;
          if (matchingWords >= 2) return true;
        }
      }
    }

    // 3. Keywords / Themes from verse metadata
    if (verse.metadata?.keywords && Array.isArray(verse.metadata.keywords)) {
      const matchedKw = verse.metadata.keywords.filter((kw) => text.includes(kw.toLowerCase()));
      if (matchedKw.length >= 2 && text.includes(`chapter ${ch}`) || text.includes(`अध्याय ${ch}`)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Validates all citations for the current request turn:
   * 1. If intent is technical/general, strictly returns empty citations.
   * 2. Checks provenance: only verses retrieved or looked up for the current turn are eligible.
   * 3. Checks canonical existence: validates chapter (1-18) and verse bounds against DB records.
   * 4. Checks claim support: verifies the answer actually discusses the verse.
   * 5. Hydrates citation metadata directly from canonical records (never trusts LLM strings).
   * 6. Cleans invalid bracketed citation tags from answer without discarding useful content.
   */
  public static verify(
    generatedAnswer: string,
    currentRequestVerses: Array<{
      chapter_number: number;
      verse_number: number;
      similarity_score?: number;
      matched_translation?: any;
    }>,
    queryIntent: QueryIntent,
  ): VerificationResult {
    this.init();

    // 1. Technical/General Factual or Invalid Verse Questions MUST NEVER receive Gita citations
    if (queryIntent.type === 'GENERAL_FACTUAL_OR_TECHNICAL' || queryIntent.type === 'INVALID_VERSE_REFERENCE') {
      return {
        verifiedCitations: [],
        rejectedCitations: currentRequestVerses.map((p) => ({
          reference: `BG ${p.chapter_number}.${p.verse_number}`,
          reason:
            queryIntent.type === 'INVALID_VERSE_REFERENCE'
              ? 'Omitted: Query references an invalid or out-of-bounds chapter/verse.'
              : 'Omitted: Query is technical/general factual; scripture citations are prohibited.',
        })),
        cleanedAnswer: generatedAnswer,
      };
    }

    const verifiedCitations: ScriptureCitationDto[] = [];
    const rejectedCitations: Array<{ reference: string; reason: string }> = [];

    // Build lookup set of current turn's retrieved/verified verses (PROVENANCE CHECK)
    const provenanceMap = new Map<string, any>();
    for (const p of currentRequestVerses) {
      provenanceMap.set(`${p.chapter_number}:${p.verse_number}`, p);
    }

    // Examine candidate verses from current request retrieval
    for (const p of currentRequestVerses) {
      const refKey = `${p.chapter_number}:${p.verse_number}`;
      const refLabel = `Bhagavad Gita ${p.chapter_number}.${p.verse_number}`;

      // Check 1: Canonical Existence in Database
      if (!this.isValidCanonicalVerse(p.chapter_number, p.verse_number)) {
        rejectedCitations.push({
          reference: refLabel,
          reason: `Nonexistent verse reference (Chapter ${p.chapter_number}, Verse ${p.verse_number} does not exist in Bhagavad Gita).`,
        });
        continue;
      }

      const canonicalRecord = this.getCanonicalVerse(p.chapter_number, p.verse_number);
      if (!canonicalRecord) {
        rejectedCitations.push({
          reference: refLabel,
          reason: 'Canonical record could not be hydrated from database.',
        });
        continue;
      }

      // Check 2: Claim Support Check (Did the answer actually use or discuss this verse?)
      // If specific verse was requested, support is intrinsically established
      const isExplicitTarget =
        queryIntent.specificVerse &&
        queryIntent.specificVerse.chapter === p.chapter_number &&
        queryIntent.specificVerse.verse === p.verse_number;

      const hasClaimSupport = isExplicitTarget || this.checkClaimSupport(generatedAnswer, canonicalRecord);

      if (!hasClaimSupport) {
        rejectedCitations.push({
          reference: refLabel,
          reason: 'Retrieved candidate was not meaningfully cited or discussed in the generated answer.',
        });
        continue;
      }

      // Check 3: Hydrate verified citation metadata strictly from canonical database
      const defaultTrans =
        canonicalRecord.translations?.[0]?.translation_text ||
        p.matched_translation?.translation_text ||
        '';

      const chapterTitle = this.chapterTitles.get(p.chapter_number);

      verifiedCitations.push({
        scripture: 'Bhagavad Gita',
        chapter: p.chapter_number,
        verse: p.verse_number,
        chapterTitle: chapterTitle?.english || undefined,
        translationSource: 'Swami Sivananda (Canonical Verified)',
        text: defaultTrans,
        sanskritDevanagari: canonicalRecord.sanskrit_devanagari,
        transliterationIast: canonicalRecord.transliteration_iast,
        similarityScore: p.similarity_score ?? 1.0,
      });
    }

    // Clean any hallucinated or malformed bracket citations from the prose (e.g. [BG 99.99])
    let cleanedAnswer = generatedAnswer;
    const bracketCitations = cleanedAnswer.match(/\[?\b(?:BG|Gita)?\s*(\d{1,2})[\.:](\d{1,3})\]?/gi) || [];
    for (const bc of bracketCitations) {
      const match = bc.match(/(\d{1,2})[\.:](\d{1,3})/);
      if (match) {
        const ch = parseInt(match[1], 10);
        const vs = parseInt(match[2], 10);
        // If verse is canonically invalid or not verified, remove the tag from prose without deleting content
        if (!this.isValidCanonicalVerse(ch, vs) || !provenanceMap.has(`${ch}:${vs}`)) {
          cleanedAnswer = cleanedAnswer.replace(bc, `(Chapter ${ch})`);
        }
      }
    }

    return {
      verifiedCitations,
      rejectedCitations,
      cleanedAnswer,
    };
  }
}

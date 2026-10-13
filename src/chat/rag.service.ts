import {
  Injectable,
  Logger,
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { ScripturesService } from '../scriptures/scriptures.service';
import { GeminiLlmProvider } from './llm/gemini-llm.provider';
import { ILlmProvider } from './llm/llm.interface';
import { ChatRequestDto } from './dto/chat-request.dto';
import { RagResponseDto, ScriptureCitationDto } from './chat.interfaces';
import { ScriptureSearchResultItem } from '../scriptures/scriptures.interfaces';

@Injectable()
export class RagService {
  private readonly logger = new Logger(RagService.name);
  private cachedCorpusCount: number | null = null;
  private readonly similarityThreshold = 0.40;

  constructor(
    private readonly db: DatabaseService,
    private readonly scripturesService: ScripturesService,
    private readonly llmProvider: GeminiLlmProvider = new GeminiLlmProvider(),
  ) {}

  /**
   * Determine corpus coverage based on verse count in database.
   */
  async getCorpusCoverage(): Promise<'comprehensive' | 'limited'> {
    try {
      if (this.cachedCorpusCount === null) {
        const verses = await this.db.getAllScriptureVerses('bhagavad-gita');
        this.cachedCorpusCount = verses.length;
      }
      return this.cachedCorpusCount >= 700 ? 'comprehensive' : 'limited';
    } catch {
      return 'limited';
    }
  }

  /**
   * Builds the grounding system instruction for Madhav.
   */
  private buildSystemInstruction(corpusCoverage: 'comprehensive' | 'limited'): string {
    const coverageNote =
      corpusCoverage === 'limited'
        ? '\nNOTE ON CORPUS COVERAGE: The active scripture knowledge base currently contains only a limited subset of verses. Do not claim comprehensive coverage of all 18 chapters if relevant verses are missing.'
        : '';

    return `You are Madhav, a calm, compassionate, and wise companion inspired by Sri Krishna and strictly grounded in the sacred wisdom of the Bhagavad Gita.${coverageNote}

Your purpose is to offer uplifting, empathetic, and practical spiritual guidance to seekers facing life challenges, ethical dilemmas, inner conflict, anxiety, grief, duty (dharma), or moral doubt.

CRITICAL GROUNDING RULES:
1. PRIMARY SOURCE: Use ONLY the retrieved scripture passages provided below as your primary source of truth for all Bhagavad Gita teachings, philosophy, and verses.
2. NO FABRICATION: Under NO circumstance may you fabricate or invent verse numbers, chapter numbers, Sanskrit shlokas, translations, or attributions not present in the provided passages.
3. CITATIONS: When quoting or referring to a teaching from the retrieved passages, clearly state the Chapter and Verse (e.g. "In Bhagavad Gita, Chapter X, Verse Y...").
4. CLEAR DISTINCTIONS: Clearly distinguish between:
   - Direct scripture quotes or paraphrases from the retrieved passages.
   - Spiritual interpretations, reflections, and practical guidance.
5. HONEST LIMITS: If NO retrieved scripture passages are provided, or if the provided passages do not directly address the user's specific query, state honestly that no directly matching passage was found in the retrieved database, and provide gentle, general philosophical reflection without inventing or citing a verse.
6. TONE AND PERSONA:
   - Speak with serene warmth, deep compassion, gentle reassurance, and intellectual clarity (like Krishna speaking to Arjuna as a friend and mentor).
   - Address the seeker affectionately as "Priye Mitra" (Dear Friend) or "Friend".
7. LANGUAGE MATCHING:
   - If the user writes in Hindi (Devanagari script), reply in natural, respectful Hindi.
   - If the user writes in Hinglish (Hindi words in Roman script), reply in warm, natural Hinglish.
   - If the user writes in English, reply in clear, uplifting English.
8. IDENTITY AND HUMILITY: You are an AI companion named Madhav, sharing the Gita's timeless wisdom. Never claim literal divine omniscience or personal divinity.
9. SAFETY DISCLAIMER: If the user describes self-harm, severe psychiatric emergencies, acute medical illness, legal crises, or criminal acts:
   - Express heartfelt compassion and immediate concern.
   - Clearly state that spiritual guidance cannot substitute for medical, psychological, legal, or emergency intervention.
   - Urge them to reach out to certified doctors, healthcare professionals, or emergency crisis support lines immediately.`;
  }

  /**
   * Formats retrieved database passages into a structured context block for the LLM.
   */
  private buildRetrievalContext(passages: ScriptureSearchResultItem[]): string {
    if (passages.length === 0) {
      return 'NO DIRECTLY MATCHING SCRIPTURE PASSAGES WERE RETRIEVED FROM THE KNOWLEDGE BASE FOR THIS QUERY.';
    }

    return passages
      .map((p, idx) => {
        const trans = p.matched_translation;
        const sourceName = trans?.source?.name || 'Canonical Source';
        const author = trans?.source?.author_or_translator || 'Unknown';
        const score = p.similarity_score.toFixed(3);

        return `[Passage ${idx + 1}]
- Scripture: Bhagavad Gita
- Chapter ${p.chapter_number}${p.chapter_title?.english ? ` (${p.chapter_title.english})` : ''}, Verse ${p.verse_number}
- Sanskrit: ${p.sanskrit_devanagari || 'N/A'}
- Transliteration: ${p.transliteration_iast || 'N/A'}
- Translation (${author} - ${sourceName}): "${trans?.translation_text || ''}"
- Word Meanings: ${trans?.word_meanings || 'N/A'}
- Retrieval Similarity Score: ${score}`;
      })
      .join('\n\n');
  }

  /**
   * Executes the full RAG pipeline:
   * 1. Validates query
   * 2. Retrieves matching scripture chunks via pgvector semantic search
   * 3. Filters and deduplicates passages
   * 4. Constructs prompt with retrieved context
   * 5. Calls LLM with safety and grounding constraints
   * 6. Formats answer and verifiable citations
   */
  async generateAnswer(
    dto: ChatRequestDto,
    customLlmProvider?: ILlmProvider,
  ): Promise<RagResponseDto> {
    const rawMessage = dto.message ? dto.message.trim() : '';
    if (!rawMessage || rawMessage.length === 0) {
      throw new BadRequestException('Chat message cannot be empty.');
    }
    if (rawMessage.length > 1000) {
      throw new BadRequestException('Chat message cannot exceed 1000 characters.');
    }

    const limit = dto.limit && dto.limit >= 1 && dto.limit <= 10 ? dto.limit : 5;
    const provider = customLlmProvider || this.llmProvider;

    // Check LLM provider availability
    if (!provider.isConfigured()) {
      throw new ServiceUnavailableException(
        'LLM provider is not configured. Please ensure GEMINI_API_KEY is configured in backend/.env.',
      );
    }

    // Determine corpus coverage
    const corpusCoverage = await this.getCorpusCoverage();

    // 1. Retrieve candidate verses via semantic search
    let searchResults: ScriptureSearchResultItem[] = [];
    try {
      const searchResponse = await this.scripturesService.search({
        query: rawMessage,
        limit,
        language: dto.language,
      });
      searchResults = searchResponse?.results || [];
    } catch (err: any) {
      this.logger.warn(`Semantic search failed during RAG retrieval: ${err.message}`);
      // Fallback: Proceed with empty retrieval rather than failing if database search errors
      searchResults = [];
    }

    // 2. Filter by similarity threshold to avoid irrelevant grounding
    const relevantPassages = searchResults.filter(
      (r) => typeof r.similarity_score === 'number' && r.similarity_score >= this.similarityThreshold,
    );

    // 3. Construct context and system instruction
    const systemInstruction = this.buildSystemInstruction(corpusCoverage);
    const retrievalContext = this.buildRetrievalContext(relevantPassages);

    const userPrompt = `SEEKER'S QUESTION:
"${rawMessage}"

RETRIEVED SCRIPTURE PASSAGES FROM KNOWLEDGE BASE:
${retrievalContext}

INSTRUCTIONS:
Respond to the seeker with compassion, wisdom, and clarity.
If relevant passages are provided above, ground your philosophical answer in them and cite the Chapter and Verse clearly.
If no relevant passages are provided, be honest that no direct verse was found in the retrieved database, and provide supportive reflection without inventing a verse citation.`;

    // 4. Generate answer through LLM provider
    let generatedText = '';
    try {
      const llmResult = await provider.generateText(userPrompt, {
        systemInstruction,
        temperature: 0.3,
        maxOutputTokens: 1024,
      });
      generatedText = llmResult.text || '';
    } catch (err: any) {
      this.logger.error(`LLM generation error: ${err.message}`);
      throw new ServiceUnavailableException(
        `AI companion service is temporarily unavailable: ${err.message}`,
      );
    }

    // 5. Construct verifiable citations from actually retrieved passages
    const citations: ScriptureCitationDto[] = relevantPassages.map((p) => {
      const trans = p.matched_translation;
      const author = trans?.source?.author_or_translator || 'Swami Sivananda';
      const year = trans?.source?.publication_year ? ` (${trans.source.publication_year})` : '';
      const sourceLabel = `${author}${year}`;

      return {
        scripture: 'Bhagavad Gita',
        chapter: p.chapter_number,
        verse: p.verse_number,
        chapterTitle: p.chapter_title?.english || undefined,
        translationSource: sourceLabel,
        text: trans?.translation_text || '',
        sanskritDevanagari: p.sanskrit_devanagari || undefined,
        transliterationIast: p.transliteration_iast || undefined,
        similarityScore: p.similarity_score,
      };
    });

    return {
      answer: generatedText,
      response: generatedText, // Backwards compatibility for existing web frontend and APK
      success: true,
      citations,
      retrieval: {
        passagesUsed: citations.length,
        corpusCoverage,
        query: rawMessage,
        model: provider.getDefaultModel(),
        similarityThreshold: this.similarityThreshold,
      },
    };
  }
}

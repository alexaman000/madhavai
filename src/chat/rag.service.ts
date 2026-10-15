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
import { QueryIntentClassifier, QueryIntent, QueryIntentType } from './query-intent.classifier';
import { CitationVerifier } from './citation-verifier';

@Injectable()
export class RagService {
  private readonly logger = new Logger(RagService.name);
  private cachedCorpusCount: number | null = null;
  private readonly similarityThreshold = 0.40;

  constructor(
    private readonly db: DatabaseService,
    private readonly scripturesService: ScripturesService,
    private readonly llmProvider: GeminiLlmProvider = new GeminiLlmProvider(),
  ) {
    CitationVerifier.init();
  }

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
   * Builds the grounding system instruction for Madhav based on user query intent.
   */
  private buildSystemInstruction(
    corpusCoverage: 'comprehensive' | 'limited',
    intentType: QueryIntentType = 'SPIRITUAL_PHILOSOPHICAL',
  ): string {
    if (intentType === 'GENERAL_FACTUAL_OR_TECHNICAL') {
      return `You are Madhav, a calm, wise, respectful, and thoughtful AI companion.
The user is asking a factual, technical, coding, or worldly practical question.

GUIDELINES:
1. Answer the question directly, accurately, and practically with clarity.
2. Maintain your calm, polite, and supportive demeanor.
3. DO NOT force or fabricate Bhagavad Gita verses, Sanskrit shlokas, or spiritual metaphors into this technical answer.
4. DO NOT apologize or claim that the Bhagavad Gita is limited or does not mention modern technology. Simply answer the user's question helpfully and directly.
5. Provide code examples, mathematical steps, or direct answers whenever appropriate.
6. Adapt length to the question: if the question is concise, keep the answer concise.
7. LANGUAGE: Respond in the exact language the user wrote (Hindi, Hinglish, or English).`;
    }

    const coverageNote =
      corpusCoverage === 'limited'
        ? '\nNOTE ON CORPUS COVERAGE: The active scripture knowledge base currently contains a subset of verses. Do not claim comprehensive coverage of all 18 chapters if relevant verses are missing.'
        : '';

    return `You are Madhav, a calm, compassionate, and wise companion inspired by Sri Krishna's teachings in the sacred Bhagavad Gita.${coverageNote}

Your purpose is to offer serene, empathetic, and practical guidance to seekers facing life challenges, ethical dilemmas, inner conflict, anxiety, grief, duty (dharma), or spiritual inquiry.

CORE PERSONALITY & GROUNDING RULES:
1. TONE: Calm, wise, compassionate, respectful, thoughtful, and practical. Speak with peaceful warmth and clarity.
2. DYNAMIC GREETINGS: Do NOT start every response with a rigid repetitive greeting (such as "Priye Mitra" or "Namaste"). Adapt naturally: acknowledge the specific concern gently, or begin directly when appropriate.
3. NO FABRICATION: Use ONLY the provided retrieved scripture passages as your ground of truth for all Bhagavad Gita teachings, philosophy, and verses. Under NO circumstance may you fabricate or invent verse numbers, chapter numbers, Sanskrit shlokas, translations, or attributions.
4. CITATIONS: When quoting or referencing a teaching from the retrieved passages, clearly state the Chapter and Verse (e.g. "In Bhagavad Gita, Chapter X, Verse Y...").
5. CLEAR DISTINCTION: Clearly distinguish between:
   - Direct scripture quotes or paraphrases from the retrieved passages.
   - Spiritual interpretations, reflections, and practical guidance.
6. HONEST LIMITS: If no retrieved scripture passages are provided, or if the provided passages do not directly address the query, state honestly that no directly matching passage was found in the retrieved database, and provide gentle, thoughtful philosophical reflection without inventing or citing a verse.
7. PRACTICAL NEXT STEPS: When addressing life struggles, provide gentle, actionable next steps rather than relying on hollow motivational quotes.
8. IDENTITY & HUMILITY: You are an AI companion named Madhav, sharing the Gita's timeless wisdom. Never claim literal divine omniscience, personal divinity, or to literally be Lord Krishna in the flesh.
9. LANGUAGE MATCHING:
   - If the user writes in Hindi (Devanagari script), reply in natural, respectful Hindi.
   - If the user writes in Hinglish (Hindi words in Roman script), reply in warm, natural Hinglish.
   - If the user writes in English, reply in clear, uplifting English.
10. SAFETY DISCLAIMER: If the user describes self-harm, severe psychiatric emergencies, acute medical illness, legal crises, or criminal acts:
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
        const score = typeof p.similarity_score === 'number' ? p.similarity_score.toFixed(3) : '1.000';

        return `[Passage ${idx + 1}]
- Scripture: Bhagavad Gita
- Chapter ${p.chapter_number}${p.chapter_title?.english ? ` (${p.chapter_title.english})` : ''}, Verse ${p.verse_number}
- Sanskrit: ${p.sanskrit_devanagari || 'N/A'}
- Transliteration: ${p.transliteration_iast || 'N/A'}
- Translation (${author} - ${sourceName}): "${trans?.translation_text || ''}"
- Word Meanings: ${typeof trans?.word_meanings === 'object' ? JSON.stringify(trans.word_meanings) : trans?.word_meanings || 'N/A'}
- Retrieval Similarity Score: ${score}`;
      })
      .join('\n\n');
  }

  /**
   * Executes the intent-aware, validated RAG pipeline:
   * 1. Classifies query intent (SPECIFIC_VERSE, GENERAL_TECHNICAL, SPIRITUAL_PHILOSOPHICAL, AMBIGUOUS)
   * 2. Retrieves exact verse lookup OR semantic pgvector search
   * 3. Incorporates recent conversation history for context continuity
   * 4. Calls LLM with appropriate system instructions
   * 5. Validates citations via CitationVerifier (canonical existence, provenance, claim support)
   */
  /**
   * Validates input, determines intent, performs retrieval, and formats prompts
   * Shared by both synchronous generateAnswer and incremental streamAnswer.
   */
  private async prepareRagContext(
    dto: ChatRequestDto,
    provider: ILlmProvider,
  ): Promise<{
    rawMessage: string;
    corpusCoverage: 'comprehensive' | 'limited';
    intent: QueryIntent;
    relevantPassages: ScriptureSearchResultItem[];
    systemInstruction: string;
    userPrompt: string;
    temperature: number;
  }> {
    const rawMessage = dto.message ? dto.message.trim() : '';
    if (!rawMessage || rawMessage.length === 0) {
      throw new BadRequestException('Chat message cannot be empty.');
    }
    if (rawMessage.length > 1000) {
      throw new BadRequestException('Chat message cannot exceed 1000 characters.');
    }

    const limit = dto.limit && dto.limit >= 1 && dto.limit <= 10 ? dto.limit : 5;

    if (!provider.isConfigured()) {
      throw new ServiceUnavailableException(
        'LLM provider is not configured. Please ensure GEMINI_API_KEY is configured in backend/.env.',
      );
    }

    const corpusCoverage = await this.getCorpusCoverage();

    // 1. Query Intent Classification
    const intent = QueryIntentClassifier.classify(rawMessage);
    this.logger.log(`Query intent: ${intent.type} (confidence: ${intent.confidence}) - "${rawMessage}"`);

    let relevantPassages: ScriptureSearchResultItem[] = [];

    // 2. Retrieval routing based on intent
    if (intent.type === 'SPECIFIC_VERSE' && intent.specificVerse) {
      try {
        const exactVerse = await this.scripturesService.getVerse(
          'bhagavad-gita',
          intent.specificVerse.chapter,
          intent.specificVerse.verse,
        );
        if (exactVerse) {
          relevantPassages.push({
            verse_id: exactVerse.verse_id,
            scripture: exactVerse.scripture,
            chapter_number: exactVerse.chapter_number,
            verse_number: exactVerse.verse_number,
            chapter_title: exactVerse.chapter_title,
            sanskrit_devanagari: exactVerse.sanskrit_devanagari,
            transliteration_iast: exactVerse.transliteration_iast,
            similarity_score: 1.0,
            distance_metric: 'deterministic_lookup',
            matched_text: exactVerse.translations?.[0]?.translation_text || '',
            matched_translation: exactVerse.translations?.[0],
            all_translations: exactVerse.translations || [],
          });
        }
      } catch (err: any) {
        this.logger.warn(`Exact verse lookup for ${intent.specificVerse.chapter}.${intent.specificVerse.verse} failed: ${err.message}`);
      }
    } else if (intent.type === 'GENERAL_FACTUAL_OR_TECHNICAL' || intent.type === 'INVALID_VERSE_REFERENCE') {
      relevantPassages = [];
    } else {
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
        searchResults = [];
      }

      relevantPassages = searchResults.filter(
        (r) => typeof r.similarity_score === 'number' && r.similarity_score >= this.similarityThreshold,
      );
    }

    // 3. Conversation History Context
    let historyBlock = '';
    if (Array.isArray(dto.history) && dto.history.length > 0) {
      const recentTurns = dto.history.slice(-6);
      historyBlock =
        'RECENT CONVERSATION HISTORY (for context and follow-up understanding):\n' +
        recentTurns
          .map((h) => `${h.role === 'user' ? 'Seeker' : 'Madhav'}: ${h.content}`)
          .join('\n') +
        '\n\n';
    }

    // 4. Construct prompt and system instruction
    const systemInstruction = this.buildSystemInstruction(corpusCoverage, intent.type);
    const retrievalContext = this.buildRetrievalContext(relevantPassages);

    let userPrompt: string;
    if (intent.type === 'GENERAL_FACTUAL_OR_TECHNICAL') {
      userPrompt = `${historyBlock}USER'S QUESTION:
"${rawMessage}"

INSTRUCTIONS:
Provide a direct, practical, and helpful answer. Do not force spiritual or scriptural citations.`;
    } else if (intent.type === 'INVALID_VERSE_REFERENCE' && intent.specificVerse) {
      userPrompt = `${historyBlock}SEEKER'S QUESTION:
"${rawMessage}"

INSTRUCTIONS:
The seeker is asking about Chapter ${intent.specificVerse.chapter}, Verse ${intent.specificVerse.verse}.
The Bhagavad Gita has exactly 18 chapters and 701 verses.
Respectfully inform the seeker that Chapter ${intent.specificVerse.chapter} does not exist in the Bhagavad Gita (which ends at Chapter 18).
Do not cite any verses or invent text. Offer to help them explore any valid chapter or topic.`;
    } else {
      userPrompt = `${historyBlock}SEEKER'S QUESTION:
"${rawMessage}"

RETRIEVED SCRIPTURE PASSAGES FROM KNOWLEDGE BASE:
${retrievalContext}

INSTRUCTIONS:
Respond to the seeker with compassion, wisdom, and practical clarity.
If relevant passages are provided above, ground your philosophical answer in them and cite Chapter and Verse.
If no relevant passages are provided, be honest and provide supportive, thoughtful guidance without inventing a verse.`;
    }

    return {
      rawMessage,
      corpusCoverage,
      intent,
      relevantPassages,
      systemInstruction,
      userPrompt,
      temperature: intent.type === 'GENERAL_FACTUAL_OR_TECHNICAL' ? 0.2 : 0.4,
    };
  }

  /**
   * Executes the intent-aware, validated RAG pipeline (synchronous non-streaming):
   */
  async generateAnswer(
    dto: ChatRequestDto,
    customLlmProvider?: ILlmProvider,
  ): Promise<RagResponseDto> {
    const provider = customLlmProvider || this.llmProvider;
    const context = await this.prepareRagContext(dto, provider);

    let generatedText = '';
    try {
      const llmResult = await provider.generateText(context.userPrompt, {
        systemInstruction: context.systemInstruction,
        temperature: context.temperature,
        maxOutputTokens: 1024,
      });
      generatedText = llmResult.text || '';
    } catch (err: any) {
      this.logger.error(`LLM generation error: ${err.message}`);
      throw new ServiceUnavailableException(
        `AI companion service is temporarily unavailable: ${err.message}`,
      );
    }

    // Step 12B: Citation Verification Layer
    const verification = CitationVerifier.verify(
      generatedText,
      context.relevantPassages,
      context.intent,
    );

    if (verification.rejectedCitations.length > 0) {
      this.logger.log(
        `CitationVerifier filtered ${verification.rejectedCitations.length} citation(s): ${verification.rejectedCitations
          .map((r) => `${r.reference} (${r.reason})`)
          .join('; ')}`,
      );
    }

    return {
      answer: verification.cleanedAnswer,
      response: verification.cleanedAnswer,
      success: true,
      citations: verification.verifiedCitations,
      retrieval: {
        passagesUsed: verification.verifiedCitations.length,
        corpusCoverage: context.corpusCoverage,
        query: context.rawMessage,
        model: provider.getDefaultModel(),
        similarityThreshold: this.similarityThreshold,
      },
    };
  }

  /**
   * Executes the intent-aware RAG pipeline with Server-Sent Events (SSE) streaming.
   * Emits tokens as they generate, and runs CitationVerifier strictly on the completed answer.
   */
  async streamAnswer(
    dto: ChatRequestDto,
    onStart?: (info: { queryIntent: string; model: string }) => void | Promise<void>,
    onDelta?: (chunk: string) => void | Promise<void>,
    abortSignal?: AbortSignal,
    customLlmProvider?: ILlmProvider,
  ): Promise<RagResponseDto> {
    const provider = customLlmProvider || this.llmProvider;
    const context = await this.prepareRagContext(dto, provider);

    if (onStart) {
      await onStart({
        queryIntent: context.intent.type,
        model: provider.getDefaultModel(),
      });
    }

    let generatedText = '';
    try {
      const llmResult = await provider.streamText(
        context.userPrompt,
        {
          systemInstruction: context.systemInstruction,
          temperature: context.temperature,
          maxOutputTokens: 1024,
          abortSignal,
        },
        async (chunk: string) => {
          if (onDelta) {
            await onDelta(chunk);
          }
        },
      );
      generatedText = llmResult.text || '';
    } catch (err: any) {
      if (abortSignal?.aborted) {
        this.logger.log('Streaming answer aborted by client.');
      } else {
        this.logger.error(`LLM streaming error: ${err.message}`);
        throw new ServiceUnavailableException(
          `AI companion service is temporarily unavailable: ${err.message}`,
        );
      }
    }

    // Step 12B: Citation Verification Layer (Runs strictly after generation finishes)
    const verification = CitationVerifier.verify(
      generatedText,
      context.relevantPassages,
      context.intent,
    );

    if (verification.rejectedCitations.length > 0) {
      this.logger.log(
        `CitationVerifier filtered ${verification.rejectedCitations.length} citation(s): ${verification.rejectedCitations
          .map((r) => `${r.reference} (${r.reason})`)
          .join('; ')}`,
      );
    }

    return {
      answer: verification.cleanedAnswer,
      response: verification.cleanedAnswer,
      success: true,
      citations: verification.verifiedCitations,
      retrieval: {
        passagesUsed: verification.verifiedCitations.length,
        corpusCoverage: context.corpusCoverage,
        query: context.rawMessage,
        model: provider.getDefaultModel(),
        similarityThreshold: this.similarityThreshold,
      },
    };
  }
}


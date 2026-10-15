export type QueryIntentType =
  | 'SPECIFIC_VERSE'
  | 'INVALID_VERSE_REFERENCE'
  | 'GENERAL_FACTUAL_OR_TECHNICAL'
  | 'SPIRITUAL_PHILOSOPHICAL'
  | 'AMBIGUOUS_OR_CASUAL';

export interface QueryIntent {
  type: QueryIntentType;
  specificVerse?: {
    chapter: number;
    verse: number;
  };
  confidence: number;
  reason: string;
}

export class QueryIntentClassifier {
  /**
   * Classify user query to guide appropriate RAG retrieval and response style
   */
  static classify(query: string): QueryIntent {
    const raw = (query || '').trim();
    const lower = raw.toLowerCase();

    // 1. SPECIFIC VERSE REFERENCE
    // Matches: "BG 2.47", "BG 2:47", "Chapter 2 Verse 47", "Gita 2.47", "अध्याय 2 श्लोक 47", "2.47"
    const versePatterns = [
      /\b(?:bg|gita|geeta|bhagavad\s*gita)?\s*(?:chapter|ch\.?|अध्याय)?\s*(\d{1,3})\s*[\.:, -]+\s*(?:verse|shloka|sloka|श्लोक)?\s*(\d{1,3})\b/i,
      /\b(?:verse|shloka|sloka|श्लोक)\s*(\d{1,3})\s*(?:of|in|का)?\s*(?:chapter|ch\.?|अध्याय)\s*(\d{1,3})\b/i,
      /\b(\d{1,3})\s*[\.:]\s*(\d{1,3})\b/,
    ];

    // Check if query explicitly asks about a specific scripture verse
    const hasScriptureContext =
      lower.includes('bg') ||
      lower.includes('gita') ||
      lower.includes('geeta') ||
      lower.includes('shlok') ||
      lower.includes('verse') ||
      lower.includes('श्लोक') ||
      lower.includes('अध्याय') ||
      lower.includes('chapter');

    if (hasScriptureContext) {
      for (const pattern of versePatterns) {
        const match = raw.match(pattern);
        if (match) {
          // If second pattern matched: match[1] is verse, match[2] is chapter
          const isReverse = pattern === versePatterns[1];
          const chapter = parseInt(isReverse ? match[2] : match[1], 10);
          const verse = parseInt(isReverse ? match[1] : match[2], 10);

          if (chapter >= 1 && chapter <= 18 && verse >= 1 && verse <= 78) {
            return {
              type: 'SPECIFIC_VERSE',
              specificVerse: { chapter, verse },
              confidence: 0.95,
              reason: `Explicit reference to Bhagavad Gita Chapter ${chapter}, Verse ${verse}`,
            };
          } else {
            return {
              type: 'INVALID_VERSE_REFERENCE',
              specificVerse: { chapter, verse },
              confidence: 0.98,
              reason: `Explicit reference to invalid or out-of-bounds Chapter ${chapter}, Verse ${verse}`,
            };
          }
        }
      }
    }

    // 2. GENERAL FACTUAL OR TECHNICAL
    // Queries about coding, technical definitions, math, science, or purely worldly tasks
    const technicalKeywords = [
      'python',
      'javascript',
      'typescript',
      'java',
      'c++',
      'code',
      'coding',
      'function',
      'algorithm',
      'binary search',
      'bubble sort',
      'array',
      'loop',
      'syntax',
      'database',
      'sql query',
      'git commit',
      'html',
      'css',
      'react',
      'npm',
      'docker',
      'api endpoint',
      'regex',
      'calculate',
      'formula',
      'capital of',
      'president of',
      'recipe for',
      'how to cook',
      'how to install',
    ];

    const isSpiritualOverride =
      lower.includes('gita') ||
      lower.includes('krishna') ||
      lower.includes('श्रीकृष्ण') ||
      lower.includes('गीता') ||
      lower.includes('dharma') ||
      lower.includes('धर्म') ||
      lower.includes('karma') ||
      lower.includes('कर्म') ||
      lower.includes('moksha') ||
      lower.includes('मोक्ष');

    if (!isSpiritualOverride && technicalKeywords.some((kw) => lower.includes(kw))) {
      return {
        type: 'GENERAL_FACTUAL_OR_TECHNICAL',
        confidence: 0.90,
        reason: 'Technical, programming, or factual query that does not require scripture retrieval',
      };
    }

    // 3. CASUAL GREETING OR HIGHLY AMBIGUOUS
    const greetings = [
      'hi',
      'hello',
      'hey',
      'namaste',
      'namaskar',
      'नमस्ते',
      'नमस्कार',
      'good morning',
      'good evening',
      'सुप्रभात',
      'pranam',
      'प्रणाम',
    ];

    const isShortGreeting = raw.length <= 25 && greetings.some((g) => lower === g || lower.startsWith(`${g} `) || lower.endsWith(` ${g}`));
    if (isShortGreeting) {
      return {
        type: 'AMBIGUOUS_OR_CASUAL',
        confidence: 0.95,
        reason: 'Short conversational greeting',
      };
    }

    const ambiguousShortQueries = ['help', 'guide me', 'what should i do', 'मदद करो', 'सलाह दो', 'help me', 'guide'];
    if (ambiguousShortQueries.includes(lower.trim())) {
      return {
        type: 'AMBIGUOUS_OR_CASUAL',
        confidence: 0.85,
        reason: 'Ambiguous prompt requiring clarification rather than assumptions',
      };
    }

    // 4. SPIRITUAL, PHILOSOPHICAL OR EMOTIONAL (DEFAULT)
    return {
      type: 'SPIRITUAL_PHILOSOPHICAL',
      confidence: 0.85,
      reason: 'Spiritual, ethical, emotional, or philosophical inquiry suitable for Gita RAG grounding',
    };
  }
}

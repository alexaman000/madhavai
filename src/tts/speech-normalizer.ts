/**
 * Madhav.ai — Dedicated Natural Speech Preparation & Normalization Engine
 *
 * Prepares raw assistant/RAG responses for Sarvam Bulbul v3 TTS:
 * - Strips decorative Markdown, role markers, and UI metadata.
 * - Expands scripture citations into respectful spoken words.
 * - Preserves Sanskrit verses and Devanagari script integrity.
 * - Splits long responses into natural conversational chunks at sentence/paragraph boundaries.
 * - Classifies context-aware delivery style (COMPASSIONATE, CALM_REFLECTIVE, etc.).
 */

export type DeliveryStyle =
  | 'COMPASSIONATE'
  | 'CALM_REFLECTIVE'
  | 'GENTLE_ENCOURAGING'
  | 'EXPLANATORY'
  | 'NEUTRAL';

export interface DeliveryConfig {
  style: DeliveryStyle;
  pace: number;
  temperature: number;
  description: string;
}

export interface PreparedSpeech {
  fullCleanText: string;
  chunks: string[];
  delivery: DeliveryConfig;
  language: 'hi-IN' | 'en-IN';
}

export class SpeechNormalizer {
  /**
   * Classify context-aware delivery style based on semantic cues in response
   */
  static classifyDeliveryStyle(text: string): DeliveryConfig {
    const lower = text.toLowerCase();

    // 1. Compassionate: comfort, sorrow, grief, fear, distress, anxiety
    const compassionateTriggers = [
      'चिंता',
      'घबराहट',
      'अशांत',
      'उलझन',
      'दुःख',
      'दुख',
      'कष्ट',
      'परेशान',
      'भय',
      'तनाव',
      'उदास',
      'worry',
      'anxious',
      'anxiety',
      'distress',
      'comfort',
      'sorrow',
      'fear',
      'restless',
      'confused',
    ];
    if (compassionateTriggers.some((t) => text.includes(t) || lower.includes(t))) {
      return {
        style: 'COMPASSIONATE',
        pace: 0.88,
        temperature: 0.72,
        description: 'Gentle, comforting and emotionally reassuring for distress/anxiety',
      };
    }

    // 2. Calm Reflective: deep philosophical inquiry, meditation, yoga, self-realization
    const reflectiveTriggers = [
      'आत्मिक चिंतन',
      'आत्मज्ञान',
      'ध्यान',
      'साधना',
      'मोक्ष',
      'ईश्वर',
      'ब्रह्म',
      'आत्मा',
      'meditation',
      'spiritual reflection',
      'self-realization',
      'soul',
      'divine',
      'eternal',
    ];
    if (reflectiveTriggers.some((t) => text.includes(t) || lower.includes(t))) {
      return {
        style: 'CALM_REFLECTIVE',
        pace: 0.86,
        temperature: 0.65,
        description: 'Thoughtful, measured delivery for deep spiritual wisdom',
      };
    }

    // 3. Gentle Encouraging: action, duty, karma, perseverance, victory, strength
    const encouragingTriggers = [
      'उठो',
      'कर्म करो',
      'कर्तव्य',
      'साहस',
      'धैर्य',
      'विजय',
      'आगे बढ़ो',
      'stand up',
      'perform your duty',
      'courage',
      'strength',
      'perseverance',
      'action',
    ];
    if (encouragingTriggers.some((t) => text.includes(t) || lower.includes(t))) {
      return {
        style: 'GENTLE_ENCOURAGING',
        pace: 0.92,
        temperature: 0.70,
        description: 'Warm, uplifting guidance inspiring confident righteous action',
      };
    }

    // 4. Explanatory: analytical breakdown, verse commentary, chapter analysis
    const explanatoryTriggers = [
      'श्लोक',
      'अर्थ',
      'अध्याय',
      'तात्पर्य',
      'व्याख्या',
      'verse',
      'meaning',
      'chapter',
      'explains',
      'context',
    ];
    if (explanatoryTriggers.some((t) => text.includes(t) || lower.includes(t))) {
      return {
        style: 'EXPLANATORY',
        pace: 0.90,
        temperature: 0.68,
        description: 'Clear, engaging conversational teaching',
      };
    }

    // 5. Neutral default
    return {
      style: 'NEUTRAL',
      pace: 0.90,
      temperature: 0.65,
      description: 'Balanced, pleasant natural conversational delivery',
    };
  }

  /**
   * Clean raw markdown, headings, badges, and noise while preserving scripture and core meaning
   */
  static cleanRawText(rawText: string, isHindi: boolean): string {
    if (!rawText || !rawText.trim()) return '';
    let text = rawText;

    // 1. Remove JSON wrappers or role tags if accidentally present
    text = text.replace(/^\{.*"response":\s*"/s, '').replace(/"\s*\}$/s, '');
    text = text.replace(/^(Assistant|Madhav|User):\s*/gim, '');

    // 2. Expand Scripture Citations into spoken words BEFORE removing brackets
    if (isHindi) {
      // BG Chapter.Verse
      text = text.replace(/\[?\bBG[- ]?([0-9]{1,2})[\.:]([0-9]{1,2})\]?/gi, 'श्रीमद्भगवद्गीता अध्याय $1, श्लोक $2, ');
      text = text.replace(/\[?\bBG[- ]?([0-9]{1,2})\]?/gi, 'श्रीमद्भगवद्गीता अध्याय $1, ');
      // Spoken Sanskrit verse intro
      text = text.replace(/\[?श्रीमद्भगवद्गीता[, ]*अध्याय\s*([0-9]{1,2})[, ]*श्लोक\s*([0-9]{1,2})\]?/gi, 'श्रीमद्भगवद्गीता अध्याय $1, श्लोक $2, ');
    } else {
      text = text.replace(/\[?\bBG[- ]?([0-9]{1,2})[\.:]([0-9]{1,2})\]?/gi, 'Bhagavad Gita Chapter $1, Verse $2, ');
      text = text.replace(/\[?\bBG[- ]?([0-9]{1,2})\]?/gi, 'Bhagavad Gita Chapter $1, ');
    }

    // 3. Strip bracketed citation tags (e.g. [1], [2], [Swami Sivananda (1942)])
    text = text.replace(/\[[0-9]+\]/g, '');
    text = text.replace(/\[[^\]]+\]/g, '');

    // 4. Strip URLs
    text = text.replace(/https?:\/\/\S+/gi, '');

    // 5. Clean Decorative Headings (### Spiritual Reflection: -> आत्मिक चिंतन:)
    text = text.replace(/^#+\s*\**(Spiritual Reflection|Aatmik Chintan|आत्मिक चिंतन)\**[:\-]?\s*/gim, 'आत्मिक चिंतन: ');
    text = text.replace(/^#+\s*\**(Key Insight|Core Teaching|मुख्य विचार)\**[:\-]?\s*/gim, 'मुख्य विचार: ');
    text = text.replace(/^#+\s*/gm, ''); // Remove other header hashes

    // 6. Strip Markdown Bold/Italic formatting characters: **bold** -> bold, *italic* -> italic
    text = text.replace(/(\*\*|\*|__|_|`|~)/g, '');

    // 7. Normalize bullet points and numbering into natural thought transitions
    text = text.replace(/^\s*[-*•]\s+/gm, '');
    text = text.replace(/^\s*\d+\.\s+/gm, '');

    // 8. Replace abrupt punctuation (em dashes, semicolons) with natural breath pause commas
    text = text.replace(/[—–-]{2,}/g, ', ');
    text = text.replace(/\s+[—–-]\s+/g, ', ');
    text = text.replace(/;/g, ', ');

    // 9. Conversational warm breath pauses after spiritual addresses
    if (isHindi) {
      text = text.replace(/(हे पार्थ|प्रिय मित्र|वत्स|हे अर्जुन)[!|।,]?\s*/gi, '$1, ');
    } else {
      text = text.replace(/(Dear friend|O Partha|O Arjuna)[!,]?\s*/gi, '$1, ');
    }

    // 10. Clean repetitive punctuation and normalize whitespace
    text = text.replace(/,\s*,+/g, ', ');
    text = text.replace(/[,\s]*,[,\s]*/g, ', ');
    text = text.replace(/[ \t]+/g, ' ');
    text = text.replace(/\n{3,}/g, '\n\n').trim();

    return text;
  }

  /**
   * Split a long response into conversational chunks without breaking sentences or Sanskrit verses
   * Optimal chunk length: 150 to 450 characters (easy on memory, fast latency, natural pause between ideas)
   */
  static segmentIntoChunks(text: string, isHindi: boolean): string[] {
    if (!text || text.trim().length === 0) return [];

    const paragraphs = text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);

    // If single paragraph and comfortably short, return single chunk
    if (paragraphs.length <= 1 && text.length <= 350) {
      return [text.trim()];
    }

    const chunks: string[] = [];
    for (const paragraph of paragraphs) {
      if (paragraph.length <= 350) {
        chunks.push(paragraph);
        continue;
      }

      // If paragraph is long, split on sentence boundaries (।, ?, ., !)
      // Preserve the punctuation with the sentence
      const sentenceRegex = /([^।?!.]+[।?!.]+)/g;
      const sentences = paragraph.match(sentenceRegex) || [paragraph];

      let currentChunk = '';
      for (const rawSentence of sentences) {
        const sentence = rawSentence.trim();
        if (!sentence) continue;

        if (currentChunk.length + sentence.length + 1 <= 400) {
          currentChunk = currentChunk ? `${currentChunk} ${sentence}` : sentence;
        } else {
          if (currentChunk) {
            chunks.push(currentChunk.trim());
          }
          currentChunk = sentence;
        }
      }

      if (currentChunk.trim()) {
        chunks.push(currentChunk.trim());
      }
    }

    // Final safety: ensure no chunk exceeds 2400 chars
    const safeChunks: string[] = [];
    for (const c of chunks) {
      if (c.length <= 2400) {
        safeChunks.push(c);
      } else {
        // Fallback sentence boundary split
        const parts = c.match(/.{1,2000}(\s|$)/g) || [c];
        safeChunks.push(...parts.map((p) => p.trim()).filter(Boolean));
      }
    }

    return safeChunks.length > 0 ? safeChunks : [text];
  }

  /**
   * Main preparation pipeline: cleans, classifies, and segments
   */
  static prepare(rawText: string, overrideLang?: string): PreparedSpeech {
    const isHindi = (overrideLang && overrideLang.startsWith('hi')) || /[\u0900-\u097F]/.test(rawText);
    const targetLang: 'hi-IN' | 'en-IN' = isHindi ? 'hi-IN' : 'en-IN';

    const fullCleanText = this.cleanRawText(rawText, isHindi);
    const delivery = this.classifyDeliveryStyle(rawText);
    const chunks = this.segmentIntoChunks(fullCleanText, isHindi);

    return {
      fullCleanText,
      chunks,
      delivery,
      language: targetLang,
    };
  }
}

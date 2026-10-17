export interface ScriptureCitationDto {
  scripture: string;
  chapter: number;
  verse: number;
  chapterTitle?: string;
  translationSource: string;
  text: string;
  sanskritDevanagari?: string;
  transliterationIast?: string;
  similarityScore?: number;
}

export interface RagResponseDto {
  answer: string;
  response: string; // for backward compatibility with frontend callers
  success: boolean; // for backward compatibility
  citations: ScriptureCitationDto[];
  retrieval: {
    passagesUsed: number;
    corpusCoverage: 'comprehensive' | 'limited';
    query: string;
    model: string;
    similarityThreshold?: number;
  };
  conversationId?: string;
  conversationTitle?: string;
  messageId?: string;
}

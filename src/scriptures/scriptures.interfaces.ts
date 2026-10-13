export interface ScriptureSource {
  id: string;
  name: string;
  author_or_translator: string;
  license: string;
  publication_year?: number;
  publisher?: string;
  source_url?: string;
  notes?: string;
  created_at?: string;
  updated_at?: string;
}

export interface ScriptureChapter {
  id: string;
  scripture_id: string;
  chapter_number: number;
  name_sanskrit: string;
  name_transliterated: string;
  name_english: string;
  verse_count: number;
  summary?: string;
  created_at?: string;
  updated_at?: string;
}

export interface ScriptureVerse {
  id: string; // e.g. 'BG-2.47'
  scripture_id: string;
  chapter_number: number;
  verse_number: number;
  sanskrit_devanagari: string;
  transliteration_iast: string;
  verification_status: 'verified' | 'pending' | 'unverified';
  verified_by?: string;
  metadata?: Record<string, any>;
  created_at?: string;
  updated_at?: string;
}

export interface ScriptureTranslation {
  id: string;
  verse_id: string;
  source_id: string;
  language: string;
  translation_text: string;
  word_meanings?: Record<string, string>;
  created_at?: string;
  updated_at?: string;
}

export interface VerseResponseDto {
  verse_id: string;
  scripture: string;
  chapter_number: number;
  verse_number: number;
  chapter_title: {
    sanskrit: string;
    transliterated: string;
    english: string;
  };
  sanskrit_devanagari: string;
  transliteration_iast: string;
  verification_status: string;
  verified_by?: string;
  metadata?: Record<string, any>;
  translations: Array<{
    language: string;
    translation_text: string;
    word_meanings?: Record<string, string>;
    source: {
      id: string;
      name: string;
      author_or_translator: string;
      license: string;
      publisher?: string;
      publication_year?: number;
      source_url?: string;
    };
  }>;
}

export interface ChapterSummaryDto {
  chapter_number: number;
  name_sanskrit: string;
  name_transliterated: string;
  name_english: string;
  verse_count: number;
  summary?: string;
}

export interface ScriptureSearchResultItem {
  verse_id: string;
  scripture: string;
  chapter_number: number;
  verse_number: number;
  chapter_title: {
    sanskrit: string;
    transliterated: string;
    english: string;
  };
  sanskrit_devanagari: string;
  transliteration_iast: string;
  similarity_score: number;
  distance_metric: string;
  matched_text: string;
  matched_translation?: {
    language: string;
    translation_text: string;
    word_meanings?: Record<string, string>;
    source: {
      id: string;
      name: string;
      author_or_translator: string;
      license: string;
      publisher?: string;
      publication_year?: number;
      source_url?: string;
    };
  };
  all_translations?: Array<{
    language: string;
    translation_text: string;
    word_meanings?: Record<string, string>;
    source: {
      id: string;
      name: string;
      author_or_translator: string;
      license: string;
      publisher?: string;
      publication_year?: number;
      source_url?: string;
    };
  }>;
  metadata?: Record<string, any>;
}

export interface ScriptureSearchResponseDto {
  query: string;
  model: string;
  dimension: number;
  total_results: number;
  results: ScriptureSearchResultItem[];
}

export interface ScriptureEmbeddingRecord {
  id: string;
  verse_id: string;
  translation_id?: string;
  source_id?: string;
  provider: string;
  model: string;
  dimension: number;
  content_hash: string;
  input_text: string;
  embedding: number[];
  metadata?: Record<string, any>;
  created_at?: string;
  updated_at?: string;
}

export interface SearchableScriptureChunk {
  chunk_id: string;
  verse_id: string;
  translation_id?: string;
  source_id?: string;
  scripture_id: string;
  chapter_number: number;
  verse_number: number;
  sanskrit_devanagari: string;
  transliteration_iast: string;
  translation_text?: string;
  language: string;
  translator?: string;
  source_name?: string;
  deterministic_input_text: string;
  content_hash: string;
}

export interface EmbeddingGenerationOptions {
  dryRun?: boolean;
  model?: string;
  batchSize?: number;
  concurrency?: number;
  forceRegenerate?: boolean;
}

export interface EmbeddingGenerationReport {
  success: boolean;
  dryRun: boolean;
  provider: string;
  model: string;
  dimension: number;
  eligibleRecords: number;
  alreadyEmbedded: number;
  successfullyEmbedded: number;
  skippedUnchanged: number;
  failedCount: number;
  missingEmbeddings: number;
  errors: Array<{ chunk_id: string; error: string }>;
  isComplete: boolean;
}

export interface EmbeddingIntegrityReport {
  totalRecordsInDb: number;
  invalidVectors: number;
  dimensionMismatches: number;
  orphanedRows: number;
  duplicateRows: number;
  staleRows: number;
  wrongModelRows: number;
  modelsUsed: Record<string, number>;
}

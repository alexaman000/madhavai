import { Injectable, Logger } from '@nestjs/common';
import { GoogleGenAI } from '@google/genai';

export interface EmbeddingProviderResult {
  embedding: number[];
  dimension: number;
}

@Injectable()
export class GeminiEmbeddingProvider {
  private readonly logger = new Logger(GeminiEmbeddingProvider.name);
  private aiClient: GoogleGenAI | null = null;
  public readonly defaultModel = 'gemini-embedding-001';
  public readonly targetDimension = 768;

  constructor() {
    this.initClient();
  }

  private initClient() {
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.LLM_API_KEY;
    if (apiKey && apiKey.trim().length > 0) {
      try {
        this.aiClient = new GoogleGenAI({ apiKey: apiKey.trim() });
        this.logger.log('✨ Gemini embedding provider initialized with API key.');
      } catch (err: any) {
        this.logger.warn(`Failed to initialize GoogleGenAI client: ${err.message}`);
      }
    } else {
      this.logger.warn('ℹ️ No GEMINI_API_KEY found in environment. Provider is unconfigured.');
    }
  }

  isConfigured(): boolean {
    return this.aiClient !== null;
  }

  /**
   * Generates a 768-dimensional embedding for the given input text with exponential backoff for transient errors.
   */
  async generateEmbedding(
    text: string,
    modelName: string = this.defaultModel,
  ): Promise<EmbeddingProviderResult> {
    if (!this.aiClient) {
      throw new Error(
        'Gemini API key is not configured. Please set GEMINI_API_KEY in your environment variables.',
      );
    }

    if (!text || text.trim().length === 0) {
      throw new Error('Input text for embedding generation cannot be empty.');
    }

    const maxRetries = 4;
    let delayMs = 2000;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const response: any = await this.aiClient.models.embedContent({
          model: modelName,
          contents: text,
          config: {
            outputDimensionality: this.targetDimension,
          },
        });

        const embeddingValues: number[] =
          response.embedding?.values || response.embeddings?.[0]?.values || [];

        if (!embeddingValues || embeddingValues.length === 0) {
          throw new Error(`Embedding response contained empty values from model '${modelName}'.`);
        }

        // Validate finite numbers
        for (let i = 0; i < embeddingValues.length; i++) {
          const val = embeddingValues[i];
          if (typeof val !== 'number' || isNaN(val) || !isFinite(val)) {
            throw new Error(`Invalid non-finite or NaN value detected in embedding vector at index ${i}.`);
          }
        }

        if (embeddingValues.length !== this.targetDimension) {
          throw new Error(
            `Dimension mismatch: expected ${this.targetDimension}, got ${embeddingValues.length}`,
          );
        }

        return {
          embedding: embeddingValues,
          dimension: embeddingValues.length,
        };
      } catch (err: any) {
        const isTransient =
          err.status === 429 ||
          err.status === 503 ||
          err.status === 500 ||
          err.message?.includes('RESOURCE_EXHAUSTED') ||
          err.message?.includes('rate limit') ||
          err.message?.includes('Quota exceeded');

        if (isTransient && attempt < maxRetries) {
          let waitTime = delayMs;
          if (err.status === 429 || err.message?.includes('RESOURCE_EXHAUSTED') || err.message?.includes('Quota exceeded')) {
            const match = err.message?.match(/retry in ([\d\.]+)s/i);
            if (match && match[1]) {
              waitTime = Math.ceil(parseFloat(match[1]) + 2) * 1000;
            } else {
              waitTime = Math.max(delayMs, 25000);
            }
          }

          this.logger.warn(
            `Transient error generating embedding (attempt ${attempt}/${maxRetries}): ${err.message}. Retrying in ${waitTime}ms...`,
          );
          await new Promise((resolve) => setTimeout(resolve, waitTime));
          delayMs *= 2;
        } else {
          // Permanent or exhausted error
          throw err;
        }
      }
    }

    throw new Error(`Failed to generate embedding for text after ${maxRetries} attempts.`);
  }
}

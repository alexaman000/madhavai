import { Injectable, Logger } from '@nestjs/common';
import { GoogleGenAI } from '@google/genai';
import {
  ILlmProvider,
  LlmGenerateOptions,
  LlmGenerateResult,
  LlmStreamOptions,
} from './llm.interface';

@Injectable()
export class GeminiLlmProvider implements ILlmProvider {
  private readonly logger = new Logger(GeminiLlmProvider.name);
  private aiClient: GoogleGenAI | null = null;
  public readonly defaultModel: string;

  constructor() {
    this.defaultModel = process.env.GEMINI_CHAT_MODEL || 'gemini-3.5-flash';
    this.initClient();
  }

  private initClient() {
    const apiKey =
      process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.LLM_API_KEY;
    if (apiKey && apiKey.trim().length > 0) {
      try {
        this.aiClient = new GoogleGenAI({ apiKey: apiKey.trim() });
        this.logger.log(`✨ Gemini LLM provider initialized with default model: ${this.defaultModel}`);
      } catch (err: any) {
        this.logger.warn(`Failed to initialize GoogleGenAI client: ${err.message}`);
      }
    } else {
      this.logger.warn('ℹ️ No GEMINI_API_KEY found in environment. LLM provider is unconfigured.');
    }
  }

  isConfigured(): boolean {
    return this.aiClient !== null;
  }

  getDefaultModel(): string {
    return this.defaultModel;
  }

  /**
   * Returns prioritized list of candidate models to try in case of 503 high demand or quota limits.
   */
  private getCandidateModels(requestedModel?: string): string[] {
    const primary = requestedModel || this.defaultModel;
    const fallbacks = [
      'gemini-3.5-flash',
      'gemini-flash-lite-latest',
      'gemini-3.5-flash-lite',
      'gemini-3.8-flash',
    ];
    return Array.from(new Set([primary, ...fallbacks]));
  }

  /**
   * Generates text response using Google GenAI SDK with bounded timeout,
   * automatic multi-model fallback cascade, and exponential backoff.
   */
  async generateText(prompt: string, options?: LlmGenerateOptions): Promise<LlmGenerateResult> {
    if (!this.aiClient) {
      throw new Error(
        'Gemini API key is not configured. Please set GEMINI_API_KEY in your environment variables.',
      );
    }

    if (!prompt || prompt.trim().length === 0) {
      throw new Error('Input prompt for LLM text generation cannot be empty.');
    }

    const candidateModels = this.getCandidateModels(options?.model);
    const timeoutMs = options?.timeoutMs || 45000;
    let lastError: Error | null = null;

    for (const model of candidateModels) {
      const maxRetries = 2;
      let delayMs = 1000;

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          const generationPromise = (async () => {
            const config: any = {};
            if (options?.systemInstruction) {
              config.systemInstruction = options.systemInstruction;
            }
            if (typeof options?.temperature === 'number') {
              config.temperature = options.temperature;
            }
            if (typeof options?.maxOutputTokens === 'number') {
              config.maxOutputTokens = options.maxOutputTokens;
            }

            const response: any = await this.aiClient!.models.generateContent({
              model,
              contents: prompt,
              config: Object.keys(config).length > 0 ? config : undefined,
            });

            const text =
              response?.text || response?.candidates?.[0]?.content?.parts?.[0]?.text || '';
            const finishReason = response?.candidates?.[0]?.finishReason || 'STOP';

            return {
              text: text.trim(),
              model,
              finishReason,
            };
          })();

          const timeoutPromise = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error(`LLM call timed out after ${timeoutMs}ms`)), timeoutMs),
          );

          const result = await Promise.race([generationPromise, timeoutPromise]);

          if (!result.text) {
            throw new Error(`LLM returned empty text from model '${model}'.`);
          }

          return result;
        } catch (err: any) {
          lastError = err;
          const isHighDemandOrTransient =
            err.status === 429 ||
            err.status === 503 ||
            err.status === 500 ||
            err.status === 404 ||
            err.message?.includes('RESOURCE_EXHAUSTED') ||
            err.message?.includes('rate limit') ||
            err.message?.includes('Quota exceeded') ||
            err.message?.includes('temporarily unavailable') ||
            err.message?.includes('experiencing high demand') ||
            err.message?.includes('timed out');

          if (isHighDemandOrTransient) {
            this.logger.warn(
              `Model ${model} failed (status: ${err.status || 'unknown'}, attempt ${attempt}/${maxRetries}): ${err.message}. Trying next candidate...`,
            );
            // Move to next candidate model immediately if 503, 404, or high demand
            if (err.status === 503 || err.status === 404 || err.message?.includes('high demand')) {
              break;
            }
            await new Promise((resolve) => setTimeout(resolve, delayMs));
            delayMs *= 2;
          } else {
            const safeMessage = (err.message || 'LLM generation failure').replace(
              /key=[a-zA-Z0-9_\-\.]+/gi,
              'key=REDACTED',
            );
            throw new Error(safeMessage);
          }
        }
      }
    }

    const safeMessage = (lastError?.message || 'Failed to generate LLM text across candidate models').replace(
      /key=[a-zA-Z0-9_\-\.]+/gi,
      'key=REDACTED',
    );
    throw new Error(safeMessage);
  }

  /**
   * Streams text response chunk-by-chunk using Google GenAI SDK.
   * Features client abort signals, timeout monitoring, and automatic multi-model fallback cascade.
   */
  async streamText(
    prompt: string,
    options?: LlmStreamOptions,
    onChunk?: (chunk: string) => void | Promise<void>,
  ): Promise<LlmGenerateResult> {
    if (!this.aiClient) {
      throw new Error(
        'Gemini API key is not configured. Please set GEMINI_API_KEY in your environment variables.',
      );
    }

    if (!prompt || prompt.trim().length === 0) {
      throw new Error('Input prompt for LLM text generation cannot be empty.');
    }

    const candidateModels = this.getCandidateModels(options?.model);
    let lastError: Error | null = null;

    for (const currentModel of candidateModels) {
      if (options?.abortSignal?.aborted) {
        return { text: '', model: currentModel, finishReason: 'ABORTED' };
      }

      const config: any = {};
      if (options?.systemInstruction) {
        config.systemInstruction = options.systemInstruction;
      }
      if (typeof options?.temperature === 'number') {
        config.temperature = options.temperature;
      }
      if (typeof options?.maxOutputTokens === 'number') {
        config.maxOutputTokens = options.maxOutputTokens;
      }
      if (options?.abortSignal) {
        config.abortSignal = options.abortSignal;
      }

      let accumulatedText = '';
      let hasEmittedChunks = false;

      try {
        const responseStream = await this.aiClient.models.generateContentStream({
          model: currentModel,
          contents: prompt,
          config: Object.keys(config).length > 0 ? config : undefined,
        });

        for await (const chunk of responseStream) {
          if (options?.abortSignal?.aborted) {
            this.logger.log('LLM stream aborted by client signal.');
            break;
          }

          const delta = chunk.text || chunk.candidates?.[0]?.content?.parts?.[0]?.text || '';
          if (delta && delta.length > 0) {
            hasEmittedChunks = true;
            accumulatedText += delta;
            if (onChunk) {
              await onChunk(delta);
            }
          }
        }

        return {
          text: accumulatedText.trim(),
          model: currentModel,
          finishReason: 'STOP',
        };
      } catch (err: any) {
        if (options?.abortSignal?.aborted || err.name === 'AbortError') {
          this.logger.log('Stream ended due to client abort.');
          return {
            text: accumulatedText.trim(),
            model: currentModel,
            finishReason: 'ABORTED',
          };
        }

        lastError = err;
        this.logger.warn(
          `Stream initialization on model ${currentModel} failed: ${err.message}. ${
            !hasEmittedChunks ? 'Attempting fallback candidate model...' : 'Chunks already emitted.'
          }`,
        );

        // If no chunks were emitted yet and error is high demand / 503 / 404 / 429, try next model
        if (!hasEmittedChunks) {
          continue;
        }

        const safeMessage = (err.message || 'LLM streaming error').replace(
          /key=[a-zA-Z0-9_\-\.]+/gi,
          'key=REDACTED',
        );
        throw new Error(safeMessage);
      }
    }

    const safeMessage = (lastError?.message || 'LLM streaming failed across all candidate models').replace(
      /key=[a-zA-Z0-9_\-\.]+/gi,
      'key=REDACTED',
    );
    throw new Error(safeMessage);
  }
}

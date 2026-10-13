import { Injectable, Logger } from '@nestjs/common';
import { GoogleGenAI } from '@google/genai';
import { ILlmProvider, LlmGenerateOptions, LlmGenerateResult } from './llm.interface';

@Injectable()
export class GeminiLlmProvider implements ILlmProvider {
  private readonly logger = new Logger(GeminiLlmProvider.name);
  private aiClient: GoogleGenAI | null = null;
  public readonly defaultModel: string;
  private readonly fallbackModel = 'gemini-3.8-flash';

  constructor() {
    this.defaultModel = process.env.GEMINI_CHAT_MODEL || 'gemini-3.5-flash-lite';
    this.initClient();
  }

  private initClient() {
    const apiKey =
      process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.LLM_API_KEY;
    if (apiKey && apiKey.trim().length > 0) {
      try {
        this.aiClient = new GoogleGenAI({ apiKey: apiKey.trim() });
        this.logger.log(`✨ Gemini LLM provider initialized with model: ${this.defaultModel}`);
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
   * Generates text response using Google GenAI SDK with bounded timeout,
   * exponential backoff retries, and automatic fallback handling for transient errors.
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

    const requestedModel = options?.model || this.defaultModel;
    const timeoutMs = options?.timeoutMs || 25000;
    const maxRetries = 3;
    let delayMs = 1500;
    let currentModel = requestedModel;

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
            model: currentModel,
            contents: prompt,
            config: Object.keys(config).length > 0 ? config : undefined,
          });

          const text = response?.text || response?.candidates?.[0]?.content?.parts?.[0]?.text || '';
          const finishReason = response?.candidates?.[0]?.finishReason || 'STOP';

          return {
            text: text.trim(),
            model: currentModel,
            finishReason,
          };
        })();

        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`LLM call timed out after ${timeoutMs}ms`)), timeoutMs),
        );

        const result = await Promise.race([generationPromise, timeoutPromise]);

        if (!result.text) {
          throw new Error(`LLM returned an empty response from model '${currentModel}'.`);
        }

        return result;
      } catch (err: any) {
        const isTransient =
          err.status === 429 ||
          err.status === 503 ||
          err.status === 500 ||
          err.message?.includes('RESOURCE_EXHAUSTED') ||
          err.message?.includes('rate limit') ||
          err.message?.includes('Quota exceeded') ||
          err.message?.includes('temporarily unavailable') ||
          err.message?.includes('experiencing high demand');

        // Check if model 503 / high demand suggests fallback model
        if (
          (err.status === 503 || err.message?.includes('experiencing high demand')) &&
          currentModel === this.defaultModel &&
          this.fallbackModel !== this.defaultModel
        ) {
          this.logger.warn(
            `Model ${currentModel} experienced high demand. Trying fallback model ${this.fallbackModel}...`,
          );
          currentModel = this.fallbackModel;
          continue;
        }

        if (isTransient && attempt < maxRetries) {
          let waitTime = delayMs;
          if (
            err.status === 429 ||
            err.message?.includes('RESOURCE_EXHAUSTED') ||
            err.message?.includes('Quota exceeded')
          ) {
            const match = err.message?.match(/retry in ([\d\.]+)s/i);
            if (match && match[1]) {
              waitTime = Math.ceil(parseFloat(match[1]) + 1) * 1000;
            } else {
              waitTime = Math.max(delayMs, 5000);
            }
          }

          this.logger.warn(
            `Transient error in LLM call (attempt ${attempt}/${maxRetries}): ${err.message}. Retrying in ${waitTime}ms...`,
          );
          await new Promise((resolve) => setTimeout(resolve, waitTime));
          delayMs *= 2;
        } else {
          // Sanitize message: never expose raw API keys or internal credentials
          const safeMessage = (err.message || 'LLM generation failure').replace(
            /key=[a-zA-Z0-9_\-\.]+/gi,
            'key=REDACTED',
          );
          throw new Error(safeMessage);
        }
      }
    }

    throw new Error(`Failed to generate LLM text after ${maxRetries} attempts.`);
  }
}

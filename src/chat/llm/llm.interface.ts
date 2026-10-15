export interface LlmMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LlmGenerateOptions {
  model?: string;
  temperature?: number;
  maxOutputTokens?: number;
  systemInstruction?: string;
  timeoutMs?: number;
}

export interface LlmGenerateResult {
  text: string;
  model: string;
  finishReason?: string;
}

export interface LlmStreamOptions extends LlmGenerateOptions {
  abortSignal?: AbortSignal;
}

export interface ILlmProvider {
  isConfigured(): boolean;
  getDefaultModel(): string;
  generateText(prompt: string, options?: LlmGenerateOptions): Promise<LlmGenerateResult>;
  streamText(
    prompt: string,
    options: LlmStreamOptions | undefined,
    onChunk: (chunk: string) => void | Promise<void>,
  ): Promise<LlmGenerateResult>;
}

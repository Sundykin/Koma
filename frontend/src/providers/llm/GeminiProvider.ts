import type { ModelConfig } from '../../types';
import type { ChatMessage, LLMCallOptions, LLMProvider, LLMStreamChunkHandler } from './types';

function createDirectProviderRemovedError(providerName: string): Error {
  return new Error(`[${providerName}] Frontend direct LLM providers have been removed. Use Electron IPC / createLLMProvider() instead.`);
}

export class GeminiProvider implements LLMProvider {
  type = 'direct-disabled';
  config: ModelConfig;

  constructor(config: ModelConfig) {
    this.config = config;
    throw createDirectProviderRemovedError('Gemini');
  }

  validate(): boolean {
    return false;
  }

  async testConnection(): Promise<boolean> {
    throw createDirectProviderRemovedError('Gemini');
  }

  async generateText(_prompt: string, _systemPrompt?: string, _options?: LLMCallOptions): Promise<string> {
    throw createDirectProviderRemovedError('Gemini');
  }

  async chat(_messages: ChatMessage[], _options?: LLMCallOptions, _onChunk?: LLMStreamChunkHandler): Promise<string> {
    throw createDirectProviderRemovedError('Gemini');
  }
}

export default GeminiProvider;

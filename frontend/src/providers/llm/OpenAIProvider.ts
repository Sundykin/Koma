import type { ModelConfig } from '../../types';
import type { ChatMessage, LLMCallOptions, LLMProvider, LLMStreamChunkHandler } from './types';

function createDirectProviderRemovedError(providerName: string): Error {
  return new Error(`[${providerName}] Frontend direct LLM providers have been removed. Use Electron IPC / createLLMProvider() instead.`);
}

export class OpenAIProvider implements LLMProvider {
  type = 'direct-disabled';
  config: ModelConfig;

  constructor(config: ModelConfig) {
    this.config = config;
    throw createDirectProviderRemovedError('OpenAI');
  }

  validate(): boolean {
    return false;
  }

  async testConnection(): Promise<boolean> {
    throw createDirectProviderRemovedError('OpenAI');
  }

  async generateText(_prompt: string, _systemPrompt?: string, _options?: LLMCallOptions): Promise<string> {
    throw createDirectProviderRemovedError('OpenAI');
  }

  async chat(_messages: ChatMessage[], _options?: LLMCallOptions, _onChunk?: LLMStreamChunkHandler): Promise<string> {
    throw createDirectProviderRemovedError('OpenAI');
  }
}

export default OpenAIProvider;

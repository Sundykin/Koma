/**
 * LLM Provider 工厂和导出
 */
import type { ModelConfig } from '../../types';
import type { LLMProvider } from './types';
import { GeminiProvider } from './GeminiProvider';
import { OpenAIProvider } from './OpenAIProvider';

export type { LLMProvider, ChatMessage } from './types';
export { GeminiProvider } from './GeminiProvider';
export { OpenAIProvider } from './OpenAIProvider';

export function createLLMProvider(config: ModelConfig): LLMProvider {
  switch (config.provider) {
    case 'gemini':
      return new GeminiProvider(config);
    case 'openai':
      return new OpenAIProvider(config);
    default:
      throw new Error(`Unknown LLM provider: ${config.provider}`);
  }
}

/**
 * LLM Provider 工厂和导出
 */
import type { ModelConfig } from '../../types';
import type { LLMProvider } from './types';
import { GeminiProvider } from './GeminiProvider';
import { OpenAIProvider } from './OpenAIProvider';
import { ClaudeProvider } from './ClaudeProvider';

export type { LLMProvider, ChatMessage } from './types';
export { GeminiProvider } from './GeminiProvider';
export { OpenAIProvider } from './OpenAIProvider';
export { ClaudeProvider } from './ClaudeProvider';

/**
 * 创建 LLM Provider
 * @param config 模型配置，provider 支持: openai-compatible, gemini, claude
 */
export function createLLMProvider(config: ModelConfig): LLMProvider {
  switch (config.provider) {
    case 'gemini':
      return new GeminiProvider(config);
    case 'openai':
    case 'openai-compatible':
      // openai-compatible 使用 OpenAIProvider（兼容 OpenAI API 格式）
      return new OpenAIProvider(config);
    case 'claude':
      return new ClaudeProvider(config);
    default:
      throw new Error(`未知的 LLM 服务商: ${config.provider}`);
  }
}

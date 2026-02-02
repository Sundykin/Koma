/**
 * 适配器工厂
 */
import type { ChatAdapter, AdapterConfig } from './types';
import { OpenAIAdapter } from './OpenAIAdapter';
import { GeminiAdapter } from './GeminiAdapter';
import { ClaudeAdapter } from './ClaudeAdapter';

export type AdapterType = 'openai' | 'openai-compatible' | 'gemini' | 'claude';

export interface CreateAdapterOptions extends AdapterConfig {
  type: AdapterType;
}

/**
 * 创建适配器
 */
export function createChatAdapter(options: CreateAdapterOptions): ChatAdapter {
  const { type, ...config } = options;

  switch (type) {
    case 'openai':
      return new OpenAIAdapter({
        ...config,
        baseUrl: config.baseUrl || 'https://api.openai.com/v1',
      });

    case 'openai-compatible':
      if (!config.baseUrl) {
        throw new Error('OpenAI 兼容模式需要指定 baseUrl');
      }
      return new OpenAIAdapter(config);

    case 'gemini':
      return new GeminiAdapter(config);

    case 'claude':
      return new ClaudeAdapter(config);

    default:
      throw new Error(`不支持的适配器类型: ${type}`);
  }
}

/**
 * 从 LLM 配置创建适配器
 * 兼容现有的 LLMModelConfig 结构
 */
export function createChatAdapterFromLLMConfig(config: {
  provider: string;
  apiKey: string;
  baseUrl?: string;
  modelName: string;
}): ChatAdapter {
  const adapterType = config.provider as AdapterType;

  return createChatAdapter({
    type: adapterType,
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
    model: config.modelName,
  });
}

export { OpenAIAdapter } from './OpenAIAdapter';
export { GeminiAdapter } from './GeminiAdapter';
export { ClaudeAdapter } from './ClaudeAdapter';
export type { ChatAdapter, AdapterConfig } from './types';

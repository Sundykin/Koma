/**
 * LLM Provider 类型定义
 */
import type { ModelConfig } from '../../types';

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface LLMCallOptions {
  traceId?: string;
  source?: string;
  operation?: string;
  projectId?: string;
  targetId?: string;
  targetName?: string;
  stream?: boolean;
  /** 强制 LLM 返回格式，目前仅 OpenAI 兼容服务生效 */
  responseFormat?: 'json_object' | 'text';
}

export interface LLMProvider {
  type: string;
  config: ModelConfig;
  validate(): boolean;
  testConnection(): Promise<boolean>;
  generateText(prompt: string, systemPrompt?: string, options?: LLMCallOptions): Promise<string>;
  chat(messages: ChatMessage[], options?: LLMCallOptions): Promise<string>;
}

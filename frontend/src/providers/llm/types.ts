/**
 * LLM Provider 类型定义
 */
import type { ModelConfig } from '../../types';

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface LLMProvider {
  type: string;
  config: ModelConfig;
  validate(): boolean;
  testConnection(): Promise<boolean>;
  generateText(prompt: string, systemPrompt?: string): Promise<string>;
  chat(messages: ChatMessage[]): Promise<string>;
}

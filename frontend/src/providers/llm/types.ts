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
}

export interface LLMProvider {
  type: string;
  config: ModelConfig;
  validate(): boolean;
  testConnection(): Promise<boolean>;
  generateText(prompt: string, systemPrompt?: string, options?: LLMCallOptions): Promise<string>;
  /**
   * 流式文本生成 — 通过 onChunk 回调逐步推送内容，无应用层超时。
   * 适用于长文本精炼、内容浓缩等重量级任务。
   * 返回完整生成结果。
   */
  generateTextStream?(
    prompt: string,
    systemPrompt?: string,
    options?: LLMCallOptions,
    onChunk?: (delta: string, accumulated: string) => void,
  ): Promise<string>;
  chat(messages: ChatMessage[], options?: LLMCallOptions): Promise<string>;
}

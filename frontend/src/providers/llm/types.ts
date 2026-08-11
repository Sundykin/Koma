/**
 * LLM Provider 类型定义
 */
import type { ModelConfig } from '../../types';

export type LLMTaskKind = 'chat' | 'extract' | 'analyze' | 'rewrite' | 'generate' | 'structured';

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface LLMCallOptions {
  traceId?: string;
  source?: string;
  operation?: string;
  taskKind?: LLMTaskKind;
  taskProfileId?: string;
  projectId?: string;
  targetId?: string;
  targetName?: string;
  stream?: boolean;
  /** 强制 LLM 返回格式，目前仅 OpenAI 兼容服务生效 */
  responseFormat?: 'json_object' | 'text';
  /** 禁用长文本自动分段（章节划分等需要全文视角的任务） */
  disableChunking?: boolean;
  /** 请求超时 (ms)，覆盖后端默认值 */
  timeoutMs?: number;
  /** 流式增量回调；提供后会优先走流式请求 */
  onChunk?: LLMStreamChunkHandler;
  /**
   * 推理过程（思维链）增量回调。推理模型吐正文之前会先思考几十秒，那段时间 onChunk
   * 一个字都不会来——只有这个回调有内容，用来让 UI 显示"正在思考"而不是空转。
   * 它不会进入最终返回的正文。
   */
  onReasoningChunk?: LLMStreamChunkHandler;
}

export type LLMStreamChunkHandler = (delta: string, accumulated: string) => void;

export interface LLMProvider {
  type: string;
  config: ModelConfig;
  validate(): boolean;
  testConnection(): Promise<boolean>;
  generateText(prompt: string, systemPrompt?: string, options?: LLMCallOptions): Promise<string>;
  chat(messages: ChatMessage[], options?: LLMCallOptions, onChunk?: LLMStreamChunkHandler): Promise<string>;
}

/**
 * LLM Provider 类型定义
 */

import type {
  BaseProvider,
  ProviderCapabilities,
} from './provider-base';

/** 聊天消息 */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | ContentPart[];
  name?: string;
  toolCallId?: string;
  toolCalls?: ToolCall[];
}

/** 内容部分 (多模态) */
export interface ContentPart {
  type: 'text' | 'image' | 'audio';
  text?: string;
  url?: string;
  base64?: string;
}

/** LLM 选项 */
export interface LLMOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  stopSequences?: string[];
  tools?: ToolDefinition[];
  responseFormat?: 'text' | 'json';
}

/** 工具定义 */
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

/** 工具调用 */
export interface ToolCall {
  id: string;
  name: string;
  arguments: string;
}

/** 聊天响应 */
export interface ChatResponse {
  content: string;
  finishReason: 'stop' | 'length' | 'tool_calls';
  toolCalls?: ToolCall[];
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

/** 流式响应块 */
export interface ChatStreamChunk {
  type: 'content' | 'tool_call' | 'done';
  content?: string;
  toolCall?: Partial<ToolCall>;
}

/** 模型信息 */
export interface ModelInfo {
  id: string;
  name: string;
  contextLength?: number;
  capabilities?: string[];
}

/** LLM 能力扩展 */
export interface LLMCapabilities extends ProviderCapabilities {
  features?: (
    | 'streaming'
    | 'vision'
    | 'function-calling'
    | 'json-mode'
    | 'system-prompt'
  )[];
}

/**
 * LLM Provider 接口
 */
export interface LLMProvider extends BaseProvider {
  chat(messages: ChatMessage[], options?: LLMOptions): Promise<ChatResponse>;
  chatStream?(messages: ChatMessage[], options?: LLMOptions): AsyncIterable<ChatStreamChunk>;
  listModels?(): Promise<ModelInfo[]>;
  getCapabilities(): LLMCapabilities;
}

/** LLM Provider 工厂函数 */
export type LLMProviderFactory = (
  config: Record<string, unknown>,
  context: { pluginId: string; instanceId: string }
) => LLMProvider;

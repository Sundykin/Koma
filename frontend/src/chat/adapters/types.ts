/**
 * 适配器类型定义
 */
import type {
  ChatMessage,
  ChatOptions,
  ChatResponse,
  ChatChunk,
  AdapterCapability,
} from '../types';

// 适配器配置
export interface AdapterConfig {
  apiKey: string;
  baseUrl?: string;
  model: string;
  defaultTemperature?: number;
  defaultMaxTokens?: number;
}

// 适配器接口
export interface ChatAdapter {
  readonly type: string;
  readonly capabilities: AdapterCapability[];

  // 核心方法
  chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse>;
  chatStream(messages: ChatMessage[], options?: ChatOptions): AsyncIterable<ChatChunk>;

  // 能力检测
  supports(capability: AdapterCapability): boolean;

  // 连接测试
  testConnection(): Promise<boolean>;
}

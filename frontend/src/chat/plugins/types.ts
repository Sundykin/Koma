/**
 * 插件类型定义
 */
import type {
  ChatMessage,
  ChatResponse,
  ChatChunk,
  ToolDefinition,
  ChatOptions,
} from '../types';
import type { ChatSession } from '../ChatSession';

// 插件上下文
export interface PluginContext {
  session: ChatSession;
  messages: ChatMessage[];
  options?: ChatOptions;
}

// 插件接口
export interface ChatPlugin {
  name: string;
  version: string;

  // 生命周期钩子
  onBeforeRequest?(context: PluginContext): Promise<void>;
  onAfterResponse?(context: PluginContext, response: ChatResponse): Promise<void>;
  onStreamChunk?(context: PluginContext, chunk: ChatChunk): Promise<ChatChunk>;
  onError?(context: PluginContext, error: Error): Promise<void>;

  // 工具相关
  getTools?(): ToolDefinition[];
  executeTool?(name: string, args: unknown): Promise<unknown>;
}

// 工具处理器
export interface ToolHandler {
  definition: ToolDefinition;
  execute: (args: unknown) => Promise<unknown>;
}

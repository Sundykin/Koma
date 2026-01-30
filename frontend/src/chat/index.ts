/**
 * 对话模块
 * 通用多轮对话能力，支持流式输出、多模型适配、插件扩展
 */

// 核心类型
export * from './types';

// 会话管理 (Legacy)
export { ChatSession } from './ChatSession';

// 适配器 (Legacy - 仅兼容保留)
export {
  createChatAdapter,
  createChatAdapterFromLLMConfig,
  OpenAIAdapter,
  GeminiAdapter,
  ClaudeAdapter,
} from './adapters';
export type { ChatAdapter, AdapterConfig, AdapterType, CreateAdapterOptions } from './adapters';

// 插件 (Legacy - 仅兼容保留)
export {
  PluginManager,
  FunctionCallPlugin,
  FileUploadPlugin,
  MCPPlugin,
} from './plugins';
export type { ChatPlugin, PluginContext, ToolHandler, MCPServerConfig } from './plugins';

// Hooks (新版 IPC 驱动)
export { useChat } from './hooks';
export type { UseChatOptions, UseChatReturn } from './hooks';

// IPC 客户端 (新架构)
export * from './ipc';
export { chatIPC } from './ipc';

// 组件
export { ChatRenderer, MessageBubble } from './components';
export type { ChatRendererProps } from './components';

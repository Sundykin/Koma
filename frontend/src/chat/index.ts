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
} from './plugins';
export type { ChatPlugin, PluginContext, ToolHandler, MCPServerConfig } from './plugins';

// Hooks (新版 IPC 驱动)
export { useChat } from './hooks';
export type { UseChatOptions, UseChatReturn } from './hooks';

// IPC 客户端 (新架构) - 避免重复导出类型
export { chatIPC } from './ipc';
export type {
  SessionConfig,
  SessionSummary,
  SessionDetail,
  ChatInput,
  StreamChunkEvent,
  StreamToolEvent,
  StreamDoneEvent,
  StreamErrorEvent,
  MCPTransportType,
  MCPConnection,
  MCPToolDefinition,
  AgentMode,
  ToolResult,
  StreamEventCallback,
  UnsubscribeFn,
} from './ipc';
export {
  createSession,
  getSession,
  disposeSession,
  listSessions,
  updateSessionConfig,
  sendMessage,
  sendMessageStream,
  cancelStream,
  onStreamChunk,
  onStreamTool,
  onStreamDone,
  onStreamError,
  connectMCP,
  disconnectMCP,
  listMCPConnections,
  listMCPTools,
  callMCPTool,
  listAllTools,
  callTool,
  createUserInput,
} from './ipc';

// 组件
export { ChatRenderer, MessageBubble } from './components';
export type { ChatRendererProps } from './components';

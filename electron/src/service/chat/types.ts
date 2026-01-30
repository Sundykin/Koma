/**
 * Chat 服务类型定义
 */
import type { BaseMessage } from '@langchain/core/messages';

// ========== 消息相关 ==========

export type MessageRole = 'system' | 'user' | 'assistant' | 'tool';

export interface ContentPart {
  type: 'text' | 'image' | 'file';
  text?: string;
  imageUrl?: string;
  mimeType?: string;
  data?: string; // base64
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolResult {
  toolCallId: string;
  name: string;
  result: unknown;
  error?: string;
}

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string | ContentPart[];
  toolCalls?: ToolCall[];
  toolResults?: ToolResult[];
  reasoning?: string;
  timestamp: number;
}

// ========== 会话相关 ==========

export interface SessionConfig {
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  enabledTools?: string[];
  modelProvider?: 'openai' | 'anthropic' | 'google';
  modelName?: string;
  apiKey?: string;
  baseUrl?: string;
}

export interface Session {
  id: string;
  windowId: number;
  config: SessionConfig;
  messages: ChatMessage[];
  langchainMessages: BaseMessage[];
  createdAt: number;
  updatedAt: number;
  abortController?: AbortController;
}

export interface SessionSummary {
  id: string;
  windowId: number;
  messageCount: number;
  createdAt: number;
  updatedAt: number;
}

// ========== 请求/响应 ==========

export interface ChatInput {
  role: 'user';
  content: string | ContentPart[];
}

export interface ChatOptions {
  temperature?: number;
  maxTokens?: number;
  tools?: string[];
  signal?: AbortSignal;
}

export interface ChatSendRequest {
  sessionId: string;
  input: ChatInput;
  options?: ChatOptions;
}

export interface ChatSendResponse {
  requestId: string;
  accepted: boolean;
}

// ========== 流式事件 ==========

export interface StreamStartEvent {
  requestId: string;
  sessionId: string;
}

export interface StreamChunkEvent {
  requestId: string;
  sessionId: string;
  delta: string;
  reasoning?: string;
  seq: number;
}

export interface StreamToolEvent {
  requestId: string;
  sessionId: string;
  toolCall: ToolCall;
  result?: unknown;
  error?: string;
}

export interface StreamDoneEvent {
  requestId: string;
  sessionId: string;
  finishReason: 'stop' | 'tool_calls' | 'length' | 'error';
  message?: ChatMessage;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface StreamErrorEvent {
  requestId: string;
  sessionId: string;
  error: {
    code: string;
    message: string;
  };
}

// ========== MCP 相关 ==========

export type MCPTransportType = 'stdio' | 'sse' | 'websocket';

export interface MCPServerConfig {
  name: string;
  transport: MCPTransportType;
  command?: string;
  args?: string[];
  url?: string;
  env?: Record<string, string>;
}

export interface MCPToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  serverName: string;
}

export interface MCPResource {
  uri: string;
  name: string;
  mimeType?: string;
  serverName: string;
}

export interface MCPConnection {
  name: string;
  transport: MCPTransportType;
  status: 'connected' | 'connecting' | 'disconnected' | 'error';
  tools: MCPToolDefinition[];
  resources: MCPResource[];
  error?: string;
}

// ========== 智能体模板 ==========

export interface AgentTemplate {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  enabledTools?: string[];
  temperature?: number;
  maxTokens?: number;
  icon?: string;
  color?: string;
  isPreset?: boolean;
}

// ========== 辅助函数 ==========

export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

export function createUserMessage(content: string | ContentPart[]): ChatMessage {
  return {
    id: generateId(),
    role: 'user',
    content,
    timestamp: Date.now(),
  };
}

export function createAssistantMessage(
  content: string,
  toolCalls?: ToolCall[],
  reasoning?: string
): ChatMessage {
  return {
    id: generateId(),
    role: 'assistant',
    content,
    toolCalls,
    reasoning,
    timestamp: Date.now(),
  };
}

export function createToolMessage(toolResults: ToolResult[]): ChatMessage {
  return {
    id: generateId(),
    role: 'tool',
    content: '',
    toolResults,
    timestamp: Date.now(),
  };
}

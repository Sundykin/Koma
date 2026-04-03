/**
 * Chat IPC 客户端封装
 * 前端通过 IPC 与 Electron 主进程通信
 */

// 类型定义 (与 electron 端保持一致)
export type MessageRole = 'system' | 'user' | 'assistant' | 'tool';

export interface TextContentPart {
  type: 'text';
  text: string;
}

export interface ImageContentPart {
  type: 'image';
  imageUrl?: string;
  imageBase64?: string;
  mimeType?: string;
}

export interface FileContentPart {
  type: 'file';
  fileName: string;
  fileData: string;
  mimeType: string;
}

export type ContentPart = TextContentPart | ImageContentPart | FileContentPart;

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

export type AgentMode = 'single' | 'orchestrated';

export interface SessionConfig {
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  enabledTools?: string[];
  llmProfileId?: string;
  modelProvider?: 'openai' | 'anthropic' | 'google';
  modelName?: string;
  apiKey?: string;
  baseUrl?: string;
  agentMode?: AgentMode;
  requiredCapabilities?: string[];
}

export interface SessionSummary {
  id: string;
  windowId: number;
  messageCount: number;
  createdAt: number;
  updatedAt: number;
}

export interface SessionDetail {
  id: string;
  windowId: number;
  config: SessionConfig;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
}

export interface ChatInput {
  role: 'user';
  content: string | ContentPart[];
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

export type MCPTransportType = 'stdio' | 'sse' | 'websocket' | 'internal';

export interface MCPServerConfig {
  id: string;
  name: string;
  transport: MCPTransportType;
  command?: string;
  args?: string[];
  url?: string;
  env?: Record<string, string>;
  pluginId?: string;
}

export interface MCPToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  serverName: string;
}

export interface MCPConnection {
  name: string;
  transport: MCPTransportType;
  status: 'connected' | 'connecting' | 'disconnected' | 'error';
  tools: MCPToolDefinition[];
  error?: string;
}

// 检查是否在 Electron 环境
function isElectron(): boolean {
  return typeof window !== 'undefined' && !!(window as any).electronAPI?.chat;
}

// 获取 Electron API
function getElectronAPI() {
  if (!isElectron()) {
    throw new Error('Chat IPC is only available in Electron environment');
  }
  return (window as any).electronAPI.chat;
}

// ========== 无状态 LLM 查询（供 workflow 服务使用） ==========

export interface LLMQueryRequest {
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  config: {
    profileId?: string;
    modelProvider?: 'openai' | 'anthropic' | 'google';
    modelName?: string;
    apiKey?: string;
    baseUrl?: string;
    temperature?: number;
    maxTokens?: number;
  };
  options?: {
    traceId?: string;
    source?: string;
    operation?: string;
  };
}

export interface LLMConnectionTestRequest {
  profileId?: string;
  modelProvider?: 'openai' | 'anthropic' | 'google';
  modelName?: string;
  apiKey?: string;
  baseUrl?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface LLMConnectionTestResponse {
  success: boolean;
  error?: {
    code: 'EMPTY_MESSAGES' | 'TIMEOUT' | 'ABORTED' | 'API_ERROR' | 'UNKNOWN';
    message: string;
  };
}

export interface LLMSaveProfileRequest {
  profileId: string;
  apiKey?: string;
}

export interface SaveLLMChannelConfigTransactionRequest {
  rootPath: string;
  editingChannelId?: string;
  payload: Record<string, unknown>;
  profileApiKey?: string;
  shouldUpdateDefault: boolean;
}

export interface SaveLLMChannelConfigTransactionResponse {
  success: boolean;
  channel?: Record<string, unknown>;
  error?: { message: string };
}

export interface DeleteLLMChannelConfigTransactionRequest {
  rootPath: string;
  channelId: string;
}

export interface MigrateLLMSecretsTransactionRequest {
  rootPath: string;
  settings: Record<string, unknown>;
}

// NOTE: Keep in sync with LLMQueryResponse in electron/service/chat/LLMQueryService.ts
export interface LLMQueryResponse {
  content: string;
  error?: {
    code: 'EMPTY_MESSAGES' | 'TIMEOUT' | 'ABORTED' | 'API_ERROR' | 'UNKNOWN';
    message: string;
  };
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

function getLLMAPI() {
  if (typeof window === 'undefined' || !(window as any).electronAPI?.llm) {
    throw new Error('LLM IPC is only available in Electron environment');
  }
  return (window as any).electronAPI.llm;
}

export function isLLMIPCAvailable(): boolean {
  return typeof window !== 'undefined' && !!(window as any).electronAPI?.llm;
}

export class LLMQueryError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'LLMQueryError';
    this.code = code;
  }
}

export async function llmQuery(request: LLMQueryRequest): Promise<LLMQueryResponse> {
  const api = getLLMAPI();
  const response = await api.query(request);
  if (response.error) {
    throw new LLMQueryError(response.error.code, response.error.message);
  }
  return response;
}

export async function testLLMConnection(
  request: LLMConnectionTestRequest,
): Promise<LLMConnectionTestResponse> {
  const api = getLLMAPI();
  return api.testConnection(request);
}

export async function saveLLMProfile(request: LLMSaveProfileRequest): Promise<void> {
  const api = getLLMAPI();
  const result = await api.saveProfile(request);
  if (!result?.success) {
    throw new Error(result?.error?.message || 'Failed to save LLM profile');
  }
}

export async function deleteLLMProfile(profileId: string): Promise<boolean> {
  const api = getLLMAPI();
  const result = await api.deleteProfile(profileId);
  if (!result?.success) {
    throw new Error(result?.error?.message || 'Failed to delete LLM profile');
  }
  return true;
}


export async function saveLLMChannelConfigTransaction(
  request: SaveLLMChannelConfigTransactionRequest,
): Promise<SaveLLMChannelConfigTransactionResponse> {
  const api = getLLMAPI();
  return api.saveChannelConfig(request);
}

export async function deleteLLMChannelConfigTransaction(
  request: DeleteLLMChannelConfigTransactionRequest,
): Promise<boolean> {
  const api = getLLMAPI();
  const result = await api.deleteChannelConfig(request);
  if (!result?.success) {
    throw new Error(result?.error?.message || 'Failed to delete LLM channel config');
  }
  return true;
}

export async function migrateLLMSecretsTransaction(
  request: MigrateLLMSecretsTransactionRequest,
): Promise<{ settings: Record<string, unknown>; migrated: boolean }> {
  const api = getLLMAPI();
  return api.migrateSettingsSecrets(request);
}

// ========== 会话管理 ==========

export async function createSession(config?: SessionConfig): Promise<SessionSummary> {
  const api = getElectronAPI();
  return api.createSession(config);
}

export async function getSession(sessionId: string): Promise<SessionDetail | null> {
  const api = getElectronAPI();
  return api.getSession(sessionId);
}

export async function disposeSession(sessionId: string): Promise<boolean> {
  const api = getElectronAPI();
  return api.disposeSession(sessionId);
}

export async function listSessions(windowId?: number): Promise<SessionSummary[]> {
  const api = getElectronAPI();
  return api.listSessions(windowId);
}

export async function updateSessionConfig(
  sessionId: string,
  config: Partial<SessionConfig>
): Promise<{ id: string; config: SessionConfig } | null> {
  const api = getElectronAPI();
  return api.updateSessionConfig(sessionId, config);
}

// ========== 消息发送 ==========

export async function sendMessage(
  sessionId: string,
  input: ChatInput,
  options?: { temperature?: number; maxTokens?: number; tools?: string[] }
): Promise<ChatMessage | undefined> {
  const api = getElectronAPI();
  return api.sendMessage(sessionId, input, options);
}

export async function sendMessageStream(
  sessionId: string,
  input: ChatInput,
  options?: { temperature?: number; maxTokens?: number; tools?: string[] }
): Promise<{ accepted: boolean }> {
  const api = getElectronAPI();
  return api.sendMessageStream(sessionId, input, options);
}

export async function cancelStream(requestIdOrSessionId: string): Promise<boolean> {
  const api = getElectronAPI();
  return api.cancelStream(requestIdOrSessionId);
}

// ========== 流式事件监听 ==========

export type StreamEventCallback<T> = (event: any, data: T) => void;
export type UnsubscribeFn = () => void;

export function onStreamChunk(callback: StreamEventCallback<StreamChunkEvent>): UnsubscribeFn {
  const api = getElectronAPI();
  return api.onStreamChunk(callback);
}

export function onStreamTool(callback: StreamEventCallback<StreamToolEvent>): UnsubscribeFn {
  const api = getElectronAPI();
  return api.onStreamTool(callback);
}

export function onStreamDone(callback: StreamEventCallback<StreamDoneEvent>): UnsubscribeFn {
  const api = getElectronAPI();
  return api.onStreamDone(callback);
}

export function onStreamError(callback: StreamEventCallback<StreamErrorEvent>): UnsubscribeFn {
  const api = getElectronAPI();
  return api.onStreamError(callback);
}

// ========== MCP 管理 ==========

export async function connectMCP(config: MCPServerConfig): Promise<MCPConnection> {
  const api = getElectronAPI();
  return api.mcp.connect(config);
}

export async function disconnectMCP(name: string): Promise<{ success: boolean }> {
  const api = getElectronAPI();
  return api.mcp.disconnect(name);
}

export async function listMCPConnections(includeTools?: boolean): Promise<{
  connections: MCPConnection[];
  tools?: MCPToolDefinition[];
}> {
  const api = getElectronAPI();
  return api.mcp.list(includeTools);
}

export async function listMCPTools(): Promise<MCPToolDefinition[]> {
  const api = getElectronAPI();
  return api.mcp.listTools();
}

export async function callMCPTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  const api = getElectronAPI();
  return api.mcp.callTool(name, args);
}

// ========== 统一工具（合并外部 MCP + 插件内部 MCP） ==========

export async function listAllTools(): Promise<MCPToolDefinition[]> {
  const api = getElectronAPI();
  return api.tools.list();
}

export async function callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  const api = getElectronAPI();
  return api.tools.call(name, args);
}

// ========== 辅助工具 ==========

export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

export function createUserInput(content: string | ContentPart[]): ChatInput {
  return { role: 'user', content };
}

// 导出所有
export const chatIPC = {
  isElectron,
  llm: {
    query: llmQuery,
    isAvailable: isLLMIPCAvailable,
  },
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
  mcp: {
    connect: connectMCP,
    disconnect: disconnectMCP,
    list: listMCPConnections,
    listTools: listMCPTools,
    callTool: callMCPTool,
  },
  tools: {
    listAll: listAllTools,
    call: callTool,
  },
  generateId,
  createUserInput,
};

export default chatIPC;

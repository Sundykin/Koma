/**
 * Chat 控制器
 * ee-core 格式：方法名直接映射为 IPC 路由
 * e.g. controller/chat/createSession
 */
import { app, BrowserWindow, IpcMainInvokeEvent } from 'electron';
import { chatService } from '../service/chat';
import { createOrchestrator, AgentOrchestrator } from '../service/chat/AgentOrchestrator';
import { loadSessionMessages, saveSessionMessages, deleteSessionFile } from '../service/chat/chatHistoryPersist';
import { mcpRegistry } from '../service/plugin/registries';
import { capabilityRegistry } from '../service/plugin/capability';
import { importFromFile, importFromObject, exportConfig, exportToFile } from '../service/chat/mcp/MCPConfigLoader';
import type {
  SessionConfig,
  ChatInput,
  ChatOptions,
  MCPServerConfig,
  StreamChunkEvent,
  StreamToolEvent,
  StreamDoneEvent,
  StreamErrorEvent,
} from '../service/chat/types';

class ChatController {
  private initialized = false;
  private orchestrators = new Map<string, AgentOrchestrator>();

  init(): void {
    if (this.initialized) return;
    this.initialized = true;

    app.on('browser-window-created', (_event, window) => {
      window.on('closed', () => {
        chatService.disposeSessionsByWindow(window.id);
      });
    });
  }

  async createSession(args: { config?: SessionConfig }, event?: IpcMainInvokeEvent) {
    const windowId = event ? (BrowserWindow.fromWebContents(event.sender)?.id || 0) : 0;
    const session = chatService.createSession(windowId, args?.config);
    return {
      id: session.id,
      windowId: session.windowId,
      config: session.config,
      messageCount: session.messages.length,
      createdAt: session.createdAt,
    };
  }

  async getSession(args: { sessionId: string }) {
    const session = chatService.getSession(args.sessionId);
    if (!session) return null;
    return {
      id: session.id,
      windowId: session.windowId,
      config: session.config,
      messages: session.messages,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    };
  }

  async disposeSession(args: { sessionId: string }) {
    return chatService.disposeSession(args.sessionId);
  }

  async listSessions(args?: { windowId?: number }, event?: IpcMainInvokeEvent) {
    const windowId = args?.windowId ?? (event ? BrowserWindow.fromWebContents(event.sender)?.id : undefined);
    return chatService.listSessions(windowId);
  }

  async updateSessionConfig(args: { sessionId: string; config: Partial<SessionConfig> }) {
    const session = chatService.updateSessionConfig(args.sessionId, args.config);
    if (!session) return null;
    return { id: session.id, config: session.config };
  }

  async sendMessage(args: { sessionId: string; input: ChatInput; options?: ChatOptions }) {
    return chatService.sendMessage(args.sessionId, args.input, args.options);
  }

  async sendMessageStream(
    args: { sessionId: string; input: ChatInput; options?: ChatOptions },
    event?: IpcMainInvokeEvent
  ) {
    if (!event) throw new Error('IPC event required for stream sending');
    const sender = event.sender;

    (async () => {
      try {
        for await (const chunk of chatService.sendMessageStream(args.sessionId, args.input, args.options)) {
          if (sender.isDestroyed()) break;
          if ('delta' in chunk) {
            sender.send('chat:stream:chunk', chunk as StreamChunkEvent);
          } else if ('toolCall' in chunk) {
            sender.send('chat:stream:tool', chunk as StreamToolEvent);
          } else if ('finishReason' in chunk) {
            sender.send('chat:stream:done', chunk as StreamDoneEvent);
          } else if ('error' in chunk) {
            sender.send('chat:stream:error', chunk as StreamErrorEvent);
          }
        }
      } catch (err: any) {
        if (!sender.isDestroyed()) {
          sender.send('chat:stream:error', {
            requestId: '',
            sessionId: args.sessionId,
            error: { code: 'STREAM_ERROR', message: err.message },
          });
        }
      }
    })();

    return { accepted: true };
  }

  async cancelStream(args: { requestId?: string; sessionId?: string }) {
    const id = args.requestId || args.sessionId;
    if (!id) return false;
    return chatService.cancelRequest(id);
  }

  // MCP methods (kept in chat controller for backward compat)
  async connectMCP(args: { config: MCPServerConfig }) {
    return chatService.connectMCP(args.config);
  }

  async disconnectMCP(args: { name: string }) {
    await chatService.disconnectMCP(args.name);
    return { success: true };
  }

  async listMCP(args?: { includeTools?: boolean }) {
    const connections = chatService.listMCPConnections();
    if (args?.includeTools) {
      return { connections, tools: chatService.listMCPTools() };
    }
    return { connections };
  }

  async callMCPTool(args: { name: string; arguments: Record<string, unknown> }) {
    return chatService.callMCPTool(args.name, args.arguments);
  }

  async listMCPTools() {
    return chatService.listMCPTools();
  }

  async listMCPResources() {
    return chatService.listMCPResources();
  }

  async readMCPResource(args: { uri: string }) {
    return chatService.readMCPResource(args.uri);
  }

  async importMCPConfig(
    args: { filePath?: string; config?: { mcpServers: Record<string, any> } }
  ): Promise<unknown> {
    if (args.filePath) return importFromFile(args.filePath);
    if (args.config) return importFromObject(args.config);
    return { error: 'Either filePath or config is required' };
  }

  async exportMCPConfig(args?: { filePath?: string }): Promise<unknown> {
    if (args?.filePath) {
      await exportToFile(args.filePath);
      return { success: true, filePath: args.filePath };
    }
    return exportConfig();
  }

  // Tools
  async listTools() {
    const externalTools = chatService.listMCPTools();
    const internalTools = mcpRegistry.tools.listDefinitions();
    const toolMap = new Map<string, any>();
    for (const t of internalTools) {
      toolMap.set(t.name, { ...t, source: 'plugin' });
    }
    for (const t of externalTools) {
      if (!toolMap.has(t.name)) {
        toolMap.set(t.name, { ...t, source: 'mcp' });
      }
    }
    return Array.from(toolMap.values());
  }

  async callTool(args: { name: string; arguments: Record<string, unknown> }) {
    const internalTool = mcpRegistry.tools.get(args.name);
    if (internalTool) return internalTool.handler(args.arguments);
    return chatService.callMCPTool(args.name, args.arguments);
  }

  // Capabilities
  async listCapabilities(args?: { type?: string; tags?: string[]; sourceKind?: string }) {
    return capabilityRegistry.list({
      type: args?.type as any,
      tags: args?.tags,
      sourceKind: args?.sourceKind as any,
    });
  }

  async invokeCapability(args: { id: string; arguments: unknown }) {
    return capabilityRegistry.invoke(args.id, args.arguments);
  }

  async resolveCapabilities(args: { requirements: string[] }) {
    return capabilityRegistry.resolve(args.requirements);
  }

  // History
  async loadHistory(args: { sessionId: string }) {
    return loadSessionMessages(args.sessionId);
  }

  async saveHistory(args: {
    id: string;
    title: string;
    messages: any[];
    systemPrompt?: string;
    schemaVersion: number;
    createdAt: number;
    updatedAt: number;
  }) {
    await saveSessionMessages(args);
    return { ok: true };
  }

  async deleteHistory(args: { sessionId: string }) {
    await deleteSessionFile(args.sessionId);
    return { ok: true };
  }

  destroy(): void {
    chatService.destroy();
  }
}

ChatController.toString = () => '[class ChatController]';

export { ChatController };
export default ChatController;

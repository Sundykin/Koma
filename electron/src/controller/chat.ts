/**
 * Chat 控制器
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

function filterContext(ctx: Record<string, unknown>): Record<string, unknown> {
  const safe: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(ctx)) {
    if (k.startsWith('_')) continue;
    try {
      JSON.stringify(v);
      safe[k] = v;
    } catch {}
  }
  return safe;
}

export class ChatController {
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

  async ['session:create'](args: { config?: SessionConfig }, event?: IpcMainInvokeEvent) {
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

  async ['session:get'](args: { sessionId: string }) {
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

  async ['session:dispose'](args: { sessionId: string }) {
    return chatService.disposeSession(args.sessionId);
  }

  async ['session:list'](args?: { windowId?: number }, event?: IpcMainInvokeEvent) {
    const windowId = args?.windowId ?? (event ? BrowserWindow.fromWebContents(event.sender)?.id : undefined);
    return chatService.listSessions(windowId);
  }

  async ['session:updateConfig'](args: { sessionId: string; config: Partial<SessionConfig> }) {
    const session = chatService.updateSessionConfig(args.sessionId, args.config);
    if (!session) return null;
    return {
      id: session.id,
      config: session.config,
    };
  }

  async ['message:send'](args: { sessionId: string; input: ChatInput; options?: ChatOptions }) {
    return chatService.sendMessage(args.sessionId, args.input, args.options);
  }

  async ['message:sendStream'](
    args: { sessionId: string; input: ChatInput; options?: ChatOptions },
    event?: IpcMainInvokeEvent
  ) {
    if (!event) {
      throw new Error('IPC event required for stream sending');
    }

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

  async ['message:cancel'](args: { requestId?: string; sessionId?: string }) {
    const id = args.requestId || args.sessionId;
    if (!id) return false;
    return chatService.cancelRequest(id);
  }

  async ['mcp:connect'](args: { config: MCPServerConfig }) {
    return chatService.connectMCP(args.config);
  }

  async ['mcp:disconnect'](args: { name: string }) {
    await chatService.disconnectMCP(args.name);
    return { success: true };
  }

  async ['mcp:list'](args?: { includeTools?: boolean }) {
    const connections = chatService.listMCPConnections();
    if (args?.includeTools) {
      return {
        connections,
        tools: chatService.listMCPTools(),
      };
    }
    return { connections };
  }

  async ['mcp:callTool'](args: { name: string; arguments: Record<string, unknown> }) {
    return chatService.callMCPTool(args.name, args.arguments);
  }

  async ['mcp:listTools']() {
    return chatService.listMCPTools();
  }

  async ['mcp:listResources']() {
    return chatService.listMCPResources();
  }

  async ['mcp:readResource'](args: { uri: string }) {
    return chatService.readMCPResource(args.uri);
  }

  async ['tools:list']() {
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

  async ['tools:call'](args: { name: string; arguments: Record<string, unknown> }) {
    const internalTool = mcpRegistry.tools.get(args.name);
    if (internalTool) {
      return internalTool.handler(args.arguments);
    }
    return chatService.callMCPTool(args.name, args.arguments);
  }

  async ['agent:list']() {
    const orchestrator = createOrchestrator({});
    return orchestrator.listAvailableWorkers().map((w) => ({
      id: w.id,
      name: w.name,
      description: w.description,
      capabilities: w.capabilities,
      pluginId: w.pluginId,
    }));
  }

  async ['agent:orchestrate'](
    args: {
      sessionId: string;
      message: string;
      config?: { maxIterations?: number; parallelExecution?: boolean };
    },
    event?: IpcMainInvokeEvent
  ) {
    if (!event) {
      throw new Error('IPC event required for agent orchestration');
    }

    const session = chatService.getSession(args.sessionId);
    if (!session) {
      return { error: 'Session not found' };
    }

    const orchestrator = createOrchestrator(session.config, args.config);
    const orchestrateId = `orch_${Date.now()}`;
    this.orchestrators.set(orchestrateId, orchestrator);

    const sender = event.sender;

    (async () => {
      try {
        for await (const ev of orchestrator.orchestrateStream(args.message)) {
          if (sender.isDestroyed()) break;
          sender.send('chat:agent:event', { orchestrateId, ...ev });
        }
      } catch (err: any) {
        if (!sender.isDestroyed()) {
          sender.send('chat:agent:event', {
            orchestrateId,
            type: 'error',
            data: { message: err.message },
          });
        }
      } finally {
        this.orchestrators.delete(orchestrateId);
      }
    })();

    return { orchestrateId, accepted: true };
  }

  async ['agent:cancel'](args: { orchestrateId: string }) {
    const orchestrator = this.orchestrators.get(args.orchestrateId);
    if (orchestrator) {
      orchestrator.cancel();
      this.orchestrators.delete(args.orchestrateId);
      return { success: true };
    }
    return { success: false, error: 'Orchestrator not found' };
  }

  async ['capability:list'](args?: { type?: string; tags?: string[]; sourceKind?: string }) {
    return capabilityRegistry.list({
      type: args?.type as any,
      tags: args?.tags,
      sourceKind: args?.sourceKind as any,
    });
  }

  async ['capability:invoke'](args: { id: string; arguments: unknown }) {
    return capabilityRegistry.invoke(args.id, args.arguments);
  }

  async ['capability:resolve'](args: { requirements: string[] }) {
    return capabilityRegistry.resolve(args.requirements);
  }

  async ['mcp:importConfig'](
    args: { filePath?: string; config?: { mcpServers: Record<string, any> } }
  ): Promise<unknown> {
    if (args.filePath) {
      return importFromFile(args.filePath);
    }
    if (args.config) {
      return importFromObject(args.config);
    }
    return { error: 'Either filePath or config is required' };
  }

  async ['mcp:exportConfig'](args?: { filePath?: string }): Promise<unknown> {
    if (args?.filePath) {
      await exportToFile(args.filePath);
      return { success: true, filePath: args.filePath };
    }
    return exportConfig();
  }

  async ['agent:templates']() {
    const workers = createOrchestrator({}).listAvailableWorkers();
    return workers.map((w) => ({
      id: w.id,
      name: w.name,
      description: w.description,
      capabilities: w.capabilities,
      tools: w.tools,
      systemPrompt: w.systemPrompt,
      pluginId: w.pluginId,
    }));
  }

  async ['history:loadMessages'](args: { sessionId: string }) {
    return loadSessionMessages(args.sessionId);
  }

  async ['history:saveMessages'](args: {
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

  async ['history:deleteMessages'](args: { sessionId: string }) {
    await deleteSessionFile(args.sessionId);
    return { ok: true };
  }

  destroy(): void {
    chatService.destroy();
  }
}

export const chatController = new ChatController();
export default chatController;

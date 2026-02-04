/**
 * Chat 控制器
 * 处理 IPC 通信，转发到 ChatService
 */
import { ipcMain, BrowserWindow } from 'electron';
import { chatService } from '../service/chat';
import { createOrchestrator, AgentOrchestrator } from '../service/chat/AgentOrchestrator';
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

export class ChatController {
  private initialized = false;

  init(): void {
    if (this.initialized) return;
    this.initialized = true;

    // ========== 会话管理 ==========

    ipcMain.handle('chat:session:create', async (event, args: { config?: SessionConfig }) => {
      const windowId = BrowserWindow.fromWebContents(event.sender)?.id || 0;
      console.log('[ChatController] createSession args:', JSON.stringify(args, null, 2));
      console.log('[ChatController] config.apiKey exists:', !!args?.config?.apiKey);
      const session = chatService.createSession(windowId, args?.config);
      return {
        id: session.id,
        windowId: session.windowId,
        config: session.config,
        messageCount: session.messages.length,
        createdAt: session.createdAt,
      };
    });

    ipcMain.handle('chat:session:get', async (event, args: { sessionId: string }) => {
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
    });

    ipcMain.handle('chat:session:dispose', async (event, args: { sessionId: string }) => {
      return chatService.disposeSession(args.sessionId);
    });

    ipcMain.handle('chat:session:list', async (event, args?: { windowId?: number }) => {
      const windowId = args?.windowId ?? BrowserWindow.fromWebContents(event.sender)?.id;
      return chatService.listSessions(windowId);
    });

    ipcMain.handle('chat:session:updateConfig', async (event, args: {
      sessionId: string;
      config: Partial<SessionConfig>;
    }) => {
      console.log('[ChatController] updateConfig sessionId:', args.sessionId);
      console.log('[ChatController] updateConfig config:', args.config);
      console.log('[ChatController] updateConfig apiKey exists:', !!args.config?.apiKey);
      const session = chatService.updateSessionConfig(args.sessionId, args.config);
      if (!session) return null;
      return {
        id: session.id,
        config: session.config,
      };
    });

    // ========== 消息发送 ==========

    ipcMain.handle('chat:message:send', async (event, args: {
      sessionId: string;
      input: ChatInput;
      options?: ChatOptions;
    }) => {
      const message = await chatService.sendMessage(args.sessionId, args.input, args.options);
      return message;
    });

    ipcMain.handle('chat:message:sendStream', async (event, args: {
      sessionId: string;
      input: ChatInput;
      options?: ChatOptions;
    }) => {
      const sender = event.sender;
      const session = chatService.getSession(args.sessionId);
      console.log('[ChatController] sendMessageStream sessionId:', args.sessionId);
      console.log('[ChatController] session config:', session?.config);
      console.log('[ChatController] apiKey exists:', !!session?.config?.apiKey);

      // 异步执行流式发送
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
    });

    ipcMain.handle('chat:message:cancel', async (event, args: { requestId?: string; sessionId?: string }) => {
      const id = args.requestId || args.sessionId;
      if (!id) return false;
      return chatService.cancelRequest(id);
    });

    // ========== MCP 管理 ==========

    ipcMain.handle('chat:mcp:connect', async (event, args: { config: MCPServerConfig }) => {
      return chatService.connectMCP(args.config);
    });

    ipcMain.handle('chat:mcp:disconnect', async (event, args: { name: string }) => {
      await chatService.disconnectMCP(args.name);
      return { success: true };
    });

    ipcMain.handle('chat:mcp:list', async (event, args?: { includeTools?: boolean }) => {
      const connections = chatService.listMCPConnections();
      if (args?.includeTools) {
        return {
          connections,
          tools: chatService.listMCPTools(),
        };
      }
      return { connections };
    });

    ipcMain.handle('chat:mcp:callTool', async (event, args: {
      name: string;
      arguments: Record<string, unknown>;
    }) => {
      return chatService.callMCPTool(args.name, args.arguments);
    });

    ipcMain.handle('chat:mcp:listTools', async () => {
      return chatService.listMCPTools();
    });

    // ========== 工具调用审批 ==========

    ipcMain.handle('chat:tool:approve', async (event, args: { callId: string }) => {
      const success = chatService.approveToolCall(args.callId);
      return { success };
    });

    ipcMain.handle('chat:tool:reject', async (event, args: { callId: string; reason?: string }) => {
      const success = chatService.rejectToolCall(args.callId, args.reason);
      return { success };
    });

    ipcMain.handle('chat:tool:listPending', async (event, args?: { sessionId?: string }) => {
      return chatService.listPendingToolCalls(args?.sessionId);
    });

    // 监听工具调用审批事件，转发到前端
    chatService.on('toolCallPending', (data) => {
      BrowserWindow.getAllWindows().forEach(win => {
        if (!win.isDestroyed()) {
          win.webContents.send('chat:tool:pending', data);
        }
      });
    });

    chatService.on('toolCallApproved', (data) => {
      BrowserWindow.getAllWindows().forEach(win => {
        if (!win.isDestroyed()) {
          win.webContents.send('chat:tool:approved', data);
        }
      });
    });

    chatService.on('toolCallRejected', (data) => {
      BrowserWindow.getAllWindows().forEach(win => {
        if (!win.isDestroyed()) {
          win.webContents.send('chat:tool:rejected', data);
        }
      });
    });

    // ========== 统一工具列表（合并外部 MCP + 插件内部） ==========

    ipcMain.handle('chat:tools:list', async () => {
      const externalTools = chatService.listMCPTools();
      const internalTools = mcpRegistry.tools.listDefinitions();
      console.log('[ChatController] chat:tools:list external:', externalTools.length, externalTools.map(t => t.name));
      console.log('[ChatController] chat:tools:list internal:', internalTools.length, internalTools.map(t => t.name));
      // 去重（按 name），内部优先
      const toolMap = new Map<string, any>();
      for (const t of internalTools) {
        toolMap.set(t.name, { ...t, source: 'plugin' });
      }
      for (const t of externalTools) {
        if (!toolMap.has(t.name)) {
          toolMap.set(t.name, { ...t, source: 'mcp' });
        }
      }
      const result = Array.from(toolMap.values());
      console.log('[ChatController] chat:tools:list total:', result.length);
      return result;
    });

    ipcMain.handle('chat:tools:call', async (event, args: {
      name: string;
      arguments: Record<string, unknown>;
    }) => {
      // 先查内部注册表
      const internalTool = mcpRegistry.tools.get(args.name);
      if (internalTool) {
        return internalTool.handler(args.arguments);
      }
      // 再查外部 MCP
      return chatService.callMCPTool(args.name, args.arguments);
    });

    // ========== Agent 编排 ==========

    // 活跃的编排器
    const orchestrators = new Map<string, AgentOrchestrator>();

    ipcMain.handle('chat:agent:list', async () => {
      const orchestrator = createOrchestrator({});
      return orchestrator.listAvailableWorkers().map(w => ({
        id: w.id,
        name: w.name,
        description: w.description,
        capabilities: w.capabilities,
        pluginId: w.pluginId,
      }));
    });

    ipcMain.handle('chat:agent:orchestrate', async (event, args: {
      sessionId: string;
      message: string;
      config?: { maxIterations?: number; parallelExecution?: boolean };
    }) => {
      const session = chatService.getSession(args.sessionId);
      if (!session) {
        return { error: 'Session not found' };
      }

      const orchestrator = createOrchestrator(session.config, args.config);
      const orchestrateId = `orch_${Date.now()}`;
      orchestrators.set(orchestrateId, orchestrator);

      const sender = event.sender;

      // 异步流式执行
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
          orchestrators.delete(orchestrateId);
        }
      })();

      return { orchestrateId, accepted: true };
    });

    ipcMain.handle('chat:agent:cancel', async (event, args: { orchestrateId: string }) => {
      const orchestrator = orchestrators.get(args.orchestrateId);
      if (orchestrator) {
        orchestrator.cancel();
        orchestrators.delete(args.orchestrateId);
        return { success: true };
      }
      return { success: false, error: 'Orchestrator not found' };
    });

    // ========== Capability 统一能力查询 ==========

    ipcMain.handle('chat:capability:list', async (event, args?: {
      type?: string;
      tags?: string[];
      sourceKind?: string;
    }) => {
      return capabilityRegistry.list({
        type: args?.type as any,
        tags: args?.tags,
        sourceKind: args?.sourceKind as any,
      });
    });

    ipcMain.handle('chat:capability:invoke', async (event, args: {
      id: string;
      arguments: unknown;
    }) => {
      return capabilityRegistry.invoke(args.id, args.arguments);
    });

    ipcMain.handle('chat:capability:resolve', async (event, args: {
      requirements: string[];
    }) => {
      return capabilityRegistry.resolve(args.requirements);
    });

    // ========== MCP 配置导入/导出 ==========

    ipcMain.handle('chat:mcp:importConfig', async (event, args: {
      filePath?: string;
      config?: { mcpServers: Record<string, any> };
    }) => {
      if (args.filePath) {
        return importFromFile(args.filePath);
      }
      if (args.config) {
        return importFromObject(args.config);
      }
      return { error: 'Either filePath or config is required' };
    });

    ipcMain.handle('chat:mcp:exportConfig', async (event, args?: {
      filePath?: string;
    }) => {
      if (args?.filePath) {
        await exportToFile(args.filePath);
        return { success: true, filePath: args.filePath };
      }
      return exportConfig();
    });

    // ========== Agent 模板管理 ==========

    ipcMain.handle('chat:agent:templates', async () => {
      // 从 Agent 注册表构建模板列表
      const workers = createOrchestrator({}).listAvailableWorkers();
      return workers.map(w => ({
        id: w.id,
        name: w.name,
        description: w.description,
        capabilities: w.capabilities,
        tools: w.tools,
        systemPrompt: w.systemPrompt,
        pluginId: w.pluginId,
      }));
    });

    // 窗口关闭时清理会话
    const { app } = require('electron');
    app.on('browser-window-closed', (event: any, window: BrowserWindow) => {
      chatService.disposeSessionsByWindow(window.id);
    });
  }

  destroy(): void {
    chatService.destroy();
  }
}

export const chatController = new ChatController();
export default chatController;

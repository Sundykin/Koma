/**
 * Chat 控制器
 * 处理 IPC 通信，转发到 ChatService
 */
import { ipcMain, BrowserWindow } from 'electron';
import { chatService } from '../service/chat';
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

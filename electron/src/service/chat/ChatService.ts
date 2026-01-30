/**
 * Chat 核心服务
 * 整合 SessionStore, MCPManager, AgentGraph
 */
import { EventEmitter } from 'events';
import { BrowserWindow, ipcMain } from 'electron';
import { HumanMessage, AIMessage, SystemMessage, ToolMessage } from '@langchain/core/messages';
import type { BaseMessage } from '@langchain/core/messages';
import { sessionStore, SessionStore } from './SessionStore';
import { mcpManager, MCPManager } from './mcp';
import { createLLM, createAgentGraph, createToolsFromMCP, streamAgentGraph } from './AgentGraph';
import type {
  Session,
  SessionConfig,
  ChatInput,
  ChatOptions,
  ChatMessage,
  StreamChunkEvent,
  StreamToolEvent,
  StreamDoneEvent,
  StreamErrorEvent,
  MCPServerConfig,
  MCPConnection,
  MCPToolDefinition,
} from './types';
import { generateId as genId, createUserMessage, createAssistantMessage, createToolMessage } from './types';

export class ChatService extends EventEmitter {
  private activeRequests = new Map<string, AbortController>();

  // ========== 会话管理 ==========

  createSession(windowId: number, config?: SessionConfig): Session {
    return sessionStore.create(windowId, config);
  }

  getSession(sessionId: string): Session | undefined {
    return sessionStore.get(sessionId);
  }

  disposeSession(sessionId: string): boolean {
    this.cancelRequest(sessionId);
    return sessionStore.dispose(sessionId);
  }

  disposeSessionsByWindow(windowId: number): number {
    // 取消该窗口所有活跃请求
    for (const [requestId, controller] of this.activeRequests) {
      if (requestId.startsWith(`${windowId}_`)) {
        controller.abort();
        this.activeRequests.delete(requestId);
      }
    }
    return sessionStore.disposeByWindow(windowId);
  }

  updateSessionConfig(sessionId: string, config: Partial<SessionConfig>): Session | undefined {
    return sessionStore.updateConfig(sessionId, config);
  }

  listSessions(windowId?: number) {
    return sessionStore.list(windowId);
  }

  // ========== 消息发送 ==========

  async sendMessage(
    sessionId: string,
    input: ChatInput,
    options?: ChatOptions
  ): Promise<ChatMessage | undefined> {
    const session = sessionStore.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    // 创建用户消息
    const userMessage = createUserMessage(input.content);
    sessionStore.addMessage(sessionId, userMessage);

    // 构建 LangChain 消息
    const humanMsg = this.contentToHumanMessage(input.content);
    session.langchainMessages.push(humanMsg);

    // 创建 LLM 和工具
    const llm = createLLM(session.config);
    const mcpTools = mcpManager.listTools();
    const tools = createToolsFromMCP(mcpTools, session.config.enabledTools);

    // 创建图
    const graph = createAgentGraph(llm, tools, session.config.systemPrompt);

    // 执行
    const result = await graph.invoke({
      messages: session.langchainMessages,
    });

    // 提取结果
    const lastMessage = result.messages[result.messages.length - 1];
    if (lastMessage instanceof AIMessage) {
      const content = typeof lastMessage.content === 'string'
        ? lastMessage.content
        : JSON.stringify(lastMessage.content);

      const assistantMessage = createAssistantMessage(content);
      sessionStore.addMessage(sessionId, assistantMessage);
      session.langchainMessages.push(lastMessage);

      return assistantMessage;
    }

    return undefined;
  }

  async *sendMessageStream(
    sessionId: string,
    input: ChatInput,
    options?: ChatOptions
  ): AsyncGenerator<StreamChunkEvent | StreamToolEvent | StreamDoneEvent | StreamErrorEvent> {
    const session = sessionStore.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    const requestId = genId();

    // 创建取消控制器
    const abortController = new AbortController();
    if (options?.signal) {
      options.signal.addEventListener('abort', () => abortController.abort());
    }
    this.activeRequests.set(requestId, abortController);
    sessionStore.setAbortController(sessionId, abortController);

    try {
      // 创建用户消息
      const userMessage = createUserMessage(input.content);
      sessionStore.addMessage(sessionId, userMessage);

      // 构建 LangChain 消息
      const humanMsg = this.contentToHumanMessage(input.content);
      session.langchainMessages.push(humanMsg);

      // 创建 LLM 和工具
      const llm = createLLM(session.config);
      const mcpTools = mcpManager.listTools();
      const tools = createToolsFromMCP(mcpTools, session.config.enabledTools);

      // 创建图
      const graph = createAgentGraph(llm, tools, session.config.systemPrompt);

      // 流式执行
      let seq = 0;
      let fullContent = '';
      let fullReasoning = '';

      for await (const event of streamAgentGraph(
        graph,
        session.langchainMessages,
        abortController.signal
      )) {
        if (abortController.signal.aborted) {
          break;
        }

        if (event.type === 'chunk') {
          fullContent += event.content || '';
          if (event.reasoning) {
            fullReasoning += event.reasoning;
          }

          yield {
            requestId,
            sessionId,
            delta: event.content || '',
            reasoning: event.reasoning,
            seq: seq++,
          } as StreamChunkEvent;
        }

        if (event.type === 'tool') {
          if (event.toolCall) {
            yield {
              requestId,
              sessionId,
              toolCall: event.toolCall,
            } as StreamToolEvent;
          }
          if (event.toolResult) {
            yield {
              requestId,
              sessionId,
              toolCall: { id: event.toolResult.toolCallId, name: event.toolResult.name, arguments: {} },
              result: event.toolResult.result,
            } as StreamToolEvent;
          }
        }

        if (event.type === 'done') {
          // 保存助手消息
          const assistantMessage = createAssistantMessage(
            fullContent,
            undefined,
            fullReasoning || undefined
          );
          sessionStore.addMessage(sessionId, assistantMessage);
          session.langchainMessages.push(new AIMessage(fullContent));

          yield {
            requestId,
            sessionId,
            finishReason: 'stop',
            message: assistantMessage,
          } as StreamDoneEvent;
        }
      }
    } catch (err: any) {
      if (err.name === 'AbortError' || abortController.signal.aborted) {
        yield {
          requestId,
          sessionId,
          finishReason: 'stop',
        } as StreamDoneEvent;
      } else {
        yield {
          requestId,
          sessionId,
          error: {
            code: err.code || 'UNKNOWN_ERROR',
            message: err.message,
          },
        } as StreamErrorEvent;
      }
    } finally {
      this.activeRequests.delete(requestId);
      sessionStore.clearAbortController(sessionId);
    }
  }

  cancelRequest(requestIdOrSessionId: string): boolean {
    // 尝试作为 requestId
    const controller = this.activeRequests.get(requestIdOrSessionId);
    if (controller) {
      controller.abort();
      this.activeRequests.delete(requestIdOrSessionId);
      return true;
    }

    // 尝试作为 sessionId
    const session = sessionStore.get(requestIdOrSessionId);
    if (session?.abortController) {
      session.abortController.abort();
      sessionStore.clearAbortController(requestIdOrSessionId);
      return true;
    }

    return false;
  }

  // ========== MCP 管理 ==========

  async connectMCP(config: MCPServerConfig): Promise<MCPConnection> {
    return mcpManager.connect(config);
  }

  async disconnectMCP(name: string): Promise<void> {
    return mcpManager.disconnect(name);
  }

  listMCPConnections(): MCPConnection[] {
    return mcpManager.listConnections();
  }

  listMCPTools(): MCPToolDefinition[] {
    return mcpManager.listTools();
  }

  async callMCPTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    return mcpManager.callTool(name, args);
  }

  // ========== 工具方法 ==========

  private contentToHumanMessage(content: string | { type: string; text?: string; imageUrl?: string }[]): HumanMessage {
    if (typeof content === 'string') {
      return new HumanMessage(content);
    }

    // 多内容类型
    const parts: Array<{ type: string; text?: string; image_url?: { url: string } }> = [];
    for (const part of content) {
      if (part.type === 'text' && part.text) {
        parts.push({ type: 'text', text: part.text });
      } else if (part.type === 'image' && part.imageUrl) {
        parts.push({ type: 'image_url', image_url: { url: part.imageUrl } });
      }
    }

    return new HumanMessage({ content: parts });
  }

  // ========== 生命周期 ==========

  destroy(): void {
    // 取消所有活跃请求
    for (const controller of this.activeRequests.values()) {
      controller.abort();
    }
    this.activeRequests.clear();

    // 断开所有 MCP 连接
    mcpManager.disconnectAll();

    // 销毁会话存储
    sessionStore.destroy();
  }
}

export const chatService = new ChatService();
export default chatService;

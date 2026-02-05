/**
 * 对话会话管理器
 */
import type { ChatAdapter } from './adapters/types';
import type {
  ChatMessage,
  ChatOptions,
  ChatResponse,
  ChatChunk,
  SessionOptions,
  ContentPart,
} from './types';
import {
  generateId,
  createUserMessage,
  createAssistantMessage,
  createSystemMessage,
  createToolMessage,
} from './types';
import { PluginManager } from './plugins/PluginManager';
import type { ChatPlugin } from './plugins/types';

export class ChatSession {
  private id: string;
  private messages: ChatMessage[] = [];
  private systemPrompt: string = '';
  private adapter: ChatAdapter;
  private pluginManager: PluginManager;
  private options: SessionOptions;

  constructor(
    adapter: ChatAdapter,
    options: SessionOptions = {},
    plugins: ChatPlugin[] = []
  ) {
    this.id = options.id || generateId();
    this.adapter = adapter;
    this.options = options;
    this.pluginManager = new PluginManager();

    if (options.systemPrompt) {
      this.systemPrompt = options.systemPrompt;
    }

    for (const plugin of plugins) {
      this.pluginManager.register(plugin);
    }
  }

  getId(): string {
    return this.id;
  }

  getMessages(): ChatMessage[] {
    return [...this.messages];
  }

  getSystemPrompt(): string {
    return this.systemPrompt;
  }

  setSystemPrompt(prompt: string): void {
    this.systemPrompt = prompt;
  }

  clearMessages(): void {
    this.messages = [];
  }

  addUserMessage(content: string | ContentPart[]): ChatMessage {
    const message = createUserMessage(content);
    this.messages.push(message);
    return message;
  }

  addAssistantMessage(content: string, toolCalls?: ChatMessage['toolCalls'], reasoning?: string): ChatMessage {
    const message = createAssistantMessage(content, toolCalls, reasoning);
    this.messages.push(message);
    return message;
  }

  addToolResult(toolCallId: string, name: string, result: unknown): ChatMessage {
    const content = typeof result === 'string' ? result : JSON.stringify(result);
    const message = createToolMessage(toolCallId, name, content);
    this.messages.push(message);
    return message;
  }

  getLastMessage(): ChatMessage | undefined {
    return this.messages[this.messages.length - 1];
  }

  /**
   * 发送消息并获取响应
   */
  async send(content: string | ContentPart[], options?: ChatOptions): Promise<ChatMessage> {
    const _userMessage = this.addUserMessage(content);

    const context = {
      session: this,
      messages: this.messages,
      options,
    };

    await this.pluginManager.executeBeforeRequest(context);

    const chatOptions: ChatOptions = {
      ...options,
      tools: this.pluginManager.collectTools(),
    };

    const messagesWithSystem = this.buildMessagesWithSystem();
    const response = await this.adapter.chat(messagesWithSystem, chatOptions);

    const assistantMessage = this.addAssistantMessage(response.content, response.toolCalls, response.reasoning);

    await this.pluginManager.executeAfterResponse(context, response);

    return assistantMessage;
  }

  /**
   * 流式发送消息
   */
  async *sendStream(
    content: string | ContentPart[],
    options?: ChatOptions
  ): AsyncIterable<ChatChunk> {
    const _userMessage = this.addUserMessage(content);

    const context = {
      session: this,
      messages: this.messages,
      options,
    };

    await this.pluginManager.executeBeforeRequest(context);

    const chatOptions: ChatOptions = {
      ...options,
      tools: this.pluginManager.collectTools(),
    };

    const messagesWithSystem = this.buildMessagesWithSystem();
    let fullContent = '';
    let fullReasoning = '';
    let toolCalls: ChatMessage['toolCalls'];

    for await (const chunk of this.adapter.chatStream(messagesWithSystem, chatOptions)) {
      const processedChunk = await this.pluginManager.executeOnStreamChunk(context, chunk);
      fullContent += processedChunk.content;
      fullReasoning += processedChunk.reasoning || '';

      if (processedChunk.toolCalls?.length) {
        toolCalls = processedChunk.toolCalls as ChatMessage['toolCalls'];
      }

      yield processedChunk;
    }

    const assistantMessage = this.addAssistantMessage(fullContent, toolCalls, fullReasoning || undefined);

    if (toolCalls?.length) {
      const response: ChatResponse = {
        id: assistantMessage.id,
        content: fullContent,
        toolCalls,
        finishReason: 'tool_calls',
      };
      await this.pluginManager.executeAfterResponse(context, response);
    }
  }

  /**
   * 流式发送（不添加用户消息，用于乐观更新场景）
   */
  async *sendStreamWithoutUserMessage(
    options?: ChatOptions
  ): AsyncIterable<ChatChunk> {
    const context = {
      session: this,
      messages: this.messages,
      options,
    };

    await this.pluginManager.executeBeforeRequest(context);

    const chatOptions: ChatOptions = {
      ...options,
      tools: this.pluginManager.collectTools(),
    };

    const messagesWithSystem = this.buildMessagesWithSystem();
    let fullContent = '';
    let fullReasoning = '';
    let toolCalls: ChatMessage['toolCalls'];

    for await (const chunk of this.adapter.chatStream(messagesWithSystem, chatOptions)) {
      const processedChunk = await this.pluginManager.executeOnStreamChunk(context, chunk);
      fullContent += processedChunk.content;
      fullReasoning += processedChunk.reasoning || '';

      if (processedChunk.toolCalls?.length) {
        toolCalls = processedChunk.toolCalls as ChatMessage['toolCalls'];
      }

      yield processedChunk;
    }

    const assistantMessage = this.addAssistantMessage(fullContent, toolCalls, fullReasoning || undefined);

    if (toolCalls?.length) {
      const response: ChatResponse = {
        id: assistantMessage.id,
        content: fullContent,
        toolCalls,
        finishReason: 'tool_calls',
      };
      await this.pluginManager.executeAfterResponse(context, response);
    }
  }

  /**
   * 继续对话（处理工具调用后）
   */
  async continueWithToolResults(options?: ChatOptions): Promise<ChatMessage> {
    const context = {
      session: this,
      messages: this.messages,
      options,
    };

    const chatOptions: ChatOptions = {
      ...options,
      tools: this.pluginManager.collectTools(),
    };

    const messagesWithSystem = this.buildMessagesWithSystem();
    const response = await this.adapter.chat(messagesWithSystem, chatOptions);

    const assistantMessage = this.addAssistantMessage(response.content, response.toolCalls, response.reasoning);

    await this.pluginManager.executeAfterResponse(context, response);

    return assistantMessage;
  }

  /**
   * 注册插件
   */
  registerPlugin(plugin: ChatPlugin): void {
    this.pluginManager.register(plugin);
  }

  /**
   * 注销插件
   */
  unregisterPlugin(name: string): void {
    this.pluginManager.unregister(name);
  }

  private buildMessagesWithSystem(): ChatMessage[] {
    const messages: ChatMessage[] = [];

    if (this.systemPrompt) {
      messages.push(createSystemMessage(this.systemPrompt));
    }

    messages.push(...this.messages);

    // 限制历史长度
    if (this.options.maxHistoryLength && messages.length > this.options.maxHistoryLength) {
      const systemMsg = messages[0]?.role === 'system' ? messages[0] : null;
      const historyMessages = systemMsg ? messages.slice(1) : messages;
      const truncated = historyMessages.slice(-this.options.maxHistoryLength);

      if (systemMsg) {
        return [systemMsg, ...truncated];
      }
      return truncated;
    }

    return messages;
  }

  /**
   * 序列化会话
   */
  toJSON(): {
    id: string;
    messages: ChatMessage[];
    systemPrompt: string;
    options: SessionOptions;
  } {
    return {
      id: this.id,
      messages: this.messages,
      systemPrompt: this.systemPrompt,
      options: this.options,
    };
  }

  /**
   * 从序列化数据恢复会话
   */
  static fromJSON(
    data: {
      id: string;
      messages: ChatMessage[];
      systemPrompt: string;
      options: SessionOptions;
    },
    adapter: ChatAdapter,
    plugins: ChatPlugin[] = []
  ): ChatSession {
    const session = new ChatSession(adapter, { ...data.options, id: data.id }, plugins);
    session.systemPrompt = data.systemPrompt;
    session.messages = data.messages;
    return session;
  }
}

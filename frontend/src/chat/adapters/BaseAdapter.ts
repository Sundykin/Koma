/**
 * 基础适配器抽象类
 */
import type { ChatAdapter, AdapterConfig } from './types';
import type {
  ChatMessage,
  ChatOptions,
  ChatResponse,
  ChatChunk,
  AdapterCapability,
  ContentPart,
} from '../types';
import { ChatError, ChatErrorCode } from '../types';

export abstract class BaseAdapter implements ChatAdapter {
  abstract readonly type: string;
  abstract readonly capabilities: AdapterCapability[];

  protected config: AdapterConfig;

  constructor(config: AdapterConfig) {
    this.config = config;
  }

  abstract chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse>;
  abstract chatStream(messages: ChatMessage[], options?: ChatOptions): AsyncIterable<ChatChunk>;

  supports(capability: AdapterCapability): boolean {
    return this.capabilities.includes(capability);
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.chat([{ id: '1', role: 'user', content: 'Hi', timestamp: Date.now() }], {
        maxTokens: 5,
      });
      return true;
    } catch {
      return false;
    }
  }

  // 获取消息文本内容
  protected getTextContent(content: string | ContentPart[]): string {
    if (typeof content === 'string') {
      return content;
    }
    return content
      .filter(part => part.type === 'text')
      .map(part => (part as { type: 'text'; text: string }).text)
      .join('\n');
  }

  // 处理网络错误
  protected handleNetworkError(error: unknown): never {
    if (error instanceof ChatError) {
      throw error;
    }
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        throw new ChatError('请求已取消', ChatErrorCode.ABORTED, error);
      }
      throw new ChatError(`网络错误: ${error.message}`, ChatErrorCode.NETWORK_ERROR, error);
    }
    throw new ChatError('未知错误', ChatErrorCode.UNKNOWN);
  }

  // 解析 SSE 流
  protected async *parseSSEStream(
    response: Response,
    signal?: AbortSignal
  ): AsyncIterable<string> {
    const reader = response.body?.getReader();
    if (!reader) {
      throw new ChatError('无法读取响应流', ChatErrorCode.INVALID_RESPONSE);
    }

    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        if (signal?.aborted) {
          throw new ChatError('请求已取消', ChatErrorCode.ABORTED);
        }

        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('data: ')) {
            const data = trimmed.slice(6);
            if (data === '[DONE]') {
              return;
            }
            yield data;
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
}

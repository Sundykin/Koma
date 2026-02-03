/**
 * Gemini 适配器
 * 使用 @google/genai SDK
 */
import { GoogleGenAI } from '@google/genai';
import { BaseAdapter } from './BaseAdapter';
import type { AdapterConfig } from './types';
import type {
  ChatMessage,
  ChatOptions,
  ChatResponse,
  ChatChunk,
  AdapterCapability,
  ToolDefinition,
} from '../types';
import { ChatError, ChatErrorCode, generateId } from '../types';

export class GeminiAdapter extends BaseAdapter {
  readonly type = 'gemini';
  readonly capabilities: AdapterCapability[] = [
    'streaming',
    'function_call',
    'vision',
    'file_upload',
  ];

  private client: GoogleGenAI;

  constructor(config: AdapterConfig) {
    super({
      ...config,
      model: config.model || 'gemini-2.0-flash',
    });
    this.client = new GoogleGenAI({ apiKey: config.apiKey });
  }

  async chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse> {
    try {
      const { systemInstruction, contents } = this.toGeminiFormat(messages);

      const config: Record<string, unknown> = {};
      if (systemInstruction) {
        config.systemInstruction = systemInstruction;
      }
      if (options?.temperature !== undefined) {
        config.temperature = options.temperature;
      }
      if (options?.maxTokens !== undefined) {
        config.maxOutputTokens = options.maxTokens;
      }
      if (options?.topP !== undefined) {
        config.topP = options.topP;
      }
      if (options?.tools) {
        config.tools = this.toGeminiTools(options.tools);
      }

      const response = await this.client.models.generateContent({
        model: this.config.model,
        contents,
        config: Object.keys(config).length > 0 ? config : undefined,
      });

      const text = response.text || '';
      const functionCalls = response.functionCalls;

      return {
        id: generateId(),
        content: text,
        toolCalls: functionCalls?.map(fc => ({
          id: generateId(),
          name: fc.name || '',
          arguments: (fc.args as Record<string, unknown>) || {},
        })),
        finishReason: functionCalls?.length ? 'tool_calls' : 'stop',
      };
    } catch (error) {
      this.handleGeminiError(error);
    }
  }

  async *chatStream(messages: ChatMessage[], options?: ChatOptions): AsyncIterable<ChatChunk> {
    try {
      const { systemInstruction, contents } = this.toGeminiFormat(messages);

      const config: Record<string, unknown> = {};
      if (systemInstruction) {
        config.systemInstruction = systemInstruction;
      }
      if (options?.temperature !== undefined) {
        config.temperature = options.temperature;
      }
      if (options?.maxTokens !== undefined) {
        config.maxOutputTokens = options.maxTokens;
      }
      if (options?.tools) {
        config.tools = this.toGeminiTools(options.tools);
      }

      const response = await this.client.models.generateContentStream({
        model: this.config.model,
        contents,
        config: Object.keys(config).length > 0 ? config : undefined,
      });

      const chunkId = generateId();
      let fullText = '';
      let lastChunk: any = null;

      for await (const chunk of response) {
        if (options?.signal?.aborted) {
          throw new ChatError('请求已取消', ChatErrorCode.ABORTED);
        }

        const text = chunk.text || '';
        fullText += text;
        lastChunk = chunk;

        yield {
          id: chunkId,
          content: text,
        };
      }

      // 检查最终响应是否有工具调用
      const functionCalls = lastChunk?.functionCalls;

      yield {
        id: chunkId,
        content: '',
        finishReason: functionCalls?.length ? 'tool_calls' : 'stop',
        toolCalls: functionCalls?.map((fc: any) => ({
          id: generateId(),
          name: fc.name || '',
          arguments: (fc.args as Record<string, unknown>) || {},
        })),
      };
    } catch (error) {
      this.handleGeminiError(error);
    }
  }

  private toGeminiFormat(messages: ChatMessage[]): {
    systemInstruction?: string;
    contents: Array<{ role: string; parts: Array<{ text: string }> }>;
  } {
    let systemInstruction: string | undefined;
    const contents: Array<{ role: string; parts: Array<{ text: string }> }> = [];

    for (const msg of messages) {
      if (msg.role === 'system') {
        systemInstruction = this.getTextContent(msg.content);
        continue;
      }

      const role = msg.role === 'assistant' ? 'model' : 'user';
      const text = this.getTextContent(msg.content);

      // 合并连续的相同角色消息
      const lastContent = contents[contents.length - 1];
      if (lastContent && lastContent.role === role) {
        lastContent.parts.push({ text });
      } else {
        contents.push({ role, parts: [{ text }] });
      }
    }

    return { systemInstruction, contents };
  }

  private toGeminiTools(tools: ToolDefinition[]): any[] {
    return [{
      functionDeclarations: tools.map(tool => ({
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      })),
    }];
  }

  private handleGeminiError(error: unknown): never {
    if (error instanceof ChatError) {
      throw error;
    }

    const errorMessage = error instanceof Error ? error.message : '未知错误';

    if (errorMessage.includes('API key') || errorMessage.includes('API_KEY')) {
      throw new ChatError(errorMessage, ChatErrorCode.AUTH_ERROR, error as Error);
    }
    if (errorMessage.includes('quota') || errorMessage.includes('rate') || errorMessage.includes('RATE')) {
      throw new ChatError(errorMessage, ChatErrorCode.RATE_LIMIT, error as Error);
    }
    if (errorMessage.includes('context') || errorMessage.includes('token') || errorMessage.includes('length')) {
      throw new ChatError(errorMessage, ChatErrorCode.CONTEXT_LENGTH_EXCEEDED, error as Error);
    }

    throw new ChatError(errorMessage, ChatErrorCode.NETWORK_ERROR, error as Error);
  }
}

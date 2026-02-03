/**
 * OpenAI 适配器
 * 支持 OpenAI API 和兼容 API（DeepSeek、通义等）
 */
import { BaseAdapter } from './BaseAdapter';
import type { AdapterConfig } from './types';
import type {
  ChatMessage,
  ChatOptions,
  ChatResponse,
  ChatChunk,
  AdapterCapability,
  ToolCall,
  ToolDefinition,
  ContentPart,
} from '../types';
import { ChatError, ChatErrorCode, generateId } from '../types';

// OpenAI 消息格式
interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | OpenAIContentPart[] | null;
  tool_calls?: OpenAIToolCall[];
  tool_call_id?: string;
  name?: string;
}

interface OpenAIContentPart {
  type: 'text' | 'image_url';
  text?: string;
  image_url?: { url: string; detail?: 'auto' | 'low' | 'high' };
}

interface OpenAIToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

interface OpenAITool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

// 流式工具调用累积器（内部使用）
interface StreamingToolCall extends Partial<ToolCall> {
  _argsStr: string;  // 累积的 arguments 字符串
}

// OpenAI 响应消息（包含 reasoning_content 扩展）
interface OpenAIResponseMessage {
  role: string;
  content: string | null;
  tool_calls?: OpenAIToolCall[];
  reasoning_content?: string;  // DeepSeek 等模型的思考过程
}

export class OpenAIAdapter extends BaseAdapter {
  readonly type = 'openai';
  readonly capabilities: AdapterCapability[] = [
    'streaming',
    'function_call',
    'vision',
    'structured_output',
  ];

  constructor(config: AdapterConfig) {
    super({
      ...config,
      baseUrl: config.baseUrl || 'https://api.openai.com/v1',
    });
  }

  async chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse> {
    try {
      const response = await fetch(`${this.config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(this.buildRequestBody(messages, options, false)),
        signal: options?.signal,
      });

      if (!response.ok) {
        await this.handleErrorResponse(response);
      }

      const data = await response.json();
      return this.parseResponse(data);
    } catch (error) {
      this.handleNetworkError(error);
    }
  }

  async *chatStream(messages: ChatMessage[], options?: ChatOptions): AsyncIterable<ChatChunk> {
    try {
      const response = await fetch(`${this.config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(this.buildRequestBody(messages, options, true)),
        signal: options?.signal,
      });

      if (!response.ok) {
        await this.handleErrorResponse(response);
      }

      const chunkId = generateId();
      const toolCalls: Map<number, StreamingToolCall> = new Map();

      for await (const data of this.parseSSEStream(response, options?.signal)) {
        try {
          const parsed = JSON.parse(data);
          const choice = parsed.choices?.[0];
          if (!choice) continue;

          const delta = choice.delta;
          // 处理 reasoning_content（DeepSeek 等模型）
          const reasoning = delta?.reasoning_content || delta?.reasoning;
          const chunk: ChatChunk = {
            id: chunkId,
            content: delta?.content || '',
            reasoning: reasoning || undefined,
            finishReason: choice.finish_reason ? this.mapChunkFinishReason(choice.finish_reason) : undefined,
          };

          // 处理工具调用增量
          if (delta?.tool_calls) {
            for (const tc of delta.tool_calls) {
              const index = tc.index ?? 0;
              let existing = toolCalls.get(index);
              if (!existing) {
                existing = { id: tc.id, name: tc.function?.name, arguments: {}, _argsStr: '' };
                toolCalls.set(index, existing);
              }
              if (tc.function?.name) {
                existing.name = tc.function.name;
              }
              if (tc.function?.arguments) {
                // 累积 arguments 字符串
                existing._argsStr += tc.function.arguments;
              }
            }
            chunk.toolCalls = Array.from(toolCalls.values()).map(tc => ({
              id: tc.id,
              name: tc.name,
              arguments: tc.arguments,
            }));
          }

          yield chunk;

          if (choice.finish_reason) {
            // 最终解析工具调用参数
            if (toolCalls.size > 0) {
              const finalToolCalls: ToolCall[] = [];
              for (const tc of toolCalls.values()) {
                try {
                  const argsStr = tc._argsStr || '{}';
                  finalToolCalls.push({
                    id: tc.id || generateId(),
                    name: tc.name || '',
                    arguments: JSON.parse(argsStr),
                  });
                } catch {
                  // ignore parse error
                }
              }
              if (finalToolCalls.length > 0) {
                yield {
                  id: chunkId,
                  content: '',
                  toolCalls: finalToolCalls,
                  finishReason: 'tool_calls',
                };
              }
            }
            break;
          }
        } catch {
          // 忽略解析错误
        }
      }
    } catch (error) {
      this.handleNetworkError(error);
    }
  }

  private getHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.config.apiKey}`,
    };
  }

  private buildRequestBody(
    messages: ChatMessage[],
    options?: ChatOptions,
    stream?: boolean
  ): Record<string, unknown> {
    const body: Record<string, unknown> = {
      model: this.config.model,
      messages: this.toOpenAIMessages(messages),
      stream,
    };

    if (options?.temperature !== undefined) {
      body.temperature = options.temperature;
    } else if (this.config.defaultTemperature !== undefined) {
      body.temperature = this.config.defaultTemperature;
    }

    if (options?.maxTokens !== undefined) {
      body.max_tokens = options.maxTokens;
    } else if (this.config.defaultMaxTokens !== undefined) {
      body.max_tokens = this.config.defaultMaxTokens;
    }

    if (options?.topP !== undefined) {
      body.top_p = options.topP;
    }

    if (options?.tools?.length) {
      body.tools = this.toOpenAITools(options.tools);
    }

    if (options?.responseFormat) {
      body.response_format = options.responseFormat;
    }

    return body;
  }

  private toOpenAIMessages(messages: ChatMessage[]): OpenAIMessage[] {
    return messages.map(msg => {
      const openAIMsg: OpenAIMessage = {
        role: msg.role,
        content: this.toOpenAIContent(msg.content),
      };

      if (msg.toolCalls?.length) {
        openAIMsg.tool_calls = msg.toolCalls.map(tc => ({
          id: tc.id,
          type: 'function' as const,
          function: {
            name: tc.name,
            arguments: JSON.stringify(tc.arguments),
          },
        }));
      }

      if (msg.toolCallId) {
        openAIMsg.tool_call_id = msg.toolCallId;
      }

      if (msg.name) {
        openAIMsg.name = msg.name;
      }

      return openAIMsg;
    });
  }

  private toOpenAIContent(content: string | ContentPart[]): string | OpenAIContentPart[] | null {
    if (typeof content === 'string') {
      return content;
    }

    if (content.length === 0) {
      return null;
    }

    // 检查是否只有文本
    const hasNonText = content.some(part => part.type !== 'text');
    if (!hasNonText) {
      return content
        .filter(part => part.type === 'text')
        .map(part => (part as { type: 'text'; text: string }).text)
        .join('\n');
    }

    // 多模态内容
    return content.map(part => {
      if (part.type === 'text') {
        return { type: 'text' as const, text: part.text };
      }
      if (part.type === 'image') {
        const url = part.imageUrl || `data:${part.mimeType || 'image/png'};base64,${part.imageBase64}`;
        return { type: 'image_url' as const, image_url: { url } };
      }
      // 文件转为文本描述
      return { type: 'text' as const, text: `[文件: ${part.fileName}]` };
    });
  }

  private toOpenAITools(tools: ToolDefinition[]): OpenAITool[] {
    return tools.map(tool => ({
      type: 'function' as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    }));
  }

  private parseResponse(data: any): ChatResponse {
    const choice = data.choices?.[0];
    if (!choice) {
      throw new ChatError('无效的响应格式', ChatErrorCode.INVALID_RESPONSE);
    }

    const message: OpenAIResponseMessage = choice.message;
    const toolCalls = message.tool_calls?.map((tc: OpenAIToolCall) => ({
      id: tc.id,
      name: tc.function.name,
      arguments: JSON.parse(tc.function.arguments || '{}'),
    }));
    // 处理 reasoning_content（DeepSeek 等模型）
    const reasoning = message.reasoning_content;

    return {
      id: data.id || generateId(),
      content: message.content || '',
      reasoning: reasoning || undefined,
      toolCalls,
      finishReason: this.mapFinishReason(choice.finish_reason),
      usage: data.usage ? {
        promptTokens: data.usage.prompt_tokens,
        completionTokens: data.usage.completion_tokens,
        totalTokens: data.usage.total_tokens,
      } : undefined,
    };
  }

  private mapFinishReason(reason: string | null): ChatResponse['finishReason'] {
    switch (reason) {
      case 'stop':
        return 'stop';
      case 'tool_calls':
        return 'tool_calls';
      case 'length':
        return 'length';
      default:
        return 'stop';
    }
  }

  private mapChunkFinishReason(reason: string | null): ChatChunk['finishReason'] {
    switch (reason) {
      case 'stop':
        return 'stop';
      case 'tool_calls':
        return 'tool_calls';
      case 'length':
        return 'length';
      default:
        return undefined;
    }
  }

  private async handleErrorResponse(response: Response): Promise<never> {
    let errorData: any;
    try {
      errorData = await response.json();
    } catch {
      throw new ChatError(`HTTP ${response.status}`, ChatErrorCode.NETWORK_ERROR);
    }

    const errorMessage = errorData.error?.message || '未知错误';
    const errorCode = errorData.error?.code;

    if (response.status === 401) {
      throw new ChatError(errorMessage, ChatErrorCode.AUTH_ERROR);
    }
    if (response.status === 429) {
      throw new ChatError(errorMessage, ChatErrorCode.RATE_LIMIT);
    }
    if (errorCode === 'context_length_exceeded') {
      throw new ChatError(errorMessage, ChatErrorCode.CONTEXT_LENGTH_EXCEEDED);
    }

    throw new ChatError(errorMessage, ChatErrorCode.NETWORK_ERROR);
  }
}

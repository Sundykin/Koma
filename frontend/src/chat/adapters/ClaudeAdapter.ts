/**
 * Claude 适配器
 * 使用 Anthropic Messages API
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
} from '../types';
import { ChatError, ChatErrorCode, generateId } from '../types';

// Claude 消息格式
interface ClaudeMessage {
  role: 'user' | 'assistant';
  content: string | ClaudeContentBlock[];
}

interface ClaudeContentBlock {
  type: 'text' | 'image' | 'tool_use' | 'tool_result';
  text?: string;
  source?: {
    type: 'base64';
    media_type: string;
    data: string;
  };
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  content?: string;
}

interface ClaudeTool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export class ClaudeAdapter extends BaseAdapter {
  readonly type = 'claude';
  readonly capabilities: AdapterCapability[] = [
    'streaming',
    'function_call',
    'vision',
  ];

  constructor(config: AdapterConfig) {
    super({
      ...config,
      baseUrl: config.baseUrl || 'https://api.anthropic.com',
      model: config.model || 'claude-sonnet-4-20250514',
    });
  }

  async chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse> {
    try {
      const { system, claudeMessages } = this.toClaudeFormat(messages);

      const response = await fetch(`${this.config.baseUrl}/v1/messages`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(this.buildRequestBody(system, claudeMessages, options, false)),
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
      const { system, claudeMessages } = this.toClaudeFormat(messages);

      const response = await fetch(`${this.config.baseUrl}/v1/messages`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(this.buildRequestBody(system, claudeMessages, options, true)),
        signal: options?.signal,
      });

      if (!response.ok) {
        await this.handleErrorResponse(response);
      }

      const chunkId = generateId();
      let currentToolUse: Partial<ToolCall> | null = null;
      let toolUseInputJson = '';
      // <think> 标签解析状态
      const thinkState = { inThink: false, buffer: '' };

      for await (const data of this.parseSSEStream(response, options?.signal)) {
        try {
          const event = JSON.parse(data);

          switch (event.type) {
            case 'content_block_start':
              if (event.content_block?.type === 'tool_use') {
                currentToolUse = {
                  id: event.content_block.id,
                  name: event.content_block.name,
                };
                toolUseInputJson = '';
              }
              break;

            case 'content_block_delta':
              if (event.delta?.type === 'text_delta') {
                // 解析 <think> 标签
                const { content, reasoning } = consumeThink(event.delta.text || '', thinkState);
                if (content || reasoning) {
                  yield {
                    id: chunkId,
                    content,
                    reasoning: reasoning || undefined,
                  };
                }
              } else if (event.delta?.type === 'input_json_delta') {
                toolUseInputJson += event.delta.partial_json || '';
              }
              break;

            case 'content_block_stop':
              if (currentToolUse) {
                try {
                  currentToolUse.arguments = JSON.parse(toolUseInputJson || '{}');
                } catch {
                  currentToolUse.arguments = {};
                }
                yield {
                  id: chunkId,
                  content: '',
                  toolCalls: [currentToolUse as ToolCall],
                };
                currentToolUse = null;
                toolUseInputJson = '';
              }
              break;

            case 'message_stop':
              // 刷新 think 缓冲区
              const flushed = flushThink(thinkState);
              if (flushed.content || flushed.reasoning) {
                yield {
                  id: chunkId,
                  content: flushed.content,
                  reasoning: flushed.reasoning || undefined,
                };
              }
              yield {
                id: chunkId,
                content: '',
                finishReason: 'stop',
              };
              break;

            case 'message_delta':
              if (event.delta?.stop_reason === 'tool_use') {
                yield {
                  id: chunkId,
                  content: '',
                  finishReason: 'tool_calls',
                };
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
      'x-api-key': this.config.apiKey,
      'anthropic-version': '2023-06-01',
    };
  }

  private buildRequestBody(
    system: string | undefined,
    messages: ClaudeMessage[],
    options?: ChatOptions,
    stream?: boolean
  ): Record<string, unknown> {
    const body: Record<string, unknown> = {
      model: this.config.model,
      messages,
      stream,
    };

    if (system) {
      body.system = system;
    }

    if (options?.maxTokens !== undefined) {
      body.max_tokens = options.maxTokens;
    } else if (this.config.defaultMaxTokens !== undefined) {
      body.max_tokens = this.config.defaultMaxTokens;
    } else {
      body.max_tokens = 4096; // Claude 需要指定 max_tokens
    }

    if (options?.temperature !== undefined) {
      body.temperature = options.temperature;
    } else if (this.config.defaultTemperature !== undefined) {
      body.temperature = this.config.defaultTemperature;
    }

    if (options?.topP !== undefined) {
      body.top_p = options.topP;
    }

    if (options?.tools?.length) {
      body.tools = this.toClaudeTools(options.tools);
    }

    return body;
  }

  private toClaudeFormat(messages: ChatMessage[]): {
    system?: string;
    claudeMessages: ClaudeMessage[];
  } {
    let system: string | undefined;
    const claudeMessages: ClaudeMessage[] = [];

    for (const msg of messages) {
      if (msg.role === 'system') {
        system = this.getTextContent(msg.content);
        continue;
      }

      if (msg.role === 'tool') {
        // 工具结果需要作为 user 消息
        const lastMsg = claudeMessages[claudeMessages.length - 1];
        const toolResult: ClaudeContentBlock = {
          type: 'tool_result',
          tool_use_id: msg.toolCallId,
          content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
        };

        if (lastMsg?.role === 'user') {
          if (typeof lastMsg.content === 'string') {
            lastMsg.content = [{ type: 'text', text: lastMsg.content }, toolResult];
          } else {
            lastMsg.content.push(toolResult);
          }
        } else {
          claudeMessages.push({
            role: 'user',
            content: [toolResult],
          });
        }
        continue;
      }

      const role = msg.role === 'assistant' ? 'assistant' : 'user';
      const content = this.toClaudeContent(msg);

      // 合并连续的相同角色消息
      const lastMsg = claudeMessages[claudeMessages.length - 1];
      if (lastMsg?.role === role) {
        if (typeof lastMsg.content === 'string') {
          if (typeof content === 'string') {
            lastMsg.content = lastMsg.content + '\n' + content;
          } else {
            lastMsg.content = [{ type: 'text', text: lastMsg.content }, ...content];
          }
        } else {
          if (typeof content === 'string') {
            lastMsg.content.push({ type: 'text', text: content });
          } else {
            lastMsg.content.push(...content);
          }
        }
      } else {
        claudeMessages.push({ role, content });
      }
    }

    return { system, claudeMessages };
  }

  private toClaudeContent(msg: ChatMessage): string | ClaudeContentBlock[] {
    const blocks: ClaudeContentBlock[] = [];

    if (typeof msg.content === 'string') {
      if (msg.content) {
        blocks.push({ type: 'text', text: msg.content });
      }
    } else {
      for (const part of msg.content) {
        if (part.type === 'text') {
          blocks.push({ type: 'text', text: part.text });
        } else if (part.type === 'image') {
          blocks.push({
            type: 'image',
            source: {
              type: 'base64',
              media_type: part.mimeType || 'image/png',
              data: part.imageBase64 || '',
            },
          });
        }
      }
    }

    // 处理工具调用
    if (msg.toolCalls?.length) {
      for (const tc of msg.toolCalls) {
        blocks.push({
          type: 'tool_use',
          id: tc.id,
          name: tc.name,
          input: tc.arguments,
        });
      }
    }

    if (blocks.length === 1 && blocks[0].type === 'text') {
      return blocks[0].text || '';
    }

    return blocks;
  }

  private toClaudeTools(tools: ToolDefinition[]): ClaudeTool[] {
    return tools.map(tool => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.parameters,
    }));
  }

  private parseResponse(data: any): ChatResponse {
    const content = data.content || [];
    let textContent = '';
    const toolCalls: ToolCall[] = [];

    for (const block of content) {
      if (block.type === 'text') {
        textContent += block.text;
      } else if (block.type === 'tool_use') {
        toolCalls.push({
          id: block.id,
          name: block.name,
          arguments: block.input || {},
        });
      }
    }

    // 解析 <think> 标签
    const parsed = parseThinkText(textContent);

    return {
      id: data.id || generateId(),
      content: parsed.content,
      reasoning: parsed.reasoning || undefined,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      finishReason: data.stop_reason === 'tool_use' ? 'tool_calls' : 'stop',
      usage: data.usage ? {
        promptTokens: data.usage.input_tokens,
        completionTokens: data.usage.output_tokens,
        totalTokens: (data.usage.input_tokens || 0) + (data.usage.output_tokens || 0),
      } : undefined,
    };
  }

  private async handleErrorResponse(response: Response): Promise<never> {
    let errorData: any;
    try {
      errorData = await response.json();
    } catch {
      throw new ChatError(`HTTP ${response.status}`, ChatErrorCode.NETWORK_ERROR);
    }

    const errorMessage = errorData.error?.message || '未知错误';
    const errorType = errorData.error?.type;

    if (response.status === 401 || errorType === 'authentication_error') {
      throw new ChatError(errorMessage, ChatErrorCode.AUTH_ERROR);
    }
    if (response.status === 429 || errorType === 'rate_limit_error') {
      throw new ChatError(errorMessage, ChatErrorCode.RATE_LIMIT);
    }
    if (errorType === 'invalid_request_error' && errorMessage.includes('token')) {
      throw new ChatError(errorMessage, ChatErrorCode.CONTEXT_LENGTH_EXCEEDED);
    }

    throw new ChatError(errorMessage, ChatErrorCode.NETWORK_ERROR);
  }
}

// <think> 标签解析
const THINK_OPEN_TAG = '<think>';
const THINK_CLOSE_TAG = '</think>';

interface ThinkState {
  inThink: boolean;
  buffer: string;
}

function consumeThink(text: string, state: ThinkState): { content: string; reasoning: string } {
  const combined = state.buffer + text;
  state.buffer = '';
  let content = '';
  let reasoning = '';
  let index = 0;

  while (index < combined.length) {
    if (combined.startsWith(THINK_OPEN_TAG, index)) {
      state.inThink = true;
      index += THINK_OPEN_TAG.length;
      continue;
    }
    if (combined.startsWith(THINK_CLOSE_TAG, index)) {
      state.inThink = false;
      index += THINK_CLOSE_TAG.length;
      continue;
    }

    // 检查是否可能是不完整的标签
    if (combined[index] === '<') {
      const remaining = combined.slice(index);
      if (THINK_OPEN_TAG.startsWith(remaining) || THINK_CLOSE_TAG.startsWith(remaining)) {
        state.buffer = remaining;
        break;
      }
    }

    if (state.inThink) {
      reasoning += combined[index];
    } else {
      content += combined[index];
    }
    index += 1;
  }

  return { content, reasoning };
}

function flushThink(state: ThinkState): { content: string; reasoning: string } {
  if (!state.buffer) return { content: '', reasoning: '' };
  const text = state.buffer;
  state.buffer = '';
  return state.inThink ? { content: '', reasoning: text } : { content: text, reasoning: '' };
}

function parseThinkText(text: string): { content: string; reasoning: string } {
  const state: ThinkState = { inThink: false, buffer: '' };
  const initial = consumeThink(text, state);
  const flushed = flushThink(state);
  return {
    content: initial.content + flushed.content,
    reasoning: initial.reasoning + flushed.reasoning,
  };
}

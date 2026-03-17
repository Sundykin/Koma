/**
 * Claude LLM Provider
 * 支持 Anthropic Claude API
 */
import type { ModelConfig } from '../../types';
import type { LLMProvider, ChatMessage, LLMCallOptions } from './types';
import { createLogger } from '../../store/logger';
import { buildAITraceHeaders } from '../../utils/aiTrace';
import { safeFetch } from '../../utils/safeFetch';

interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface AnthropicResponse {
  content: Array<{ type: string; text: string }>;
  model: string;
  stop_reason: string;
}

const logger = createLogger('ClaudeProvider');

export class ClaudeProvider implements LLMProvider {
  type = 'claude';
  config: ModelConfig;

  constructor(config: ModelConfig) {
    this.config = config;
  }

  validate(): boolean {
    return !!this.config.apiKey && this.config.apiKey.length > 0;
  }

  private get baseUrl(): string {
    return this.config.baseUrl || 'https://api.anthropic.com';
  }

  private get modelName(): string {
    return this.config.modelName || 'claude-sonnet-4-20250514';
  }

  async testConnection(): Promise<boolean> {
    try {
      const response = await safeFetch(`${this.baseUrl}/v1/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.config.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: this.modelName,
          max_tokens: 10,
          messages: [{ role: 'user', content: 'Hello' }],
        }),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async generateText(prompt: string, systemPrompt?: string, options?: LLMCallOptions): Promise<string> {
    const traceId = options?.traceId;
    logger.info('发起 Claude generateText 请求', {
      traceId,
      url: `${this.baseUrl}/v1/messages`,
      model: this.modelName,
      source: options?.source,
      operation: options?.operation,
      transport: 'safeFetch',
    });

    const response = await safeFetch(`${this.baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.config.apiKey,
        'anthropic-version': '2023-06-01',
        ...buildAITraceHeaders(options),
      },
      body: JSON.stringify({
        model: this.modelName,
        max_tokens: 4096,
        system: systemPrompt,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    logger.info('收到 Claude generateText 响应', {
      traceId,
      status: response.status,
      ok: response.ok,
    });

    if (!response.ok) {
      const error = await response.text();
      logger.error('Claude generateText 失败', {
        traceId,
        status: response.status,
        error,
      });
      throw new Error(`Claude API 请求失败: ${error}`);
    }

    const data: AnthropicResponse = await response.json();
    const textContent = data.content.find(c => c.type === 'text');
    logger.info('Claude generateText 解析完成', {
      traceId,
      contentLength: textContent?.text?.length || 0,
    });
    return textContent?.text || '';
  }

  async chat(messages: ChatMessage[], options?: LLMCallOptions): Promise<string> {
    // 提取 system prompt
    const systemMessage = messages.find(m => m.role === 'system');
    const systemPrompt = systemMessage?.content;
    const traceId = options?.traceId;

    // 转换消息格式（排除 system）
    const anthropicMessages: AnthropicMessage[] = messages
      .filter(m => m.role !== 'system')
      .map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }));

    logger.info('发起 Claude chat 请求', {
      traceId,
      url: `${this.baseUrl}/v1/messages`,
      model: this.modelName,
      messageCount: anthropicMessages.length,
      source: options?.source,
      operation: options?.operation,
      transport: 'safeFetch',
    });

    const response = await safeFetch(`${this.baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.config.apiKey,
        'anthropic-version': '2023-06-01',
        ...buildAITraceHeaders(options),
      },
      body: JSON.stringify({
        model: this.modelName,
        max_tokens: 4096,
        system: systemPrompt,
        messages: anthropicMessages,
      }),
    });

    logger.info('收到 Claude chat 响应', {
      traceId,
      status: response.status,
      ok: response.ok,
    });

    if (!response.ok) {
      const error = await response.text();
      logger.error('Claude chat 失败', {
        traceId,
        status: response.status,
        error,
      });
      throw new Error(`Claude API 请求失败: ${error}`);
    }

    const data: AnthropicResponse = await response.json();
    const textContent = data.content.find(c => c.type === 'text');
    logger.info('Claude chat 解析完成', {
      traceId,
      contentLength: textContent?.text?.length || 0,
    });
    return textContent?.text || '';
  }
}

export default ClaudeProvider;

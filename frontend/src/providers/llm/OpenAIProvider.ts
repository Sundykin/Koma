/**
 * OpenAI LLM Provider
 */
import type { ModelConfig } from '../../types';
import type { LLMProvider, ChatMessage, LLMCallOptions } from './types';
import { createLogger } from '../../store/logger';
import { buildAITraceHeaders } from '../../utils/aiTrace';
import { safeFetch } from '../../utils/safeFetch';
import { summarizeHTTPErrorDetail } from '../../utils/aiError';

const logger = createLogger('OpenAIProvider');

export class OpenAIProvider implements LLMProvider {
  type = 'openai';
  config: ModelConfig;

  constructor(config: ModelConfig) {
    this.config = config;
  }

  validate(): boolean {
    return !!this.config.apiKey && this.config.apiKey.length > 0;
  }

  async testConnection(): Promise<boolean> {
    try {
      const response = await safeFetch(
        `${this.config.baseUrl || 'https://api.openai.com/v1'}/models`,
        {
          headers: {
            Authorization: `Bearer ${this.config.apiKey}`,
          },
        }
      );
      return response.ok;
    } catch {
      return false;
    }
  }

  private async request(
    messages: { role: string; content: string }[],
    options?: LLMCallOptions
  ): Promise<string> {
    const baseUrl = this.config.baseUrl || 'https://api.openai.com/v1';
    const url = `${baseUrl}/chat/completions`;
    const traceId = options?.traceId;
    const model = this.config.modelName || 'gpt-4';
    const useStream = options?.stream ?? false;

    logger.info('发起 OpenAI Chat 请求', {
      traceId,
      url,
      model,
      messageCount: messages.length,
      source: options?.source,
      operation: options?.operation,
      transport: 'safeFetch',
    });

    let response: Response;
    try {
      response = await safeFetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.apiKey}`,
          ...buildAITraceHeaders(options),
        },
        body: JSON.stringify({
          model,
          messages,
          stream: useStream,
        }),
      });
    } catch (err) {
      logger.error('OpenAI Chat 请求异常', {
        traceId,
        url,
        error: err instanceof Error ? err.message : String(err),
      });
      throw new Error(
        `无法连接 API (${baseUrl}): ${err instanceof Error ? err.message : String(err)}`
      );
    }

    logger.info('收到 OpenAI Chat 响应', {
      traceId,
      status: response.status,
      ok: response.ok,
    });

    if (!response.ok) {
      let detail = '';
      try { detail = await response.text(); } catch { /* ignore */ }
      const summarizedDetail = summarizeHTTPErrorDetail(response.status, detail);
      logger.error('OpenAI Chat 响应失败', {
        traceId,
        status: response.status,
        detail: summarizedDetail,
      });
      const hint = response.status === 401 ? '，请检查 API Key'
        : response.status === 429 ? '，请求过于频繁'
        : response.status === 404 ? '，请检查模型名称或 API 地址'
        : '';
      throw new Error(`API 请求失败 (${response.status}${hint}): ${summarizedDetail}`);
    }

    const responseText = await response.text();
    const content = useStream
      ? this.parseSSE(responseText)
      : this.parseJSONCompletion(responseText);
    if (!content) {
      logger.error('OpenAI Chat 返回空内容', { traceId });
      throw new Error('API 返回内容为空，请检查模型配置');
    }
    logger.info('OpenAI Chat 解析完成', {
      traceId,
      contentLength: content.length,
    });
    return content;
  }

  private parseSSE(text: string): string {
    let content = '';
    for (const line of text.split('\n')) {
      if (line.startsWith('data: ') && line !== 'data: [DONE]') {
        try {
          const chunk = JSON.parse(line.slice(6));
          const delta = chunk.choices?.[0]?.delta?.content;
          if (delta) content += delta;
        } catch { /* skip malformed lines */ }
      }
    }
    return content;
  }

  private parseJSONCompletion(text: string): string {
    try {
      const parsed = JSON.parse(text);
      const content = parsed?.choices?.[0]?.message?.content;
      if (typeof content === 'string') {
        return content;
      }
      if (Array.isArray(content)) {
        return content.map((item: any) => item?.text || '').join('');
      }
      return '';
    } catch {
      return '';
    }
  }

  async generateText(prompt: string, systemPrompt?: string, options?: LLMCallOptions): Promise<string> {
    const messages: { role: string; content: string }[] = [];
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }
    messages.push({ role: 'user', content: prompt });
    return this.request(messages, options);
  }

  async chat(messages: ChatMessage[], options?: LLMCallOptions): Promise<string> {
    return this.request(messages, options);
  }
}

export default OpenAIProvider;

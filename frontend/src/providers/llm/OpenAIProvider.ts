/**
 * OpenAI LLM Provider
 */
import type { ModelConfig } from '../../types';
import type { LLMProvider, ChatMessage } from './types';
import { safeFetch } from '../../utils/safeFetch';

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

  private async request(messages: { role: string; content: string }[]): Promise<string> {
    const baseUrl = this.config.baseUrl || 'https://api.openai.com/v1';
    const url = `${baseUrl}/chat/completions`;

    let response: Response;
    try {
      response = await safeFetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify({
          model: this.config.modelName || 'gpt-4',
          messages,
        }),
      });
    } catch (err) {
      throw new Error(
        `无法连接 API (${baseUrl}): ${err instanceof Error ? err.message : String(err)}`
      );
    }

    if (!response.ok) {
      let detail = '';
      try { detail = await response.text(); } catch { /* ignore */ }
      const hint = response.status === 401 ? '，请检查 API Key'
        : response.status === 429 ? '，请求过于频繁'
        : response.status === 404 ? '，请检查模型名称或 API 地址'
        : '';
      throw new Error(`API 请求失败 (${response.status}${hint}): ${detail}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error('API 返回内容为空，请检查模型配置');
    }
    return content;
  }

  async generateText(prompt: string, systemPrompt?: string): Promise<string> {
    const messages: { role: string; content: string }[] = [];
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }
    messages.push({ role: 'user', content: prompt });
    return this.request(messages);
  }

  async chat(messages: ChatMessage[]): Promise<string> {
    return this.request(messages);
  }
}

export default OpenAIProvider;

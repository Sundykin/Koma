/**
 * Claude LLM Provider
 * 支持 Anthropic Claude API
 */
import type { ModelConfig } from '../../types';
import type { LLMProvider, ChatMessage } from './types';

interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface AnthropicResponse {
  content: Array<{ type: string; text: string }>;
  model: string;
  stop_reason: string;
}

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
      const response = await fetch(`${this.baseUrl}/v1/messages`, {
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

  async generateText(prompt: string, systemPrompt?: string): Promise<string> {
    const response = await fetch(`${this.baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.config.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.modelName,
        max_tokens: 4096,
        system: systemPrompt,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Claude API error: ${error}`);
    }

    const data: AnthropicResponse = await response.json();
    const textContent = data.content.find(c => c.type === 'text');
    return textContent?.text || '';
  }

  async chat(messages: ChatMessage[]): Promise<string> {
    // 提取 system prompt
    const systemMessage = messages.find(m => m.role === 'system');
    const systemPrompt = systemMessage?.content;

    // 转换消息格式（排除 system）
    const anthropicMessages: AnthropicMessage[] = messages
      .filter(m => m.role !== 'system')
      .map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }));

    const response = await fetch(`${this.baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.config.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.modelName,
        max_tokens: 4096,
        system: systemPrompt,
        messages: anthropicMessages,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Claude API error: ${error}`);
    }

    const data: AnthropicResponse = await response.json();
    const textContent = data.content.find(c => c.type === 'text');
    return textContent?.text || '';
  }
}

export default ClaudeProvider;

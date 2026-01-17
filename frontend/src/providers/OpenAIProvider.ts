/**
 * OpenAI LLM Provider
 */
import type { ModelConfig, ScriptAnalysisResult } from '../types';
import type { LLMProvider } from './types';

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
      const response = await fetch(
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

  async generateText(prompt: string, systemPrompt?: string): Promise<string> {
    const messages: { role: string; content: string }[] = [];

    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }
    messages.push({ role: 'user', content: prompt });

    const response = await fetch(
      `${this.config.baseUrl || 'https://api.openai.com/v1'}/chat/completions`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify({
          model: this.config.modelName || 'gpt-4',
          messages,
        }),
      }
    );

    const data = await response.json();
    return data.choices?.[0]?.message?.content || '';
  }
}

export default OpenAIProvider;

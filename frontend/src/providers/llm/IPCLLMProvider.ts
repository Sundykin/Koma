/**
 * IPC LLM Provider
 * 通过 Electron IPC 调用主进程的 LLMQueryService，替代前端直连 LLM API
 */
import type { ModelConfig } from '../../types';
import type { LLMProvider, ChatMessage, LLMCallOptions } from './types';
import { llmQuery, isLLMIPCAvailable } from '../../chat/ipc/chatIPC';

export { isLLMIPCAvailable };

export class IPCLLMProvider implements LLMProvider {
  type = 'ipc';
  config: ModelConfig;

  constructor(config: ModelConfig) {
    this.config = config;
  }

  validate(): boolean {
    return Boolean(
      this.config.apiKey &&
      this.config.apiKey.length > 0 &&
      String(this.config.modelName || '').trim()
    );
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.generateText('Hi', undefined, { source: 'testConnection' });
      return true;
    } catch {
      return false;
    }
  }

  async generateText(prompt: string, systemPrompt?: string, options?: LLMCallOptions): Promise<string> {
    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [];
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }
    messages.push({ role: 'user', content: prompt });

    const response = await llmQuery({
      messages,
      config: this.buildConfig(),
      options: {
        traceId: options?.traceId,
        source: options?.source,
        operation: options?.operation || 'generateText',
      },
    });
    return response.content;
  }

  async chat(messages: ChatMessage[], options?: LLMCallOptions): Promise<string> {
    const response = await llmQuery({
      messages: messages.map(m => ({
        role: m.role as 'system' | 'user' | 'assistant',
        content: m.content,
      })),
      config: this.buildConfig(),
      options: {
        traceId: options?.traceId,
        source: options?.source,
        operation: options?.operation || 'chat',
      },
    });
    return response.content;
  }

  private buildConfig() {
    return {
      modelProvider: this.mapProvider(this.config.provider),
      modelName: String(this.config.modelName || '').trim(),
      apiKey: this.config.apiKey,
      baseUrl: this.config.baseUrl,
      temperature: this.config.temperature,
      maxTokens: this.config.maxTokens,
    };
  }

  private mapProvider(provider: string): 'openai' | 'anthropic' | 'google' {
    if (provider === 'claude') return 'anthropic';
    if (provider === 'gemini') return 'google';
    if (provider === 'openai') return 'openai';
    if (provider === 'openai-compatible') return 'openai';
    throw new Error(`Unknown LLM provider: "${provider}"`);
  }
}

/**
 * IPC LLM Provider
 * 通过 Electron IPC 调用主进程的 LLMQueryService，替代前端直连 LLM API
 */
import type { ModelConfig } from '../../types';
import type { LLMProvider, ChatMessage, LLMCallOptions } from './types';
import { llmQuery, llmQueryStream, isLLMIPCAvailable, testLLMConnection } from '../../chat/ipc/chatIPC';

export { isLLMIPCAvailable };

export class IPCLLMProvider implements LLMProvider {
  type = 'ipc';
  config: ModelConfig;

  constructor(config: ModelConfig) {
    this.config = config;
  }

  validate(): boolean {
    return Boolean(
      ((this.config.profileId && this.config.profileId.length > 0)
        || (this.config.apiKey && this.config.apiKey.length > 0)) &&
      String(this.config.modelName || '').trim()
    );
  }

  async testConnection(): Promise<boolean> {
    const result = await testLLMConnection({
      modelProvider: this.mapProvider(this.config.provider),
      profileId: this.config.profileId,
      modelName: String(this.config.modelName || '').trim(),
      apiKey: this.config.apiKey,
      baseUrl: this.config.baseUrl,
      temperature: this.config.temperature,
      maxTokens: this.config.maxTokens,
    });
    return result.success;
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
        disableChunking: options?.disableChunking,
        timeoutMs: options?.timeoutMs,
        responseFormat: options?.responseFormat,
      },
    });
    return response.content;
  }

  /**
   * 流式文本生成 — 无应用层超时，适用于长文本精炼等重量级任务。
   * 通过 onChunk 回调实时推送生成内容。
   */
  async generateTextStream(
    prompt: string,
    systemPrompt?: string,
    options?: LLMCallOptions,
    onChunk?: (delta: string, accumulated: string) => void,
  ): Promise<string> {
    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [];
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }
    messages.push({ role: 'user', content: prompt });

    const response = await llmQueryStream(
      {
        messages,
        config: this.buildConfig(),
        options: {
          traceId: options?.traceId,
          source: options?.source,
          operation: options?.operation || 'generateTextStream',
          disableChunking: options?.disableChunking,
          timeoutMs: options?.timeoutMs,
          responseFormat: options?.responseFormat,
        },
      },
      onChunk,
    );
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
        disableChunking: options?.disableChunking,
        timeoutMs: options?.timeoutMs,
        responseFormat: options?.responseFormat,
      },
    });
    return response.content;
  }

  private buildConfig() {
    return {
      profileId: this.config.profileId,
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

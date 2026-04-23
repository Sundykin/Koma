/**
 * 模型 Provider 类型定义
 */
import type { ModelConfig } from '../types';
export type { TTIProvider, TTIOptions, ImageResult } from './tti/types';
export type { ITVProvider, ITVRequest, ITVResult } from './itv/types';
export type { TTSProvider, TTSRequest } from './tts/types';

// ========== LLM Provider ==========

export interface LLMProvider {
  type: string;
  config: ModelConfig;

  validate(): boolean;
  testConnection(): Promise<boolean>;
  generateText(
    prompt: string,
    systemPrompt?: string,
    options?: {
      traceId?: string;
      source?: string;
      operation?: string;
      projectId?: string;
      targetId?: string;
      targetName?: string;
      stream?: boolean;
      onChunk?: (delta: string, accumulated: string) => void;
    }
  ): Promise<string>;
  chat?(
    messages: { role: string; content: string }[],
    options?: {
      traceId?: string;
      source?: string;
      operation?: string;
      projectId?: string;
      targetId?: string;
      targetName?: string;
      stream?: boolean;
      onChunk?: (delta: string, accumulated: string) => void;
    }
  ): Promise<string>;
}

// ========== Provider 注册表 ==========

export type ProviderFactory<T> = (config: any) => T;

export interface ProviderRegistry<T> {
  register(type: string, factory: ProviderFactory<T>): void;
  get(type: string): ProviderFactory<T> | undefined;
  list(): string[];
}

export function createProviderRegistry<T>(): ProviderRegistry<T> {
  const factories = new Map<string, ProviderFactory<T>>();

  return {
    register(type: string, factory: ProviderFactory<T>) {
      factories.set(type, factory);
    },
    get(type: string) {
      return factories.get(type);
    },
    list() {
      return Array.from(factories.keys());
    },
  };
}

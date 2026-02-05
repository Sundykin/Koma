/**
 * 模型 Provider 类型定义
 */
import type {
  ModelConfig,
  TTSConfig,
  ITVConfig,
  TTSOptions,
  ITVOptions,
  AudioResult,
  VideoResult,
  Voice,
  ProgressInfo,
} from '../types';

// ========== LLM Provider ==========

export interface LLMProvider {
  type: string;
  config: ModelConfig;

  validate(): boolean;
  testConnection(): Promise<boolean>;
  generateText(prompt: string, systemPrompt?: string): Promise<string>;
  chat?(messages: { role: string; content: string }[]): Promise<string>;
}

// ========== TTI Provider ==========

export interface TTIProvider {
  type: string;
  config: ModelConfig;

  validate(): boolean;
  testConnection(): Promise<boolean>;
  generateImage(prompt: string, options?: TTIOptions): Promise<ImageResult>;
}

export interface TTIOptions {
  width?: number;
  height?: number;
  negativePrompt?: string;
  seed?: number;
  steps?: number;
  cfg?: number;
}

export interface ImageResult {
  path: string;
  width: number;
  height: number;
  seed?: number;
}

// ========== TTS Provider ==========

export interface TTSProvider {
  type: string;
  config: TTSConfig;

  validate(): boolean;
  testConnection(): Promise<boolean>;
  synthesize(
    text: string,
    voiceId: string,
    options?: TTSOptions
  ): Promise<AudioResult>;
  listVoices(): Promise<Voice[]>;
  getVoices(): Promise<Voice[]>;  // alias for listVoices
}

// ========== ITV Provider ==========

export interface ITVProvider {
  type: string;
  config: ITVConfig;

  validate(): boolean;
  testConnection(): Promise<boolean>;
  generate(
    imagePath: string,
    prompt: string,
    options?: ITVOptions
  ): Promise<VideoResult | string>; // 返回 VideoResult 或 taskId
  submitTask?(imagePath: string, options?: ITVOptions): Promise<string>;  // 提交异步任务
  getProgress?(taskId: string): Promise<ProgressInfo>;  // 获取进度
  checkProgress?(taskId: string): Promise<ProgressInfo>;
  cancelTask?(taskId: string): Promise<void>;
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

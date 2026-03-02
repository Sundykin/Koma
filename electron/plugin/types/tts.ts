/**
 * TTS Provider 类型定义
 */

import type {
  BaseProvider,
  ProviderCapabilities,
  GenerationInput,
  GenerationOutput,
  TaskSubmitResult,
  TaskStatus,
  TaskResult,
} from './provider-base';

/** TTS 输入 */
export interface TTSInput extends GenerationInput {
  prompt: string;
  voiceId: string;
  options?: TTSOptions;
}

/** TTS 选项 */
export interface TTSOptions extends Record<string, unknown> {
  speed?: number;
  pitch?: number;
  volume?: number;
  format?: 'mp3' | 'wav' | 'ogg' | 'flac';
  sampleRate?: 16000 | 22050 | 44100 | 48000;
  emotion?: string;
  style?: string;
}

/** 音色 */
export interface Voice {
  id: string;
  name: string;
  language: string;
  languageCode?: string;
  gender?: 'male' | 'female' | 'neutral';
  previewUrl?: string;
  emotions?: string[];
  styles?: string[];
  cloneable?: boolean;
}

/** TTS 能力扩展 */
export interface TTSCapabilities extends ProviderCapabilities {
  features?: (
    | 'emotion'
    | 'style'
    | 'ssml'
    | 'voice-clone'
    | 'multilingual'
  )[];
}

/**
 * TTS Provider 接口
 */
export interface TTSProvider extends BaseProvider {
  synthesize?(input: TTSInput): Promise<GenerationOutput>;
  synthesizeAsync?(input: TTSInput): Promise<TaskSubmitResult>;
  synthesizeStream?(input: TTSInput): AsyncIterable<Uint8Array>;
  listVoices(): Promise<Voice[]>;
  getTaskStatus?(taskId: string): Promise<TaskStatus>;
  getTaskResult?(taskId: string): Promise<TaskResult<GenerationOutput>>;
  getCapabilities(): TTSCapabilities;
}

/** TTS Provider 工厂函数 */
export type TTSProviderFactory = (
  config: Record<string, unknown>,
  context: { pluginId: string; instanceId: string }
) => TTSProvider;

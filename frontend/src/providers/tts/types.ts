/**
 * TTS Provider 类型定义
 */
import type { TTSConfig, TTSOptions, AudioResult, Voice, TTSProviderType } from '../../types';

export interface TTSProvider {
  type: TTSProviderType;
  config: TTSConfig;

  validate(): boolean;
  testConnection(): Promise<boolean>;
  synthesize(
    text: string,
    voiceId: string,
    options?: TTSOptions
  ): Promise<AudioResult>;
  listVoices(): Promise<Voice[]>;
}

export { TTSConfig, TTSOptions, AudioResult, Voice };

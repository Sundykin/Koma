/**
 * OpenAI TTS Provider
 */
import type { TTSConfig, TTSOptions, AudioResult, Voice } from '../../types';
import type { TTSProvider } from './types';

const OPENAI_VOICES: Voice[] = [
  { id: 'alloy', name: 'Alloy', language: 'multi', gender: 'neutral', provider: 'openai-tts' },
  { id: 'echo', name: 'Echo', language: 'multi', gender: 'male', provider: 'openai-tts' },
  { id: 'fable', name: 'Fable', language: 'multi', gender: 'female', provider: 'openai-tts' },
  { id: 'onyx', name: 'Onyx', language: 'multi', gender: 'male', provider: 'openai-tts' },
  { id: 'nova', name: 'Nova', language: 'multi', gender: 'female', provider: 'openai-tts' },
  { id: 'shimmer', name: 'Shimmer', language: 'multi', gender: 'female', provider: 'openai-tts' },
];

export class OpenAITTSProvider implements TTSProvider {
  type: 'openai-tts' = 'openai-tts';
  config: TTSConfig;

  constructor(config: TTSConfig) {
    this.config = config;
  }

  validate(): boolean {
    return !!this.config.apiKey;
  }

  async testConnection(): Promise<boolean> {
    // 简单验证 API Key 格式
    return this.validate();
  }

  async synthesize(
    text: string,
    voiceId: string,
    options?: TTSOptions
  ): Promise<AudioResult> {
    if (!this.config.apiKey) {
      throw new Error('OpenAI API Key is required');
    }

    const response = await fetch(
      `${this.config.baseUrl || 'https://api.openai.com/v1'}/audio/speech`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify({
          model: 'tts-1',
          input: text,
          voice: voiceId,
          speed: options?.rate || 1.0,
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`OpenAI TTS failed: ${response.statusText}`);
    }

    // TODO: 需要保存到文件并返回路径
    // 这里返回 Blob URL 作为临时方案
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);

    return {
      path: url,
      duration: 0, // 需要解析音频获取时长
      sampleRate: 24000,
    };
  }

  async listVoices(): Promise<Voice[]> {
    return OPENAI_VOICES;
  }
}

export default OpenAITTSProvider;

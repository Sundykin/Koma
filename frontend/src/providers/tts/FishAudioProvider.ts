/**
 * Fish Audio TTS Provider
 * https://fish.audio/
 */
import type { TTSConfig, TTSOptions, AudioResult, Voice } from '../../types';
import type { TTSProvider } from './types';

export class FishAudioProvider implements TTSProvider {
  type = 'fish-audio' as const;
  config: TTSConfig;

  constructor(config: TTSConfig) {
    this.config = config;
  }

  validate(): boolean {
    return !!this.config.apiKey;
  }

  async testConnection(): Promise<boolean> {
    if (!this.validate()) return false;

    try {
      const response = await fetch(`${this.getBaseUrl()}/model`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
        },
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  private getBaseUrl(): string {
    return this.config.baseUrl || 'https://api.fish.audio/v1';
  }

  async synthesize(
    text: string,
    voiceId: string,
    options?: TTSOptions
  ): Promise<AudioResult> {
    if (!this.validate()) {
      throw new Error('Fish Audio API Key 未配置');
    }

    const response = await fetch(`${this.getBaseUrl()}/tts`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text,
        reference_id: voiceId,
        format: 'mp3',
        latency: 'normal',
        streaming: false,
        ...(options?.rate && { speed: options.rate }),
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Fish Audio 合成失败: ${error}`);
    }

    const audioBlob = await response.blob();
    const audioUrl = URL.createObjectURL(audioBlob);

    // 估算时长 (实际需要解析音频)
    const estimatedDuration = text.length * 0.15;

    return {
      path: audioUrl,
      duration: estimatedDuration,
      format: 'mp3',
    };
  }

  async listVoices(): Promise<Voice[]> {
    if (!this.validate()) {
      return [];
    }

    try {
      const response = await fetch(`${this.getBaseUrl()}/model`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
        },
      });

      if (!response.ok) {
        return this.getDefaultVoices();
      }

      const data = await response.json();
      return (data.items || []).map((item: any) => ({
        id: item._id,
        name: item.title || item.name || item._id,
        language: item.languages?.[0] || 'zh',
        gender: item.gender || 'unknown',
        provider: 'fish-audio' as const,
        previewUrl: item.cover_image,
      }));
    } catch {
      return this.getDefaultVoices();
    }
  }

  private getDefaultVoices(): Voice[] {
    return [
      { id: 'default', name: '默认音色', language: 'zh', gender: 'female', provider: 'fish-audio' },
    ];
  }
}

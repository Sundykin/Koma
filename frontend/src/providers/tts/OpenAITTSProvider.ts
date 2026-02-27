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

    // 通过 Electron IPC 保存到项目目录
    const blob = await response.blob();
    const arrayBuffer = await blob.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const base64Data = btoa(binary);

    const electronAPI = (window as any).electronAPI;
    if (electronAPI?.fs) {
      // 保存到临时目录
      const tempDir = await electronAPI.app.getPath('temp');
      const fileName = `tts_${Date.now()}_${voiceId}.mp3`;
      const filePath = `${tempDir}/koma-tts/${fileName}`;
      await electronAPI.fs.mkdir(`${tempDir}/koma-tts`);
      await electronAPI.fs.writeFile(filePath, base64Data, true);

      return {
        path: filePath,
        duration: 0, // 需要解析音频获取时长
        sampleRate: 24000,
      };
    }

    // 非 Electron 环境回退到 Blob URL
    const url = URL.createObjectURL(blob);
    return {
      path: url,
      duration: 0,
      sampleRate: 24000,
    };
  }

  async listVoices(): Promise<Voice[]> {
    return OPENAI_VOICES;
  }
}

export default OpenAITTSProvider;

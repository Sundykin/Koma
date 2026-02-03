/**
 * Edge TTS Provider (免费)
 * 使用 Microsoft Edge 的 TTS 服务
 */
import type { TTSConfig, TTSOptions, AudioResult, Voice } from '../../types';
import type { TTSProvider } from './types';

// Edge TTS 中文音色列表
const EDGE_VOICES: Voice[] = [
  {
    id: 'zh-CN-XiaoxiaoNeural',
    name: '晓晓 (女声)',
    language: 'zh-CN',
    gender: 'female',
    provider: 'edge-tts',
  },
  {
    id: 'zh-CN-YunxiNeural',
    name: '云希 (男声)',
    language: 'zh-CN',
    gender: 'male',
    provider: 'edge-tts',
  },
  {
    id: 'zh-CN-YunjianNeural',
    name: '云健 (男声)',
    language: 'zh-CN',
    gender: 'male',
    provider: 'edge-tts',
  },
  {
    id: 'zh-CN-XiaoyiNeural',
    name: '晓伊 (女声)',
    language: 'zh-CN',
    gender: 'female',
    provider: 'edge-tts',
  },
  {
    id: 'zh-CN-YunyangNeural',
    name: '云扬 (男声-新闻)',
    language: 'zh-CN',
    gender: 'male',
    provider: 'edge-tts',
  },
  {
    id: 'zh-CN-XiaochenNeural',
    name: '晓辰 (女声)',
    language: 'zh-CN',
    gender: 'female',
    provider: 'edge-tts',
  },
];

export class EdgeTTSProvider implements TTSProvider {
  type: 'edge-tts' = 'edge-tts';
  config: TTSConfig;

  constructor(config: TTSConfig) {
    this.config = config;
  }

  validate(): boolean {
    // Edge TTS 不需要 API Key
    return true;
  }

  async testConnection(): Promise<boolean> {
    // Edge TTS 通常可用
    return true;
  }

  async synthesize(
    text: string,
    voiceId: string,
    options?: TTSOptions
  ): Promise<AudioResult> {
    // TODO: 实现 Edge TTS 调用
    // 需要使用 edge-tts 库或 WebSocket API
    // 参考: https://github.com/rany2/edge-tts

    throw new Error(
      'Edge TTS synthesis not implemented. Requires edge-tts package or native WebSocket implementation.'
    );
  }

  async listVoices(): Promise<Voice[]> {
    return EDGE_VOICES;
  }
}

export default EdgeTTSProvider;

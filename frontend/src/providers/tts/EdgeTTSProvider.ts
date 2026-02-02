/**
 * Edge TTS Provider (??)
 * ?? Microsoft Edge ? TTS ?? (CLI ??)
 */
import { spawn } from 'child_process';
import type { TTSConfig, TTSOptions, AudioResult, Voice } from '../../types';
import type { TTSProvider } from './types';

// Edge TTS ??????
const EDGE_VOICES: Voice[] = [
  {
    id: 'zh-CN-XiaoxiaoNeural',
    name: '?? (??)',
    language: 'zh-CN',
    gender: 'female',
    provider: 'edge-tts',
  },
  {
    id: 'zh-CN-YunxiNeural',
    name: '?? (??)',
    language: 'zh-CN',
    gender: 'male',
    provider: 'edge-tts',
  },
  {
    id: 'zh-CN-YunjianNeural',
    name: '?? (??)',
    language: 'zh-CN',
    gender: 'male',
    provider: 'edge-tts',
  },
  {
    id: 'zh-CN-XiaoyiNeural',
    name: '?? (??)',
    language: 'zh-CN',
    gender: 'female',
    provider: 'edge-tts',
  },
  {
    id: 'zh-CN-YunyangNeural',
    name: '?? (??-??)',
    language: 'zh-CN',
    gender: 'male',
    provider: 'edge-tts',
  },
  {
    id: 'zh-CN-XiaochenNeural',
    name: '?? (??)',
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
    return true; // Edge TTS ????? API Key
  }

  async testConnection(): Promise<boolean> {
    return true;
  }

  /**
   * ???? (?? TTSProvider ??)
   */
  async synthesize(
    text: string,
    voiceId: string,
    options?: TTSOptions
  ): Promise<AudioResult> {
    return this.generateSpeech(text, { ...options, voice: voiceId });
  }

  /**
   * ?? edge-tts CLI ????
   */
  async generateSpeech(text: string, options?: TTSOptions & { voice?: string }): Promise<AudioResult> {
    const voice = options?.voice || 'zh-CN-XiaoxiaoNeural';
    // ?? /tmp ????????
    const outputPath = `/tmp/tts_${Date.now()}.mp3`;
    
    return new Promise((resolve, reject) => {
      // ????
      const args = ['--voice', voice, '--text', text, '--write-media', outputPath];
      
      // ???????
      if (options?.rate) {
        const rateStr = options.rate >= 1 
          ? `+${Math.round((options.rate - 1) * 100)}%` 
          : `-${Math.round((1 - options.rate) * 100)}%`;
        args.push('--rate', rateStr);
      }
      
      if (options?.pitch) {
        const pitchStr = options.pitch >= 1 
          ? `+${Math.round((options.pitch - 1) * 100)}%` 
          : `-${Math.round((1 - options.pitch) * 100)}%`;
        args.push('--pitch', pitchStr);
      }

      const proc = spawn('edge-tts', args);

      proc.on('close', (code) => {
        if (code === 0) {
          resolve({ 
            path: outputPath, 
            duration: 0,
            format: 'mp3'
          });
        } else {
          reject(new Error(`Edge TTS failed with code ${code}`));
        }
      });

      proc.on('error', (err) => {
        reject(new Error(`Failed to start Edge TTS: ${err.message}`));
      });
    });
  }

  async listVoices(): Promise<Voice[]> {
    return EDGE_VOICES;
  }
}

export default EdgeTTSProvider;

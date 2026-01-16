/**
 * TTS Provider 模块导出
 */
export * from './types';
export { EdgeTTSProvider } from './EdgeTTSProvider';
export { OpenAITTSProvider } from './OpenAITTSProvider';
export { FishAudioProvider } from './FishAudioProvider';
export { GPTSoVITSProvider } from './GPTSoVITSProvider';
export { TTSService, ttsService } from './TTSService';
export type { DialogueSegment, SynthesizedDialogue } from './TTSService';

import type { TTSConfig } from '../../types';
import type { TTSProvider } from './types';
import { EdgeTTSProvider } from './EdgeTTSProvider';
import { OpenAITTSProvider } from './OpenAITTSProvider';
import { FishAudioProvider } from './FishAudioProvider';
import { GPTSoVITSProvider } from './GPTSoVITSProvider';

export function createTTSProvider(config: TTSConfig): TTSProvider {
  switch (config.provider) {
    case 'edge-tts':
      return new EdgeTTSProvider(config);
    case 'openai-tts':
      return new OpenAITTSProvider(config);
    case 'fish-audio':
      return new FishAudioProvider(config);
    case 'gpt-sovits':
      return new GPTSoVITSProvider(config);
    default:
      throw new Error(`Unknown TTS provider: ${config.provider}`);
  }
}

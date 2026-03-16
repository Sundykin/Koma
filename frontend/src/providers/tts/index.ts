/**
 * TTS Provider 模块导出
 * 重构版：注册到 ProviderRegistry
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
import type { ProviderDefinition } from '../registry.types';
import { ttsRegistry } from '../registry';

// configSchema 定义
const edgeTTSSchema = {
  type: 'object',
  properties: {
    defaultVoice: { title: '默认音色', type: 'string', default: 'zh-CN-XiaoxiaoNeural' },
    defaultSpeed: { title: '语速', type: 'number', default: 1.0, minimum: 0.5, maximum: 2.0 },
  },
};

const openAITTSSchema = {
  type: 'object',
  properties: {
    apiKey: { title: 'API Key', type: 'string', format: 'password' },
    baseUrl: { title: 'API URL', type: 'string', default: 'https://api.openai.com/v1' },
    model: { title: '模型', type: 'string', enum: ['tts-1', 'tts-1-hd'], default: 'tts-1' },
    defaultVoice: { title: '默认音色', type: 'string', enum: ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'], default: 'alloy' },
  },
  required: ['apiKey'],
};

const fishAudioSchema = {
  type: 'object',
  properties: {
    apiKey: { title: 'API Key', type: 'string', format: 'password' },
    baseUrl: { title: 'API URL', type: 'string', default: 'https://api.fish.audio' },
    defaultVoice: { title: '默认音色 ID', type: 'string' },
  },
  required: ['apiKey'],
};

const gptSovitsSchema = {
  type: 'object',
  properties: {
    baseUrl: { title: '服务地址', type: 'string', default: 'http://127.0.0.1:9880' },
    defaultVoice: { title: '默认参考音频路径', type: 'string' },
    defaultSpeed: { title: '语速', type: 'number', default: 1.0 },
  },
};

// 注册内置 TTS Provider
function registerBuiltinTTSProviders() {
  const builtins: ProviderDefinition<TTSProvider>[] = [
    {
      type: 'edge-tts',
      kind: 'tts',
      name: 'Edge TTS (免费)',
      description: '微软 Edge 免费语音合成',
      factory: (config) => new EdgeTTSProvider(config as TTSConfig),
      capabilities: ['tts'],
      configSchema: edgeTTSSchema,
    },
    {
      type: 'openai-tts',
      kind: 'tts',
      name: 'OpenAI TTS',
      description: 'OpenAI 官方语音合成',
      factory: (config) => new OpenAITTSProvider(config as TTSConfig),
      capabilities: ['tts'],
      configSchema: openAITTSSchema,
    },
    {
      type: 'fish-audio',
      kind: 'tts',
      name: 'Fish Audio',
      description: 'Fish Audio 语音合成',
      factory: (config) => new FishAudioProvider(config as TTSConfig),
      capabilities: ['tts'],
      configSchema: fishAudioSchema,
    },
    {
      type: 'gpt-sovits',
      kind: 'tts',
      name: 'GPT-SoVITS (本地)',
      description: '本地部署的 GPT-SoVITS 服务',
      factory: (config) => new GPTSoVITSProvider(config as TTSConfig),
      capabilities: ['tts'],
      configSchema: gptSovitsSchema,
    },
  ];

  for (const def of builtins) {
    if (!ttsRegistry.has(def.type)) {
      ttsRegistry.register(def);
    }
  }
}

// 初始化时注册
registerBuiltinTTSProviders();

/**
 * 创建 TTS Provider
 * 从 Registry 获取，不再使用 switch-case
 */
export function createTTSProvider(config: TTSConfig): TTSProvider {
  const def = ttsRegistry.get(config.provider);
  if (!def) {
    throw new Error(`未知的语音合成服务商: ${config.provider}`);
  }
  // 使用包装函数保持 fetch 的上下文，避免 "Illegal invocation" 错误
  return def.factory(config, { sandboxedFetch: (...args: Parameters<typeof fetch>) => fetch(...args) });
}

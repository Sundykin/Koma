/**
 * TTI Provider 工厂和导出
 * 重构版：注册到 ProviderRegistry
 */
import type { TTIModelConfig } from '../../types';
import type { TTIProvider } from './types';
import { ComfyUIProvider } from './ComfyUIProvider';
import { NanoBananaProvider } from './NanoBananaProvider';
import { Gemini3ProProvider } from './Gemini3ProProvider';
import { OpenAICompatibleTTIProvider } from './OpenAICompatibleTTIProvider';
import { Grok2ApiImagineTTIProvider } from './Grok2ApiImagineTTIProvider';
import { GeminiNativeTTIProvider } from './GeminiNativeTTIProvider';
import type { ProviderDefinition } from '../registry.types';
import { DEFAULT_POLLING_CONFIG, MEDIA_PROVIDER_CONTRACT_VERSION } from '../registry.types';
import { ttiRegistry } from '../registry';

export type { TTIProvider, ImageResult, TTIOptions } from './types';
export { ComfyUIProvider } from './ComfyUIProvider';
export { NanoBananaProvider } from './NanoBananaProvider';
export { Gemini3ProProvider } from './Gemini3ProProvider';
export { OpenAICompatibleTTIProvider } from './OpenAICompatibleTTIProvider';
export { Grok2ApiImagineTTIProvider } from './Grok2ApiImagineTTIProvider';
export { GeminiNativeTTIProvider } from './GeminiNativeTTIProvider';

// 注册内置 Provider
function registerBuiltinProviders() {
  const builtins: ProviderDefinition<TTIProvider>[] = [
    {
      type: 'nano-banana',
      kind: 'tti',
      name: 'Nano-Banana（官方）',
      description: 'NanoBanana 文生图服务',
      factory: (config) => new NanoBananaProvider(config as TTIModelConfig),
      contractVersion: MEDIA_PROVIDER_CONTRACT_VERSION,
      capabilities: ['tti'],
      polling: DEFAULT_POLLING_CONFIG,
      presetBaseUrl: 'http://ai.hsxbk.top',
      auth: { apiKey: 'required', baseUrl: 'optional' },
    },
    {
      type: 'comfyui',
      kind: 'tti',
      name: 'ComfyUI',
      description: '本地 ComfyUI 文生图',
      factory: (config) => new ComfyUIProvider(config as TTIModelConfig),
      contractVersion: MEDIA_PROVIDER_CONTRACT_VERSION,
      capabilities: ['tti'],
      polling: {
        interval: 2000,
        maxDuration: 300000,
        initialDelay: 1000,
      },
      presetBaseUrl: 'http://127.0.0.1:8188',
      auth: { apiKey: 'none', baseUrl: 'required' },
    },
    {
      type: 'gemini-3-pro',
      kind: 'tti',
      name: 'Gemini-3-Pro (toapis)',
      description: 'Google Gemini 3 Pro 图像生成',
      factory: (config) => new Gemini3ProProvider(config as TTIModelConfig),
      contractVersion: MEDIA_PROVIDER_CONTRACT_VERSION,
      capabilities: ['tti'],
      polling: DEFAULT_POLLING_CONFIG,
      presetBaseUrl: 'https://toapis.com',
      auth: { apiKey: 'required', baseUrl: 'optional' },
    },
    {
      type: 'openai-compatible-tti',
      kind: 'tti',
      name: '自定义服务商（OpenAI 兼容）',
      description: '兼容 OpenAI 接口的自定义文生图服务',
      factory: (config) => new OpenAICompatibleTTIProvider(config as TTIModelConfig),
      contractVersion: MEDIA_PROVIDER_CONTRACT_VERSION,
      capabilities: ['tti'],
      polling: DEFAULT_POLLING_CONFIG,
      presetBaseUrl: '',
      auth: { apiKey: 'required', baseUrl: 'optional' },
    },
    {
      type: 'grok2api-imagine-tti',
      kind: 'tti',
      name: 'Grok2API Imagine（多参考）',
      description: 'Grok2API 逆向接口：文生图 + 多参考图（chat/completions）',
      factory: (config) => new Grok2ApiImagineTTIProvider(config as TTIModelConfig),
      contractVersion: MEDIA_PROVIDER_CONTRACT_VERSION,
      capabilities: ['tti'],
      polling: DEFAULT_POLLING_CONFIG,
      presetBaseUrl: '',
      auth: { apiKey: 'required', baseUrl: 'optional' },
    },
    {
      type: 'gemini-native-tti',
      kind: 'tti',
      name: 'Gemini Native（谷歌原生）',
      description: 'Google Gemini 原生 generateContent 图像生成（支持多图参考）',
      factory: (config) => new GeminiNativeTTIProvider(config as TTIModelConfig),
      contractVersion: MEDIA_PROVIDER_CONTRACT_VERSION,
      capabilities: ['tti'],
      presetBaseUrl: 'https://generativelanguage.googleapis.com',
      auth: { apiKey: 'required', baseUrl: 'optional' },
    },
  ];

  for (const def of builtins) {
    if (!ttiRegistry.has(def.type)) {
      ttiRegistry.register(def);
    }
  }
}

// 初始化时注册
registerBuiltinProviders();

/**
 * 创建 TTI Provider
 * 从 Registry 获取，不再使用 switch-case
 */
export function createTTIProvider(config: TTIModelConfig): TTIProvider {
  const def = ttiRegistry.get(config.provider);
  if (!def) {
    throw new Error(`未知的图片生成服务商: ${config.provider}`);
  }
  // 使用包装函数保持 fetch 的上下文，避免 "Illegal invocation" 错误
  return def.factory(config, { sandboxedFetch: (...args: Parameters<typeof fetch>) => fetch(...args) });
}

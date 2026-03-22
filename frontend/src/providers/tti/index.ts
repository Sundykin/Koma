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
import type { ProviderDefinition } from '../registry.types';
import { DEFAULT_POLLING_CONFIG, MEDIA_PROVIDER_CONTRACT_VERSION } from '../registry.types';
import { ttiRegistry } from '../registry';

export type { TTIProvider, ImageResult, TTIOptions } from './types';
export { ComfyUIProvider } from './ComfyUIProvider';
export { NanoBananaProvider } from './NanoBananaProvider';
export { Gemini3ProProvider } from './Gemini3ProProvider';
export { OpenAICompatibleTTIProvider } from './OpenAICompatibleTTIProvider';
export { Grok2ApiImagineTTIProvider } from './Grok2ApiImagineTTIProvider';

// 注册内置 Provider
function registerBuiltinProviders() {
  const builtins: ProviderDefinition<TTIProvider>[] = [
    {
      type: 'nano-banana',
      kind: 'tti',
      name: 'NanoBanana',
      description: 'NanoBanana 文生图服务',
      factory: (config) => new NanoBananaProvider(config as TTIModelConfig),
      contractVersion: MEDIA_PROVIDER_CONTRACT_VERSION,
      capabilities: ['tti'],
      polling: DEFAULT_POLLING_CONFIG,
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
    },
    {
      type: 'gemini-3-pro',
      kind: 'tti',
      name: 'Gemini 3 Pro',
      description: 'Google Gemini 3 Pro 图像生成',
      factory: (config) => new Gemini3ProProvider(config as TTIModelConfig),
      contractVersion: MEDIA_PROVIDER_CONTRACT_VERSION,
      capabilities: ['tti'],
      polling: DEFAULT_POLLING_CONFIG,
    },
    {
      type: 'openai-compatible-tti',
      kind: 'tti',
      name: '自定义服务商',
      description: '兼容 OpenAI 接口的自定义文生图服务',
      factory: (config) => new OpenAICompatibleTTIProvider(config as TTIModelConfig),
      contractVersion: MEDIA_PROVIDER_CONTRACT_VERSION,
      capabilities: ['tti'],
      polling: DEFAULT_POLLING_CONFIG,
    },
    {
      type: 'grok2api-imagine-tti',
      kind: 'tti',
      name: 'Grok2API Imagine',
      description: 'Grok2API 逆向接口：文生图 + 多参考图（chat/completions）',
      factory: (config) => new Grok2ApiImagineTTIProvider(config as TTIModelConfig),
      contractVersion: MEDIA_PROVIDER_CONTRACT_VERSION,
      capabilities: ['tti'],
      polling: DEFAULT_POLLING_CONFIG,
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

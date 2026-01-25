/**
 * TTI Provider 工厂和导出
 * 重构版：注册到 ProviderRegistry
 */
import type { TTIModelConfig } from '../../types';
import type { TTIProvider } from './types';
import { ComfyUIProvider } from './ComfyUIProvider';
import { NanoBananaProvider } from './NanoBananaProvider';
import { Gemini3ProProvider } from './Gemini3ProProvider';
import { ttiRegistry, type ProviderDefinition, DEFAULT_POLLING_CONFIG } from '../registry';

export type { TTIProvider, ImageResult, TTIOptions } from './types';
export { ComfyUIProvider } from './ComfyUIProvider';
export { NanoBananaProvider } from './NanoBananaProvider';
export { Gemini3ProProvider } from './Gemini3ProProvider';

// 注册内置 Provider
function registerBuiltinProviders() {
  const builtins: ProviderDefinition<TTIProvider>[] = [
    {
      type: 'nano-banana',
      kind: 'tti',
      name: 'NanoBanana',
      description: 'NanoBanana 文生图服务',
      factory: (config) => new NanoBananaProvider(config as TTIModelConfig),
      capabilities: ['tti'],
      polling: DEFAULT_POLLING_CONFIG,
    },
    {
      type: 'comfyui',
      kind: 'tti',
      name: 'ComfyUI',
      description: '本地 ComfyUI 文生图',
      factory: (config) => new ComfyUIProvider(config as TTIModelConfig),
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
 * 创建 TTI Provider（兼容旧 API）
 */
export function createTTIProvider(config: TTIModelConfig): TTIProvider {
  // 优先从 Registry 获取
  const def = ttiRegistry.get(config.provider);
  if (def) {
    return def.factory(config, { sandboxedFetch: fetch });
  }

  // 兼容旧代码
  switch (config.provider) {
    case 'nano-banana':
      return new NanoBananaProvider(config);
    case 'comfyui':
      return new ComfyUIProvider(config);
    case 'gemini-3-pro':
      return new Gemini3ProProvider(config);
    default:
      throw new Error(`Unknown TTI provider: ${config.provider}`);
  }
}

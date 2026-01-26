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
 * 创建 TTI Provider
 * 从 Registry 获取，不再使用 switch-case
 */
export function createTTIProvider(config: TTIModelConfig): TTIProvider {
  const def = ttiRegistry.get(config.provider);
  if (!def) {
    throw new Error(`Unknown TTI provider: ${config.provider}`);
  }
  return def.factory(config, { sandboxedFetch: fetch });
}

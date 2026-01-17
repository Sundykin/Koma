/**
 * TTI Provider 工厂和导出
 */
import type { TTIModelConfig } from '../../types';
import type { TTIProvider } from './types';
import { ComfyUIProvider } from './ComfyUIProvider';
import { NanoBananaProvider } from './NanoBananaProvider';

export type { TTIProvider, ImageResult, TTIOptions } from './types';
export { ComfyUIProvider } from './ComfyUIProvider';
export { NanoBananaProvider } from './NanoBananaProvider';

export function createTTIProvider(config: TTIModelConfig): TTIProvider {
  switch (config.provider) {
    case 'nano-banana':
      return new NanoBananaProvider(config);
    case 'comfyui':
      return new ComfyUIProvider(config);
    default:
      throw new Error(`Unknown TTI provider: ${config.provider}`);
  }
}

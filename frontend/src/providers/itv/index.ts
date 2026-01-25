/**
 * ITV Provider 模块导出
 * 重构版：注册到 ProviderRegistry
 */
export * from './types';
export { RunwayProvider } from './RunwayProvider';
export { KlingProvider } from './KlingProvider';
export { PikaProvider } from './PikaProvider';
export { Sora2Provider } from './Sora2Provider';
export { ComfyUIAnimateDiffProvider } from './ComfyUIAnimateDiffProvider';

import type { ITVConfig } from '../../types';
import type { ITVProvider } from './types';
import { RunwayProvider } from './RunwayProvider';
import { KlingProvider } from './KlingProvider';
import { PikaProvider } from './PikaProvider';
import { Sora2Provider } from './Sora2Provider';
import { ComfyUIAnimateDiffProvider } from './ComfyUIAnimateDiffProvider';
import { itvRegistry, type ProviderDefinition, DEFAULT_POLLING_CONFIG } from '../registry';

// 注册内置 Provider
function registerBuiltinProviders() {
  const builtins: ProviderDefinition<ITVProvider>[] = [
    {
      type: 'runway',
      kind: 'itv',
      name: 'Runway',
      description: 'Runway Gen-2 视频生成',
      factory: (config) => new RunwayProvider(config as ITVConfig),
      capabilities: ['itv'],
      polling: DEFAULT_POLLING_CONFIG,
    },
    {
      type: 'kling',
      kind: 'itv',
      name: 'Kling AI',
      description: '快手可灵视频生成',
      factory: (config) => new KlingProvider(config as ITVConfig),
      capabilities: ['itv'],
      polling: DEFAULT_POLLING_CONFIG,
    },
    {
      type: 'pika',
      kind: 'itv',
      name: 'Pika Labs',
      description: 'Pika 视频生成',
      factory: (config) => new PikaProvider(config as ITVConfig),
      capabilities: ['itv'],
      polling: DEFAULT_POLLING_CONFIG,
    },
    {
      type: 'sora2',
      kind: 'itv',
      name: 'Sora 2',
      description: 'OpenAI Sora 2 视频生成，支持角色提取',
      factory: (config) => new Sora2Provider(config as ITVConfig),
      capabilities: ['itv', 'character-extract', 'remix'],
      polling: {
        interval: 5000,
        maxDuration: 600000,
        initialDelay: 3000,
      },
    },
    {
      type: 'comfyui-animatediff',
      kind: 'itv',
      name: 'ComfyUI AnimateDiff',
      description: '本地 ComfyUI AnimateDiff 视频生成',
      factory: (config) => new ComfyUIAnimateDiffProvider(config as ITVConfig),
      capabilities: ['itv'],
      polling: {
        interval: 2000,
        maxDuration: 300000,
        initialDelay: 1000,
      },
    },
  ];

  for (const def of builtins) {
    if (!itvRegistry.has(def.type)) {
      itvRegistry.register(def);
    }
  }
}

// 初始化时注册
registerBuiltinProviders();

/**
 * 创建 ITV Provider（兼容旧 API）
 */
export function createITVProvider(config: ITVConfig): ITVProvider {
  // 优先从 Registry 获取
  const def = itvRegistry.get(config.provider);
  if (def) {
    return def.factory(config, { sandboxedFetch: fetch });
  }

  // 兼容旧代码
  switch (config.provider) {
    case 'runway':
      return new RunwayProvider(config);
    case 'kling':
      return new KlingProvider(config);
    case 'pika':
      return new PikaProvider(config);
    case 'sora2':
      return new Sora2Provider(config);
    case 'comfyui-animatediff':
      return new ComfyUIAnimateDiffProvider(config);
    default:
      throw new Error(`Unknown ITV provider: ${config.provider}`);
  }
}

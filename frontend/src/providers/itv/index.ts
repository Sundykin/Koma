/**
 * ITV Provider 模块导出
 * 重构版：注册到 ProviderRegistry
 */
export * from './types';
export { RunwayProvider } from './RunwayProvider';
export { KlingProvider } from './KlingProvider';
export { PikaProvider } from './PikaProvider';
export { Sora2Provider } from './Sora2Provider';
export { ViduProvider } from './ViduProvider';
export { ComfyUIAnimateDiffProvider } from './ComfyUIAnimateDiffProvider';
export { CustomITVProvider } from './CustomITVProvider';
export { Grok2ApiImagineITVProvider } from './Grok2ApiImagineITVProvider';

import type { ITVConfig } from '../../types';
import type { ITVProvider } from './types';
import { RunwayProvider } from './RunwayProvider';
import { KlingProvider } from './KlingProvider';
import { PikaProvider } from './PikaProvider';
import { Sora2Provider } from './Sora2Provider';
import { ViduProvider } from './ViduProvider';
import { ComfyUIAnimateDiffProvider } from './ComfyUIAnimateDiffProvider';
import { CustomITVProvider } from './CustomITVProvider';
import { Grok2ApiImagineITVProvider } from './Grok2ApiImagineITVProvider';
import type { ProviderDefinition } from '../registry.types';
import { DEFAULT_POLLING_CONFIG, MEDIA_PROVIDER_CONTRACT_VERSION } from '../registry.types';
import { itvRegistry } from '../registry';
import { safeFetch } from '../../utils/safeFetch';

// 注册内置 Provider
function registerBuiltinProviders() {
  const builtins: ProviderDefinition<ITVProvider>[] = [
    {
      type: 'runway',
      kind: 'itv',
      name: 'Runway',
      description: 'Runway Gen-2 视频生成',
      factory: (config) => new RunwayProvider(config as ITVConfig),
      contractVersion: MEDIA_PROVIDER_CONTRACT_VERSION,
      capabilities: ['itv'],
      polling: DEFAULT_POLLING_CONFIG,
    },
    {
      type: 'kling',
      kind: 'itv',
      name: 'Kling AI',
      description: '快手可灵视频生成',
      factory: (config) => new KlingProvider(config as ITVConfig),
      contractVersion: MEDIA_PROVIDER_CONTRACT_VERSION,
      capabilities: ['itv'],
      polling: DEFAULT_POLLING_CONFIG,
    },
    {
      type: 'pika',
      kind: 'itv',
      name: 'Pika Labs',
      description: 'Pika 视频生成',
      factory: (config) => new PikaProvider(config as ITVConfig),
      contractVersion: MEDIA_PROVIDER_CONTRACT_VERSION,
      capabilities: ['itv'],
      polling: DEFAULT_POLLING_CONFIG,
    },
    {
      type: 'sora2',
      kind: 'itv',
      name: 'Sora 2',
      description: 'OpenAI Sora 2 视频生成，支持角色提取',
      factory: (config) => new Sora2Provider(config as ITVConfig),
      contractVersion: MEDIA_PROVIDER_CONTRACT_VERSION,
      capabilities: ['itv'],
      polling: {
        interval: 5000,
        maxDuration: 600000,
        initialDelay: 3000,
      },
    },
    {
      type: 'vidu',
      kind: 'itv',
      name: 'Vidu',
      description: 'Vidu 视频生成，支持文生视频、图生视频、参考生视频、首尾帧视频',
      factory: (config) => new ViduProvider(config as ITVConfig),
      contractVersion: MEDIA_PROVIDER_CONTRACT_VERSION,
      capabilities: ['itv'],
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
      contractVersion: MEDIA_PROVIDER_CONTRACT_VERSION,
      capabilities: ['itv'],
      polling: {
        interval: 2000,
        maxDuration: 300000,
        initialDelay: 1000,
      },
    },
    {
      type: 'custom',
      kind: 'itv',
      name: '自定义',
      description: '自定义视频生成 API（兼容多种接口格式）',
      factory: (config) => new CustomITVProvider(config as ITVConfig),
      contractVersion: MEDIA_PROVIDER_CONTRACT_VERSION,
      capabilities: ['itv'],
      polling: {
        interval: 5000,
        maxDuration: 600000,
        initialDelay: 3000,
      },
    },
    {
      type: 'grok2api-imagine-itv',
      kind: 'itv',
      name: 'Grok2API Imagine Video',
      description: 'Grok2API 逆向接口：图生视频（chat/completions）',
      factory: (config) => new Grok2ApiImagineITVProvider(config as ITVConfig),
      contractVersion: MEDIA_PROVIDER_CONTRACT_VERSION,
      capabilities: ['itv'],
      polling: DEFAULT_POLLING_CONFIG,
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
 * 创建 ITV Provider
 * 从 Registry 获取，不再使用 switch-case
 */
export function createITVProvider(config: ITVConfig): ITVProvider {
  const def = itvRegistry.get(config.provider);
  if (!def) {
    throw new Error(`未知的视频生成服务商: ${config.provider}`);
  }
  // 使用包装函数保持 fetch 的上下文，避免 "Illegal invocation" 错误
  return def.factory(config, { sandboxedFetch: ((input: string | URL | Request, init?: RequestInit) => safeFetch(String(input), init)) as typeof fetch });
}

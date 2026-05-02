/**
 * ITV Provider 模块导出
 * 重构版：注册到 ProviderRegistry
 *
 * 当前内置渠道收敛为 2 个，都默认指向 https://komaapi.com：
 *   - grok2api-imagine-itv  → Koma官方 Grok（图生视频）
 *   - koma-suihe-itv        → Koma 官方 - 即梦（穗禾 Seedance）
 *
 * 之前注册过的 runway / kling / pika / sora2 / seedance / vidu /
 * comfyui-animatediff / custom 已下线；用户旧渠道仍存于 SQLite，
 * 但 createITVProvider 不再认识这些 providerType。
 */
export * from './types';
export { Grok2ApiImagineITVProvider } from './Grok2ApiImagineITVProvider';
export { SuiheITVProvider } from './SuiheITVProvider';

import type { ITVConfig } from '../../types';
import type { ITVProvider } from './types';
import { Grok2ApiImagineITVProvider } from './Grok2ApiImagineITVProvider';
import { SuiheITVProvider } from './SuiheITVProvider';
import type { ProviderDefinition } from '../registry.types';
import { DEFAULT_POLLING_CONFIG, MEDIA_PROVIDER_CONTRACT_VERSION } from '../registry.types';
import { itvRegistry } from '../registry';
import { safeFetch } from '../../utils/safeFetch';

// 注册内置 Provider
function registerBuiltinProviders() {
  const builtins: ProviderDefinition<ITVProvider>[] = [
    {
      type: 'grok2api-imagine-itv',
      kind: 'itv',
      name: 'Koma官方 Grok',
      description: 'Koma 官方 Grok 图生视频（chat/completions）',
      factory: (config) => new Grok2ApiImagineITVProvider(config as ITVConfig),
      contractVersion: MEDIA_PROVIDER_CONTRACT_VERSION,
      capabilities: ['itv'],
      polling: DEFAULT_POLLING_CONFIG,
      presetBaseUrl: 'https://komaapi.com',
      auth: { apiKey: 'required', baseUrl: 'optional' },
    },
    {
      type: 'koma-suihe-itv',
      kind: 'itv',
      name: 'Koma 官方 - 即梦',
      description: 'Koma 官方激活通道下的即梦视频生成（seedance-2.0-r / -f）。'
        + '协议为 OpenAI 标准视频 API JSON，由 komaapi.com 网关转换为穗禾上游 multipart。',
      factory: (config) => new SuiheITVProvider(config as ITVConfig),
      contractVersion: MEDIA_PROVIDER_CONTRACT_VERSION,
      capabilities: ['itv'],
      polling: {
        interval: 5000,
        maxDuration: 600000,
        initialDelay: 3000,
      },
      presetBaseUrl: 'https://komaapi.com',
      auth: { apiKey: 'required', baseUrl: 'optional' },
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

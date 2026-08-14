/**
 * ITV Provider 模块导出
 * 重构版：注册到 ProviderRegistry
 *
 * 当前内置渠道：
 *   - koma-suihe-itv        → Koma 官方 - 即梦（Koma 即梦 Seedance，komaapi 网关）
 *   - suihe-itv             → 穗禾直连视频（api.suihemedia.cloud，multipart + /v1/tasks 轮询）
 *   - comfyui-itv           → ComfyUI 直连（/prompt + /history 轮询，内置 MiniMax H3 参考生视频工作流）
 *
 * 之前注册过的 runway / kling / pika / sora2 / seedance / vidu /
 * comfyui-animatediff / custom 已下线；用户旧渠道仍存于 SQLite，
 * 但 createITVProvider 不再认识这些 providerType。
 */
export * from './types';
export { SuiheITVProvider } from './SuiheITVProvider';
export { SuiheDirectITVProvider } from './SuiheDirectITVProvider';
export { ComfyUIITVProvider } from './ComfyUIITVProvider';
export { MiniMaxH3ITVProvider } from './MiniMaxH3ITVProvider';

import type { ITVConfig } from '../../types';
import type { ITVProvider } from './types';
import { SuiheITVProvider } from './SuiheITVProvider';
import { SuiheDirectITVProvider } from './SuiheDirectITVProvider';
import { ComfyUIITVProvider } from './ComfyUIITVProvider';
import { MiniMaxH3ITVProvider } from './MiniMaxH3ITVProvider';
import type { ProviderDefinition } from '../registry.types';
import { DEFAULT_POLLING_CONFIG, MEDIA_PROVIDER_CONTRACT_VERSION } from '../registry.types';
import { itvRegistry } from '../registry';
import { safeFetch } from '../../utils/safeFetch';

// 注册内置 Provider
function registerBuiltinProviders() {
  const builtins: ProviderDefinition<ITVProvider>[] = [
    {
      type: 'koma-suihe-itv',
      kind: 'itv',
      name: 'Koma 即梦',
      description: 'Koma 官方激活通道下的即梦视频生成（seedance-2.0 / seedance-2.0-fast）。'
        + '客户端发 OpenAI 标准视频 API JSON + Koma 即梦协议占位符（@image_file_N / '
        + '@video_file_N / @audio_file_N），由 komaapi.com 网关转成上游 multipart。',
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
    {
      type: 'suihe-itv',
      kind: 'itv',
      name: '穗禾 Suihe 视频',
      description: '穗禾开放 API 直连视频生成（multipart 直传首尾帧/全能参考素材，POST /v1/videos/generations + /v1/tasks 轮询）',
      factory: (config) => new SuiheDirectITVProvider(config as ITVConfig),
      contractVersion: MEDIA_PROVIDER_CONTRACT_VERSION,
      capabilities: ['itv'],
      polling: {
        interval: 5000,
        maxDuration: 600000,
        initialDelay: 3000,
      },
      presetBaseUrl: 'https://www.suihemedia.cloud',
      auth: { apiKey: 'required', baseUrl: 'optional' },
      fallbackPolicy: 'lock-to-selection',
    },
    {
      type: 'comfyui-itv',
      kind: 'itv',
      name: 'ComfyUI',
      description: '直连 ComfyUI 服务端（POST /prompt + GET /history 轮询）。内置 MiniMax H3 参考生视频工作流'
        + '（多参考图 + 提示词 → 带音轨视频），参考图以原文件直传 /upload/image；'
        + '可在模型 defaults.workflowJson 里换成自定义 API 格式工作流。',
      factory: (config) => new ComfyUIITVProvider(config as ITVConfig),
      contractVersion: MEDIA_PROVIDER_CONTRACT_VERSION,
      capabilities: ['itv'],
      // ComfyUI 本地推理耗时远高于云端 API，放宽到 60 分钟
      polling: {
        interval: 5000,
        maxDuration: 3600000,
        initialDelay: 5000,
      },
      // ComfyUI 原生无鉴权：apiKey 可选，服务地址必填
      auth: { apiKey: 'optional', baseUrl: 'required' },
      fallbackPolicy: 'lock-to-selection',
    },
    {
      type: 'minimax-h3-itv',
      kind: 'itv',
      name: 'MiniMax H3 官方',
      description: 'MiniMax 官方云端 API（api.minimaxi.com，V2 接口）：多模态 content[] 直接输入，'
        + '支持文生视频 / 首尾帧 / 全能参考（图 ≤9 + 视频 ≤3 + 音频 ≤3）；可选 H3-Context-IR'
        + '增强提示词（先深度理解多模态上下文，再生成结构化更丰富的 prompt）。',
      factory: (config) => new MiniMaxH3ITVProvider(config as ITVConfig),
      contractVersion: MEDIA_PROVIDER_CONTRACT_VERSION,
      capabilities: ['itv'],
      polling: {
        interval: 10000,
        maxDuration: 1800000,
        initialDelay: 5000,
      },
      auth: { apiKey: 'required', baseUrl: 'optional' },
      fallbackPolicy: 'lock-to-selection',
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

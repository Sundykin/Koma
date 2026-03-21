/**
 * Provider 工厂
 * 根据配置创建对应的 Provider 实例
 */
import type {
  AppSettings,
  ModelConfig,
  TTSConfig,
  ITVConfig,
  LLMModelConfig,
  TTIModelConfig,
  TTSModelConfig,
  ResolvedTTSConfig,
} from '../types';
import type { ChannelConfig } from './channel/types';
import {
  getActiveLLMConfig,
  getActiveTTIConfig,
  getActiveITVConfig,
  getActiveTTSConfig,
  getDefaultChannelConfig,
  getChannelsByCapability,
} from '../store/globalStore';
import type { ChannelKind } from './registry.types';
import { createProviderInstance } from './registry';
import { usePluginStore } from '../store/pluginStore';
import { waitForPluginStoreRehydration } from '../store/pluginStore';
import { createSandboxedFetch } from '../services/plugin/PluginSandbox';
import { createLogger } from '../store/logger';

const logger = createLogger('Provider');

// 从子目录导入类型和工厂
import { createLLMProvider } from './llm';
import type { LLMProvider } from './llm/types';
import { createTTIProvider } from './tti';
import type { TTIProvider } from './tti/types';
import { createTTSProvider } from './tts';
import type { TTSProvider } from './tts/types';
import { createITVProvider as createITVProviderFromConfig } from './itv';
import type { ITVProvider } from './itv/types';
import type { ImageHostingProvider } from './imageHosting/types';

// 重新导出 ProviderManager
export { providerManager, ProviderManager, type ProviderKindMap } from './manager';

// 重新导出 Registry 类型
export type {
  ChannelKind,
  ChannelCapability,
  ProviderDefinition,
  ProviderContext,
} from './registry.types';
export { MEDIA_PROVIDER_CONTRACT_VERSION } from './registry.types';

// Registry 函数使用静态导出
export {
  listProviders,
  registerProvider,
  unregisterProvider,
  unregisterProvidersByPlugin,
  createProviderInstance,
} from './registry';

// 重新导出子目录内容
export { createLLMProvider, GeminiProvider, OpenAIProvider, ClaudeProvider } from './llm';
export type { LLMProvider, ChatMessage } from './llm/types';
export { createTTIProvider, ComfyUIProvider } from './tti';
export type { TTIProvider, ImageResult, TTIOptions } from './tti/types';
export { createTTSProvider } from './tts';
export type { TTSProvider, TTSRequest, AudioResult, TTSOptions } from './tts/types';
export { createITVProvider as createITVProviderFromConfig } from './itv';
export type { ITVProvider, ITVRequest, ITVResult, ProgressInfo, ITVOptions } from './itv/types';

// ========== 从 AppSettings 创建 Provider ==========

export function createProvidersFromSettings(settings: AppSettings) {
  const defaultLLMConfig = settings.llmConfigs.find(c => c.isDefault) || settings.llmConfigs[0];

  return {
    llm: defaultLLMConfig ? createLLMProvider({
      provider: defaultLLMConfig.provider as any,
      apiKey: defaultLLMConfig.apiKey,
      baseUrl: defaultLLMConfig.baseUrl,
      modelName: defaultLLMConfig.modelName,
    }) : null,
  };
}

// ========== 配置校验函数 ==========

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateLLMConfig(config: ModelConfig): ValidationResult {
  const errors: string[] = [];
  if (!config.provider) errors.push('未选择 Provider');
  if (!config.apiKey || config.apiKey.trim() === '') errors.push('API Key 不能为空');
  if (!config.modelName || config.modelName.trim() === '') errors.push('模型名称不能为空');
  return { valid: errors.length === 0, errors };
}

export function validateTTIConfig(config: ModelConfig): ValidationResult {
  const errors: string[] = [];
  if (!config.provider) errors.push('未选择 TTI Provider');
  if (config.provider === 'comfyui') {
    if (!config.baseUrl || config.baseUrl.trim() === '') errors.push('ComfyUI 地址不能为空');
  } else {
    if (!config.apiKey || config.apiKey.trim() === '') errors.push('API Key 不能为空');
  }
  return { valid: errors.length === 0, errors };
}

export function validateITVConfig(config: ITVConfig): ValidationResult {
  const errors: string[] = [];
  if (!config.provider) errors.push('未选择 ITV Provider');
  if (config.provider && config.provider !== 'comfyui-animatediff') {
    if (!config.apiKey || config.apiKey.trim() === '') errors.push('API Key 不能为空');
  }
  return { valid: errors.length === 0, errors };
}

export function validateTTSConfig(config: TTSConfig): ValidationResult {
  const errors: string[] = [];
  if (!config.provider) errors.push('未选择 TTS Provider');
  if (config.provider && config.provider !== 'edge-tts' && config.provider !== 'gpt-sovits') {
    if (!config.apiKey || config.apiKey.trim() === '') errors.push('API Key 不能为空');
  }
  return { valid: errors.length === 0, errors };
}

export function validateAllSettings(settings: AppSettings): {
  llm: ValidationResult;
  tti: ValidationResult;
  itv: ValidationResult;
  tts: ValidationResult;
} {
  const defaultLLMConfig = settings.llmConfigs?.find(c => c.isDefault) || settings.llmConfigs?.[0];
  const llmResult: ValidationResult = defaultLLMConfig
    ? validateLLMConfig({
        provider: defaultLLMConfig.provider as any,
        apiKey: defaultLLMConfig.apiKey,
        baseUrl: defaultLLMConfig.baseUrl,
        modelName: defaultLLMConfig.modelName,
      })
    : { valid: false, errors: ['未配置 LLM 模型'] };

  const defaultTTIConfig = settings.ttiConfigs?.find(c => c.isDefault) || settings.ttiConfigs?.[0];
  const ttiResult: ValidationResult = defaultTTIConfig
    ? validateTTIConfig({
        provider: defaultTTIConfig.provider as any,
        apiKey: defaultTTIConfig.apiKey || '',
        baseUrl: defaultTTIConfig.baseUrl,
        modelName: defaultTTIConfig.modelName || '',
      })
    : { valid: false, errors: ['未配置 TTI 服务'] };

  const defaultITVConfig = settings.itvConfigs?.find(c => c.isDefault) || settings.itvConfigs?.[0];
  const itvResult: ValidationResult = defaultITVConfig
    ? validateITVConfig({
        provider: defaultITVConfig.provider as any,
        apiKey: defaultITVConfig.apiKey,
        baseUrl: defaultITVConfig.baseUrl,
        defaultDuration: defaultITVConfig.defaultDuration,
      })
    : { valid: false, errors: ['未配置 ITV 服务'] };

  const defaultTTSConfig = settings.ttsConfigs?.find(c => c.isDefault) || settings.ttsConfigs?.[0];
  const ttsResult: ValidationResult = defaultTTSConfig
    ? validateTTSConfig({
        provider: defaultTTSConfig.provider,
        apiKey: defaultTTSConfig.apiKey,
        defaultVoice: defaultTTSConfig.defaultVoice,
      })
    : { valid: false, errors: ['未配置 TTS 服务'] };

  return { llm: llmResult, tti: ttiResult, itv: itvResult, tts: ttsResult };
}

// ========== 连接测试函数 ==========

export async function testLLMConnection(config: ModelConfig): Promise<{ success: boolean; message: string }> {
  try {
    const provider = createLLMProvider(config);
    if (!provider.validate()) return { success: false, message: '配置校验失败' };
    const result = await provider.testConnection();
    return { success: result, message: result ? '连接成功' : '连接失败，请检查配置' };
  } catch (err: any) {
    return { success: false, message: err.message || '连接测试失败' };
  }
}

export async function testTTIConnection(config: TTIModelConfig): Promise<{ success: boolean; message: string }> {
  try {
    const provider = createTTIProvider(config);
    if (!provider.validate()) return { success: false, message: '配置校验失败' };
    const result = await provider.testConnection();
    return { success: result, message: result ? '连接成功' : '连接失败，请检查配置' };
  } catch (err: any) {
    return { success: false, message: err.message || '连接测试失败' };
  }
}

// ========== 项目级 Provider 工厂 ==========

export function createLLMProviderFromConfig(config: LLMModelConfig): LLMProvider {
  return createLLMProvider({
    provider: config.provider as any,
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
    modelName: config.modelName,
  });
}

export function createTTIProviderFromConfig(config: TTIModelConfig): TTIProvider {
  return createTTIProvider(config);
}

export function createTTSProviderFromConfig(config: TTSModelConfig): TTSProvider {
  return createTTSProvider({
    provider: config.provider,
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
    defaultVoice: config.defaultVoice,
  });
}

// ========== 插件渠道 Provider 创建 ==========

function createBestEffortPluginChannelFetch(): typeof fetch {
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.toString()
        : (input as any)?.url || input.toString();

    if (url.startsWith('file://')) {
      throw new Error('不允许通过 fetch 访问本地文件');
    }
    if (url.includes('localhost') || url.includes('127.0.0.1')) {
      throw new Error('不允许访问本地服务');
    }

    // We intentionally use native fetch here (not IPC safeFetch) because plugin providers
    // may send FormData which the IPC bridge does not support yet.
    return fetch(input as any, init);
  };
}

/**
 * 为插件渠道创建 Provider 上下文
 */
async function createChannelProviderContext(channelConfig: ChannelConfig, kind: ChannelKind) {
  if (channelConfig.source === 'plugin') {
    if (!channelConfig.pluginId) {
      logger.error(`插件渠道 ${channelConfig.name} 缺少 pluginId`);
      return null;
    }

    // In early startup, pluginStore may not have rehydrated yet. For plugin channels,
    // we wait once to avoid a false "plugin not found" -> "provider not ready".
    let plugin = usePluginStore.getState().getPlugin(channelConfig.pluginId);
    if (!plugin) {
      await waitForPluginStoreRehydration();
      plugin = usePluginStore.getState().getPlugin(channelConfig.pluginId);
    }
    if (!plugin) {
      logger.warn(`插件 ${channelConfig.pluginId} 未找到`, {
        channelId: channelConfig.id,
        providerType: channelConfig.providerType,
        capability: channelConfig.capabilities,
      });
      // Best-effort: if provider definitions are already registered in-memory but the plugin
      // record is temporarily unavailable (rehydration edge cases / multi-window), we can
      // still create the provider instance for image-hosting so downstream remoteUrl fill
      // does not fail with "Provider not ready".
      if (kind === 'image-hosting') {
        return {
          sandboxedFetch: createBestEffortPluginChannelFetch(),
          pluginId: channelConfig.pluginId,
          logger: console,
        };
      }
      return null;
    }
    if (!plugin.isEnabled) {
      logger.warn(`插件 ${channelConfig.pluginId} 已禁用`, {
        channelId: channelConfig.id,
        providerType: channelConfig.providerType,
      });
      return null;
    }

    return {
      sandboxedFetch: createSandboxedFetch(plugin),
      pluginId: plugin.id,
      logger: console,
    };
  }

  return { sandboxedFetch: fetch, logger: console };
}

/**
 * 从插件渠道配置创建 Provider 实例
 */
async function createChannelProvider<T>(channelConfig: ChannelConfig, kind: ChannelKind): Promise<T | null> {
  const context = await createChannelProviderContext(channelConfig, kind);
  if (!context) return null;

  try {
    return createProviderInstance<T>(
      kind,
      channelConfig.providerType,
      channelConfig.providerConfig,
      context
    );
  } catch (err: unknown) {
    logger.error('创建插件 Provider 失败', {
      kind,
      providerType: channelConfig.providerType,
      pluginId: channelConfig.pluginId,
      channelId: channelConfig.id,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

export async function getProjectImageHostingProvider(): Promise<ImageHostingProvider | null> {
  const channel = await getDefaultChannelConfig('image-hosting' as any)
    || (await getChannelsByCapability('image-hosting' as any))[0]
    || null;
  if (!channel) return null;
  return createChannelProvider<ImageHostingProvider>(channel, 'image-hosting');
}

export async function getProjectLLMProvider(projectLLMConfigId?: string): Promise<LLMProvider | null> {
  const config = await getActiveLLMConfig(projectLLMConfigId);
  if (!config) return null;
  return createLLMProviderFromConfig(config);
}

export async function getProjectTTIProvider(projectTTIConfigId?: string): Promise<TTIProvider | null> {
  const config = await getActiveTTIConfig(projectTTIConfigId);
  if (!config) return null;

  if (config.source === 'channel') {
    return createChannelProvider<TTIProvider>(config.channelConfig, 'tti');
  }

  return createTTIProviderFromConfig(config);
}

export async function getProjectITVProvider(projectITVConfigId?: string): Promise<ITVProvider | null> {
  const config = await getActiveITVConfig(projectITVConfigId);
  if (!config) return null;

  if (config.source === 'channel') {
    return createChannelProvider<ITVProvider>(config.channelConfig, 'itv');
  }

  return createITVProviderFromConfig({
    provider: config.provider as any,
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
    defaultDuration: config.defaultDuration,
    defaultResolution: config.defaultResolution,
  });
}

export async function getProjectTTSProvider(projectTTSConfigId?: string): Promise<TTSProvider | null> {
  const config = await getActiveTTSConfig(projectTTSConfigId);
  if (!config) return null;

  // 支持插件渠道（如果有）
  if ('source' in config && config.source === 'channel') {
    const resolvedConfig = config as ResolvedTTSConfig;
    if (resolvedConfig.source === 'channel') {
      return createChannelProvider<TTSProvider>(resolvedConfig.channelConfig, 'tts');
    }
  }

  return createTTSProviderFromConfig(config);
}

export async function getProjectProviders(project: {
  llmConfigId?: string;
  ttiConfigId?: string;
  itvConfigId?: string;
  ttsConfigId?: string;
}) {
  const [llm, tti, itv, tts] = await Promise.all([
    getProjectLLMProvider(project.llmConfigId),
    getProjectTTIProvider(project.ttiConfigId),
    getProjectITVProvider(project.itvConfigId).catch(() => null),
    getProjectTTSProvider(project.ttsConfigId).catch(() => null),
  ]);
  return { llm, tti, itv, tts };
}

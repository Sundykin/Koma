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
  ITVModelConfig,
  TTSModelConfig,
  ResolvedTTIConfig,
  ResolvedITVConfig,
  ResolvedTTSConfig,
} from '../types';
import type { ChannelConfig } from './channel/types';
import {
  getActiveLLMConfig,
  getActiveTTIConfig,
  getActiveITVConfig,
  getActiveTTSConfig,
} from '../store/globalStore';
import type { ChannelKind } from './registry.types';
import { usePluginStore } from '../store/pluginStore';
import { createSandboxedFetch } from '../services/plugin/PluginSandbox';

// 从子目录导入类型和工厂
import { createLLMProvider, GeminiProvider, OpenAIProvider, ClaudeProvider } from './llm';
import type { LLMProvider } from './llm/types';
import { createTTIProvider, ComfyUIProvider } from './tti';
import type { TTIProvider, ImageResult, TTIOptions } from './tti/types';
import { createTTSProvider } from './tts';
import type { TTSProvider, AudioResult, TTSOptions } from './tts/types';
import { createITVProvider as createITVProviderFromConfig } from './itv';
import type { ITVProvider, ProgressInfo, ITVOptions } from './itv/types';

// 重新导出 ProviderManager
export { providerManager, ProviderManager, type ProviderKindMap } from './manager';

// 重新导出 Registry (类型可以静态导出)
export type {
  ChannelKind,
  ChannelCapability,
  ProviderDefinition,
  ProviderContext,
} from './registry.types';

// Registry 实例不再从这里导出，需要的文件直接从 './registry' 导入
// 这样可以避免 providers/index.ts 同时静态和动态导入 registry

// Registry 函数使用动态导入包装 (避免与 PluginAPI.ts 动态导入冲突)
export const listProviders = async (kind?: import('./registry.types').ChannelKind) => {
  const { listProviders: fn } = await import('./registry');
  return fn(kind);
};

export const registerProvider = async (def: import('./registry.types').ProviderDefinition<any>) => {
  const { registerProvider: fn } = await import('./registry');
  return fn(def);
};

export const unregisterProvider = async (kind: import('./registry.types').ChannelKind, type: string) => {
  const { unregisterProvider: fn } = await import('./registry');
  return fn(kind, type);
};

export const unregisterProvidersByPlugin = async (pluginId: string) => {
  const { unregisterProvidersByPlugin: fn } = await import('./registry');
  return fn(pluginId);
};

export const createProviderInstance = async <T>(
  kind: import('./registry.types').ChannelKind,
  type: string,
  config: Record<string, any>,
  ctx?: Partial<import('./registry.types').ProviderContext>
): Promise<T> => {
  const { createProviderInstance: fn } = await import('./registry');
  return fn<T>(kind, type, config, ctx);
};

// 重新导出子目录内容
export { createLLMProvider, GeminiProvider, OpenAIProvider, ClaudeProvider } from './llm';
export type { LLMProvider, ChatMessage } from './llm/types';
export { createTTIProvider, ComfyUIProvider } from './tti';
export type { TTIProvider, ImageResult, TTIOptions } from './tti/types';
export { createTTSProvider } from './tts';
export type { TTSProvider, AudioResult, TTSOptions } from './tts/types';
export { createITVProvider as createITVProviderFromConfig } from './itv';
export type { ITVProvider, ProgressInfo, ITVOptions } from './itv/types';

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

/**
 * 为插件渠道创建 Provider 上下文
 */
function createChannelProviderContext(channelConfig: ChannelConfig) {
  if (channelConfig.source === 'plugin') {
    if (!channelConfig.pluginId) {
      console.error(`[Provider] 插件渠道 ${channelConfig.name} 缺少 pluginId`);
      return null;
    }

    const plugin = usePluginStore.getState().getPlugin(channelConfig.pluginId);
    if (!plugin) {
      console.warn(`[Provider] 插件 ${channelConfig.pluginId} 未找到`);
      return null;
    }
    if (!plugin.isEnabled) {
      console.warn(`[Provider] 插件 ${channelConfig.pluginId} 已禁用`);
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
  const context = createChannelProviderContext(channelConfig);
  if (!context) return null;

  try {
    const { createProviderInstance: create } = await import('./registry');
    return create<T>(
      kind,
      channelConfig.providerType,
      channelConfig.providerConfig,
      context
    );
  } catch (err: any) {
    console.error(`[Provider] 创建插件 Provider 失败:`, err.message);
    return null;
  }
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

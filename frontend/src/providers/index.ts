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
} from '../types';
import type { LLMProvider, TTIProvider, TTSProvider, ITVProvider } from './types';
import { GeminiProvider } from './GeminiProvider';
import { OpenAIProvider } from './OpenAIProvider';
import { ComfyUITTIProvider } from './ComfyUIProvider';
import {
  getActiveLLMConfig,
  getActiveTTIConfig,
  getActiveITVConfig,
  getActiveTTSConfig,
} from '../store/globalStore';

// ========== LLM Provider 工厂 ==========

export function createLLMProvider(config: ModelConfig): LLMProvider {
  switch (config.provider) {
    case 'gemini':
      return new GeminiProvider(config);
    case 'openai':
      return new OpenAIProvider(config);
    default:
      throw new Error(`Unknown LLM provider: ${config.provider}`);
  }
}

// ========== TTI Provider 工厂 ==========

export function createTTIProvider(config: ModelConfig): TTIProvider {
  switch (config.provider) {
    case 'comfyui':
      return new ComfyUITTIProvider(config);
    // TODO: 添加 Midjourney、DALL-E 等 Provider
    default:
      throw new Error(`Unknown TTI provider: ${config.provider}`);
  }
}

// ========== TTS Provider 工厂 ==========

export function createTTSProvider(config: TTSConfig): TTSProvider {
  switch (config.provider) {
    case 'edge-tts':
      // TODO: Phase 2 实现
      throw new Error('Edge TTS provider not implemented yet');
    case 'openai-tts':
      // TODO: Phase 2 实现
      throw new Error('OpenAI TTS provider not implemented yet');
    default:
      throw new Error(`Unknown TTS provider: ${config.provider}`);
  }
}

// ========== ITV Provider 工厂 ==========

export function createITVProvider(config: ITVConfig): ITVProvider {
  switch (config.provider) {
    case 'runway':
      // TODO: Phase 2 实现
      throw new Error('Runway provider not implemented yet');
    case 'kling':
      // TODO: Phase 2 实现
      throw new Error('Kling provider not implemented yet');
    case 'comfyui-animatediff':
      // TODO: Phase 2 实现
      throw new Error('ComfyUI AnimateDiff provider not implemented yet');
    default:
      throw new Error(`Unknown ITV provider: ${config.provider}`);
  }
}

// ========== 从 AppSettings 创建 Provider ==========

export function createProvidersFromSettings(settings: AppSettings) {
  // 获取默认 LLM 配置
  const defaultLLMConfig = settings.llmConfigs.find(c => c.isDefault) || settings.llmConfigs[0];

  return {
    llm: defaultLLMConfig ? createLLMProvider({
      provider: defaultLLMConfig.provider === 'openai-compatible' ? 'openai' : defaultLLMConfig.provider as any,
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

// 校验 LLM 配置
export function validateLLMConfig(config: ModelConfig): ValidationResult {
  const errors: string[] = [];

  if (!config.provider) {
    errors.push('未选择 Provider');
  }

  if (!config.apiKey || config.apiKey.trim() === '') {
    errors.push('API Key 不能为空');
  }

  if (!config.modelName || config.modelName.trim() === '') {
    errors.push('模型名称不能为空');
  }

  return { valid: errors.length === 0, errors };
}

// 校验 TTI 配置
export function validateTTIConfig(config: ModelConfig): ValidationResult {
  const errors: string[] = [];

  if (!config.provider) {
    errors.push('未选择 TTI Provider');
  }

  if (config.provider === 'comfyui') {
    if (!config.baseUrl || config.baseUrl.trim() === '') {
      errors.push('ComfyUI 地址不能为空');
    }
  } else if (config.provider !== 'comfyui') {
    if (!config.apiKey || config.apiKey.trim() === '') {
      errors.push('API Key 不能为空');
    }
  }

  return { valid: errors.length === 0, errors };
}

// 校验 ITV 配置
export function validateITVConfig(config: ITVConfig): ValidationResult {
  const errors: string[] = [];

  if (!config.provider) {
    errors.push('未选择 ITV Provider');
  }

  if (config.provider && config.provider !== 'comfyui-animatediff') {
    if (!config.apiKey || config.apiKey.trim() === '') {
      errors.push('API Key 不能为空');
    }
  }

  return { valid: errors.length === 0, errors };
}

// 校验 TTS 配置
export function validateTTSConfig(config: TTSConfig): ValidationResult {
  const errors: string[] = [];

  if (!config.provider) {
    errors.push('未选择 TTS Provider');
  }

  // edge-tts 不需要 API Key
  if (config.provider && config.provider !== 'edge-tts' && config.provider !== 'gpt-sovits') {
    if (!config.apiKey || config.apiKey.trim() === '') {
      errors.push('API Key 不能为空');
    }
  }

  return { valid: errors.length === 0, errors };
}

// 校验全部配置
export function validateAllSettings(
  settings: AppSettings
): { llm: ValidationResult; tti: ValidationResult; itv: ValidationResult; tts: ValidationResult } {
  // 验证默认 LLM 配置
  const defaultLLMConfig = settings.llmConfigs?.find(c => c.isDefault) || settings.llmConfigs?.[0];
  const llmResult: ValidationResult = defaultLLMConfig
    ? validateLLMConfig({
        provider: defaultLLMConfig.provider === 'openai-compatible' ? 'openai' : defaultLLMConfig.provider as any,
        apiKey: defaultLLMConfig.apiKey,
        baseUrl: defaultLLMConfig.baseUrl,
        modelName: defaultLLMConfig.modelName,
      })
    : { valid: false, errors: ['未配置 LLM 模型'] };

  // 验证默认 TTI 配置
  const defaultTTIConfig = settings.ttiConfigs?.find(c => c.isDefault) || settings.ttiConfigs?.[0];
  const ttiResult: ValidationResult = defaultTTIConfig
    ? validateTTIConfig({
        provider: defaultTTIConfig.provider as any,
        apiKey: defaultTTIConfig.apiKey || '',
        baseUrl: defaultTTIConfig.baseUrl,
        modelName: defaultTTIConfig.modelName || '',
      })
    : { valid: false, errors: ['未配置 TTI 服务'] };

  // 验证默认 ITV 配置
  const defaultITVConfig = settings.itvConfigs?.find(c => c.isDefault) || settings.itvConfigs?.[0];
  const itvResult: ValidationResult = defaultITVConfig
    ? validateITVConfig({
        provider: defaultITVConfig.provider as any,
        apiKey: defaultITVConfig.apiKey,
        baseUrl: defaultITVConfig.baseUrl,
        defaultDuration: defaultITVConfig.defaultDuration,
      })
    : { valid: false, errors: ['未配置 ITV 服务'] };

  // 验证默认 TTS 配置
  const defaultTTSConfig = settings.ttsConfigs?.find(c => c.isDefault) || settings.ttsConfigs?.[0];
  const ttsResult: ValidationResult = defaultTTSConfig
    ? validateTTSConfig({
        provider: defaultTTSConfig.provider,
        apiKey: defaultTTSConfig.apiKey,
        defaultVoice: defaultTTSConfig.defaultVoice,
      })
    : { valid: false, errors: ['未配置 TTS 服务'] };

  return {
    llm: llmResult,
    tti: ttiResult,
    itv: itvResult,
    tts: ttsResult,
  };
}

// ========== 连接测试函数 ==========

export async function testLLMConnection(
  config: ModelConfig
): Promise<{ success: boolean; message: string }> {
  try {
    const provider = createLLMProvider(config);
    if (!provider.validate()) {
      return { success: false, message: '配置校验失败' };
    }
    const result = await provider.testConnection();
    return {
      success: result,
      message: result ? '连接成功' : '连接失败，请检查配置',
    };
  } catch (err: any) {
    return { success: false, message: err.message || '连接测试失败' };
  }
}

export async function testTTIConnection(
  config: ModelConfig
): Promise<{ success: boolean; message: string }> {
  try {
    const provider = createTTIProvider(config);
    if (!provider.validate()) {
      return { success: false, message: '配置校验失败' };
    }
    const result = await provider.testConnection();
    return {
      success: result,
      message: result ? '连接成功' : '连接失败，请检查配置',
    };
  } catch (err: any) {
    return { success: false, message: err.message || '连接测试失败' };
  }
}

// 导出 Provider 类
export { GeminiProvider } from './GeminiProvider';
export { OpenAIProvider } from './OpenAIProvider';
export { ComfyUITTIProvider } from './ComfyUIProvider';
export * from './types';

// ========== 项目级 Provider 工厂 ==========

/**
 * 根据 LLM 配置创建 Provider
 */
export function createLLMProviderFromConfig(config: LLMModelConfig): LLMProvider {
  const providerType = config.provider === 'openai-compatible' ? 'openai' : config.provider;
  return createLLMProvider({
    provider: providerType as any,
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
    modelName: config.modelName,
  });
}

/**
 * 根据 TTI 配置创建 Provider
 */
export function createTTIProviderFromConfig(config: TTIModelConfig): TTIProvider {
  return createTTIProvider({
    provider: config.provider as any,
    apiKey: config.apiKey || '',
    baseUrl: config.baseUrl,
    modelName: config.modelName || '',
  });
}

/**
 * 获取项目应使用的 LLM Provider
 * 优先使用项目指定的配置，否则使用全局默认
 */
export async function getProjectLLMProvider(projectLLMConfigId?: string): Promise<LLMProvider | null> {
  const config = await getActiveLLMConfig(projectLLMConfigId);
  if (!config) return null;
  return createLLMProviderFromConfig(config);
}

/**
 * 获取项目应使用的 TTI Provider
 */
export async function getProjectTTIProvider(projectTTIConfigId?: string): Promise<TTIProvider | null> {
  const config = await getActiveTTIConfig(projectTTIConfigId);
  if (!config) return null;
  return createTTIProviderFromConfig(config);
}

/**
 * 获取项目应使用的 ITV Provider
 */
export async function getProjectITVProvider(projectITVConfigId?: string): Promise<ITVProvider | null> {
  const config = await getActiveITVConfig(projectITVConfigId);
  if (!config) return null;
  // TODO: 实现具体的 ITV Provider 创建逻辑
  return createITVProvider({
    provider: config.provider as any,
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
    defaultDuration: config.defaultDuration,
    defaultResolution: config.defaultResolution,
  });
}

/**
 * 获取项目应使用的 TTS Provider
 */
export async function getProjectTTSProvider(projectTTSConfigId?: string): Promise<TTSProvider | null> {
  const config = await getActiveTTSConfig(projectTTSConfigId);
  if (!config) return null;
  // TODO: 实现具体的 TTS Provider 创建逻辑
  return createTTSProvider({
    provider: config.provider,
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
    defaultVoice: config.defaultVoice,
  });
}

/**
 * 获取项目的所有 Provider（批量获取）
 */
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

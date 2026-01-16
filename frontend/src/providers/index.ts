/**
 * Provider 工厂
 * 根据配置创建对应的 Provider 实例
 */
import type { AppSettings, ModelConfig, TTSConfig, ITVConfig, CustomLLMChannel } from '../types';
import type { LLMProvider, TTIProvider, TTSProvider, ITVProvider } from './types';
import { GeminiProvider } from './GeminiProvider';
import { OpenAIProvider } from './OpenAIProvider';
import { ComfyUITTIProvider } from './ComfyUIProvider';

// ========== LLM Provider 工厂 ==========

export function createLLMProvider(
  config: ModelConfig,
  customChannels?: CustomLLMChannel[]
): LLMProvider {
  switch (config.provider) {
    case 'gemini':
      return new GeminiProvider(config);
    case 'openai':
      return new OpenAIProvider(config);
    case 'custom': {
      // 使用自定义渠道
      if (!config.channelId || !customChannels) {
        throw new Error('Custom provider requires channelId and customChannels');
      }
      const channel = customChannels.find(c => c.id === config.channelId);
      if (!channel) {
        throw new Error(`Custom channel not found: ${config.channelId}`);
      }
      // 使用 OpenAI 兼容接口
      return new OpenAIProvider({
        ...config,
        apiKey: channel.apiKey,
        baseUrl: channel.baseUrl,
        modelName: config.modelName || channel.defaultModel || 'gpt-4',
      });
    }
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
  return {
    llm: createLLMProvider(settings.llm, settings.customChannels),
    // TTI/TTS/ITV 按需创建，因为可能未配置
  };
}

// ========== 配置校验函数 ==========

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

// 校验 LLM 配置
export function validateLLMConfig(
  config: ModelConfig,
  customChannels?: CustomLLMChannel[]
): ValidationResult {
  const errors: string[] = [];

  if (!config.provider) {
    errors.push('未选择 Provider');
  }

  if (config.provider === 'custom') {
    if (!config.channelId) {
      errors.push('未选择自定义渠道');
    } else if (!customChannels?.find(c => c.id === config.channelId)) {
      errors.push('选择的渠道不存在');
    }
  } else {
    if (!config.apiKey || config.apiKey.trim() === '') {
      errors.push('API Key 不能为空');
    }
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
  return {
    llm: validateLLMConfig(settings.llm, settings.customChannels),
    tti: validateTTIConfig(settings.tti),
    itv: validateITVConfig(settings.itv),
    tts: validateTTSConfig(settings.tts),
  };
}

// ========== 连接测试函数 ==========

export async function testLLMConnection(
  config: ModelConfig,
  customChannels?: CustomLLMChannel[]
): Promise<{ success: boolean; message: string }> {
  try {
    const provider = createLLMProvider(config, customChannels);
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

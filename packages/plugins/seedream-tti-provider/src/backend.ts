/**
 * Seedream TTI Provider - Backend Module
 * 在 Electron 后端注册 Provider，使用统一配置 API
 */

import type { ElectronPluginAPI, ProviderDefinition } from '@komastudio/plugin-sdk';

const MODEL_ID = 'doubao-seedream-4-0-250828';

interface SeedreamConfig {
  apiKey: string;
  baseUrl: string;
  sizeMode: 'preset' | 'custom';
  sizePreset: string;
  customWidth: number;
  customHeight: number;
  watermark: boolean;
}

const DEFAULT_CONFIG: SeedreamConfig = {
  apiKey: '',
  baseUrl: 'https://api.vectorengine.ai',
  sizeMode: 'preset',
  sizePreset: '2K',
  customWidth: 2048,
  customHeight: 2048,
  watermark: true,
};

const SIZE_PRESETS = [
  { value: '1K', width: 1024, height: 1024 },
  { value: '2K', width: 2048, height: 2048 },
  { value: '4K', width: 4096, height: 4096 },
];

interface GenerateOptions {
  prompt: string;
  negativePrompt?: string;
  width?: number;
  height?: number;
}

function resolveSize(config: SeedreamConfig, options?: { width?: number; height?: number }) {
  if (options?.width && options?.height) {
    return {
      size: `${options.width}x${options.height}`,
      width: options.width,
      height: options.height,
    };
  }
  if (config.sizeMode === 'custom') {
    return {
      size: `${config.customWidth}x${config.customHeight}`,
      width: config.customWidth,
      height: config.customHeight,
    };
  }
  const preset = SIZE_PRESETS.find(p => p.value === config.sizePreset);
  if (preset) {
    return { size: config.sizePreset, width: preset.width, height: preset.height };
  }
  return { size: '2K', width: 2048, height: 2048 };
}

function getAuthorization(apiKey: string): string {
  if (!apiKey) return '';
  if (apiKey.toLowerCase().startsWith('bearer ')) {
    return apiKey;
  }
  return `Bearer ${apiKey}`;
}

class SeedreamTTIProvider {
  private config: SeedreamConfig;

  constructor(config: Record<string, unknown>) {
    this.config = { ...DEFAULT_CONFIG, ...config } as SeedreamConfig;
  }

  validate(): boolean {
    return !!this.config.apiKey && !!this.config.baseUrl;
  }

  async generate(options: GenerateOptions): Promise<{ url: string; width: number; height: number }> {
    const { prompt, width, height } = options;

    if (!this.validate()) {
      throw new Error('API Key 未配置，请在插件设置中配置 Seedream API Key');
    }

    const baseUrl = this.config.baseUrl.replace(/\/+$/, '');
    const authorization = getAuthorization(this.config.apiKey);
    const { size, width: w, height: h } = resolveSize(this.config, { width, height });

    const body = {
      model: MODEL_ID,
      prompt,
      size,
      sequential_image_generation: 'disabled',
      stream: false,
      response_format: 'url',
      watermark: this.config.watermark,
    };

    const response = await fetch(`${baseUrl}/v1/images/generations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authorization,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`图像生成失败: ${errorText}`);
    }

    const data = await response.json();
    const imageUrl = data?.data?.[0]?.url;

    if (!imageUrl) {
      const apiError = data?.error?.message || data?.error || data?.message;
      throw new Error(apiError || '返回数据中未找到图像 URL');
    }

    return { url: imageUrl, width: w, height: h };
  }

  async testConnection(): Promise<boolean> {
    if (!this.validate()) return false;
    try {
      const baseUrl = this.config.baseUrl.replace(/\/+$/, '');
      const authorization = getAuthorization(this.config.apiKey);

      const response = await fetch(`${baseUrl}/v1/images/generations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': authorization,
        },
        body: JSON.stringify({
          model: MODEL_ID,
          prompt: 'test',
          size: '1K',
          stream: false,
        }),
      });
      return response.status !== 401 && response.status !== 403;
    } catch {
      return false;
    }
  }
}

// 插件 API 引用
let pluginApi: ElectronPluginAPI | null = null;

export async function onActivate(api: ElectronPluginAPI): Promise<void> {
  pluginApi = api;
  api.log.info('Seedream TTI Provider (backend) activated');

  // 注册 Provider
  const providerDef: ProviderDefinition = {
    type: 'seedream-tti',
    kind: 'tti',
    name: 'Seedream 文生图',
    description: '豆包 Seedream 4.0 文生图/图生图服务',
    capabilities: ['tti'],
    defaultConfig: DEFAULT_CONFIG,
    factory: async (config) => {
      // 通过统一 API 读取配置
      const savedConfig = await api.channels.getProviderConfig('seedream-tti');
      const mergedConfig = { ...DEFAULT_CONFIG, ...savedConfig, ...config };
      api.log.info('Creating provider with config:', { hasApiKey: !!mergedConfig.apiKey });
      return new SeedreamTTIProvider(mergedConfig);
    },
  };

  await api.channels.registerProvider(providerDef);
}

export async function onDeactivate(): Promise<void> {
  pluginApi = null;
}

// Provider 工厂函数
export function createProvider(config: Record<string, unknown>): SeedreamTTIProvider {
  return new SeedreamTTIProvider(config);
}

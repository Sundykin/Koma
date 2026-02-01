/**
 * SCDN Image Hosting Provider - Backend Module
 * 在 Electron 后端注册图床 Provider
 */

import type { ElectronPluginAPI } from '@komastudio/plugin-sdk';

// 图床配置
interface SCDNImageHostingConfig {
  enabled: boolean;
  apiEndpoint: string;
  outputFormat: 'auto' | 'jpeg' | 'png' | 'webp' | 'gif' | 'webp_animated';
  cdnDomain: string;
}

const DEFAULT_CONFIG: SCDNImageHostingConfig = {
  enabled: false,
  apiEndpoint: 'https://img.scdn.io/api/v1.php',
  outputFormat: 'webp',
  cdnDomain: '',
};

// 上传结果
interface UploadResult {
  success: boolean;
  url?: string;
  error?: string;
  data?: {
    filename: string;
    originalSize: number;
    compressedSize: number;
    compressionRatio: number;
  };
}

/**
 * SCDN 图床 Provider
 */
class SCDNImageHostingProvider {
  private config: SCDNImageHostingConfig;

  constructor(config: Record<string, unknown>) {
    this.config = { ...DEFAULT_CONFIG, ...config } as SCDNImageHostingConfig;
  }

  validate(): boolean {
    return this.config.enabled && !!this.config.apiEndpoint;
  }

  /**
   * 上传图片
   */
  async uploadImage(
    imageData: Buffer | ArrayBuffer,
    options?: { filename?: string; outputFormat?: string; cdnDomain?: string }
  ): Promise<UploadResult> {
    if (!this.validate()) {
      return {
        success: false,
        error: '图床未启用或未配置',
      };
    }

    try {
      // 构建 FormData
      const FormData = (await import('form-data')).default;
      const formData = new FormData();

      // 添加图片数据
      const filename = options?.filename || `image_${Date.now()}.png`;
      formData.append('image', Buffer.from(imageData as ArrayBuffer), {
        filename,
        contentType: 'image/png',
      });

      // 输出格式
      const outputFormat = options?.outputFormat || this.config.outputFormat || 'auto';
      formData.append('outputFormat', outputFormat);

      // CDN 域名
      const cdnDomain = options?.cdnDomain || this.config.cdnDomain;
      if (cdnDomain) {
        formData.append('cdn_domain', cdnDomain);
      }

      // 发送请求
      const fetch = (await import('node-fetch')).default;
      const response = await fetch(this.config.apiEndpoint, {
        method: 'POST',
        body: formData as any,
        headers: formData.getHeaders(),
      });

      const result = await response.json() as any;

      if (result.success) {
        return {
          success: true,
          url: result.url,
          data: result.data,
        };
      } else {
        return {
          success: false,
          error: result.message || '上传失败',
        };
      }
    } catch (err: any) {
      console.error('[SCDN] Upload error:', err);
      return {
        success: false,
        error: err.message || '网络请求失败',
      };
    }
  }

  /**
   * 带重试的上传
   */
  async uploadWithRetry(
    imageData: Buffer | ArrayBuffer,
    options?: { filename?: string; outputFormat?: string; cdnDomain?: string },
    maxRetries: number = 3
  ): Promise<UploadResult> {
    let lastError = '';

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      console.log(`[SCDN] 上传尝试 ${attempt}/${maxRetries}`);

      const result = await this.uploadImage(imageData, options);

      if (result.success) {
        console.log(`[SCDN] 上传成功:`, result.url);
        return result;
      }

      lastError = result.error || '未知错误';
      console.warn(`[SCDN] 上传失败 (尝试 ${attempt}):`, lastError);

      if (attempt < maxRetries) {
        const waitTime = 1000 * Math.pow(2, attempt - 1);
        console.log(`[SCDN] 等待 ${waitTime}ms 后重试...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }

    return {
      success: false,
      error: `上传失败，已重试 ${maxRetries} 次: ${lastError}`,
    };
  }

  /**
   * 测试连接
   */
  async testConnection(): Promise<boolean> {
    if (!this.config.apiEndpoint) return false;

    try {
      // 创建一个 1x1 透明 PNG 测试图片
      const testImageBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
      const testBuffer = Buffer.from(testImageBase64, 'base64');

      const result = await this.uploadImage(testBuffer, { filename: 'test.png' });
      return result.success;
    } catch {
      return false;
    }
  }
}

// 插件 API 引用
let pluginApi: ElectronPluginAPI | null = null;

export async function onActivate(api: ElectronPluginAPI): Promise<void> {
  pluginApi = api;
  api.log.info('SCDN Image Hosting Provider (backend) activated');

  // 注册图床 Provider
  const providerDef = {
    type: 'scdn-image-hosting',
    kind: 'image-hosting' as const,
    name: 'SCDN 图床',
    description: 'SCDN 图床服务，支持图片上传并获取远程 URL',
    capabilities: ['image-hosting'],
    defaultConfig: DEFAULT_CONFIG,
    factory: async (config: Record<string, unknown>) => {
      const savedConfig = await api.channels.getProviderConfig('scdn-image-hosting');
      const mergedConfig = { ...DEFAULT_CONFIG, ...savedConfig, ...config };
      api.log.info('Creating image hosting provider with config:', { enabled: mergedConfig.enabled });
      return new SCDNImageHostingProvider(mergedConfig);
    },
  };

  await api.channels.registerProvider(providerDef as any);
}

export async function onDeactivate(): Promise<void> {
  pluginApi = null;
}

// Provider 工厂函数
export function createProvider(config: Record<string, unknown>): SCDNImageHostingProvider {
  return new SCDNImageHostingProvider(config);
}

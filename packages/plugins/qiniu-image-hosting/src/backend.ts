/**
 * 七牛云图床 Provider - Backend Module
 * 使用 new-api 上传接口，API Key 即激活 Key
 */

import type { ElectronPluginAPI } from '@komastudio/plugin-sdk';

interface QiniuConfig {
  enabled: boolean;
  apiEndpoint: string;
  apiKey: string; // 激活 key (new-api 的 sk-xxx)
}

const DEFAULT_CONFIG: QiniuConfig = {
  enabled: true,
  apiEndpoint: 'http://192.227.192.228:3000/v1/uploads/image',
  apiKey: 'sk-I5kyGgOb0ie9PGclXHYZEzkZrzoDIVXeXrkcgX7uWj8B584B',
};

interface UploadResult {
  success: boolean;
  url?: string;
  error?: string;
  data?: {
    filename?: string;
    key?: string;
    hash?: string;
    size?: number;
  };
}

class QiniuImageHostingProvider {
  private config: QiniuConfig;

  constructor(config: Record<string, unknown>) {
    this.config = { ...DEFAULT_CONFIG, ...config } as QiniuConfig;
  }

  validate(): boolean {
    return Boolean(this.config.enabled && this.config.apiEndpoint && this.config.apiKey);
  }

  async uploadImage(
    imageData: Buffer | ArrayBuffer | Uint8Array,
    options?: { filename?: string; mimeType?: string }
  ): Promise<UploadResult> {
    if (!this.validate()) {
      return { success: false, error: '图床未启用或未配置 apiKey' };
    }

    try {
      const filename = options?.filename || `image_${Date.now()}.png`;
      const mimeType = options?.mimeType || this.guessMime(filename);

      const bytes = this.toUint8Array(imageData);
      const blob = new Blob([bytes], { type: mimeType });

      const formData = new FormData();
      formData.append('file', blob, filename);

      const resp = await fetch(this.config.apiEndpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
        },
        body: formData,
      });

      const result = (await resp.json()) as any;

      if (result?.success && result?.data?.url) {
        return {
          success: true,
          url: result.data.url,
          data: {
            filename: result.data.filename,
            key: result.data.key,
            hash: result.data.hash,
            size: result.data.size,
          },
        };
      }
      return {
        success: false,
        error: result?.message || `上传失败 (HTTP ${resp.status})`,
      };
    } catch (err: any) {
      return { success: false, error: err?.message || '网络请求失败' };
    }
  }

  async uploadWithRetry(
    imageData: Buffer | ArrayBuffer | Uint8Array,
    options?: { filename?: string; mimeType?: string },
    maxRetries: number = 3
  ): Promise<UploadResult> {
    let lastError = '';
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const r = await this.uploadImage(imageData, options);
      if (r.success) return r;
      lastError = r.error || '未知错误';
      if (attempt < maxRetries) {
        await new Promise((rs) => setTimeout(rs, 1000 * Math.pow(2, attempt - 1)));
      }
    }
    return { success: false, error: `上传失败，已重试 ${maxRetries} 次: ${lastError}` };
  }

  async testConnection(): Promise<boolean> {
    if (!this.config.apiEndpoint || !this.config.apiKey) return false;
    try {
      // 1x1 透明 png
      const testBase64 =
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
      const buf = Buffer.from(testBase64, 'base64');
      const r = await this.uploadImage(buf, { filename: 'koma-qiniu-test.png' });
      return r.success;
    } catch {
      return false;
    }
  }

  private toUint8Array(data: Buffer | ArrayBuffer | Uint8Array): Uint8Array {
    if (data instanceof Uint8Array) return data;
    if (data instanceof ArrayBuffer) return new Uint8Array(data);
    return new Uint8Array(Buffer.from(data as any));
  }

  private guessMime(filename: string): string {
    const ext = filename.split('.').pop()?.toLowerCase() || '';
    const map: Record<string, string> = {
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      gif: 'image/gif',
      webp: 'image/webp',
      bmp: 'image/bmp',
      svg: 'image/svg+xml',
      heic: 'image/heic',
      ico: 'image/x-icon',
    };
    return map[ext] || 'image/png';
  }
}

let pluginApi: ElectronPluginAPI | null = null;

export async function onActivate(api: ElectronPluginAPI): Promise<void> {
  pluginApi = api;
  api.log.info('[Qiniu Image Hosting] backend activated');

  const providerDef = {
    type: 'qiniu-image-hosting',
    kind: 'image-hosting' as const,
    name: '七牛云图床（内置）',
    description: '基于 new-api 上传接口的七牛云图床，支持时间戳防盗链',
    capabilities: ['image-hosting'],
    defaultConfig: DEFAULT_CONFIG,
    factory: async (config: Record<string, unknown>) => {
      const saved = await api.channels.getProviderConfig('qiniu-image-hosting');
      const merged = { ...DEFAULT_CONFIG, ...saved, ...config };
      api.log.info('[Qiniu] create provider', { enabled: merged.enabled, hasApiKey: !!merged.apiKey });
      return new QiniuImageHostingProvider(merged);
    },
  };

  await api.channels.registerProvider(providerDef as any);
}

export async function onDeactivate(): Promise<void> {
  pluginApi = null;
}

export function createProvider(config: Record<string, unknown>): QiniuImageHostingProvider {
  return new QiniuImageHostingProvider(config);
}

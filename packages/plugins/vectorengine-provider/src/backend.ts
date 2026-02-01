/**
 * VectorEngine ITV Provider - Backend Module
 * 在 Electron 后端注册 Provider，使用统一配置 API
 */

import type { ElectronPluginAPI, ProviderDefinition } from '@komastudio/plugin-sdk';

interface VectorEngineConfig {
  apiKey: string;
  baseUrl: string;
  defaultModel: string;
  defaultOrientation: 'portrait' | 'landscape';
  defaultSize: 'small' | 'large';
  defaultDuration: number;
  watermark: boolean;
}

const DEFAULT_CONFIG: VectorEngineConfig = {
  apiKey: '',
  baseUrl: 'https://api.vectorengine.ai',
  defaultModel: 'sora-2-all',
  defaultOrientation: 'landscape',
  defaultSize: 'small',
  defaultDuration: 10,
  watermark: true,
};

interface GenerateVideoInput {
  imageUrl?: string;
  prompt: string;
  options?: {
    duration?: number;
    orientation?: 'portrait' | 'landscape';
    size?: 'small' | 'large';
  };
}

interface ProgressInfo {
  taskId: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  progress: number;
  resultUrl?: string;
  error?: string;
}

interface CharacterExtractionParams {
  url?: string;
  fromTask?: string;
  timestamps: string;
  model?: string;
}

function getAuthorization(apiKey: string): string {
  if (!apiKey) return '';
  if (apiKey.toLowerCase().startsWith('bearer ')) {
    return apiKey;
  }
  return `Bearer ${apiKey}`;
}

class VectorEngineITVProvider {
  private config: VectorEngineConfig;

  constructor(config: Record<string, unknown>) {
    this.config = { ...DEFAULT_CONFIG, ...config } as VectorEngineConfig;
  }

  validate(): boolean {
    return !!this.config.apiKey && !!this.config.baseUrl;
  }

  async testConnection(): Promise<boolean> {
    if (!this.validate()) return false;
    try {
      const baseUrl = this.config.baseUrl.replace(/\/+$/, '');
      const authorization = getAuthorization(this.config.apiKey);

      const response = await fetch(`${baseUrl}/v1/video/query?id=test`, {
        method: 'GET',
        headers: { 'Authorization': authorization },
      });
      return response.status !== 401 && response.status !== 403;
    } catch {
      return false;
    }
  }

  async generateVideo(input: GenerateVideoInput): Promise<{ url: string; taskId: string }> {
    if (!this.validate()) {
      throw new Error('API Key 未配置');
    }

    const baseUrl = this.config.baseUrl.replace(/\/+$/, '');
    const authorization = getAuthorization(this.config.apiKey);
    const { prompt, imageUrl, options } = input;

    const response = await fetch(`${baseUrl}/v1/video/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authorization,
      },
      body: JSON.stringify({
        images: imageUrl ? [imageUrl] : [],
        model: this.config.defaultModel,
        orientation: options?.orientation || this.config.defaultOrientation,
        prompt,
        size: options?.size || this.config.defaultSize,
        duration: options?.duration || this.config.defaultDuration,
        watermark: this.config.watermark,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`视频生成失败: ${errorText}`);
    }

    const data = await response.json();
    const taskId = data.id;

    // 轮询等待完成
    const polling = { interval: 5000, maxDuration: 600000, initialDelay: 3000 };
    const startTime = Date.now();

    await this.delay(polling.initialDelay);

    while (Date.now() - startTime < polling.maxDuration) {
      const progress = await this.checkProgress(taskId);

      if (progress.status === 'completed' && progress.resultUrl) {
        return { url: progress.resultUrl, taskId };
      }

      if (progress.status === 'failed') {
        throw new Error(progress.error || '视频生成失败');
      }

      await this.delay(polling.interval);
    }

    throw new Error('视频生成超时');
  }

  async checkProgress(taskId: string): Promise<ProgressInfo> {
    const baseUrl = this.config.baseUrl.replace(/\/+$/, '');
    const authorization = getAuthorization(this.config.apiKey);

    const response = await fetch(`${baseUrl}/v1/video/query?id=${taskId}`, {
      method: 'GET',
      headers: { 'Authorization': authorization },
    });

    if (!response.ok) {
      return { taskId, status: 'failed', progress: 0, error: '查询失败' };
    }

    const data = await response.json();

    const statusMap: Record<string, ProgressInfo['status']> = {
      'pending': 'queued',
      'queued': 'queued',
      'processing': 'processing',
      'in_progress': 'processing',
      'completed': 'completed',
      'succeeded': 'completed',
      'failed': 'failed',
      'error': 'failed',
    };

    return {
      taskId,
      status: statusMap[data.status] || 'processing',
      progress: data.detail?.pending_info?.progress_pct || 0,
      resultUrl: data.video_url,
      error: data.detail?.failure_reason,
    };
  }

  async extractCharacter(params: CharacterExtractionParams): Promise<string> {
    if (!params.url && !params.fromTask) {
      throw new Error('必须提供 url 或 fromTask 参数');
    }

    const baseUrl = this.config.baseUrl.replace(/\/+$/, '');
    const authorization = getAuthorization(this.config.apiKey);

    const body: Record<string, unknown> = { timestamps: params.timestamps };
    if (params.url) {
      body.url = params.url;
    } else if (params.fromTask) {
      body.from_task = params.fromTask;
    }

    const response = await fetch(`${baseUrl}/sora/v1/characters`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authorization,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`角色提取失败: ${errorText}`);
    }

    const data = await response.json();
    return data.id;
  }

  async checkCharacterProgress(taskId: string): Promise<ProgressInfo & { characters?: unknown[] }> {
    const baseUrl = this.config.baseUrl.replace(/\/+$/, '');
    const authorization = getAuthorization(this.config.apiKey);

    const response = await fetch(`${baseUrl}/sora/v1/characters/${taskId}`, {
      method: 'GET',
      headers: { 'Authorization': authorization },
    });

    if (!response.ok) {
      return { taskId, status: 'failed', progress: 0, error: '查询失败' };
    }

    const data = await response.json();

    const statusMap: Record<string, ProgressInfo['status']> = {
      'pending': 'queued',
      'queued': 'queued',
      'processing': 'processing',
      'in_progress': 'processing',
      'completed': 'completed',
      'succeeded': 'completed',
      'failed': 'failed',
      'error': 'failed',
    };

    const result: ProgressInfo & { characters?: unknown[] } = {
      taskId,
      status: statusMap[data.status] || 'processing',
      progress: data.progress || 0,
    };

    if (data.status === 'completed' || data.status === 'succeeded') {
      const chars = data.characters || data.result?.characters || data.data?.characters;
      if (chars) {
        result.characters = chars.map((c: any) => ({
          id: c.id,
          username: c.username || c.name,
          displayName: c.display_name || c.displayName,
          avatarUrl: c.avatar_url || c.avatarUrl,
        }));
      }
    }

    if (data.error) {
      result.error = data.error.message || data.error;
    }

    return result;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// 插件 API 引用
let pluginApi: ElectronPluginAPI | null = null;

export async function onActivate(api: ElectronPluginAPI): Promise<void> {
  pluginApi = api;
  api.log.info('VectorEngine ITV Provider (backend) activated');

  // 注册 Provider
  const providerDef: ProviderDefinition = {
    type: 'vectorengine',
    kind: 'itv',
    name: 'VectorEngine (Sora-2)',
    description: 'VectorEngine.ai 视频生成服务 - 支持图生视频和角色提取',
    capabilities: ['itv', 'character-extract'],
    defaultConfig: DEFAULT_CONFIG,
    factory: async (config) => {
      // 通过统一 API 读取配置
      const savedConfig = await api.channels.getProviderConfig('vectorengine');
      const mergedConfig = { ...DEFAULT_CONFIG, ...savedConfig, ...config };
      api.log.info('Creating provider with config:', { hasApiKey: !!mergedConfig.apiKey });
      return new VectorEngineITVProvider(mergedConfig);
    },
  };

  await api.channels.registerProvider(providerDef);
}

export async function onDeactivate(): Promise<void> {
  pluginApi = null;
}

// Provider 工厂函数
export function createProvider(config: Record<string, unknown>): VectorEngineITVProvider {
  return new VectorEngineITVProvider(config);
}

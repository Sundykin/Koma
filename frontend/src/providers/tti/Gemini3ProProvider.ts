/**
 * Gemini-3-Pro TTI Provider
 * toapis.com 的 gemini-3-pro-image-preview 文生图服务
 */
import type { TTIModelConfig, ProviderStartResult, ProviderTaskSnapshot } from '../../types';
import type { TTIProvider, TTIOptions, TTIRequest, ImageResult } from './types';
import { safeFetch } from '../../utils/safeFetch';
import { resolveTTISize } from './utils/ttiSize';

// API 响应类型
interface Gemini3ProCreateResponse {
  id: string;
  object: string;
  model: string;
  status: 'queued' | 'in_progress' | 'completed' | 'failed';
  progress: number;
  created_at: number;
  metadata?: Record<string, any>;
}

interface Gemini3ProTaskResponse {
  id: string;
  object: string;
  model: string;
  status: 'queued' | 'in_progress' | 'completed' | 'failed';
  progress: number;
  created_at: number;
  completed_at?: number;
  expires_at?: number;
  result?: {
    type: string;
    data: Array<{
      url: string;
      revised_prompt?: string;
    }>;
  };
  error?: {
    code: string;
    message: string;
  };
}

export class Gemini3ProProvider implements TTIProvider {
  type = 'gemini-3-pro' as const;
  config: TTIModelConfig;

  constructor(config: TTIModelConfig) {
    this.config = config;
  }

  private getModelName(): string {
    const value = String(this.config.modelName || '').trim();
    if (!value) {
      throw new Error('模型名称未配置');
    }
    return value;
  }

  private getBaseUrl(): string {
    return this.config.baseUrl || 'https://toapis.com';
  }

  private getHeaders(): Record<string, string> {
    if (this.config.profileId) {
      return {
        'x-koma-channel-id': this.config.profileId,
        'Content-Type': 'application/json',
      };
    }
    return {
      'Authorization': `Bearer ${this.config.apiKey || ''}`,
      'Content-Type': 'application/json',
    };
  }

  private getAuthOnlyHeaders(): Record<string, string> {
    if (this.config.profileId) {
      return { 'x-koma-channel-id': this.config.profileId };
    }
    return { 'Authorization': `Bearer ${this.config.apiKey || ''}` };
  }

  validate(): boolean {
    const hasCredentialRef = Boolean(this.config.profileId) || Boolean(this.config.apiKey);
    return hasCredentialRef && Boolean(String(this.config.modelName || '').trim());
  }

  async testConnection(): Promise<boolean> {
    if (!this.validate()) return false;

    try {
      // 使用简单的请求测试连接
      const response = await safeFetch(`${this.getBaseUrl()}/v1/images/generations`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          model: this.getModelName(),
          prompt: 'test',
          n: 1,
        }),
      });
      // 只要能收到响应就算连接成功（即使是错误响应）
      return response.status !== 401 && response.status !== 403;
    } catch {
      return false;
    }
  }

  /**
   * 创建图片生成任务
   */
  async start(request: TTIRequest): Promise<ProviderStartResult<ImageResult>> {
    if (!this.config.apiKey && !this.config.profileId) {
      throw new Error('API Key 未配置');
    }
    if (!String(this.config.modelName || '').trim()) {
      throw new Error('模型名称未配置');
    }

    const options: TTIOptions | undefined = request.options;
    const body: Record<string, any> = {
      model: this.getModelName(),
      prompt: request.prompt,
      n: 1,
    };

    // OpenAI-compatible image APIs expect WxH size, not raw aspect ratio.
    const size = resolveTTISize(options, this.config.defaultSize);
    if (size) {
      body.size = size;
    }

    // 参考图（图生图）
    if (request.references && request.references.length > 0) {
      body.image_urls = request.references.map(item => ({ url: item.value }));
    }

    const response = await safeFetch(`${this.getBaseUrl()}/v1/images/generations`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`创建任务失败: ${errorText}`);
    }

    const data: Gemini3ProCreateResponse = await response.json();
    return { mode: 'async', taskId: data.id };
  }

  /**
   * 轮询任务状态
   */
  async getTaskSnapshot(taskId: string): Promise<ProviderTaskSnapshot<ImageResult>> {
    const response = await safeFetch(`${this.getBaseUrl()}/v1/images/generations/${taskId}`, {
      method: 'GET',
      headers: this.getAuthOnlyHeaders(),
    });

    if (!response.ok) {
      return {
        state: 'failed',
        progress: 0,
        error: '查询失败',
      };
    }

    const data: Gemini3ProTaskResponse = await response.json();

    const stateMap: Record<string, ProviderTaskSnapshot<ImageResult>['state']> = {
      queued: 'queued',
      in_progress: 'running',
      completed: 'succeeded',
      failed: 'failed',
    };

    const snapshot: ProviderTaskSnapshot<ImageResult> = {
      state: stateMap[data.status] || 'running',
      progress: data.progress || 0,
    };

    if (data.status === 'completed' && data.result?.data?.[0]?.url) {
      snapshot.output = { path: data.result.data[0].url };
    }

    if (data.status === 'failed' && data.error) {
      snapshot.error = data.error.message || '任务失败';
    }

    return snapshot;
  }
}

/**
 * Gemini-3-Pro TTI Provider
 * toapis.com 的 gemini-3-pro-image-preview 文生图服务
 */
import type { TTIModelConfig, ProgressInfo } from '../../types';
import type { TTIProvider, TTIOptions } from './types';

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

  private getBaseUrl(): string {
    return this.config.baseUrl || 'https://toapis.com';
  }

  private getHeaders(): Record<string, string> {
    return {
      'Authorization': `Bearer ${this.config.apiKey || ''}`,
      'Content-Type': 'application/json',
    };
  }

  validate(): boolean {
    return !!this.config.apiKey;
  }

  async testConnection(): Promise<boolean> {
    if (!this.validate()) return false;

    try {
      // 使用简单的请求测试连接
      const response = await fetch(`${this.getBaseUrl()}/v1/images/generations`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          model: 'gemini-3-pro-image-preview',
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
   * @returns taskId 用于轮询结果
   */
  async generateImage(prompt: string, options?: TTIOptions): Promise<string> {
    if (!this.validate()) {
      throw new Error('API Key 未配置');
    }

    const body: Record<string, any> = {
      model: this.config.modelName || 'gemini-3-pro-image-preview',
      prompt,
      n: 1,
    };

    // 尺寸比例
    if (options?.aspectRatio) {
      body.size = options.aspectRatio;
    }

    // 参考图（图生图）
    if (options?.imageUrls && options.imageUrls.length > 0) {
      body.image_urls = options.imageUrls.map(url => ({ url }));
    }

    const response = await fetch(`${this.getBaseUrl()}/v1/images/generations`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`创建任务失败: ${errorText}`);
    }

    const data: Gemini3ProCreateResponse = await response.json();
    return data.id;
  }

  /**
   * 轮询任务状态
   */
  async checkProgress(taskId: string): Promise<ProgressInfo> {
    const response = await fetch(`${this.getBaseUrl()}/v1/images/generations/${taskId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${this.config.apiKey || ''}`,
      },
    });

    if (!response.ok) {
      return {
        taskId,
        status: 'failed',
        progress: 0,
        error: '查询失败',
      };
    }

    const data: Gemini3ProTaskResponse = await response.json();

    const stateMap: Record<string, ProgressInfo['status']> = {
      'queued': 'queued',
      'in_progress': 'processing',
      'completed': 'completed',
      'failed': 'failed',
    };

    const result: ProgressInfo = {
      taskId,
      status: stateMap[data.status] || 'processing',
      progress: data.progress || 0,
    };

    if (data.status === 'completed' && data.result?.data?.[0]?.url) {
      result.resultUrl = data.result.data[0].url;
    }

    if (data.status === 'failed' && data.error) {
      result.error = data.error.message || '任务失败';
    }

    return result;
  }
}

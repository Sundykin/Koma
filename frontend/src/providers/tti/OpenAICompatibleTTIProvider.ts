/**
 * OpenAI-Compatible TTI Provider
 * 兼容 OpenAI /v1/images/generations 接口的自定义文生图服务
 * 支持 url 和 b64_json 两种返回格式
 */
import type { TTIModelConfig, ProgressInfo } from '../../types';
import type { TTIProvider, TTIOptions, ImageResult } from './types';

interface ImageData {
  url?: string;
  b64_json?: string;
  revised_prompt?: string;
}

interface CreateResponse {
  id?: string;
  created?: number;
  // 异步模式字段
  status?: 'queued' | 'in_progress' | 'completed' | 'failed';
  progress?: number;
  // 同步模式：直接返回结果
  data?: ImageData[];
}

interface TaskResponse {
  id: string;
  status: 'queued' | 'in_progress' | 'completed' | 'failed';
  progress: number;
  result?: {
    type: string;
    data: ImageData[];
  };
  data?: ImageData[];
  error?: {
    code: string;
    message: string;
  };
}

export class OpenAICompatibleTTIProvider implements TTIProvider {
  type = 'openai-compatible-tti' as const;
  config: TTIModelConfig;

  constructor(config: TTIModelConfig) {
    this.config = config;
  }

  private getBaseUrl(): string {
    return (this.config.baseUrl || '').replace(/\/+$/, '');
  }

  private getHeaders(): Record<string, string> {
    return {
      'Authorization': `Bearer ${this.config.apiKey || ''}`,
      'Content-Type': 'application/json',
    };
  }

  validate(): boolean {
    return !!this.config.apiKey && !!this.config.baseUrl;
  }

  async testConnection(): Promise<boolean> {
    if (!this.validate()) return false;

    try {
      const response = await fetch(`${this.getBaseUrl()}/v1/models`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.config.apiKey || ''}`,
        },
      });
      return response.status !== 401 && response.status !== 403;
    } catch {
      return false;
    }
  }

  /**
   * 从 ImageData 中提取可用的图片 URL
   * 支持 url 和 b64_json 两种格式
   */
  private extractImageUrl(item: ImageData): string | null {
    if (item.url) {
      return item.url;
    }
    if (item.b64_json) {
      return `data:image/jpeg;base64,${item.b64_json}`;
    }
    return null;
  }

  /**
   * 生成图片
   * 同步返回（直接拿到结果）或异步（返回 taskId 轮询）
   */
  async generateImage(prompt: string, options?: TTIOptions): Promise<ImageResult | string> {
    if (!this.validate()) {
      throw new Error('API Key 或 API 地址未配置');
    }

    const body: Record<string, any> = {
      model: this.config.modelName || 'dall-e-3',
      prompt,
      n: 1,
    };

    if (options?.aspectRatio) {
      body.size = options.aspectRatio;
    }

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

    const data: CreateResponse = await response.json();

    // 同步模式：响应中直接包含图片数据
    if (data.data?.[0]) {
      const imageUrl = this.extractImageUrl(data.data[0]);
      if (imageUrl) {
        // 返回 ImageResult，path 存放 URL/data URL，下游 saveImage 会处理
        return {
          path: imageUrl,
          url: imageUrl,
          width: 0,
          height: 0,
        };
      }
    }

    // 异步模式：返回 taskId
    if (data.id) {
      return data.id;
    }

    throw new Error('API 返回了无法识别的响应格式');
  }

  /**
   * 轮询任务状态（异步模式）
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

    const data: TaskResponse = await response.json();

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

    if (data.status === 'completed') {
      const items = data.result?.data || data.data;
      if (items?.[0]) {
        const url = this.extractImageUrl(items[0]);
        if (url) {
          result.resultUrl = url;
        }
      }
    }

    if (data.status === 'failed' && data.error) {
      result.error = data.error.message || '任务失败';
    }

    return result;
  }
}

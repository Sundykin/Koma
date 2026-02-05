/**
 * Nano-Banana TTI Provider
 * 官方文生图服务
 */
import type { TTIModelConfig, ProgressInfo } from '../../types';
import type { TTIProvider, TTIOptions } from './types';

// API 响应类型
interface NanoBananaResponse {
  code: number;
  msg: string;
  data: {
    task_id: string;
  };
}

interface NanoBananaTaskResponse {
  code: number;
  msg: string;
  data: {
    task_id: string;
    state: 'pending' | 'running' | 'succeeded' | 'failed';
    data?: {
      images: Array<{ url: string; file_name: string }>;
      description?: string;
    };
    msg?: string;
  };
}

interface BalanceResponse {
  code: number;
  msg: string;
  data?: {
    balance: number;
  };
}

export class NanoBananaProvider implements TTIProvider {
  type = 'nano-banana' as const;
  config: TTIModelConfig;

  constructor(config: TTIModelConfig) {
    this.config = config;
  }

  private getBaseUrl(): string {
    return this.config.baseUrl || 'http://ai.hsxbk.top';
  }

  private getHeaders(): Record<string, string> {
    return {
      'Authorization': this.config.apiKey || '',
      'Content-Type': 'application/json',
    };
  }

  validate(): boolean {
    return !!this.config.apiKey;
  }

  async testConnection(): Promise<boolean> {
    if (!this.validate()) return false;

    try {
      const response = await fetch(`${this.getBaseUrl()}/api/user/balance`, {
        method: 'GET',
        headers: { 'Authorization': this.config.apiKey || '' },
      });
      const data: BalanceResponse = await response.json();
      return data.code === 200;
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
      model: this.config.modelName || 'gemini-2.5-pro-image-preview',
      prompt,
    };

    // 可选参数
    if (options?.aspectRatio) {
      body.aspect_ratio = options.aspectRatio;
    }
    if (options?.imageSize) {
      body.image_size = options.imageSize;
    }
    if (options?.imageUrls && options.imageUrls.length > 0) {
      body.image_urls = options.imageUrls;
    }

    const response = await fetch(`${this.getBaseUrl()}/api/nano-banana`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(body),
    });

    const data: NanoBananaResponse = await response.json();

    if (data.code !== 200) {
      throw new Error(data.msg || '创建任务失败');
    }

    return data.data.task_id;
  }

  /**
   * 轮询任务状态
   */
  async checkProgress(taskId: string): Promise<ProgressInfo> {
    const response = await fetch(`${this.getBaseUrl()}/api/nano-banana/task/${taskId}`, {
      method: 'GET',
      headers: { 'Authorization': this.config.apiKey || '' },
    });

    const data: NanoBananaTaskResponse = await response.json();

    if (data.code !== 200) {
      return {
        taskId,
        status: 'failed',
        progress: 0,
        error: data.msg || '查询失败',
      };
    }

    const stateMap: Record<string, ProgressInfo['status']> = {
      'pending': 'queued',
      'running': 'processing',
      'succeeded': 'completed',
      'failed': 'failed',
    };

    const result: ProgressInfo = {
      taskId,
      status: stateMap[data.data.state] || 'processing',
      progress: data.data.state === 'succeeded' ? 100 : data.data.state === 'running' ? 50 : 0,
    };

    if (data.data.state === 'succeeded' && data.data.data?.images?.[0]?.url) {
      result.resultUrl = data.data.data.images[0].url;
    }

    if (data.data.state === 'failed') {
      result.error = data.data.msg || '任务失败';
    }

    return result;
  }
}

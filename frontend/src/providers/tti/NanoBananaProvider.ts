/**
 * Nano-Banana TTI Provider
 * 官方文生图服务
 */
import type { TTIModelConfig, ProviderStartResult, ProviderTaskSnapshot } from '../../types';
import type { TTIProvider, TTIOptions, TTIRequest, ImageResult } from './types';
import { safeFetch } from '../../utils/safeFetch';

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

  private getModelName(): string {
    const value = String(this.config.modelName || '').trim();
    if (!value) {
      throw new Error('模型名称未配置');
    }
    return value;
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
    return Boolean(this.config.apiKey && String(this.config.modelName || '').trim());
  }

  async testConnection(): Promise<boolean> {
    if (!this.validate()) return false;

    try {
      const response = await safeFetch(`${this.getBaseUrl()}/api/user/balance`, {
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
   */
  async start(request: TTIRequest): Promise<ProviderStartResult<ImageResult>> {
    if (!this.config.apiKey) {
      throw new Error('API Key 未配置');
    }
    if (!String(this.config.modelName || '').trim()) {
      throw new Error('模型名称未配置');
    }

    const options: TTIOptions | undefined = request.options;
    const body: Record<string, any> = {
      model: this.getModelName(),
      prompt: request.prompt,
    };

    // 可选参数
    if (options?.aspectRatio) {
      body.aspect_ratio = options.aspectRatio;
    }
    if (options?.imageSize) {
      body.image_size = options.imageSize;
    }
    if (request.references && request.references.length > 0) {
      body.image_urls = request.references.map(item => item.value);
    }

    const response = await safeFetch(`${this.getBaseUrl()}/api/nano-banana`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(body),
    });

    const data: NanoBananaResponse = await response.json();

    if (data.code !== 200) {
      throw new Error(data.msg || '创建任务失败');
    }

    return { mode: 'async', taskId: data.data.task_id };
  }

  /**
   * 轮询任务状态
   */
  async getTaskSnapshot(taskId: string): Promise<ProviderTaskSnapshot<ImageResult>> {
    const response = await safeFetch(`${this.getBaseUrl()}/api/nano-banana/task/${taskId}`, {
      method: 'GET',
      headers: { 'Authorization': this.config.apiKey || '' },
    });

    const data: NanoBananaTaskResponse = await response.json();

    if (data.code !== 200) {
      return {
        state: 'failed',
        progress: 0,
        error: data.msg || '查询失败',
      };
    }

    const stateMap: Record<string, ProviderTaskSnapshot<ImageResult>['state']> = {
      pending: 'queued',
      running: 'running',
      succeeded: 'succeeded',
      failed: 'failed',
    };

    const snapshot: ProviderTaskSnapshot<ImageResult> = {
      state: stateMap[data.data.state] || 'running',
      progress: data.data.state === 'succeeded' ? 100 : data.data.state === 'running' ? 50 : 0,
    };

    if (data.data.state === 'succeeded' && data.data.data?.images?.[0]?.url) {
      snapshot.output = { path: data.data.data.images[0].url };
    }

    if (data.data.state === 'failed') {
      snapshot.error = data.data.msg || '任务失败';
    }

    return snapshot;
  }
}

/**
 * OpenAI-Compatible TTI Provider
 * 兼容 OpenAI /v1/images/generations 接口的自定义文生图服务
 * 支持 url 和 b64_json 两种返回格式
 */
import type { TTIModelConfig, ProviderStartResult, ProviderTaskSnapshot } from '../../types';
import type { TTIProvider, TTIOptions, TTIRequest, ImageResult } from './types';
import { safeFetch } from '../../utils/safeFetch';
import { createLogger } from '../../store/logger';

const logger = createLogger('OpenAICompatibleTTI');

function sanitizeBodyForLog(body: Record<string, any>): Record<string, any> {
  const walk = (v: any): any => {
    if (typeof v === 'string') {
      if (v.startsWith('data:')) {
        return `${v.slice(0, 140)}...(data-url ${v.length} chars)`;
      }
      return v.length > 2000 ? `${v.slice(0, 800)}...(truncated, ${v.length} chars)` : v;
    }
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') {
      const out: Record<string, any> = {};
      for (const [k, val] of Object.entries(v)) out[k] = walk(val);
      return out;
    }
    return v;
  };
  return walk(body);
}

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

  private getModelName(): string {
    const value = String(this.config.modelName || '').trim();
    if (!value) {
      throw new Error('模型名称未配置');
    }
    return value;
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
    return Boolean(this.config.apiKey && this.config.baseUrl && String(this.config.modelName || '').trim());
  }

  async testConnection(): Promise<boolean> {
    if (!this.validate()) return false;

    try {
      const response = await safeFetch(`${this.getBaseUrl()}/v1/models`, {
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
  async start(request: TTIRequest): Promise<ProviderStartResult<ImageResult>> {
    if (!this.config.apiKey || !this.config.baseUrl) {
      throw new Error('API Key 或 API 地址未配置');
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

    if (options?.aspectRatio) {
      body.size = options.aspectRatio;
    }

    if (request.references && request.references.length > 0) {
      body.image_urls = request.references.map(item => ({ url: item.value }));
    }

    const protocol = (this.config as any)?.promptProtocol;
    const debugBody = Boolean(protocol) || (import.meta as any)?.env?.DEV === true;
    if (debugBody) {
      logger.info('TTI start request body', {
        provider: this.config.provider,
        ...(protocol ? { promptProtocol: protocol } : undefined),
        body: sanitizeBodyForLog(body),
      });
    }

    const response = await safeFetch(`${this.getBaseUrl()}/v1/images/generations`, {
      method: 'POST',
      headers: {
        ...this.getHeaders(),
        ...(debugBody ? { 'x-koma-debug-body': '1' } : undefined),
        ...(debugBody ? { 'x-koma-trace-operation': 'tti.start' } : undefined),
      },
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
        return {
          mode: 'immediate',
          output: {
            path: imageUrl,
            url: imageUrl,
          },
        };
      }
    }

    // 异步模式：返回 taskId
    if (data.id) {
      return { mode: 'async', taskId: data.id };
    }

    throw new Error('API 返回了无法识别的响应格式');
  }

  /**
   * 轮询任务状态（异步模式）
   */
  async getTaskSnapshot(taskId: string): Promise<ProviderTaskSnapshot<ImageResult>> {
    const response = await safeFetch(`${this.getBaseUrl()}/v1/images/generations/${taskId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${this.config.apiKey || ''}`,
      },
    });

    if (!response.ok) {
      return {
        state: 'failed',
        progress: 0,
        error: '查询失败',
      };
    }

    const data: TaskResponse = await response.json();

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

    if (data.status === 'completed') {
      const items = data.result?.data || data.data;
      if (items?.[0]) {
        const url = this.extractImageUrl(items[0]);
        if (url) {
          snapshot.output = { path: url, url };
        }
      }
    }

    if (data.status === 'failed' && data.error) {
      snapshot.error = data.error.message || '任务失败';
    }

    return snapshot;
  }
}

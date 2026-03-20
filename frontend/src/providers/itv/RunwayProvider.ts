/**
 * Runway Gen-3 Provider
 */
import type { ITVConfig, ITVOptions } from '../../types';
import type { ProviderStartResult, ProviderTaskSnapshot } from '../../types';
import type { ITVProvider, ITVRequest, ITVResult } from './types';
import { safeFetch } from '../../utils/safeFetch';

interface RunwayCreateResponse {
  id?: string;
  task_id?: string;
  status?: string;
}

interface RunwayTaskResponse {
  id?: string;
  status?: string;
  output?: string[];
  output_url?: string;
  artifacts?: Array<{ url?: string }>;
  error?: {
    message?: string;
  };
  failure_reason?: string;
  message?: string;
}

export class RunwayProvider implements ITVProvider {
  type: 'runway' = 'runway';
  config: ITVConfig;

  constructor(config: ITVConfig) {
    this.config = config;
  }

  validate(): boolean {
    return !!this.config.apiKey;
  }

  private getBaseUrl(): string {
    return this.config.baseUrl || 'https://api.runwayml.com';
  }

  private getHeaders(): Record<string, string> {
    return {
      'Authorization': `Bearer ${this.config.apiKey || ''}`,
      'Content-Type': 'application/json',
      'X-Runway-Version': '2024-11-06',
    };
  }

  private buildUrl(endpoint: string): string {
    const base = this.getBaseUrl().replace(/\/+$/, '');
    const normalized = endpoint.replace(/^\/+/, '');
    if (base.endsWith('/v1')) {
      return `${base}/${normalized}`;
    }
    return `${base}/v1/${normalized}`;
  }

  async testConnection(): Promise<boolean> {
    if (!this.validate()) return false;

    try {
      const response = await safeFetch(this.buildUrl('organization'), {
        method: 'GET',
        headers: this.getHeaders(),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  private parseResolution(options?: ITVOptions): { width: number; height: number } {
    const resolution = options?.resolution || this.config.defaultResolution;
    if (resolution) {
      const match = resolution.match(/(\d+)\s*x\s*(\d+)/i);
      if (match) {
        return { width: Number(match[1]), height: Number(match[2]) };
      }
    }
    return { width: 1280, height: 720 };
  }

  private resolveRatio(options?: ITVOptions): string {
    if (options?.resolution) {
      const match = options.resolution.match(/(\d+)\s*x\s*(\d+)/i);
      if (match) {
        return `${Number(match[1])}:${Number(match[2])}`;
      }
    }

    if (options?.aspectRatio) {
      if (options.aspectRatio === '16:9') return '1280:720';
      if (options.aspectRatio === '9:16') return '720:1280';
      if (options.aspectRatio === '1:1') return '960:960';
      if (/^\d+\s*:\s*\d+$/.test(options.aspectRatio)) {
        return options.aspectRatio.replace(/\s+/g, '');
      }
    }

    return '1280:720';
  }

  private async toDataUrl(source: string): Promise<string> {
    if (/^https?:\/\//i.test(source) || source.startsWith('data:')) {
      return source;
    }

    const response = await safeFetch(source);
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  private mapStatus(rawStatus?: string): ProviderTaskSnapshot<ITVResult>['state'] {
    const status = (rawStatus || '').toUpperCase();
    if (status === 'SUCCEEDED' || status === 'COMPLETED') return 'succeeded';
    if (status === 'FAILED' || status === 'CANCELED' || status === 'CANCELLED') return 'failed';
    if (status === 'PENDING' || status === 'QUEUED' || status === 'THROTTLED') return 'queued';
    if (status === 'RUNNING' || status === 'IN_PROGRESS' || status === 'PROCESSING') return 'running';
    return 'running';
  }

  async start(request: ITVRequest): Promise<ProviderStartResult<ITVResult>> {
    if (!this.validate()) {
      throw new Error('Runway API Key 未配置');
    }

    const { prompt, options } = request;
    const endpoint = 'image_to_video';

    const duration = options?.duration || this.config.defaultDuration || 4;
    const ratio = this.resolveRatio(options);

    const body: Record<string, any> = {
      promptText: prompt,
      duration,
      ratio,
    };

    if (options?.seed !== undefined) {
      body.seed = options.seed;
    }

    body.promptImage = request.primaryImage.value;

    const response = await safeFetch(this.buildUrl(endpoint), {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Runway 生成失败: ${errorText}`);
    }

    const data: RunwayCreateResponse = await response.json();
    const taskId = data.id || data.task_id;

    if (!taskId) {
      throw new Error('Runway 任务ID获取失败');
    }

    return { mode: 'async', taskId: String(taskId) };
  }

  async getTaskSnapshot(taskId: string): Promise<ProviderTaskSnapshot<ITVResult>> {
    const response = await safeFetch(this.buildUrl(`tasks/${taskId}`), {
      method: 'GET',
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        state: 'failed',
        progress: 0,
        error: errorText || '查询失败',
      };
    }

    const data: RunwayTaskResponse = await response.json();
    const state = this.mapStatus(data.status);
    const resultUrl = data.output?.[0]
      || data.output_url
      || data.artifacts?.[0]?.url;
    const error = data.error?.message || data.failure_reason || data.message;

    return {
      state,
      progress: state === 'succeeded' ? 100 : state === 'running' ? 50 : 0,
      output: (state === 'succeeded' && resultUrl) ? { source: resultUrl, taskId } : undefined,
      error,
    };
  }

  async cancelTask(taskId: string): Promise<void> {
    const endpoints = [
      { method: 'DELETE', url: this.buildUrl(`tasks/${taskId}`) },
      { method: 'POST', url: this.buildUrl(`tasks/${taskId}/cancel`) },
    ];

    for (const endpoint of endpoints) {
      try {
        const response = await safeFetch(endpoint.url, {
          method: endpoint.method,
          headers: this.getHeaders(),
        });
        if (response.ok) return;
      } catch {
        // ignore and try next endpoint
      }
    }
  }

  // polling 配置由 registry 下发；Provider 本身不做内部轮询
}

export default RunwayProvider;

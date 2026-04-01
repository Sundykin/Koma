/**
 * Pika Labs ITV Provider
 * https://pika.art/
 */
import type {
  ITVConfig,
} from '../../types';
import type { ProviderStartResult, ProviderTaskSnapshot } from '../../types';
import { requirePrimaryImage, type ITVProvider, type ITVRequest, type ITVResult } from './types';
import { safeFetch } from '../../utils/safeFetch';

export class PikaProvider implements ITVProvider {
  type = 'pika' as const;
  config: ITVConfig;

  constructor(config: ITVConfig) {
    this.config = config;
  }

  validate(): boolean {
    return !!this.config.apiKey;
  }

  private getBaseUrl(): string {
    return this.config.baseUrl || 'https://api.pika.art/v1';
  }

  async testConnection(): Promise<boolean> {
    if (!this.validate()) return false;

    try {
      const response = await safeFetch(`${this.getBaseUrl()}/health`, {
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
        },
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async start(request: ITVRequest): Promise<ProviderStartResult<ITVResult>> {
    if (!this.validate()) {
      throw new Error('Pika API Key 未配置');
    }

    const primaryImage = requirePrimaryImage(request, 'Pika');
    const { prompt, options } = request;

    // Pika API 提交生成任务
    const formData = new FormData();

    // 读取图片文件
    const imageResponse = await safeFetch(primaryImage.value);
    const imageBlob = await imageResponse.blob();
    formData.append('image', imageBlob, 'input.png');

    formData.append('prompt', prompt);
    formData.append('duration', String(options?.duration || this.config.defaultDuration || 4));

    if (options?.motionStrength) {
      formData.append('motion', String(options.motionStrength));
    }

    const response = await safeFetch(`${this.getBaseUrl()}/generate`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Pika 生成失败: ${error}`);
    }

    const data = await response.json();
    const taskId = data.task_id || data.id;
    if (!taskId) {
      throw new Error('Pika 任务ID获取失败');
    }

    return { mode: 'async', taskId: String(taskId) };
  }

  async getTaskSnapshot(taskId: string): Promise<ProviderTaskSnapshot<ITVResult>> {
    const response = await safeFetch(`${this.getBaseUrl()}/tasks/${taskId}`, {
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
      },
    });

    if (!response.ok) {
      return { state: 'failed', progress: 0, error: '获取任务状态失败' };
    }

    const data = await response.json();

    // 映射 Pika 状态
    let state: ProviderTaskSnapshot<ITVResult>['state'] = 'queued';
    if (data.status === 'completed' || data.status === 'succeeded') {
      state = 'succeeded';
    } else if (data.status === 'failed' || data.status === 'error') {
      state = 'failed';
    } else if (data.status === 'processing' || data.status === 'running') {
      state = 'running';
    }

    const resultUrl = data.output_url || data.video_url;
    return {
      state,
      progress: data.progress || (state === 'succeeded' ? 100 : 0),
      output: (state === 'succeeded' && resultUrl) ? { source: resultUrl, taskId } : undefined,
      error: data.error,
    };
  }

  async cancelTask(taskId: string): Promise<void> {
    await safeFetch(`${this.getBaseUrl()}/tasks/${taskId}/cancel`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
      },
    });
  }

  // polling 配置由 registry 下发；Provider 本身不做内部轮询
}

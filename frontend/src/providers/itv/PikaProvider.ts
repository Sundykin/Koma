/**
 * Pika Labs ITV Provider
 * https://pika.art/
 */
import type {
  ITVConfig,
  ITVOptions,
  VideoResult,
  ProgressInfo,
} from '../../types';
import type { ITVProvider } from './types';

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
      const response = await fetch(`${this.getBaseUrl()}/health`, {
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
        },
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async generate(
    imagePath: string,
    prompt: string,
    options?: ITVOptions
  ): Promise<string> {
    if (!this.validate()) {
      throw new Error('Pika API Key 未配置');
    }

    // Pika API 提交生成任务
    const formData = new FormData();

    // 读取图片文件
    const imageResponse = await fetch(imagePath);
    const imageBlob = await imageResponse.blob();
    formData.append('image', imageBlob, 'input.png');
    formData.append('prompt', prompt);
    formData.append('duration', String(options?.duration || this.config.defaultDuration || 4));

    if (options?.motionStrength) {
      formData.append('motion', String(options.motionStrength));
    }

    const response = await fetch(`${this.getBaseUrl()}/generate`, {
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
    return data.task_id || data.id;
  }

  async checkProgress(taskId: string): Promise<ProgressInfo> {
    const response = await fetch(`${this.getBaseUrl()}/tasks/${taskId}`, {
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
      },
    });

    if (!response.ok) {
      throw new Error('获取任务状态失败');
    }

    const data = await response.json();

    // 映射 Pika 状态
    let status: ProgressInfo['status'] = 'queued';
    if (data.status === 'completed' || data.status === 'succeeded') {
      status = 'completed';
    } else if (data.status === 'failed' || data.status === 'error') {
      status = 'failed';
    } else if (data.status === 'processing' || data.status === 'running') {
      status = 'processing';
    }

    return {
      taskId,
      status,
      progress: data.progress || 0,
      resultUrl: data.output_url || data.video_url,
      error: data.error,
    };
  }

  async cancelTask(taskId: string): Promise<void> {
    await fetch(`${this.getBaseUrl()}/tasks/${taskId}/cancel`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
      },
    });
  }
}

/**
 * Pika Labs ITV Provider
 * https://pika.art/
 */
import type {
  ITVConfig,
  VideoResult,
  ProgressInfo,
} from '../../types';
import type { ITVProvider, ITVGenerateInput } from './types';
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

  async generateVideo(input: ITVGenerateInput): Promise<VideoResult> {
    if (!this.validate()) {
      throw new Error('Pika API Key 未配置');
    }

    const { imageUrl, prompt, options } = input;

    // Pika API 提交生成任务
    const formData = new FormData();

    // 读取图片文件
    if (imageUrl) {
      const imageResponse = await safeFetch(imageUrl);
      const imageBlob = await imageResponse.blob();
      formData.append('image', imageBlob, 'input.png');
    }
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

    // 轮询等待完成
    const pollingConfig = this.polling;
    const startTime = Date.now();

    while (Date.now() - startTime < pollingConfig.maxDuration) {
      const progress = await this.checkProgress(taskId);

      if (progress.status === 'completed' && progress.resultUrl) {
        return {
          url: progress.resultUrl,
          path: progress.resultUrl,
          duration: options?.duration || 4,
          width: 1280,
          height: 720,
          fps: 24,
        };
      }

      if (progress.status === 'failed') {
        throw new Error(progress.error || '视频生成失败');
      }

      await this.delay(pollingConfig.interval);
    }

    throw new Error('视频生成超时');
  }

  async checkProgress(taskId: string): Promise<ProgressInfo> {
    const response = await safeFetch(`${this.getBaseUrl()}/tasks/${taskId}`, {
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
    await safeFetch(`${this.getBaseUrl()}/tasks/${taskId}/cancel`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
      },
    });
  }

  private get polling() {
    return {
      interval: 3000,
      maxDuration: 300000,
    };
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

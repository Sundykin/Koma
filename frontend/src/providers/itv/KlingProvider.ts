/**
 * Kling (可灵) Provider
 */
import type { ITVConfig, ITVOptions, VideoResult, ProgressInfo } from '../../types';
import type { ITVProvider, ITVGenerateInput } from './types';
import { safeFetch } from '../../utils/safeFetch';

interface KlingCreateResponse {
  code?: number;
  message?: string;
  request_id?: string;
  task_id?: string;
  id?: string;
  data?: {
    task_id?: string;
    id?: string;
    task_status?: string;
    request_id?: string;
  };
}

interface KlingProgressResponse {
  code?: number;
  message?: string;
  request_id?: string;
  data?: {
    task_id?: string;
    task_status?: string;
    task_status_msg?: string;
    progress?: number;
    task_result?: {
      videos?: Array<{ id?: string; url?: string; duration?: string }>;
      video_url?: string;
    };
    result?: {
      url?: string;
      data?: Array<{ url?: string }>;
    };
    url?: string;
    output?: string[];
  };
  status?: string;
  progress?: number;
  url?: string;
  output?: string[];
  result?: {
    url?: string;
    data?: Array<{ url?: string }>;
  };
  error?: {
    message?: string;
  };
}

export class KlingProvider implements ITVProvider {
  type: 'kling' = 'kling';
  config: ITVConfig;

  constructor(config: ITVConfig) {
    this.config = config;
  }

  validate(): boolean {
    return !!this.config.apiKey;
  }

  private getBaseUrl(): string {
    return this.config.baseUrl || 'https://api.klingai.com';
  }

  private getHeaders(): Record<string, string> {
    return {
      'Authorization': `Bearer ${this.config.apiKey || ''}`,
      'Content-Type': 'application/json',
    };
  }

  private buildUrl(endpoint: string): string {
    const base = this.getBaseUrl().replace(/\/+$/, '');
    if (/\/kling\/v1$/.test(base) || /\/v1$/.test(base)) {
      return `${base}/${endpoint}`;
    }
    if (/\/kling$/.test(base)) {
      return `${base}/v1/${endpoint}`;
    }
    return `${base}/v1/${endpoint}`;
  }

  async testConnection(): Promise<boolean> {
    if (!this.validate()) return false;

    try {
      const response = await safeFetch(this.buildUrl('videos/text2video'), {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          prompt: 'test',
          duration: '5',
        }),
      });
      return response.status !== 401 && response.status !== 403;
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

  private resolveAspectRatio(options?: ITVOptions): string | undefined {
    if (options?.aspectRatio) return options.aspectRatio;

    const { width, height } = this.parseResolution(options);
    if (width === height) return '1:1';
    if (width > height) return '16:9';
    return '9:16';
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

  private resolveTaskId(data: KlingCreateResponse): string | undefined {
    return data.task_id
      || data.id
      || data.data?.task_id
      || data.data?.id
      || data.request_id
      || data.data?.request_id;
  }

  private mapStatus(rawStatus?: string): ProgressInfo['status'] {
    const status = (rawStatus || '').toLowerCase();
    if (['completed', 'succeeded', 'success'].includes(status)) return 'completed';
    if (['failed', 'error', 'timeout', 'cancelled', 'canceled'].includes(status)) return 'failed';
    if (['queued', 'pending', 'submitted', 'submitting'].includes(status)) return 'queued';
    if (['in_progress', 'running', 'processing'].includes(status)) return 'processing';
    return 'processing';
  }

  private extractProgress(data: KlingProgressResponse): ProgressInfo {
    // Cast to any for flexible property access - Kling API responses vary
    const payload: any = data.data || data;
    const status = this.mapStatus(payload.task_status || payload.status || data.status);
    const progressRaw = payload.progress ?? data.progress;
    const progress = typeof progressRaw === 'number'
      ? progressRaw
      : status === 'completed'
        ? 100
        : status === 'processing'
          ? 50
          : 0;
    const resultUrl = payload.task_result?.videos?.[0]?.url
      || payload.task_result?.video_url
      || payload.result?.data?.[0]?.url
      || payload.result?.url
      || payload.url
      || data.url
      || payload.output?.[0]
      || data.output?.[0];

    const error = payload.task_status_msg
      || data.error?.message
      || data.message;

    return {
      taskId: payload.task_id || data.request_id || data.data?.task_id || '',
      status,
      progress,
      resultUrl,
      error,
    };
  }

  async generateVideo(input: ITVGenerateInput): Promise<VideoResult> {
    if (!this.validate()) {
      throw new Error('Kling API Key 未配置');
    }

    const { imageUrl, prompt, options } = input;
    const imageSource = imageUrl || options?.startFrame;
    const useImage = !!imageSource;
    const endpoint = useImage ? 'videos/image2video' : 'videos/text2video';

    const body: Record<string, any> = {
      prompt,
      duration: String(options?.duration || this.config.defaultDuration || 5),
    };

    const aspectRatio = this.resolveAspectRatio(options);
    if (aspectRatio) {
      body.aspect_ratio = aspectRatio;
    }

    if (options?.negativePrompt) {
      body.negative_prompt = options.negativePrompt;
    }

    if (options?.motionStrength !== undefined) {
      body.cfg_scale = options.motionStrength;
    }

    if (useImage && imageSource) {
      body.image = await this.toDataUrl(imageSource);
      if (options?.endFrame) {
        body.image_tail = await this.toDataUrl(options.endFrame);
      }
    }

    const response = await safeFetch(this.buildUrl(endpoint), {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Kling 生成失败: ${errorText}`);
    }

    const data: KlingCreateResponse = await response.json();
    if (typeof data.code === 'number' && data.code !== 0 && data.code !== 200) {
      throw new Error(data.message || '创建任务失败');
    }

    const taskId = this.resolveTaskId(data);
    if (!taskId) {
      throw new Error('Kling 任务ID获取失败');
    }

    const pollingConfig = this.polling;
    const startTime = Date.now();

    if (pollingConfig.initialDelay) {
      await this.delay(pollingConfig.initialDelay);
    }

    while (Date.now() - startTime < pollingConfig.maxDuration) {
      const progress = await this.checkProgress(taskId);

      if (progress.status === 'completed' && progress.resultUrl) {
        const resolution = this.parseResolution(options);
        return {
          url: progress.resultUrl,
          path: progress.resultUrl,
          duration: options?.duration || this.config.defaultDuration || 5,
          width: resolution.width,
          height: resolution.height,
          fps: options?.fps || 24,
          taskId,
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
    const endpoints = [
      this.buildUrl(`videos/text2video/${taskId}`),
      this.buildUrl(`videos/image2video/${taskId}`),
      this.buildUrl(`video/generations/${taskId}`),
      this.buildUrl(`tasks/generations/${taskId}`),
      this.buildUrl(`videos/${taskId}`),
    ];

    let lastError: string | undefined;

    for (const url of endpoints) {
      try {
        const response = await safeFetch(url, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${this.config.apiKey || ''}`,
          },
        });

        if (!response.ok) {
          let errorMsg = response.statusText;
          try {
            const errorJson = await response.json();
            errorMsg = errorJson.message || errorJson.error?.message || JSON.stringify(errorJson);
          } catch {
            const text = await response.text();
            if (text) errorMsg = text.slice(0, 200); // 截断过长的 HTML 错误
          }
          
          lastError = `请求失败 (${response.status}): ${errorMsg}`;
          
          // 404/400 可能意味着端点不对，尝试下一个
          if (response.status === 404 || response.status === 400) {
            continue;
          }
          
          // 其他错误直接返回
          return {
            taskId,
            status: 'failed',
            progress: 0,
            error: this.translateError(lastError),
          };
        }

        const data: KlingProgressResponse = await response.json();
        if (typeof data.code === 'number' && data.code !== 0 && data.code !== 200) {
          return {
            taskId,
            status: 'failed',
            progress: 0,
            error: this.translateError(data.message || '查询任务失败'),
          };
        }

        const progress = this.extractProgress(data);
        // 翻译进度中的错误信息
        if (progress.error) {
            progress.error = this.translateError(progress.error);
        }
        
        return {
          ...progress,
          taskId,
        };
      } catch (err: any) {
        lastError = err?.message || String(err);
      }
    }

    return {
      taskId,
      status: 'failed',
      progress: 0,
      error: this.translateError(lastError || '查询任务状态失败，请检查网络或稍后重试'),
    };
  }

  private translateError(msg: string): string {
    if (!msg) return '未知错误';
    const lower = msg.toLowerCase();
    if (lower.includes('sensitive') || lower.includes('nsfw')) return '内容包含敏感词或违规元素，请修改提示词';
    if (lower.includes('balance') || lower.includes('credit')) return '账户余额不足';
    if (lower.includes('timeout')) return '任务处理超时';
    if (lower.includes('network') || lower.includes('fetch')) return '网络连接失败';
    if (lower.includes('unauthorized') || lower.includes('401')) return 'API Key 无效或过期';
    return msg;
  }

  async cancelTask(taskId: string): Promise<void> {
    const endpoints = [
      this.buildUrl(`videos/text2video/${taskId}/cancel`),
      this.buildUrl(`videos/image2video/${taskId}/cancel`),
      this.buildUrl(`tasks/generations/${taskId}/cancel`),
    ];

    for (const url of endpoints) {
      try {
        const response = await safeFetch(url, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.config.apiKey || ''}`,
          },
        });
        if (response.ok) return;
      } catch {
        // ignore and try next endpoint
      }
    }
  }

  private get polling() {
    return {
      interval: 4000,
      maxDuration: 600000,
      initialDelay: 2000,
    };
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export default KlingProvider;

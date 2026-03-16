/**
 * 自定义 ITV Provider
 * 支持 Grok2API 等 SSE 流式视频生成平台
 *
 * API 格式：
 * - POST /v1/public/video/start  → { task_id, aspect_ratio }
 * - GET  /v1/public/video/sse?task_id=xxx → SSE chat.completion.chunk 流
 *   进度: "正在生成视频中，当前进度XX%"
 *   结果: <video> HTML 标签含 mp4 URL
 */
import type { ITVConfig, VideoResult, ProgressInfo } from '../../types';
import type { ITVProvider, ITVGenerateInput } from './types';
import { safeFetch } from '../../utils/safeFetch';

export class CustomITVProvider implements ITVProvider {
  type = 'custom' as const;
  config: ITVConfig;

  constructor(config: ITVConfig) {
    this.config = config;
  }

  validate(): boolean {
    return !!this.config.apiKey && !!this.config.baseUrl;
  }

  private getBaseUrl(): string {
    return (this.config.baseUrl || '').replace(/\/+$/, '');
  }

  private getHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.config.apiKey || ''}`,
      'Content-Type': 'application/json',
    };
  }

  async testConnection(): Promise<boolean> {
    if (!this.validate()) return false;
    try {
      const resp = await safeFetch(`${this.getBaseUrl()}/v1/models`, {
        headers: { Authorization: `Bearer ${this.config.apiKey || ''}` },
      });
      return resp.ok;
    } catch {
      return false;
    }
  }

  /**
   * 提交视频生成任务
   */
  private async submitTask(prompt: string, imageUrl?: string): Promise<string> {
    const body: Record<string, any> = { prompt };
    if (imageUrl) {
      body.image_url = imageUrl;
    }

    const resp = await safeFetch(`${this.getBaseUrl()}/v1/public/video/start`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const err = await resp.text();
      throw new Error(`提交视频任务失败 (${resp.status}): ${err}`);
    }

    const data = await resp.json();
    const taskId = data.task_id || data.id;
    if (!taskId) {
      throw new Error('无法获取任务 ID');
    }
    return taskId;
  }

  /**
   * 通过 SSE 等待视频生成完成
   * 解析 chat.completion.chunk 格式的流式响应
   */
  private async waitForResult(taskId: string, onProgress?: (p: ProgressInfo) => void): Promise<string> {
    const resp = await safeFetch(
      `${this.getBaseUrl()}/v1/public/video/sse?task_id=${taskId}`,
      { headers: { Authorization: `Bearer ${this.config.apiKey || ''}` } }
    );

    if (!resp.ok) {
      const err = await resp.text();
      throw new Error(`查询视频进度失败 (${resp.status}): ${err}`);
    }

    const text = await resp.text();
    let videoUrl = '';
    let lastProgress = 0;

    for (const line of text.split('\n')) {
      if (!line.startsWith('data: ') || line === 'data: [DONE]') continue;

      try {
        const chunk = JSON.parse(line.slice(6));
        const content = chunk.choices?.[0]?.delta?.content || '';
        if (!content) continue;

        // 解析进度: "正在生成视频中，当前进度XX%"
        const progressMatch = content.match(/进度\s*(\d+)%/);
        if (progressMatch) {
          lastProgress = parseInt(progressMatch[1], 10);
          onProgress?.({
            taskId,
            status: 'processing',
            progress: lastProgress,
          });
        }

        // 解析视频 URL: <source ... src="URL" ...>
        const srcMatch = content.match(/src="([^"]+\.mp4[^"]*)"/);
        if (srcMatch) {
          videoUrl = srcMatch[1];
        }
      } catch {
        // 忽略非 JSON 行
      }
    }

    if (!videoUrl) {
      throw new Error('视频生成完成但未获取到视频地址');
    }

    return videoUrl;
  }

  async generateVideo(input: ITVGenerateInput): Promise<VideoResult> {
    if (!this.validate()) {
      throw new Error('请配置 API Key 和 Base URL');
    }

    const { imageUrl, prompt, options } = input;
    const taskId = await this.submitTask(prompt, imageUrl || options?.startFrame);

    const videoUrl = await this.waitForResult(taskId);

    return {
      url: videoUrl,
      path: videoUrl,
      duration: options?.duration || this.config.defaultDuration || 5,
      width: 1280,
      height: 720,
      fps: 24,
      taskId,
    };
  }

  async generateVideoWithProgress(
    input: ITVGenerateInput,
    onProgress?: (progress: ProgressInfo) => void
  ): Promise<VideoResult> {
    if (!this.validate()) {
      throw new Error('请配置 API Key 和 Base URL');
    }

    const { imageUrl, prompt, options } = input;
    const taskId = await this.submitTask(prompt, imageUrl || options?.startFrame);

    onProgress?.({ taskId, status: 'processing', progress: 0 });

    const videoUrl = await this.waitForResult(taskId, onProgress);

    onProgress?.({ taskId, status: 'completed', progress: 100, resultUrl: videoUrl });

    return {
      url: videoUrl,
      path: videoUrl,
      duration: options?.duration || this.config.defaultDuration || 5,
      width: 1280,
      height: 720,
      fps: 24,
      taskId,
    };
  }

  async checkProgress(taskId: string): Promise<ProgressInfo> {
    try {
      const videoUrl = await this.waitForResult(taskId);
      return { taskId, status: 'completed', progress: 100, resultUrl: videoUrl };
    } catch (err: any) {
      return { taskId, status: 'failed', progress: 0, error: err.message };
    }
  }

  async cancelTask(taskId: string): Promise<void> {
    try {
      await safeFetch(`${this.getBaseUrl()}/v1/public/video/stop`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ task_id: taskId }),
      });
    } catch { /* ignore */ }
  }
}

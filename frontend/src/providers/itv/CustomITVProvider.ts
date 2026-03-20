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
import type { ITVConfig } from '../../types';
import type { ProviderStartResult, ProviderTaskSnapshot } from '../../types';
import type { ITVProvider, ITVRequest, ITVResult } from './types';
import { safeFetch } from '../../utils/safeFetch';

function stripDataUrlHeader(dataUrl: string): { mimeType?: string; base64: string } {
  // data:<mime>;base64,<payload>
  const match = /^data:([^;,]+);base64,(.*)$/i.exec(dataUrl);
  if (!match) {
    const idx = dataUrl.indexOf(',');
    return { base64: idx >= 0 ? dataUrl.slice(idx + 1) : dataUrl };
  }
  return { mimeType: match[1], base64: match[2] };
}

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
  private async submitTask(request: ITVRequest): Promise<string> {
    const body: Record<string, any> = { prompt: request.prompt };

    // Primary image:
    // - Prefer URL for interoperability with remote servers.
    // - If the upstream only provides data URL, send both image_url (data URL) and image_base64.
    //   This keeps mapping centralized within this provider boundary.
    const primary = request.primaryImage?.value;
    if (primary) {
      body.image_url = primary;
      if (primary.startsWith('data:')) {
        const { mimeType, base64 } = stripDataUrlHeader(primary);
        body.image_base64 = base64;
        if (mimeType) body.image_mime = mimeType;
      }
    }

    // Options (best-effort mapping; server may ignore unknown fields)
    const opts = request.options || {};
    if (typeof opts.duration === 'number') body.duration = opts.duration;
    if (typeof opts.fps === 'number') body.fps = opts.fps;
    if (typeof opts.resolution === 'string') body.resolution = opts.resolution;
    if (typeof opts.motionPrompt === 'string' && opts.motionPrompt) body.motion_prompt = opts.motionPrompt;
    if (typeof opts.aspectRatio === 'string' && opts.aspectRatio) body.aspect_ratio = opts.aspectRatio;

    // Additional references (if supported by server)
    if (request.additionalReferences?.length) {
      body.additional_reference_images = request.additionalReferences.map(r => r.value);
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
    const taskId = data.task_id || data.taskId || data.id;
    if (!taskId) {
      throw new Error(`无法获取任务 ID: ${JSON.stringify(data).slice(0, 200)}`);
    }
    return taskId;
  }

  /**
   * 通过 SSE 获取进度与结果（读取一小段后主动中止）
   */
  private async readSSESnapshot(
    taskId: string,
    timeoutMs: number
  ): Promise<{ progress?: number; videoUrl?: string }> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const resp = await safeFetch(
        `${this.getBaseUrl()}/v1/public/video/sse?task_id=${taskId}`,
        {
          headers: { Authorization: `Bearer ${this.config.apiKey || ''}` },
          signal: controller.signal,
        } as RequestInit
      );

      if (!resp.ok) {
        return {};
      }

      // 尽量从流中读取少量内容，解析出“最新进度”或 mp4 URL
      const reader = resp.body?.getReader();
      if (!reader) {
        const text = await resp.text();
        return this.parseSSEText(text);
      }

      let buffer = '';
      const start = Date.now();
      while (Date.now() - start < timeoutMs) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += new TextDecoder().decode(value);
        const parsed = this.parseSSEText(buffer);
        if (parsed.videoUrl) return parsed;
        if (typeof parsed.progress === 'number') {
          // 已获得进度，提前返回，减少一次 snapshot 的耗时
          return parsed;
        }
      }

      return this.parseSSEText(buffer);
    } catch {
      return {};
    } finally {
      clearTimeout(timeout);
      controller.abort();
    }
  }

  private parseSSEText(text: string): { progress?: number; videoUrl?: string } {
    let videoUrl: string | undefined;
    let progress: number | undefined;

    for (const line of text.split('\n')) {
      if (!line.startsWith('data: ') || line === 'data: [DONE]') continue;
      try {
        const chunk = JSON.parse(line.slice(6));
        const content = chunk.choices?.[0]?.delta?.content || '';
        if (!content) continue;

        const progressMatch = content.match(/进度\s*(\d+)%/);
        if (progressMatch) {
          progress = parseInt(progressMatch[1], 10);
        }

        const srcMatch = content.match(/src="([^"]+\.mp4[^"]*)"/);
        if (srcMatch) {
          videoUrl = srcMatch[1];
        }
      } catch {
        // ignore
      }
    }

    return { progress, videoUrl };
  }

  async start(request: ITVRequest): Promise<ProviderStartResult<ITVResult>> {
    if (!this.validate()) {
      throw new Error('请配置 API Key 和 Base URL');
    }

    const taskId = await this.submitTask(request);
    return { mode: 'async', taskId };
  }

  async getTaskSnapshot(taskId: string): Promise<ProviderTaskSnapshot<ITVResult>> {
    if (!this.validate()) {
      return { state: 'failed', progress: 0, error: '请配置 API Key 和 Base URL' };
    }

    const { progress, videoUrl } = await this.readSSESnapshot(taskId, 1500);
    if (videoUrl) {
      return {
        state: 'succeeded',
        progress: 100,
        output: { source: videoUrl, taskId },
      };
    }

    if (typeof progress === 'number') {
      return { state: 'running', progress };
    }

    return { state: 'queued', progress: 0 };
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

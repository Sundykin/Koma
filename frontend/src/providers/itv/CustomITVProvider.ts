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
import { createLogger } from '../../store/logger';

const logger = createLogger('CustomITV');

function sanitizeBodyForLog(body: Record<string, any>): Record<string, any> {
  const walk = (v: any): any => {
    if (typeof v === 'string') {
      if (v.startsWith('data:')) {
        return `${v.slice(0, 140)}...(data-url ${v.length} chars)`;
      }
      // base64 field can be enormous
      if (v.length > 2000) {
        return `${v.slice(0, 800)}...(truncated, ${v.length} chars)`;
      }
      return v;
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
  private apiVariant: 'public' | 'standard' | undefined;
  private apiOverride?: {
    baseUrl: string;
    startPath: string;
    ssePath?: string;
    stopPath?: string;
  };

  assetTransports = {
    primaryImage: ['remote-url', 'data-url'],
    additionalReferences: ['remote-url', 'data-url'],
  } as const;

  constructor(config: ITVConfig) {
    this.config = config;
  }

  validate(): boolean {
    return !!this.config.apiKey && !!this.config.baseUrl;
  }

  private getBaseUrl(): string {
    return (this.config.baseUrl || '').replace(/\/+$/, '');
  }

  private joinUrl(path: string): string {
    const base = (this.apiOverride?.baseUrl || this.getBaseUrl()).replace(/\/+$/, '');
    // Allow users to set baseUrl with /v1 or /v1/public suffix without duplicating segments.
    if (base.endsWith('/v1/public') && path.startsWith('/v1/public/')) {
      return `${base}${path.slice('/v1/public'.length)}`;
    }
    if (base.endsWith('/v1') && path.startsWith('/v1/')) {
      return `${base}${path.slice('/v1'.length)}`;
    }
    return `${base}${path.startsWith('/') ? '' : '/'}${path}`;
  }

  private getApiPaths(variant: 'public' | 'standard') {
    return variant === 'public'
      ? {
        start: '/v1/public/video/start',
        sse: '/v1/public/video/sse',
        stop: '/v1/public/video/stop',
      }
      : {
        start: '/v1/video/start',
        sse: '/v1/video/sse',
        stop: '/v1/video/stop',
      };
  }

  private async detectApiOverrideFromOpenApi(): Promise<void> {
    if (this.apiOverride) return;
    if (!this.validate()) return;

    const rawBase = this.getBaseUrl();
    const baseCandidates = Array.from(new Set([
      rawBase,
      rawBase.replace(/\/v1\/public$/i, ''),
      rawBase.replace(/\/v1$/i, ''),
    ].map(v => v.replace(/\/+$/, '')).filter(Boolean)));

    for (const baseUrl of baseCandidates) {
      try {
        const resp = await safeFetch(`${baseUrl}/openapi.json`, {
          method: 'GET',
          headers: { Authorization: `Bearer ${this.config.apiKey || ''}` },
        });
        if (!resp.ok) continue;

        const spec = await resp.json() as any;
        const paths = spec?.paths as Record<string, any> | undefined;
        if (!paths) continue;

        const entries = Object.entries(paths);
        const hasPost = (p: string) => Boolean(paths[p]?.post);
        const hasGet = (p: string) => Boolean(paths[p]?.get);

        const pickFirst = (predicates: Array<(p: string) => boolean>, methodPred: (p: string) => boolean): string | undefined => {
          for (const pred of predicates) {
            const hit = entries.find(([p]) => pred(p) && methodPred(p))?.[0];
            if (hit) return hit;
          }
          return undefined;
        };

        const startPath = pickFirst(
          [
            (p) => /\/v1\/public\/video\/start\/?$/i.test(p),
            (p) => /\/v1\/video\/start\/?$/i.test(p),
            (p) => /\/video\/start\/?$/i.test(p),
            (p) => /\/video\/create\/?$/i.test(p),
            (p) => /\/video\/generate\/?$/i.test(p),
          ],
          hasPost
        );

        if (!startPath) continue;

        const ssePath = pickFirst(
          [
            (p) => /\/video\/sse\/?$/i.test(p),
            (p) => /\/video\/stream\/?$/i.test(p),
          ],
          hasGet
        );

        const stopPath = pickFirst(
          [
            (p) => /\/video\/stop\/?$/i.test(p),
            (p) => /\/video\/cancel\/?$/i.test(p),
          ],
          hasPost
        );

        this.apiOverride = {
          baseUrl,
          startPath,
          ssePath,
          stopPath,
        };
        return;
      } catch {
        // ignore
      }
    }
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

    const protocol = (this.config as any)?.promptProtocol;
    const debugBody = Boolean(protocol) || (import.meta as any)?.env?.DEV === true;

    const trySubmit = async (variant: 'public' | 'standard') => {
      const startPath = this.apiOverride?.startPath || this.getApiPaths(variant).start;
      return safeFetch(this.joinUrl(startPath), {
        method: 'POST',
        headers: {
          ...this.getHeaders(),
          ...(debugBody ? { 'x-koma-debug-body': '1' } : undefined),
          ...(debugBody ? { 'x-koma-trace-operation': 'itv.start' } : undefined),
        },
        body: JSON.stringify(body),
      });
    };

    if (debugBody) {
      logger.info('ITV start request body', {
        provider: this.config.provider,
        ...(protocol ? { promptProtocol: protocol } : undefined),
        body: sanitizeBodyForLog(body),
      });
    }

    const preferredVariant: 'public' | 'standard' = this.apiVariant || 'public';
    const fallbackVariant: 'public' | 'standard' = preferredVariant === 'public' ? 'standard' : 'public';

    let resp = await trySubmit(preferredVariant);
    // Some deployments expose only one set of endpoints. Always try the other variant on 404.
    if (resp.status === 404) {
      const fallbackResp = await trySubmit(fallbackVariant);
      if (fallbackResp.ok) {
        this.apiVariant = fallbackVariant;
        resp = fallbackResp;
      } else if (fallbackResp.status === 404) {
        // Last resort: try to discover the actual endpoint via OpenAPI.
        await this.detectApiOverrideFromOpenApi();
        if (this.apiOverride?.startPath) {
          resp = await safeFetch(this.joinUrl(this.apiOverride.startPath), {
            method: 'POST',
            headers: this.getHeaders(),
            body: JSON.stringify(body),
          });
        }
      }
    } else if (resp.ok && !this.apiVariant) {
      // Cache the successful variant for subsequent calls.
      this.apiVariant = preferredVariant;
    }

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
      const preferredVariant = this.apiVariant || 'public';
      const paths = this.getApiPaths(preferredVariant);
      const ssePath = this.apiOverride?.ssePath || paths.sse;
      const resp = await safeFetch(
        `${this.joinUrl(ssePath)}?task_id=${taskId}`,
        {
          headers: { Authorization: `Bearer ${this.config.apiKey || ''}` },
          signal: controller.signal,
        } as RequestInit
      );

      if (!resp.ok) {
        // Always try the other variant once on 404 (covers recovered tasks and mixed deployments).
        if (resp.status === 404) {
          const fallbackVariant: 'public' | 'standard' = preferredVariant === 'public' ? 'standard' : 'public';
          const fallbackPaths = this.getApiPaths(fallbackVariant);
          const fallbackSsePath = this.apiOverride?.ssePath || fallbackPaths.sse;
          const fallbackResp = await safeFetch(
            `${this.joinUrl(fallbackSsePath)}?task_id=${taskId}`,
            {
              headers: { Authorization: `Bearer ${this.config.apiKey || ''}` },
              signal: controller.signal,
            } as RequestInit
          );
          if (fallbackResp.ok) {
            this.apiVariant = fallbackVariant;
            const reader = fallbackResp.body?.getReader();
            if (!reader) {
              const text = await fallbackResp.text();
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
                return parsed;
              }
            }
            return this.parseSSEText(buffer);
          }
          // Try OpenAPI discovery once if both variants 404.
          await this.detectApiOverrideFromOpenApi();
          if (this.apiOverride?.ssePath) {
            const overrideResp = await safeFetch(
              `${this.joinUrl(this.apiOverride.ssePath)}?task_id=${taskId}`,
              {
                headers: { Authorization: `Bearer ${this.config.apiKey || ''}` },
                signal: controller.signal,
              } as RequestInit
            );
            if (overrideResp.ok) {
              const reader = overrideResp.body?.getReader();
              if (!reader) {
                const text = await overrideResp.text();
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
                if (typeof parsed.progress === 'number') return parsed;
              }
              return this.parseSSEText(buffer);
            }
          }
        }
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
      const variant = this.apiVariant || 'public';
      const paths = this.getApiPaths(variant);
      const stopPath = this.apiOverride?.stopPath || paths.stop;
      await safeFetch(this.joinUrl(stopPath), {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ task_id: taskId }),
      });
    } catch { /* ignore */ }
  }
}

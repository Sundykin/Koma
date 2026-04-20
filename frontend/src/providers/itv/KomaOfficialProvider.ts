/**
 * Koma 官方视频渠道
 *
 * 协议参照 JRenapi/main.py 的 NewAPI 桥接实现：
 *  - POST /v1/videos          创建异步任务（jimeng / sora2 / grok-imagine 等）
 *  - GET  /v1/videos/{id}     轮询任务状态
 *  - POST /v1/chat/completions  文生视频兜底（部分节点只开放 chat 接口）
 *
 * baseUrl 被锁定为 https://api.568069.xyz（由 catalog.ts 的 configSchema.baseUrlLocked
 * 强制覆盖，用户不能在 UI 中修改）。
 *
 * 参考图走 Koma 既有图床服务转成远端 URL：provider 只声明 assetTransports =
 * 'remote-url'，framework 会在 videoRequestCompiler 里自动把本地/data 图片上
 * 传到 image-hosting 渠道再转成 URL 塞进请求体。相比 JRenapi 的 OSS 直传方案
 * 少了一个 sign-service 依赖，也避免了 ~2MB 的 base64 内联。
 */
import type {
  ITVConfig,
  ITVOptions,
  ProviderAssetInput,
  ProviderStartResult,
  ProviderTaskSnapshot,
} from '../../types';
import {
  isImageToVideoRequest,
  isReferenceToVideoRequest,
  isStartEndToVideoRequest,
  isTextToVideoRequest,
} from '../../types';
import {
  assertSupportedVideoCapabilities,
  type ITVProvider,
  type ITVRequest,
  type ITVResult,
  type ITVTaskSnapshotContext,
} from './types';
import { safeFetch } from '../../utils/safeFetch';
import { createLogger } from '../../store/logger';
import { sanitizeBodyForLog } from '../../utils/logFormatting';

const logger = createLogger('KomaOfficial');

export const KOMA_OFFICIAL_BASE_URL = 'https://api.568069.xyz';
const GROK_VIDEO_MODEL_PREFIX = 'grok-imagine-1.0-video';
const GROK_MAX_REFERENCE_IMAGES = 7;
const DEFAULT_CREATE_RETRY = 2;
const DEFAULT_INFLIGHT_LIMIT = 50;

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);
const RETRYABLE_BODY_MARKERS = [
  'fail_to_fetch_task',
  'missing final video_url',
  'upstream_error',
  'server_error',
  'bad gateway',
  'timeout',
];

type CreateRawResult = {
  taskId?: string;
  videoUrl?: string;
  status?: string;
};

function joinUrl(baseUrl: string, path: string): string {
  const b = baseUrl.replace(/\/+$/, '');
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${b}${p}`;
}

function resolveMaybeRelative(baseUrl: string, candidate: string): string {
  if (!candidate) return candidate;
  if (/^(https?:|data:)/i.test(candidate)) return candidate;
  try {
    return new URL(candidate, baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`).toString();
  } catch {
    return candidate;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function nonce(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function bustCacheForUrl(url: string): string {
  // 给外链加一次性 query，绕过部分上游基于 sha1(url) 的 fcntl 串行化锁
  // （参照 JRenapi 的 _bust_url_cache）。data-url / 非 http 直接返回。
  if (!/^https?:\/\//i.test(url)) return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}_r=${nonce()}`;
}

function extractUrlsFromData(data: unknown): string[] {
  const urls: string[] = [];
  const visit = (node: unknown) => {
    if (!node) return;
    if (typeof node === 'string') {
      if (/^https?:\/\//i.test(node) && /\.(mp4|webm|mov|m3u8)(\?|$)/i.test(node)) {
        urls.push(node);
      }
      return;
    }
    if (Array.isArray(node)) {
      for (const item of node) visit(item);
      return;
    }
    if (typeof node === 'object') {
      const obj = node as Record<string, unknown>;
      for (const key of ['url', 'video_url', 'videoUrl', 'file_url', 'source']) {
        const v = obj[key];
        if (typeof v === 'string' && /^https?:\/\//i.test(v)) urls.push(v);
      }
      for (const v of Object.values(obj)) visit(v);
    }
  };
  visit(data);
  return urls;
}

function extractVideoUrlFromChatResponse(body: unknown): string | undefined {
  if (!body || typeof body !== 'object') return undefined;
  const choices = (body as { choices?: unknown }).choices;
  if (Array.isArray(choices) && choices.length > 0) {
    const content = (choices[0] as { message?: { content?: unknown } })?.message?.content;
    if (typeof content === 'string') {
      const m = content.match(/https?:\/\/[^\s"'<>)]+\.(?:mp4|webm|mov|m3u8)(?:\?[^\s"'<>)]*)?/i);
      if (m) return m[0];
      const attr = content.match(/(?:src|href)\s*=\s*"([^"]+)"/i);
      if (attr) return attr[1];
    }
    if (Array.isArray(content)) {
      for (const item of content) {
        if (item && typeof item === 'object') {
          const rec = item as Record<string, unknown>;
          if (typeof rec.url === 'string' && /^https?:\/\//i.test(rec.url)) return rec.url as string;
          if (typeof rec.text === 'string') {
            const m = (rec.text as string).match(/https?:\/\/[^\s"'<>)]+\.(?:mp4|webm|mov|m3u8)(?:\?[^\s"'<>)]*)?/i);
            if (m) return m[0];
          }
        }
      }
    }
  }
  const urls = extractUrlsFromData(body);
  return urls[0];
}

function isGrokModel(modelName: string): boolean {
  return modelName.startsWith(GROK_VIDEO_MODEL_PREFIX);
}

function isBodyRetryable(text: string): boolean {
  const lower = (text || '').toLowerCase();
  return RETRYABLE_BODY_MARKERS.some((m) => lower.includes(m));
}

function backoffMs(attempt: number): number {
  const base = Math.min(8000, 1000 + attempt * 2000);
  return base + Math.floor(Math.random() * 2000);
}

// ---- 全局并发限流 ----
// JRenapi 用 Semaphore(50) 控制客户端出口带宽，避免上游 502。
// 这里用简单的 in-module 信号量，所有 KomaOfficialProvider 实例共享。
class InflightLimiter {
  private inflight = 0;
  private queue: Array<() => void> = [];

  constructor(private max: number) {}

  async acquire(): Promise<void> {
    if (this.inflight < this.max) {
      this.inflight += 1;
      return;
    }
    await new Promise<void>((resolve) => this.queue.push(resolve));
    this.inflight += 1;
  }

  release(): void {
    this.inflight -= 1;
    const next = this.queue.shift();
    if (next) next();
  }
}

let sharedLimiter: InflightLimiter | null = null;
function getLimiter(limit?: number): InflightLimiter {
  const n = Math.max(1, Math.floor(limit ?? DEFAULT_INFLIGHT_LIMIT));
  if (!sharedLimiter) sharedLimiter = new InflightLimiter(n);
  return sharedLimiter;
}

async function withLimiter<T>(limit: number | undefined, fn: () => Promise<T>): Promise<T> {
  const limiter = getLimiter(limit);
  await limiter.acquire();
  try {
    return await fn();
  } finally {
    limiter.release();
  }
}

// ---- HTTP ----
async function requestWithFallback(
  url: string,
  init: RequestInit,
): Promise<Response> {
  // https → http 回退只在 https 主域失败时生效（纯对齐 JRenapi 的 _candidate_urls），
  // 对锁定的官方域名保持 https 优先。
  try {
    return await safeFetch(url, init);
  } catch (err) {
    if (url.startsWith('https://')) {
      const fallback = `http://${url.slice('https://'.length)}`;
      try {
        return await safeFetch(fallback, init);
      } catch {
        throw err;
      }
    }
    throw err;
  }
}

async function postJsonWithRetry(
  url: string,
  body: unknown,
  headers: Record<string, string>,
  retryCount: number,
): Promise<Response> {
  const maxAttempts = Math.max(1, retryCount + 1);
  let lastErr: unknown = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const resp = await requestWithFallback(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });
      if (resp.ok) return resp;
      if (attempt >= maxAttempts) return resp;
      if (!RETRYABLE_STATUS.has(resp.status)) return resp;
      const text = await resp.clone().text().catch(() => '');
      if (!isBodyRetryable(text) && resp.status !== 502 && resp.status !== 500) {
        return resp;
      }
      logger.warn(`POST ${url} 返回 ${resp.status}，第 ${attempt}/${maxAttempts} 次重试`);
    } catch (err) {
      lastErr = err;
      if (attempt >= maxAttempts) throw err;
      logger.warn(`POST ${url} 抛错，第 ${attempt}/${maxAttempts} 次重试`, {
        error: err instanceof Error ? err.message : String(err),
      });
    }
    await sleep(backoffMs(attempt));
  }
  if (lastErr) throw lastErr;
  throw new Error('请求失败但无响应');
}

function parseCreateBody(body: unknown): CreateRawResult {
  if (!body || typeof body !== 'object') return {};
  const b = body as Record<string, unknown>;
  const status = typeof b.status === 'string' ? b.status.toLowerCase() : '';
  const taskId = typeof b.id === 'string' ? b.id : undefined;
  let videoUrl: string | undefined;
  if (status === 'completed') {
    if (typeof b.url === 'string') videoUrl = b.url;
    else if (b.output && typeof b.output === 'object' && typeof (b.output as Record<string, unknown>).url === 'string') {
      videoUrl = (b.output as Record<string, unknown>).url as string;
    } else {
      videoUrl = extractUrlsFromData(body)[0];
    }
  }
  return { taskId, videoUrl, status };
}

function normalizeDurationForGrok(value: number | undefined): number {
  const supported = [6, 10, 15];
  if (!value || !Number.isFinite(value)) return 6;
  let best = supported[0];
  let bestDist = Math.abs(value - best);
  for (const s of supported.slice(1)) {
    const d = Math.abs(value - s);
    if (d < bestDist) {
      best = s;
      bestDist = d;
    }
  }
  return best;
}

function assertKomaOfficialBaseUrl(baseUrl: string | undefined): string {
  // 即便 UI 或迁移脚本里写错了，这里再兜底一次：始终返回锁定域名。
  return KOMA_OFFICIAL_BASE_URL;
}

export interface KomaOfficialOptions extends ITVOptions {
  duration?: number;
  resolution?: string;
  ratio?: string;
  // 允许运行时覆盖并发上限（通常走 env/默认 50）
  inflightLimit?: number;
  createRetryCount?: number;
}

export class KomaOfficialProvider implements ITVProvider {
  type = 'koma-official' as const;
  config: ITVConfig;

  // 声明需要远端 URL：framework 会自动把本地/data 图上传到图床再塞进来。
  assetTransports = {
    primaryImage: ['remote-url'] as const,
    additionalReferences: ['remote-url'] as const,
    referenceImages: ['remote-url'] as const,
    startFrame: ['remote-url'] as const,
    endFrame: ['remote-url'] as const,
  };

  constructor(config: ITVConfig) {
    this.config = config;
  }

  private getBaseUrl(): string {
    return assertKomaOfficialBaseUrl(this.config.baseUrl);
  }

  private getModelName(): string {
    const value = String(this.config.modelName || '').trim();
    if (!value) throw new Error('未选择 Koma 官方渠道的模型');
    return value;
  }

  private getHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.config.apiKey || ''}`,
      'Content-Type': 'application/json',
      Connection: 'close',
    };
  }

  validate(): boolean {
    return Boolean(this.config.apiKey && String(this.config.modelName || '').trim());
  }

  async testConnection(): Promise<boolean> {
    if (!this.validate()) return false;
    try {
      const resp = await safeFetch(joinUrl(this.getBaseUrl(), '/v1/models'), {
        method: 'GET',
        headers: { Authorization: `Bearer ${this.config.apiKey || ''}` },
      });
      return resp.status !== 401 && resp.status !== 403;
    } catch {
      return false;
    }
  }

  async start(request: ITVRequest): Promise<ProviderStartResult<ITVResult>> {
    if (!this.config.apiKey) throw new Error('Koma 官方渠道未配置 API Key');
    assertSupportedVideoCapabilities(request, 'Koma 官方', [
      'video.text-to-video',
      'video.image-to-video',
      'video.reference-to-video',
      'video.start-end-to-video',
    ]);

    const baseUrl = this.getBaseUrl();
    const modelName = this.getModelName();
    const options = (request.options || {}) as KomaOfficialOptions;
    const retryCount = Number.isFinite(options.createRetryCount as number)
      ? Math.max(0, Math.min(5, options.createRetryCount as number))
      : DEFAULT_CREATE_RETRY;

    const referenceUrls = this.collectReferenceUrls(request);
    const duration = Number.isFinite(options.duration as number) ? (options.duration as number) : (this.config.defaultDuration || 5);
    const resolution = options.resolution || this.config.defaultResolution || '720p';
    const ratio = options.ratio || '16:9';

    return withLimiter(options.inflightLimit, async () => {
      // Grok 系列模型走专用字段（image_reference / size / quality）
      if (isGrokModel(modelName)) {
        return this.startGrok({
          baseUrl,
          modelName,
          prompt: request.prompt,
          ratio,
          resolution,
          duration,
          referenceUrls,
          retryCount,
        });
      }

      // 其余模型（jimeng / sora2 / 通用）走 /v1/videos 通用字段
      return this.startGeneric({
        baseUrl,
        modelName,
        prompt: request.prompt,
        ratio,
        resolution,
        duration,
        referenceUrls,
        retryCount,
        capability: request.capability,
      });
    });
  }

  async getTaskSnapshot(
    taskId: string,
    _context?: ITVTaskSnapshotContext,
  ): Promise<ProviderTaskSnapshot<ITVResult>> {
    const baseUrl = this.getBaseUrl();
    try {
      const resp = await requestWithFallback(joinUrl(baseUrl, `/v1/videos/${encodeURIComponent(taskId)}`), {
        method: 'GET',
        headers: { Authorization: `Bearer ${this.config.apiKey || ''}` },
      });
      if (!resp.ok) {
        const text = await resp.text().catch(() => '');
        return {
          state: RETRYABLE_STATUS.has(resp.status) ? 'running' : 'failed',
          progress: 0,
          error: `轮询任务失败 ${resp.status}: ${text.slice(0, 400)}`,
        };
      }
      const data = await resp.json();
      const status = String((data as Record<string, unknown>)?.status || '').toLowerCase();
      const progressRaw = (data as Record<string, unknown>)?.progress;
      const progress = typeof progressRaw === 'number'
        ? Math.max(0, Math.min(100, Math.round(progressRaw)))
        : undefined;

      if (status === 'completed') {
        const urlDirect = typeof (data as Record<string, unknown>).url === 'string'
          ? ((data as Record<string, unknown>).url as string)
          : undefined;
        const deepUrl = urlDirect || extractUrlsFromData(data)[0];
        if (deepUrl) {
          return {
            state: 'succeeded',
            progress: 100,
            output: {
              source: resolveMaybeRelative(baseUrl, deepUrl),
              taskId,
            },
          };
        }
        return { state: 'failed', progress: 0, error: '任务已完成但未返回视频地址' };
      }

      if (status === 'failed') {
        const errMsg = this.extractErrorMessage(data);
        return { state: 'failed', progress: 0, error: errMsg };
      }

      if (status === 'queued' || status === 'pending' || status === 'waiting') {
        return { state: 'queued', progress };
      }

      return { state: 'running', progress };
    } catch (err) {
      return {
        state: 'running',
        progress: 0,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  // ---- 子流程 ----

  private collectReferenceUrls(request: ITVRequest): string[] {
    const urls: string[] = [];
    const push = (asset: ProviderAssetInput | undefined) => {
      if (!asset?.value) return;
      urls.push(bustCacheForUrl(asset.value));
    };
    if (isImageToVideoRequest(request)) {
      push(request.primaryImage);
      for (const ref of request.additionalReferences || []) push(ref);
    } else if (isReferenceToVideoRequest(request)) {
      for (const ref of request.referenceImages) push(ref);
    } else if (isStartEndToVideoRequest(request)) {
      push(request.startFrame);
      push(request.endFrame);
    } else if (isTextToVideoRequest(request)) {
      // 文生无参考图
    }
    // 去重但保留顺序
    const seen = new Set<string>();
    return urls.filter((u) => {
      if (seen.has(u)) return false;
      seen.add(u);
      return true;
    });
  }

  private async startGeneric(params: {
    baseUrl: string;
    modelName: string;
    prompt: string;
    ratio: string;
    resolution: string;
    duration: number;
    referenceUrls: string[];
    retryCount: number;
    capability: ITVRequest['capability'];
  }): Promise<ProviderStartResult<ITVResult>> {
    const body: Record<string, unknown> = {
      model: params.modelName,
      prompt: params.prompt,
      ratio: params.ratio,
      resolution: params.resolution,
      duration: params.duration,
      seconds: String(params.duration),
      response_format: 'url',
    };
    if (params.referenceUrls.length > 0) {
      body.file_paths = params.referenceUrls;
    }

    try {
      const resp = await postJsonWithRetry(
        joinUrl(params.baseUrl, '/v1/videos'),
        body,
        this.getHeaders(),
        params.retryCount,
      );
      if (resp.ok) {
        const data = await resp.json();
        logger.info('Koma 官方 /v1/videos 创建成功', { response: sanitizeBodyForLog(data) });
        const parsed = parseCreateBody(data);
        if (parsed.videoUrl) {
          return {
            mode: 'immediate',
            output: {
              source: resolveMaybeRelative(params.baseUrl, parsed.videoUrl),
              taskId: parsed.taskId,
            },
          };
        }
        if (parsed.taskId) {
          return { mode: 'async', taskId: parsed.taskId };
        }
        throw new Error('响应中缺少任务 id 或视频 url');
      }
      // 404/405 说明节点不支持 /v1/videos，文生直接兜底到 chat
      if ((resp.status === 404 || resp.status === 405) && params.capability === 'video.text-to-video') {
        logger.warn('/v1/videos 不可用，回退到 /v1/chat/completions 兜底');
        return this.startChatFallback(params);
      }
      const text = await resp.text().catch(() => '');
      throw new Error(`提交视频任务失败 ${resp.status}: ${text.slice(0, 600)}`);
    } catch (err) {
      // 文生在网络层异常时也尝试 chat 兜底
      if (params.capability === 'video.text-to-video') {
        logger.warn('/v1/videos 请求失败，回退到 /v1/chat/completions', {
          error: err instanceof Error ? err.message : String(err),
        });
        return this.startChatFallback(params);
      }
      throw err;
    }
  }

  private async startChatFallback(params: {
    baseUrl: string;
    modelName: string;
    prompt: string;
    ratio: string;
    resolution: string;
    duration: number;
    retryCount: number;
  }): Promise<ProviderStartResult<ITVResult>> {
    const body = {
      model: params.modelName,
      messages: [{ role: 'user', content: params.prompt }],
      ratio: params.ratio,
      resolution: params.resolution,
      duration: params.duration,
      stream: false,
    };
    const resp = await postJsonWithRetry(
      joinUrl(params.baseUrl, '/v1/chat/completions'),
      body,
      this.getHeaders(),
      params.retryCount,
    );
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      throw new Error(`chat 兜底失败 ${resp.status}: ${text.slice(0, 600)}`);
    }
    const data = await resp.json();
    const url = extractVideoUrlFromChatResponse(data);
    if (!url) throw new Error('chat 兜底响应中未找到视频 URL');
    return {
      mode: 'immediate',
      output: { source: resolveMaybeRelative(params.baseUrl, url) },
    };
  }

  private async startGrok(params: {
    baseUrl: string;
    modelName: string;
    prompt: string;
    ratio: string;
    resolution: string;
    duration: number;
    referenceUrls: string[];
    retryCount: number;
  }): Promise<ProviderStartResult<ITVResult>> {
    if (params.referenceUrls.length > GROK_MAX_REFERENCE_IMAGES) {
      throw new Error(`Grok 最多支持 ${GROK_MAX_REFERENCE_IMAGES} 张参考图`);
    }
    const duration = normalizeDurationForGrok(params.duration);
    const body: Record<string, unknown> = {
      model: params.modelName,
      prompt: params.prompt,
      size: this.resolveGrokSize(params.ratio),
      seconds: String(duration),
      quality: /720p|1080p|hd|high/i.test(params.resolution) ? 'high' : 'standard',
    };
    if (params.referenceUrls.length > 0) {
      body.image_reference = params.referenceUrls.map((url) => ({
        type: 'image_url',
        image_url: { url },
      }));
    }
    const resp = await postJsonWithRetry(
      joinUrl(params.baseUrl, '/v1/videos'),
      body,
      this.getHeaders(),
      params.retryCount,
    );
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      throw new Error(`Grok 视频任务创建失败 ${resp.status}: ${text.slice(0, 600)}`);
    }
    const data = await resp.json();
    const parsed = parseCreateBody(data);
    if (parsed.videoUrl) {
      return {
        mode: 'immediate',
        output: {
          source: resolveMaybeRelative(params.baseUrl, parsed.videoUrl),
          taskId: parsed.taskId,
        },
      };
    }
    if (parsed.taskId) return { mode: 'async', taskId: parsed.taskId };
    throw new Error('Grok 响应中缺少任务 id 或视频 url');
  }

  private resolveGrokSize(ratio: string): string {
    const map: Record<string, string> = {
      '1:1': '1024x1024',
      '16:9': '1280x720',
      '9:16': '720x1280',
      '4:3': '1152x864',
      '3:4': '864x1152',
      '21:9': '1680x720',
    };
    return map[ratio] || map['16:9'];
  }

  private extractErrorMessage(body: unknown): string {
    if (!body || typeof body !== 'object') return '任务失败';
    const rec = body as Record<string, unknown>;
    const error = rec.error;
    if (error && typeof error === 'object') {
      const msg = (error as Record<string, unknown>).message;
      if (typeof msg === 'string' && msg.trim()) return msg.trim();
      const code = (error as Record<string, unknown>).code;
      if (typeof code === 'string' && code.trim()) return code.trim();
    }
    if (typeof error === 'string' && error.trim()) return error.trim();
    if (typeof rec.error_message === 'string') return rec.error_message as string;
    return '任务失败';
  }
}

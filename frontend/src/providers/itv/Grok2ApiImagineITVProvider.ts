/**
 * Grok2API Imagine ITV Provider
 *
 * Uses Grok2API reverse-engineered multimodal `/v1/chat/completions` endpoint for i2v.
 * We intentionally keep this provider isolated to avoid impacting existing ITV providers.
 */
import type { ITVConfig, ProviderStartResult, ProviderTaskSnapshot } from '../../types';
import {
  assertSupportedVideoCapabilities,
  requirePrimaryImage,
  type ITVProvider,
  type ITVRequest,
  type ITVResult,
} from './types';
import { safeFetch } from '../../utils/safeFetch';
import { createLogger } from '../../store/logger';
import { sanitizeBodyForLog } from '../../utils/logFormatting';

const logger = createLogger('Grok2ApiImagineITV');

type ChatContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

type ChatCompletionsResponse = {
  choices?: Array<{
    message?: {
      content?: unknown;
    };
  }>;
};

function joinUrl(baseUrl: string, path: string): string {
  const b = baseUrl.replace(/\/+$/, '');
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${b}${p}`;
}

function trimUrlTail(candidate: string): string {
  let s = candidate.trim();
  // Common trailing chars when the model returns HTML attributes or markdown-ish wrappers.
  // Also handle percent-encoded tails like %22%3E (">).
  for (let i = 0; i < 10; i += 1) {
    const before = s;
    s = s.replace(/[)"'<>.,;\]]+$/g, '');
    s = s.replace(/(%22|%27|%3E|%3C)+$/gi, '');
    if (s === before) break;
  }
  return s;
}

function normalizeCandidateUrl(candidate: string, baseUrl: string): string | null {
  const c = trimUrlTail(candidate);
  if (!c) return null;
  if (c.startsWith('data:')) return c;
  if (/^https?:\/\//i.test(c)) return c;
  if (c.startsWith('koma-local:')) return c;

  if (c.startsWith('/') || c.startsWith('./')) {
    if (/\.(mp4|webm|mov|m3u8)(\?.*)?$/i.test(c) || c.includes('/files/') || c.includes('/generated/')) {
      try {
        return new URL(c, baseUrl).toString();
      } catch {
        return null;
      }
    }
  }
  return null;
}

function extractUrlsFromText(text: string, baseUrl: string): string[] {
  if (!text) return [];
  const out: string[] = [];

  // href/src="..."
  for (const m of text.matchAll(/(?:href|src)\s*=\s*"([^"]+)"/gi)) {
    const u = normalizeCandidateUrl(m[1], baseUrl);
    if (u) out.push(u);
  }
  for (const m of text.matchAll(/(?:href|src)\s*=\s*'([^']+)'/gi)) {
    const u = normalizeCandidateUrl(m[1], baseUrl);
    if (u) out.push(u);
  }

  // Markdown link/image
  for (const m of text.matchAll(/\[[^\]]*\]\(([^)]+)\)|!\[[^\]]*\]\(([^)]+)\)/g)) {
    const u = normalizeCandidateUrl((m[1] || m[2] || '').trim(), baseUrl);
    if (u) out.push(u);
  }

  // Plain URLs
  for (const m of text.matchAll(/https?:\/\/[^\s)]+/g)) {
    const u = normalizeCandidateUrl(m[0], baseUrl);
    if (u) out.push(u);
  }

  // data:
  for (const m of text.matchAll(/data:[^ \n\r\t]+/g)) {
    const u = normalizeCandidateUrl(m[0], baseUrl);
    if (u) out.push(u);
  }

  // Relative media paths
  for (const m of text.matchAll(/(\/[^\s)]+\.(mp4|webm|mov|m3u8)(\?[^\s)]*)?)/gi)) {
    const u = normalizeCandidateUrl(m[1], baseUrl);
    if (u) out.push(u);
  }

  return out;
}

function scoreMediaUrl(url: string): number {
  const u = url.toLowerCase();
  let score = 0;
  if (u.startsWith('data:video/')) score += 200;
  if (/\.(mp4|webm|mov|m3u8)(\?|$)/.test(u)) score += 180;
  if (u.includes('/video/') || u.includes('video')) score += 40;
  if (u.includes('preview_image')) score -= 120;
  if (/\.(png|jpg|jpeg|webp|gif)(\?|$)/.test(u)) score -= 100;
  return score;
}

function findBestMediaUrlDeep(value: unknown, baseUrl: string): { best?: string; candidates: Array<{ url: string; score: number }> } {
  const visited = new Set<any>();
  const stack: unknown[] = [value];
  const candidates: Array<{ url: string; score: number }> = [];
  let steps = 0;

  const addCandidate = (u: string) => {
    const score = scoreMediaUrl(u);
    candidates.push({ url: u, score });
  };

  while (stack.length > 0 && steps < 5000) {
    steps += 1;
    const cur = stack.pop();
    if (typeof cur === 'string') {
      for (const u of extractUrlsFromText(cur, baseUrl)) addCandidate(u);
      continue;
    }
    if (!cur || typeof cur !== 'object') continue;
    if (visited.has(cur as any)) continue;
    visited.add(cur as any);

    if (Array.isArray(cur)) {
      for (let i = cur.length - 1; i >= 0; i -= 1) stack.push(cur[i]);
      continue;
    }

    const obj = cur as Record<string, unknown>;
    for (const key of ['url', 'videoUrl', 'video_url', 'src', 'href', 'path', 'output', 'result', 'preview', 'preview_image']) {
      if (key in obj) stack.push(obj[key]);
    }
    for (const v of Object.values(obj)) stack.push(v);
  }

  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0]?.url;
  return { best, candidates: candidates.slice(0, 12) };
}

export class Grok2ApiImagineITVProvider implements ITVProvider {
  type = 'grok2api-imagine-itv' as const;
  config: ITVConfig;

  // Grok2API accepts URL or data-uri (base64) for images.
  assetTransports = {
    primaryImage: ['remote-url', 'data-url'] as const,
    additionalReferences: ['remote-url', 'data-url'] as const,
  };

  constructor(config: ITVConfig) {
    this.config = config;
  }

  private getModelName(): string {
    const value = String(this.config.modelName || '').trim();
    if (!value) {
      throw new Error('模型名称未配置');
    }
    return value;
  }

  private normalizeVideoLengthSeconds(value: number | undefined): number | undefined {
    if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
    // grok2api reverse-engineered constraints:
    // video_length is a discrete enum: 6 / 10 / 15 (seconds).
    // We choose the nearest supported value to reduce "invalid_video_length" errors.
    const supported = [6, 10, 15] as const;
    let best: number = supported[0];
    let bestDist = Math.abs(value - best);
    for (const s of supported.slice(1)) {
      const dist = Math.abs(value - s);
      if (dist < bestDist) {
        best = s;
        bestDist = dist;
      }
    }
    return best;
  }

  private normalizeAspectRatio(value: string | undefined): string | undefined {
    if (!value || typeof value !== 'string') return undefined;
    const v = value.trim();
    // Preferred format: "9:16" / "16:9"
    if (/^\d{1,3}\s*:\s*\d{1,3}$/.test(v)) {
      const [aRaw, bRaw] = v.split(':').map(s => Number(s.trim()));
      if (!Number.isFinite(aRaw) || !Number.isFinite(bRaw) || aRaw <= 0 || bRaw <= 0) return undefined;
      // Keep as reduced ratio for stability
      const gcd = (x: number, y: number): number => (y === 0 ? x : gcd(y, x % y));
      const g = gcd(aRaw, bRaw);
      return `${Math.round(aRaw / g)}:${Math.round(bRaw / g)}`;
    }

    // Settings UI uses "1280x720" style; convert it to reduced ratio string.
    const m = v.match(/^(\d{3,5})x(\d{3,5})$/);
    if (!m) return undefined;
    const w = Number(m[1]);
    const h = Number(m[2]);
    if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return undefined;
    const gcd = (x: number, y: number): number => (y === 0 ? x : gcd(y, x % y));
    const g = gcd(w, h);
    return `${Math.round(w / g)}:${Math.round(h / g)}`;
  }

  private normalizeResolutionName(value: string | undefined): '480p' | '720p' | undefined {
    if (!value || typeof value !== 'string') return undefined;
    const v = value.trim().toLowerCase();
    if (v === '480p' || v === '720p') return v as any;
    // Map any WxH aspect ratios into the closest supported resolution bucket.
    const m = v.match(/^(\d{3,5})x(\d{3,5})$/);
    if (!m) return undefined;
    const w = Number(m[1]);
    const h = Number(m[2]);
    const shortEdge = Math.min(w, h);
    return shortEdge <= 480 ? '480p' : '720p';
  }

  validate(): boolean {
    return Boolean(this.config.apiKey && this.config.baseUrl && String(this.config.modelName || '').trim());
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
      const resp = await safeFetch(joinUrl(this.config.baseUrl || '', '/v1/models'), {
        method: 'GET',
        headers: { Authorization: `Bearer ${this.config.apiKey || ''}` },
      });
      return resp.status !== 401 && resp.status !== 403;
    } catch {
      return false;
    }
  }

  async start(request: ITVRequest): Promise<ProviderStartResult<ITVResult>> {
    if (!this.config.apiKey || !this.config.baseUrl) {
      throw new Error('API Key 或 API 地址未配置');
    }
    const modelName = this.getModelName();
    assertSupportedVideoCapabilities(request, 'Grok2API Imagine Video', ['video.image-to-video']);
    const primaryImage = requirePrimaryImage(request, 'Grok2API Imagine Video');

    const protocol = (this.config as any)?.promptProtocol;
    const debugBody = Boolean(protocol) || (import.meta as any)?.env?.DEV === true;

    const blocks: ChatContentBlock[] = [];
    // Doc-aligned ordering: text first, then images.
    blocks.push({ type: 'text', text: request.prompt });
    blocks.push({ type: 'image_url', image_url: { url: primaryImage.value } });
    for (const ref of request.additionalReferences || []) blocks.push({ type: 'image_url', image_url: { url: ref.value } });

    const opts = request.options || {};
    const durationRaw = typeof opts.duration === 'number' ? opts.duration : this.config.defaultDuration;
    const duration = this.normalizeVideoLengthSeconds(durationRaw);

    // Koma's ITV settings UI uses "1280x720" etc as the "resolution" selector.
    // grok2api expects that value in `video_config.aspect_ratio`, and only supports
    // a small enum for `video_config.resolution_name` (480p / 720p).
    const resolutionRaw = typeof opts.resolution === 'string'
      ? opts.resolution
      : this.config.defaultResolution;
    const aspectRatio = this.normalizeAspectRatio(resolutionRaw);
    const resolutionName = this.normalizeResolutionName(resolutionRaw);

    const body: Record<string, any> = {
      model: modelName,
      stream: false,
      messages: [{ role: 'user', content: blocks }],
      video_config: {
        ...(duration ? { video_length: duration } : undefined),
        ...(aspectRatio ? { aspect_ratio: aspectRatio } : undefined),
        ...(resolutionName ? { resolution_name: resolutionName } : undefined),
        preset: 'custom',
      },
    };

    if (debugBody) {
      logger.info('ITV chat (video) request body', {
        provider: this.config.provider,
        ...(protocol ? { promptProtocol: protocol } : undefined),
        body: sanitizeBodyForLog(body),
      });
    }

    const resp = await safeFetch(joinUrl(this.config.baseUrl || '', '/v1/chat/completions'), {
      method: 'POST',
      headers: {
        ...this.getHeaders(),
        ...(debugBody ? { 'x-koma-debug-body': '1' } : undefined),
        ...(debugBody ? { 'x-koma-trace-operation': 'itv.chat.video' } : undefined),
      },
      body: JSON.stringify(body),
    });
    const raw = await resp.text();
    if (!resp.ok) throw new Error(`提交视频任务失败 (${resp.status}): ${raw.slice(0, 1200)}`);

    let data: ChatCompletionsResponse | null = null;
    try {
      data = JSON.parse(raw) as ChatCompletionsResponse;
    } catch {
      // Some grok2api deployments may return HTML snippets.
      const { best, candidates } = findBestMediaUrlDeep(raw, this.config.baseUrl || '');
      if (!best || scoreMediaUrl(best) <= 0) {
        logger.warn('ITV chat response is not JSON and has no detectable video url', {
          rawPreview: raw.slice(0, 1200),
          candidates,
        });
        throw new Error('API 返回了无法识别的视频响应（chat/completions，非 JSON）');
      }
      return { mode: 'immediate', output: { source: best } };
    }

    const { best, candidates } = findBestMediaUrlDeep(data, this.config.baseUrl || '');
    if (!best || scoreMediaUrl(best) <= 0) {
      logger.warn('ITV chat response has no detectable video url', {
        provider: this.config.provider,
        response: sanitizeBodyForLog(data as any),
        rawPreview: raw.slice(0, 1200),
        candidates,
      });
      throw new Error('API 返回了无法识别的视频响应（chat/completions）');
    }
    return { mode: 'immediate', output: { source: best } };
  }

  async getTaskSnapshot(_taskId: string): Promise<ProviderTaskSnapshot<ITVResult>> {
    return { state: 'failed', progress: 0, error: 'Grok2API ITV does not support task snapshots' };
  }
}

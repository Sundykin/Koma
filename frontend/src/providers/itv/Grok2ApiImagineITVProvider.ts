/**
 * Grok2API Imagine ITV Provider
 *
 * Uses Grok2API reverse-engineered multimodal `/v1/chat/completions` endpoint for i2v.
 * We intentionally keep this provider isolated to avoid impacting existing ITV providers.
 */
import type { ITVConfig, ProviderStartResult, ProviderTaskSnapshot } from '../../types';
import type { ITVProvider, ITVRequest, ITVResult } from './types';
import { safeFetch } from '../../utils/safeFetch';
import { createLogger } from '../../store/logger';

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

function sanitizeBodyForLog(body: Record<string, any>): Record<string, any> {
  const walk = (v: any): any => {
    if (typeof v === 'string') {
      if (v.startsWith('data:')) return `${v.slice(0, 140)}...(data-url ${v.length} chars)`;
      return v.length > 2000 ? `${v.slice(0, 800)}...(truncated, ${v.length} chars)` : v;
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

  validate(): boolean {
    return Boolean(this.config.apiKey && this.config.baseUrl);
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
    if (!this.validate()) throw new Error('API Key 或 API 地址未配置');

    const protocol = (this.config as any)?.promptProtocol;
    const debugBody = Boolean(protocol) || (import.meta as any)?.env?.DEV === true;

    const blocks: ChatContentBlock[] = [];
    if (request.primaryImage?.value) {
      blocks.push({ type: 'image_url', image_url: { url: request.primaryImage.value } });
    }

    // Best-effort: include additional references (some Grok2API deployments may ignore beyond first).
    for (const ref of request.additionalReferences || []) {
      blocks.push({ type: 'image_url', image_url: { url: ref.value } });
    }

    blocks.push({ type: 'text', text: request.prompt });

    const opts = request.options || {};
    const duration = typeof opts.duration === 'number' ? opts.duration : this.config.defaultDuration;
    const resolutionName = typeof opts.resolution === 'string' ? opts.resolution : this.config.defaultResolution;

    const body: Record<string, any> = {
      model: (this.config as any).modelName || 'grok-imagine-1.0-video',
      messages: [{ role: 'user', content: blocks }],
      video_config: {
        ...(duration ? { video_length: duration } : undefined),
        ...(resolutionName ? { resolution_name: resolutionName } : undefined),
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

/**
 * Grok2API Imagine TTI Provider
 *
 * Goal:
 * - Keep existing providers untouched.
 * - Speak Grok2API reverse-engineered multimodal shape:
 *   - No references: OpenAI-compatible `/v1/images/generations`
 *   - With references: `/v1/images/edits` (multipart/form-data, repeated `image` fields)
 */
import type { TTIModelConfig, ProviderStartResult, ProviderTaskSnapshot } from '../../types';
import type { TTIProvider, TTIRequest, ImageResult } from './types';
import { safeFetch } from '../../utils/safeFetch';
import { createLogger } from '../../store/logger';
import { electronService } from '../../services/electronService';

const logger = createLogger('Grok2ApiImagineTTI');

type ImageGenResponse = {
  data?: Array<{ url?: string; b64_json?: string }>;
  id?: string;
  created?: number;
};

function base64ToBytes(base64: string): Uint8Array {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function parseDataUrl(dataUrl: string): { mimeType: string; bytes: Uint8Array } {
  const m = dataUrl.match(/^data:([^;]+);base64,(.*)$/);
  if (!m) {
    // Fallback for non-base64 data URLs is not supported here.
    throw new Error('不支持的 data-url 格式（需要 base64）');
  }
  return { mimeType: m[1] || 'application/octet-stream', bytes: base64ToBytes(m[2] || '') };
}

function extFromMime(mimeType: string): string {
  const m = mimeType.toLowerCase();
  if (m.includes('png')) return 'png';
  if (m.includes('jpeg') || m.includes('jpg')) return 'jpg';
  if (m.includes('webp')) return 'webp';
  if (m.includes('gif')) return 'gif';
  return 'bin';
}

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

function tryExtractMarkdownUrl(text: string): string | null {
  // ![alt](url) or [text](url)
  const m = text.match(/\[[^\]]*\]\(([^)]+)\)|!\[[^\]]*\]\(([^)]+)\)/);
  const url = (m?.[1] || m?.[2] || '').trim();
  return url || null;
}

function normalizeCandidateUrl(candidate: string, baseUrl: string): string | null {
  const c = candidate.trim();
  if (!c) return null;
  if (c.startsWith('data:')) return c;
  if (/^https?:\/\//i.test(c)) return c;

  // Some deployments may return relative URLs (e.g. /outputs/xxx.png)
  if (c.startsWith('/') || c.startsWith('./')) {
    // Only treat as URL if it looks like a media file path.
    if (/\.(png|jpg|jpeg|webp|gif)(\?.*)?$/i.test(c) || c.includes('/outputs/') || c.includes('/static/')) {
      try {
        return new URL(c, baseUrl).toString();
      } catch {
        return null;
      }
    }
  }

  // Some UIs may return a koma-local URL for local file access.
  // Keep it as-is; downstream persistence can still accept it as a "source" string.
  if (c.startsWith('koma-local:')) return c;

  return null;
}

function extractFirstUrlFromText(text: string, baseUrl: string): string | null {
  if (!text) return null;

  const md = tryExtractMarkdownUrl(text);
  if (md) {
    const normalized = normalizeCandidateUrl(md, baseUrl);
    if (normalized) return normalized;
  }

  // Prefer data: URLs first
  const dataMatch = text.match(/data:[^ \n\r\t]+/);
  if (dataMatch?.[0]) return normalizeCandidateUrl(dataMatch[0], baseUrl);

  const httpMatch = text.match(/https?:\/\/[^\s)]+/);
  if (httpMatch?.[0]) return normalizeCandidateUrl(httpMatch[0], baseUrl);

  // Relative media URLs in plain text
  const relMatch = text.match(/(\/[^\s)]+\.(png|jpg|jpeg|webp|gif)(\?[^\s)]*)?)/i);
  if (relMatch?.[1]) return normalizeCandidateUrl(relMatch[1], baseUrl);

  return null;
}

function findMediaUrlDeep(value: unknown, baseUrl: string): string | null {
  const visited = new Set<any>();
  const stack: unknown[] = [value];
  let steps = 0;

  while (stack.length > 0 && steps < 5000) {
    steps += 1;
    const cur = stack.pop();
    if (typeof cur === 'string') {
      const url = extractFirstUrlFromText(cur, baseUrl) || normalizeCandidateUrl(cur, baseUrl);
      if (url) return url;
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
    // Common keys seen in reverse-engineered backends
    for (const key of ['url', 'imageUrl', 'image_url', 'src', 'href', 'path', 'output', 'result']) {
      if (key in obj) stack.push(obj[key]);
    }
    // Also scan all properties best-effort
    for (const v of Object.values(obj)) stack.push(v);
  }

  return null;
}

function extractImageUrlFromGen(resp: ImageGenResponse): string | null {
  const item = resp.data?.[0];
  if (!item) return null;
  if (item.url) return item.url;
  if (item.b64_json) return `data:image/jpeg;base64,${item.b64_json}`;
  return null;
}

export class Grok2ApiImagineTTIProvider implements TTIProvider {
  type = 'grok2api-imagine-tti' as const;
  config: TTIModelConfig;

  constructor(config: TTIModelConfig) {
    this.config = config;
  }

  validate(): boolean {
    return Boolean(this.config.apiKey && this.config.baseUrl);
  }

  private getHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.config.apiKey || ''}`,
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

  async start(request: TTIRequest): Promise<ProviderStartResult<ImageResult>> {
    if (!this.validate()) throw new Error('API Key 或 API 地址未配置');

    const hasRefs = Boolean(request.references?.length);
    const protocol = (this.config as any)?.promptProtocol;
    const debugBody = Boolean(protocol) || (import.meta as any)?.env?.DEV === true;

    // 1) No references: call OpenAI-compatible images generation endpoint
    if (!hasRefs) {
      const w = request.options?.width;
      const h = request.options?.height;
      const body: Record<string, any> = {
        model: this.config.modelName || 'grok-imagine-1.0',
        prompt: request.prompt,
        n: 1,
        ...(typeof w === 'number' && typeof h === 'number' ? { size: `${w}x${h}` } : undefined),
      };

      if (debugBody) {
        logger.info('TTI generations request body', {
          provider: this.config.provider,
          ...(protocol ? { promptProtocol: protocol } : undefined),
          body: sanitizeBodyForLog(body),
        });
      }

      const resp = await safeFetch(joinUrl(this.config.baseUrl || '', '/v1/images/generations'), {
        method: 'POST',
        headers: {
          ...this.getHeaders(),
          ...(debugBody ? { 'x-koma-debug-body': '1' } : undefined),
          ...(debugBody ? { 'x-koma-trace-operation': 'tti.generations' } : undefined),
        },
        body: JSON.stringify(body),
      });
      const raw = await resp.text();
      if (!resp.ok) throw new Error(`创建任务失败: ${raw.slice(0, 1200)}`);

      let data: ImageGenResponse;
      try {
        data = JSON.parse(raw) as ImageGenResponse;
      } catch {
        logger.warn('TTI generations response is not JSON', { preview: raw.slice(0, 1200) });
        throw new Error('API 返回了无法识别的图片响应（images/generations，非 JSON）');
      }
      const url = extractImageUrlFromGen(data);
      if (!url) throw new Error('API 返回了无法识别的图片响应');
      return { mode: 'immediate', output: { path: url, url } };
    }

    // 2) With references: use /v1/images/edits (multipart)
    const form = new FormData();
    form.append('model', this.config.modelName || 'grok-imagine-1.0-edit');
    form.append('prompt', request.prompt);

    const refs = request.references || [];
    for (let i = 0; i < refs.length; i += 1) {
      const ref = refs[i];
      if (!ref?.value) continue;

      let mimeType = ref.mimeType || 'image/png';
      let bytes: Uint8Array | null = null;

      if (ref.value.startsWith('data:')) {
        const parsed = parseDataUrl(ref.value);
        mimeType = parsed.mimeType || mimeType;
        bytes = parsed.bytes;
      } else if (ref.transport === 'remote-url') {
        // Edits endpoint expects file parts; for remote URLs we best-effort download to temp first.
        if (!electronService.isElectron()) {
          throw new Error('当前环境无法处理 remote-url 参考图，请改用 data-url 或在 Electron 环境中运行');
        }
        const tmpDir = await electronService.app.getPath('temp');
        const tmpPath = `${tmpDir.replace(/\/+$/, '')}/koma-grok2api-edit-${Date.now()}-${i}.bin`;
        const dl = await electronService.fs.downloadFile(ref.value, tmpPath);
        if (!dl?.success) throw new Error(`下载参考图失败: ${ref.value}`);
        const base64 = await electronService.fs.readFileAsBase64(tmpPath);
        bytes = base64ToBytes(base64);
        // Best-effort cleanup (ignore errors)
        electronService.fs.remove(tmpPath).catch(() => {});
      } else {
        // data-url is expected for local assets; if we reach here it's likely a filesystem path or other
        throw new Error(`不支持的参考图输入: ${ref.transport}:${ref.value}`);
      }

      const filename = `image${i + 1}.${extFromMime(mimeType)}`;
      form.append('image', new Blob([bytes], { type: mimeType }), filename);
    }

    if (debugBody) {
      logger.info('TTI edits (multipart) request', {
        provider: this.config.provider,
        ...(protocol ? { promptProtocol: protocol } : undefined),
        model: this.config.modelName || 'grok-imagine-1.0-edit',
        prompt: request.prompt,
        images: refs.map((r, i) => ({
          i: i + 1,
          transport: r.transport,
          mimeType: r.mimeType,
          valuePreview: typeof r.value === 'string' ? (r.value.startsWith('data:') ? `${r.value.slice(0, 80)}...(data-url)` : r.value) : String(r.value),
        })),
      });
    }

    const resp = await safeFetch(joinUrl(this.config.baseUrl || '', '/v1/images/edits'), {
      method: 'POST',
      headers: {
        ...this.getHeaders(),
        ...(debugBody ? { 'x-koma-debug-body': '1' } : undefined),
        ...(debugBody ? { 'x-koma-trace-operation': 'tti.images.edits' } : undefined),
      },
      body: form as any,
    });
    const raw = await resp.text();
    if (!resp.ok) throw new Error(`创建任务失败: ${raw.slice(0, 1200)}`);

    let data: any = null;
    try {
      data = JSON.parse(raw);
    } catch {
      logger.warn('TTI images/edits response is not JSON', { preview: raw.slice(0, 1200) });
      throw new Error('API 返回了无法识别的图片响应（images/edits，非 JSON）');
    }

    // Most deployments keep OpenAI-like shape: { data: [{url|b64_json}] }
    const candidate = extractImageUrlFromGen(data as ImageGenResponse) || findMediaUrlDeep(data, this.config.baseUrl || '');
    const url = candidate ? (normalizeCandidateUrl(candidate, this.config.baseUrl || '') || candidate) : null;
    if (!url) {
      logger.warn('TTI images/edits response has no detectable media url', {
        provider: this.config.provider,
        response: sanitizeBodyForLog(data as any),
        rawPreview: raw.slice(0, 1200),
      });
      throw new Error('API 返回了无法识别的图片响应（images/edits）');
    }
    return { mode: 'immediate', output: { path: url, url } };
  }

  // Grok2API endpoints are typically immediate; keep snapshot unimplemented for now.
  async getTaskSnapshot(_taskId: string): Promise<ProviderTaskSnapshot<ImageResult>> {
    return { state: 'failed', progress: 0, error: 'Grok2API TTI does not support task snapshots' };
  }
}

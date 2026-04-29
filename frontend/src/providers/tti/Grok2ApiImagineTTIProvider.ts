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
import { base64ToBytes, parseDataUrl } from '../../utils/encoding';
import { sanitizeBodyForLog } from '../../utils/logFormatting';
import { resolveTTISize } from './utils/ttiSize';

const logger = createLogger('Grok2ApiImagineTTI');

const GROK2API_MAX_BATCH_IMAGES = 10;
const GROK2API_LITE_MAX_EDIT_BATCH_IMAGES = 4;

type ImageGenResponse = {
  data?: Array<{ url?: string; b64_json?: string }>;
  id?: string;
  created?: number;
};

type ChatCompletionsResponse = {
  id?: string;
  choices?: Array<{
    message?: {
      content?: unknown;
    };
  }>;
};

function extFromMime(mimeType: string): string {
  const m = mimeType.toLowerCase();
  if (m.includes('png')) return 'png';
  if (m.includes('jpeg') || m.includes('jpg')) return 'jpg';
  if (m.includes('webp')) return 'webp';
  if (m.includes('gif')) return 'gif';
  return 'bin';
}


function joinUrl(baseUrl: string, path: string): string {
  const b = baseUrl.replace(/\/+$/, '');
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${b}${p}`;
}

function clampCount(value: unknown, max: number): number {
  const normalized = Number(value);
  if (!Number.isFinite(normalized)) return 1;
  return Math.max(1, Math.min(max, Math.floor(normalized)));
}

function isLiteImageModel(modelName: string): boolean {
  return /(?:^|[-_\s])lite(?:$|[-_\s])/i.test(modelName);
}

function extractMarkdownUrls(text: string): string[] {
  return Array.from(text.matchAll(/(?:!\[[^\]]*\]|\[[^\]]*\])\(([^)]+)\)/g))
    .map(match => (match[1] || '').trim())
    .filter(Boolean);
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

function extractUrlsFromText(text: string, baseUrl: string): string[] {
  if (!text) return [];

  const candidates = [
    ...extractMarkdownUrls(text),
    ...Array.from(text.matchAll(/data:[^ \n\r\t]+/g)).map(match => match[0]),
    ...Array.from(text.matchAll(/https?:\/\/[^\s)]+/g)).map(match => match[0]),
    ...Array.from(text.matchAll(/(?:^|[\s(])(\/[^\s)]+\.(?:png|jpg|jpeg|webp|gif)(?:\?[^\s)]*)?)/gi)).map(match => match[1] || ''),
  ];

  const seen = new Set<string>();
  const urls: string[] = [];
  for (const candidate of candidates) {
    const normalized = normalizeCandidateUrl(candidate, baseUrl);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    urls.push(normalized);
  }
  return urls;
}

function extractFirstUrlFromText(text: string, baseUrl: string): string | null {
  return extractUrlsFromText(text, baseUrl)[0] ?? null;
}

function findMediaUrlsDeep(value: unknown, baseUrl: string): string[] {
  const visited = new Set<any>();
  const seen = new Set<string>();
  const urls: string[] = [];
  const stack: unknown[] = [value];
  let steps = 0;

  while (stack.length > 0 && steps < 5000) {
    steps += 1;
    const cur = stack.pop();
    if (typeof cur === 'string') {
      for (const url of extractUrlsFromText(cur, baseUrl)) {
        if (seen.has(url)) continue;
        seen.add(url);
        urls.push(url);
      }
      const normalized = normalizeCandidateUrl(cur, baseUrl);
      if (normalized && !seen.has(normalized)) {
        seen.add(normalized);
        urls.push(normalized);
      }
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

  return urls;
}

function findMediaUrlDeep(value: unknown, baseUrl: string): string | null {
  return findMediaUrlsDeep(value, baseUrl)[0] ?? null;
}

function dropOverflowImageTags(prompt: string, maxImages: number): string {
  const out = prompt
    .replace(/\@Image\s+(\d+)\b/g, (m, nRaw) => (Number(nRaw) > maxImages ? '' : m))
    .replace(/\[\[IMAGE_TAG_(\d+)\]\]/g, (m, nRaw) => (Number(nRaw) > maxImages ? '' : m));
  return out.replace(/\s{2,}/g, ' ').trim();
}

function stripBatchMetadata(image: ImageResult): ImageResult {
  const metadata = image.metadata ? { ...image.metadata } : undefined;
  if (metadata?.batchImages) {
    delete metadata.batchImages;
  }
  return metadata ? { ...image, metadata } : { ...image };
}

function createImmediateImageResult(images: ImageResult[]): ImageResult {
  const normalized = images.map(stripBatchMetadata);
  const first = normalized[0];
  if (!first) {
    throw new Error('API 返回了无法识别的图片响应');
  }
  if (normalized.length === 1) {
    return first;
  }
  return {
    ...first,
    metadata: {
      ...(first.metadata ?? {}),
      batchImages: normalized,
    },
  };
}

function extractImageResultsFromGen(resp: ImageGenResponse): ImageResult[] {
  return (resp.data ?? [])
    .map(item => {
      const url = item.url || (item.b64_json ? `data:image/jpeg;base64,${item.b64_json}` : null);
      return url ? { path: url, url } : null;
    })
    .filter(Boolean) as ImageResult[];
}

export class Grok2ApiImagineTTIProvider implements TTIProvider {
  type = 'grok2api-imagine-tti' as const;
  config: TTIModelConfig;

  constructor(config: TTIModelConfig) {
    // grok2api-imagine-tti 协议固有需要 grok-image-index 编译（@角色名 → @Image N 且 refs 自动限 3）。
    // 与 Grok2ApiImagineITVProvider 对称硬绑，避免用户漏配导致上游 400。
    this.config = { ...config, promptProtocol: config.promptProtocol ?? 'grok-image-index' };
  }

  private getModelName(): string {
    const value = String(this.config.modelName || '').trim();
    if (!value) {
      throw new Error('模型名称未配置');
    }
    return value;
  }

  validate(): boolean {
    const hasCredentialRef = Boolean(this.config.profileId) || Boolean(this.config.apiKey);
    return hasCredentialRef && Boolean(this.config.baseUrl) && Boolean(String(this.config.modelName || '').trim());
  }

  private getHeaders(): Record<string, string> {
    // 优先走 channelId 代理（主进程解密注入 Authorization）；回退到明文 apiKey（历史路径）
    if (this.config.profileId) {
      return { 'x-koma-channel-id': this.config.profileId };
    }
    return {
      Authorization: `Bearer ${this.config.apiKey || ''}`,
    };
  }

  private getJsonHeaders(): Record<string, string> {
    return {
      ...this.getHeaders(),
      'Content-Type': 'application/json',
    };
  }

  async testConnection(): Promise<boolean> {
    if (!this.validate()) return false;
    try {
      const resp = await safeFetch(joinUrl(this.config.baseUrl || '', '/v1/models'), {
        method: 'GET',
        headers: this.getHeaders(),
      });
      return resp.status !== 401 && resp.status !== 403;
    } catch {
      return false;
    }
  }

  async start(request: TTIRequest): Promise<ProviderStartResult<ImageResult>> {
    if ((!this.config.apiKey && !this.config.profileId) || !this.config.baseUrl) {
      throw new Error('API Key 或 API 地址未配置');
    }
    const modelName = this.getModelName();

    const hasRefs = Boolean(request.references?.length);
    const protocol = (this.config as any)?.promptProtocol;
    const debugBody = Boolean(protocol) || (import.meta as any)?.env?.DEV === true;

    // 解析尺寸：优先显式 width/height，其次请求比例，最后渠道默认尺寸。
    const resolveSize = (): string | undefined => resolveTTISize(request.options, this.config.defaultSize);
    const generationCount = clampCount(request.count, GROK2API_MAX_BATCH_IMAGES);
    const chatCount = clampCount(request.count, GROK2API_MAX_BATCH_IMAGES);
    const editCount = clampCount(
      request.count,
      isLiteImageModel(modelName) ? GROK2API_LITE_MAX_EDIT_BATCH_IMAGES : GROK2API_MAX_BATCH_IMAGES,
    );

    // 1) No references: call OpenAI-compatible images generation endpoint
    if (!hasRefs) {
      const size = resolveSize();
      const body: Record<string, any> = {
        model: modelName,
        prompt: request.prompt,
        n: generationCount,
        ...(size ? { size } : undefined),
      };

      if (debugBody) {
        logger.info('TTI generations request body', {
          provider: this.config.provider,
          ...(protocol ? { promptProtocol: protocol } : undefined),
          size,
          requestedAspectRatio: request.options?.aspectRatio,
          defaultSize: this.config.defaultSize,
          body: sanitizeBodyForLog(body),
        });
      }

      const resp = await safeFetch(joinUrl(this.config.baseUrl || '', '/v1/images/generations'), {
        method: 'POST',
        headers: {
          ...this.getJsonHeaders(),
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
      const images = extractImageResultsFromGen(data);
      if (!images.length) throw new Error('API 返回了无法识别的图片响应');
      return { mode: 'immediate', output: createImmediateImageResult(images) };
    }

    // 2) With references:
    // Some deployments/proxies may not support multipart reliably. Try JSON-body edit first.
    const refsAll = request.references || [];
    const refs = refsAll.slice(0, 3);
    const prompt = dropOverflowImageTags(request.prompt, refs.length);

    try {
      const content = [
        { type: 'text', text: prompt },
        ...refs.map(r => ({ type: 'image_url', image_url: { url: r.value } })),
      ];

      const size = resolveSize();

      const body: Record<string, any> = {
        model: modelName,
        stream: false,
        messages: [{ role: 'user', content }],
        image_config: {
          n: chatCount,
          ...(size ? { size } : undefined),
        },
      };

      if (debugBody) {
        logger.info('TTI chat(edit) request body', {
          provider: this.config.provider,
          ...(protocol ? { promptProtocol: protocol } : undefined),
          size,
          requestedAspectRatio: request.options?.aspectRatio,
          defaultSize: this.config.defaultSize,
          body: sanitizeBodyForLog(body),
        });
      }

      const resp = await safeFetch(joinUrl(this.config.baseUrl || '', '/v1/chat/completions'), {
        method: 'POST',
        headers: {
          ...this.getJsonHeaders(),
          ...(debugBody ? { 'x-koma-debug-body': '1' } : undefined),
          ...(debugBody ? { 'x-koma-trace-operation': 'tti.chat.edit' } : undefined),
        },
        body: JSON.stringify(body),
      });
      const raw = await resp.text();
      if (!resp.ok) throw new Error(`chat/edit failed (${resp.status}): ${raw.slice(0, 600)}`);

      let data: ChatCompletionsResponse;
      try {
        data = JSON.parse(raw) as ChatCompletionsResponse;
      } catch {
        throw new Error(`chat/edit non-json: ${raw.slice(0, 600)}`);
      }

      const images = findMediaUrlsDeep(data, this.config.baseUrl || '')
        .map(url => ({ path: url, url } satisfies ImageResult));
      if (!images.length) throw new Error('chat/edit has no media url');
      return { mode: 'immediate', output: createImmediateImageResult(images) };
    } catch (err: any) {
      logger.warn('TTI chat(edit) failed; falling back to images/edits multipart', {
        provider: this.config.provider,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    // 2.2) Fallback: use /v1/images/edits (multipart)
    const form = new FormData();
    form.append('model', modelName);
    form.append('prompt', prompt);
    form.append('n', String(editCount));

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
        model: modelName,
        size: resolveSize(),
        requestedAspectRatio: request.options?.aspectRatio,
        defaultSize: this.config.defaultSize,
        prompt,
        images: refsAll.map((r, i) => ({
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
    let images = extractImageResultsFromGen(data as ImageGenResponse);
    if (!images.length) {
      images = findMediaUrlsDeep(data, this.config.baseUrl || '')
        .map(url => ({ path: url, url } satisfies ImageResult));
    }
    if (!images.length) {
      logger.warn('TTI images/edits response has no detectable media url', {
        provider: this.config.provider,
        response: sanitizeBodyForLog(data as any),
        rawPreview: raw.slice(0, 1200),
      });
      throw new Error('API 返回了无法识别的图片响应（images/edits）');
    }
    return { mode: 'immediate', output: createImmediateImageResult(images) };
  }

  // Grok2API endpoints are typically immediate; keep snapshot unimplemented for now.
  async getTaskSnapshot(_taskId: string): Promise<ProviderTaskSnapshot<ImageResult>> {
    return { state: 'failed', progress: 0, error: 'Grok2API TTI does not support task snapshots' };
  }
}

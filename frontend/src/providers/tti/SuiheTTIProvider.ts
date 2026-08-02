/**
 * 穗禾（Suihe）直连 TTI Provider — https://www.suihemedia.cloud
 *（文档写的 api.suihemedia.cloud 实测无创作路由/鉴权 403，官网 www 域才是实际 API 网关）
 *
 * 协议（对齐穗禾开放 API 文档）：
 *   - POST /v1/images/generations，**multipart/form-data**（官方推荐）：
 *     文本字段 prompt / model / ratio / resolution / n / watermark；
 *     参考图用原始文件字段 `images`（可多条），由穗禾完成接收与可拉取编排，
 *     不需要先把素材传到自建公网图床。
 *   - 创作接口为异步任务：受理（多为 202）后取 task_id（UUID），
 *     轮询 GET /v1/tasks/{task_id} 至 success/failed，从 result_urls 取成图。
 *   - 鉴权 Authorization: Bearer <sk-…>，统一走 buildChannelAuthRequest
 *     （有 profileId 时由主进程注入，明文不出主进程）。
 *
 * 注意：
 *   - multipart 下参考图字段名是 `images`（文件）；JSON 模式才是 image/images，
 *     两者不可混用 —— 本 Provider 只走 multipart。
 *   - watermark 恒 false（与产品其他渠道一致：不添加水印）。
 *   - 不启用 Koma 提示词协议（grok-image-index），多图引用由用户在 prompt 自然语言描述。
 */
import type { TTIModelConfig, ProviderStartResult, ProviderTaskSnapshot, ProviderAssetInput } from '../../types';
import type { TTIProvider, TTIOptions, TTIRequest, ImageResult } from './types';
import { safeFetch } from '../../utils/safeFetch';
import { buildChannelAuthRequest } from '../channel/auth';
import { createLogger } from '../../store/logger';
import { fetchReferenceBytes, extFromMime } from '../utils/referenceAssets';

const logger = createLogger('SuiheTTI');

const SUIHE_GENERATIONS_PATH = '/v1/images/generations';
const SUIHE_TASKS_PATH = '/v1/tasks';
const SUIHE_MODELS_PATH = '/v1/models';

/** 参考图数量安全上限（穗禾以服务端校验为准，这里对齐 Seedream 系列的 10 张档位） */
const SUIHE_MAX_REFERENCES = 10;
const SUIHE_MAX_BATCH_IMAGES = 10;

function joinUrl(base: string, path: string): string {
  const b = base.replace(/\/+$/, '');
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${b}${p}`;
}

/** 比例格式校验（W:H），合法即透传，可选值范围由服务端校验 */
function normalizeRatio(value?: string): string | undefined {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return undefined;
  const m = raw.match(/^(\d{1,3})\s*:\s*(\d{1,3})$/);
  if (!m) return undefined;
  return `${Number(m[1])}:${Number(m[2])}`;
}

/**
 * 清晰度档位：穗禾 multipart 用 resolution（如 2k），支持 1K~4K 或 WxH。
 * imageSize/defaultSize 为档位时小写透传；defaultSize 为 WxH 时改送 size 字段。
 */
function normalizeResolutionTier(value?: string): string | undefined {
  const key = String(value || '').trim().toLowerCase();
  if (/^(1k|1\.5k|2k|3k|4k)$/.test(key)) return key;
  return undefined;
}

function normalizePixelSize(value?: string): string | undefined {
  const m = String(value || '').trim().toLowerCase().match(/^(\d{2,5})x(\d{2,5})$/);
  return m ? `${m[1]}x${m[2]}` : undefined;
}

interface SuiheTaskStatus {
  status?: string;
  progress?: number | string;
  progress_pct?: number | string;
  result_urls?: string[];
  fail_reason?: string;
  error?: { code?: string; message?: string };
}

function parseTaskState(data: SuiheTaskStatus): ProviderTaskSnapshot<ImageResult>['state'] {
  const status = String(data.status || '').toLowerCase();
  if (status === 'success' || status === 'completed' || status === 'succeeded') return 'succeeded';
  if (status === 'failed' || status === 'error' || status === 'cancelled' || status === 'canceled') return 'failed';
  if (status === 'pending' || status === 'submitted' || status === 'queued') return 'queued';
  return 'running';
}

function parseTaskProgress(data: SuiheTaskStatus, state: ProviderTaskSnapshot<ImageResult>['state']): number {
  const raw = data.progress_pct ?? data.progress;
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (Number.isFinite(n)) return Math.max(0, Math.min(100, Math.round(n)));
  return state === 'succeeded' ? 100 : 0;
}

export class SuiheTTIProvider implements TTIProvider {
  type = 'suihe-tti' as const;
  config: TTIModelConfig;
  /**
   * multipart 直传原始文件：data-url 经 parseDataUrl 解字节、remote-url 由前端下载，
   * 调用方无需先上传图床。
   */
  supportsLocalReferences = true;

  constructor(config: TTIModelConfig) {
    // 不默认启用 Koma 提示词协议（grok-image-index）。
    this.config = { ...config };
  }

  private getModelName(): string {
    const value = String(this.config.modelName || '').trim();
    if (!value) throw new Error('模型名称未配置');
    return value;
  }

  private getBaseUrl(): string {
    return (this.config.baseUrl || '').replace(/\/+$/, '');
  }

  private getAuthOnlyHeaders(): Record<string, string> {
    return buildChannelAuthRequest({
      channelId: this.config.profileId,
      apiKey: this.config.apiKey,
      mode: 'bearer-header',
    }).headers;
  }

  validate(): boolean {
    const hasCredentialRef = Boolean(this.config.profileId) || Boolean(this.config.apiKey);
    return hasCredentialRef && Boolean(this.config.baseUrl) && Boolean(String(this.config.modelName || '').trim());
  }

  async testConnection(): Promise<boolean> {
    if (!this.validate()) return false;
    try {
      const response = await safeFetch(joinUrl(this.getBaseUrl(), SUIHE_MODELS_PATH), {
        method: 'GET',
        headers: this.getAuthOnlyHeaders(),
      });
      return response.status !== 401 && response.status !== 403;
    } catch {
      return false;
    }
  }

  private clampCount(value: unknown): number {
    const n = Number(value);
    if (!Number.isFinite(n)) return 1;
    return Math.max(1, Math.min(SUIHE_MAX_BATCH_IMAGES, Math.floor(n)));
  }

  private createImmediateOutput(images: ImageResult[]): ImageResult | null {
    const first = images[0];
    if (!first) return null;
    if (images.length === 1) return first;
    return {
      ...first,
      metadata: {
        ...(first.metadata ?? {}),
        batchImages: images,
      },
    };
  }

  /**
   * 提交生图任务（multipart 直传参考原文件），恒返回异步 taskId。
   */
  async start(request: TTIRequest): Promise<ProviderStartResult<ImageResult>> {
    if ((!this.config.apiKey && !this.config.profileId) || !this.config.baseUrl) {
      throw new Error('API Key 或 API 地址未配置');
    }
    const model = this.getModelName();
    const options: TTIOptions | undefined = request.options;
    const count = this.clampCount(request.count);

    const form = new FormData();
    form.append('prompt', request.prompt);
    form.append('model', model);
    form.append('n', String(count));
    // 不添加水印（与产品其他渠道一致）
    form.append('watermark', 'false');

    const ratio = normalizeRatio(options?.aspectRatio);
    if (ratio) form.append('ratio', ratio);

    // 清晰度：档位送 resolution；defaultSize 为 WxH 时送 size；默认 2k
    const pixelSize = normalizePixelSize(this.config.defaultSize)
      || (typeof options?.width === 'number' && typeof options?.height === 'number'
        ? `${Math.round(options.width)}x${Math.round(options.height)}`
        : undefined);
    const tier = normalizeResolutionTier(options?.imageSize)
      || normalizeResolutionTier(this.config.defaultSize);
    if (pixelSize && !tier) {
      form.append('size', pixelSize);
    } else {
      form.append('resolution', tier || '2k');
    }

    // 参考图：multipart 文件字段 `images`（可多条），原始字节直传
    const refs = (request.references ?? []).slice(0, SUIHE_MAX_REFERENCES);
    let refCount = 0;
    for (let i = 0; i < refs.length; i += 1) {
      const ref = refs[i] as ProviderAssetInput;
      if (!ref?.value) continue;
      const { bytes, mimeType } = await fetchReferenceBytes(ref);
      if (!bytes || bytes.length === 0) continue;
      form.append('images', new Blob([bytes], { type: mimeType }), `reference-${i + 1}.${extFromMime(mimeType)}`);
      refCount += 1;
    }

    logger.info('Suihe TTI start request', {
      provider: this.config.provider,
      model,
      count,
      refsCount: refCount,
      ratio,
      hasPixelSize: Boolean(pixelSize),
      promptPreview: request.prompt.slice(0, 80),
    });

    // multipart：手动覆盖 Content-Type 让浏览器自动加 boundary
    const response = await safeFetch(joinUrl(this.getBaseUrl(), SUIHE_GENERATIONS_PATH), {
      method: 'POST',
      headers: this.getAuthOnlyHeaders(),
      body: form as any,
    });

    const raw = await response.text();
    let data: { task_id?: string; id?: string; error?: { code?: string; message?: string } };
    try {
      data = JSON.parse(raw);
    } catch {
      logger.warn('Suihe TTI accept response is not JSON', { status: response.status, preview: raw.slice(0, 600) });
      throw new Error(`穗禾生图受理返回了非 JSON 响应 (HTTP ${response.status})`);
    }
    if (!response.ok) {
      const code = data?.error?.code ? `, ${data.error.code}` : '';
      const message = data?.error?.message || raw.slice(0, 300);
      throw new Error(`穗禾生图任务创建失败 (HTTP ${response.status}${code}): ${message}`);
    }

    // 图片受理的 id 与 task_id 一般为同一 UUID，可互换
    const taskId = data.task_id || data.id;
    if (!taskId) {
      throw new Error('穗禾生图受理响应未返回 task_id');
    }
    return { mode: 'async', taskId };
  }

  /**
   * 轮询任务：GET /v1/tasks/{task_id}，success 时从 result_urls 取成图。
   */
  async getTaskSnapshot(taskId: string): Promise<ProviderTaskSnapshot<ImageResult>> {
    const response = await safeFetch(
      joinUrl(this.getBaseUrl(), `${SUIHE_TASKS_PATH}/${encodeURIComponent(taskId)}`),
      { method: 'GET', headers: this.getAuthOnlyHeaders() },
    );
    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      return { state: 'failed', progress: 0, error: errorText.slice(0, 300) || `查询失败 HTTP ${response.status}` };
    }
    let data: SuiheTaskStatus;
    try {
      data = (await response.json()) as SuiheTaskStatus;
    } catch {
      return { state: 'failed', progress: 0, error: '查询返回非 JSON' };
    }

    const state = parseTaskState(data);
    const progress = parseTaskProgress(data, state);

    if (state === 'succeeded') {
      const urls = Array.isArray(data.result_urls) ? data.result_urls.filter(Boolean) : [];
      const images = urls.map(url => ({ path: url, url }));
      const output = this.createImmediateOutput(images);
      if (!output) {
        return { state: 'failed', progress: 100, error: '任务完成但未返回图片地址' };
      }
      return { state: 'succeeded', progress: 100, output };
    }
    if (state === 'failed') {
      return { state: 'failed', progress, error: data.fail_reason || data.error?.message || '任务失败' };
    }
    return { state, progress };
  }
}

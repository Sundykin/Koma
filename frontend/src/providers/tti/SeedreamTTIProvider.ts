/**
 * Doubao Seedream TTI Provider
 * 火山引擎 Ark 图像生成接口（POST {baseUrl}/api/v3/images/generations）
 *
 * 与 OpenAICompatibleTTIProvider 的差异：
 * - 端点为 Ark 原生 /api/v3/images/generations，文生图与图生图同端点，
 *   参考图走 JSON body 的 `image` 字段（单张 string / 多张数组，最多 10 张），
 *   而非 OpenAI 的 /v1/images/edits multipart。
 * - 纯同步接口（Seedream 5.0 pro 不支持组图/流式/异步任务），
 *   count>1 时并行扇出多次请求后用 metadata.batchImages 合并。
 * - watermark 恒为 false（产品要求生成图不带 "AI生成" 水印）。
 * - 不启用 Koma 提示词协议（grok-image-index）：Seedream 用自然语言引用多图（图1/图2），
 *   构造函数不默认 promptProtocol。
 *
 * 参考图传输：一律转为 base64 data-url 直传（Ark 原生支持，单图 ≤30MB）。
 * 早期版本先把 data-url 上传图床再喂公网 URL，但 Ark 服务端下载图床经常超时
 * （HTTP 400 InvalidParameter: Timeout while downloading url），故改为：
 *   - data-url → 规范化 header 后直接传
 *   - remote-url → 前端自行下载字节并编码为 data-url（渲染端下载远快于 Ark 回源）；
 *     下载失败才退回原始 URL 让 Ark 自己拉。
 */
import type { TTIModelConfig, ProviderStartResult, ProviderAssetInput } from '../../types';
import type { TTIProvider, TTIOptions, TTIRequest, ImageResult } from './types';
import { safeFetch } from '../../utils/safeFetch';
import { buildChannelAuthRequest } from '../channel/auth';
import { createLogger } from '../../store/logger';
import { bytesToBase64, parseDataUrl } from '../../utils/encoding';

const logger = createLogger('SeedreamTTI');

const SEEDREAM_GENERATIONS_PATH = '/api/v3/images/generations';
const SEEDREAM_MODELS_PATH = '/api/v3/models';

/** Ark 限制：参考图最多 10 张；参考图数量 + 最终生成图片数量 ≤ 15 */
const SEEDREAM_MAX_REFERENCES = 10;
const SEEDREAM_MAX_IMAGES_PER_BATCH = 15;

/** Ark size=WxH 约束：总像素 ∈ [921600, 4624220]，宽高比 ∈ [1/16, 16] */
const ARK_MIN_PIXELS = 921600;
const ARK_MAX_PIXELS = 4624220;
const ARK_MAX_ASPECT = 16;

/**
 * 宽高比 → 像素表，三档均满足 Ark 约束。
 * 注意 1K 档的 21:9/9:21 不能按长边 1280 缩放（1280x544=696,320 低于总像素下限
 * 921,600 会被 Ark 拒绝），需放大到 1568x672。
 */
const SEEDREAM_ASPECT_TO_SIZE_1K: Record<string, string> = {
  '1:1': '1024x1024',
  '16:9': '1280x720',
  '9:16': '720x1280',
  '3:2': '1280x848',
  '2:3': '848x1280',
  '4:3': '1152x864',
  '3:4': '864x1152',
  '21:9': '1568x672',
  '9:21': '672x1568',
};

const SEEDREAM_ASPECT_TO_SIZE_1_5K: Record<string, string> = {
  '1:1': '1280x1280',
  '16:9': '1536x864',
  '9:16': '864x1536',
  '3:2': '1632x1088',
  '2:3': '1088x1632',
  '4:3': '1408x1056',
  '3:4': '1056x1408',
  '21:9': '1792x768',
  '9:21': '768x1792',
};

const SEEDREAM_ASPECT_TO_SIZE_2K: Record<string, string> = {
  '1:1': '2048x2048',
  '16:9': '2048x1152',
  '9:16': '1152x2048',
  '3:2': '2048x1360',
  '2:3': '1360x2048',
  '4:3': '2048x1536',
  '3:4': '1536x2048',
  '21:9': '2240x960',
  '9:21': '960x2240',
};

type SeedreamTier = '1K' | '1.5K' | '2K';

/** Seedream 5.0 pro 最高 2K：4K/3K 等更高档位封顶到 2K。 */
function normalizeSeedreamTier(value?: string): SeedreamTier | undefined {
  const key = String(value || '').trim().toLowerCase();
  if (key === '1k') return '1K';
  if (key === '1.5k') return '1.5K';
  if (key === '2k' || key === '3k' || key === '4k') return '2K';
  return undefined;
}

function isValidArkPixelSize(width: number, height: number): boolean {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return false;
  const pixels = width * height;
  if (pixels < ARK_MIN_PIXELS || pixels > ARK_MAX_PIXELS) return false;
  const ratio = Math.max(width, height) / Math.min(width, height);
  return ratio <= ARK_MAX_ASPECT;
}

function reduceAspectRatio(width: number, height: number): string | undefined {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return undefined;
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  const divisor = gcd(Math.round(width), Math.round(height));
  return `${Math.round(width / divisor)}:${Math.round(height / divisor)}`;
}

function normalizeAspectRatioInput(value: string | undefined): string | undefined {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return undefined;
  const direct = raw.match(/^(\d{1,3})\s*:\s*(\d{1,3})$/);
  if (direct) return reduceAspectRatio(Number(direct[1]), Number(direct[2]));
  const wxh = raw.match(/^(\d{2,5})x(\d{2,5})$/);
  if (wxh) return reduceAspectRatio(Number(wxh[1]), Number(wxh[2]));
  return undefined;
}

/**
 * 解析 Ark 的 size 参数：
 * 1. 显式 width/height 且满足 Ark 约束 → 'WxH'
 * 2. aspectRatio → 按档位（imageSize/defaultSize，默认 2K）查像素表
 * 3. defaultSize 为合法 'WxH' → 照搬
 * 4. 兜底 → 档位标签（'1K'/'1.5K'/'2K'），由模型按提示词自行决定比例
 */
export function resolveSeedreamSize(options?: TTIOptions, defaultSize?: string): string {
  const w = options?.width;
  const h = options?.height;
  if (typeof w === 'number' && typeof h === 'number' && isValidArkPixelSize(w, h)) {
    return `${Math.round(w)}x${Math.round(h)}`;
  }

  const tier = normalizeSeedreamTier(options?.imageSize) ?? normalizeSeedreamTier(defaultSize) ?? '2K';
  const table = tier === '1K'
    ? SEEDREAM_ASPECT_TO_SIZE_1K
    : tier === '1.5K'
      ? SEEDREAM_ASPECT_TO_SIZE_1_5K
      : SEEDREAM_ASPECT_TO_SIZE_2K;
  // 先查原始写法再查约分结果：'21:9' 约分后是 '7:3'，但表里按惯例记作 '21:9'
  const rawRatio = String(options?.aspectRatio || '').trim().toLowerCase().replace(/\s+/g, '');
  if (rawRatio && table[rawRatio]) {
    return table[rawRatio];
  }
  const ratio = normalizeAspectRatioInput(options?.aspectRatio);
  if (ratio && table[ratio]) {
    return table[ratio];
  }

  if (defaultSize) {
    const m = defaultSize.trim().toLowerCase().match(/^(\d{2,5})x(\d{2,5})$/);
    if (m && isValidArkPixelSize(Number(m[1]), Number(m[2]))) {
      return `${m[1]}x${m[2]}`;
  }
  }

  return tier;
}

/** Ark 要求 data:image/<图片格式>;base64,...（格式必须小写）—— 重建 header 保证合规。 */
function normalizeDataUrlForArk(dataUrl: string): string {
  try {
    const { mimeType, bytes } = parseDataUrl(dataUrl);
    const mime = (mimeType || 'image/png').toLowerCase();
    return `data:${mime};base64,${bytesToBase64(bytes)}`;
  } catch {
    return dataUrl;
  }
}

function sanitizeBodyForLog(body: Record<string, any>): Record<string, any> {
  const walk = (v: any): any => {
    if (typeof v === 'string') {
      if (v.startsWith('data:')) {
        return `${v.slice(0, 140)}...(data-url ${v.length} chars)`;
      }
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

interface SeedreamImageData {
  url?: string;
  b64_json?: string;
}

interface SeedreamResponse {
  data?: SeedreamImageData[];
  error?: {
    code?: string;
    message?: string;
  };
}

export class SeedreamTTIProvider implements TTIProvider {
  type = 'doubao-seedream-tti' as const;
  config: TTIModelConfig;
  /**
   * 参考图一律由 Provider 转为 base64 data-url 直传（含 remote-url 前端下载重编码），
   * 调用方无需先上传图床，直接喂本地参考即可。
   */
  supportsLocalReferences = true;

  constructor(config: TTIModelConfig) {
    // 关键区别：不像另外三家默认 'grok-image-index'，Seedream 不启用 Koma 提示词协议。
    this.config = { ...config };
  }

  private getModelName(): string {
    const value = String(this.config.modelName || '').trim();
    if (!value) {
      throw new Error('模型名称未配置');
    }
    return value;
  }

  private getBaseUrl(): string {
    return (this.config.baseUrl || '').replace(/\/+$/, '');
  }

  private getHeaders(): Record<string, string> {
    return buildChannelAuthRequest({
      channelId: this.config.profileId,
      apiKey: this.config.apiKey,
      mode: 'bearer-header',
      headers: { 'Content-Type': 'application/json' },
    }).headers;
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
      const response = await safeFetch(`${this.getBaseUrl()}${SEEDREAM_MODELS_PATH}`, {
        method: 'GET',
        headers: this.getAuthOnlyHeaders(),
      });
      return response.status !== 401 && response.status !== 403;
    } catch {
      return false;
    }
  }

  /**
   * 把参考图解析成 Ark `image` 字段可接受的值（一律 base64 data-url 直传）：
   * - data-url → 规范化 header（mime 小写）后直接传
   * - remote-url / http(s) → 前端下载字节并编码为 data-url，避免 Ark 回源图床超时；
   *   下载失败时退回原始 URL，让 Ark 自行拉取作为最后手段
   */
  private async resolveReferenceValue(ref: ProviderAssetInput): Promise<string | null> {
    if (!ref?.value) return null;

    if (ref.value.startsWith('data:')) {
      return normalizeDataUrlForArk(ref.value);
    }

    if (ref.transport === 'remote-url' || /^https?:\/\//i.test(ref.value)) {
      try {
        const resp = await safeFetch(ref.value);
        if (!resp || !resp.ok) {
          throw new Error(`HTTP ${resp?.status ?? 'no response'}`);
        }
        const bytes = new Uint8Array(await resp.arrayBuffer());
        const mimeType = (
          ref.mimeType
          || resp.headers.get('content-type')?.split(';')[0]
          || 'image/png'
        ).toLowerCase();
        return `data:${mimeType};base64,${bytesToBase64(bytes)}`;
      } catch (error) {
        logger.warn('参考图下载失败，退回原始 URL 由 Ark 拉取', {
          url: ref.value.slice(0, 200),
          error: error instanceof Error ? error.message : String(error),
        });
        return ref.value;
      }
    }

    logger.warn('不支持的参考图输入，已跳过', { transport: ref.transport });
    return null;
  }

  private buildBody(prompt: string, references: string[], options?: TTIOptions): Record<string, any> {
    const body: Record<string, any> = {
      model: this.getModelName(),
      prompt,
      size: resolveSeedreamSize(options, this.config.defaultSize),
      response_format: 'url',
      output_format: 'png',
      // 产品要求：生成图不添加 "AI生成" 水印，恒 false，不做成可配。
      watermark: false,
    };
    if (references.length === 1) {
      body.image = references[0];
    } else if (references.length > 1) {
      body.image = references;
    }
    return body;
  }

  private async requestOnce(body: Record<string, any>, debugBody: boolean): Promise<ImageResult[]> {
    const response = await safeFetch(`${this.getBaseUrl()}${SEEDREAM_GENERATIONS_PATH}`, {
      method: 'POST',
      headers: {
        ...this.getHeaders(),
        ...(debugBody ? { 'x-koma-debug-body': '1' } : undefined),
        ...(debugBody ? { 'x-koma-trace-operation': 'tti.start' } : undefined),
      },
      body: JSON.stringify(body),
    });

    const raw = await response.text();
    let data: SeedreamResponse;
    try {
      data = JSON.parse(raw) as SeedreamResponse;
    } catch {
      logger.warn('Seedream response is not JSON', { status: response.status, preview: raw.slice(0, 600) });
      throw new Error(`Seedream 返回了非 JSON 响应 (HTTP ${response.status})`);
    }

    if (!response.ok) {
      const code = data?.error?.code ? `, ${data.error.code}` : '';
      const message = data?.error?.message || raw.slice(0, 300);
      throw new Error(`Seedream 请求失败 (HTTP ${response.status}${code}): ${message}`);
    }

    return (data.data ?? [])
      .map((item): ImageResult | null => {
        if (item.url) {
          return { path: item.url, url: item.url };
        }
        if (item.b64_json) {
          const dataUrl = `data:image/png;base64,${item.b64_json}`;
          return { path: dataUrl, url: dataUrl };
        }
        return null;
      })
      .filter(Boolean) as ImageResult[];
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
   * 生成图片（纯同步：Ark images/generations 直接返回结果）
   * count>1 时并行扇出多次请求（Seedream 5.0 pro 不支持单次组图），
   * 并用 metadata.batchImages 合并，与 MediaGenerationService 的批量落库对齐。
   */
  async start(request: TTIRequest): Promise<ProviderStartResult<ImageResult>> {
    if ((!this.config.apiKey && !this.config.profileId) || !this.config.baseUrl) {
      throw new Error('API Key 或 API 地址未配置');
    }
    if (!String(this.config.modelName || '').trim()) {
      throw new Error('模型名称未配置');
    }

    const debugBody = (import.meta as any)?.env?.DEV === true;

    const resolvedRefs = (await Promise.all(
      (request.references ?? []).map(ref => this.resolveReferenceValue(ref)),
    )).filter(Boolean) as string[];
    const references = resolvedRefs.slice(0, SEEDREAM_MAX_REFERENCES);

    // 钳制：参考图数量 + 最终生成图片数量 ≤ 15
    const maxCount = Math.max(1, SEEDREAM_MAX_IMAGES_PER_BATCH - references.length);
    const requested = Math.floor(Number(request.count) || 1);
    const count = Math.max(1, Math.min(maxCount, requested));

    const body = this.buildBody(request.prompt, references, request.options);

    if (debugBody) {
      logger.info('Seedream TTI start request', {
        provider: this.config.provider,
        model: this.getModelName(),
        size: body.size,
        count,
        refsCount: references.length,
        body: sanitizeBodyForLog(body),
      });
    }

    const images = count === 1
      ? await this.requestOnce(body, debugBody)
      : (await Promise.all(
          Array.from({ length: count }, () => this.requestOnce(body, debugBody)),
        )).flat();

    const output = this.createImmediateOutput(images);
    if (!output) {
      throw new Error('Seedream 返回了无法识别的图片响应（data 为空）');
    }
    return { mode: 'immediate', output };
  }
}

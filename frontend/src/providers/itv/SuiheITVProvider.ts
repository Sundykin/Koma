/**
 * Koma 官方 - 即梦（Koma 即梦上游）ITV Provider
 *
 * 协议：multipart/form-data 直传（推荐入口）。
 *   POST /v1/videos/generations   创建任务（表单直传常见 202，JSON 分支常见 200）
 *   GET  /v1/tasks/{task_id}      轮询任务，终态从 result_urls 取成片
 *
 * 素材一律随表单直传原始文件，由上游完成中转 —— **不再依赖图床**：
 *   - 首尾帧：first_frame / end_frame
 *   - 全能参考：image_file[_N] / video_file[_N] / audio_file[_N]
 *   - 已经是公网 http(s) 链接的素材，字段值直接传字符串，上游自行拉取
 *
 * 注意：受理响应里的 `id` 可能是 cgt- 前缀形态，不能当 /v1/tasks/{task_id} 的路径参数，
 * 必须用同响应里的 `task_id`（UUID）。
 *
 * 模型：
 *   - seedance-2.0       duration 4-15 s
 *   - seedance-2.0-fast  duration 4-15 s
 *
 * 当前阶段Koma 即梦上游强制锁 480p，所以 size 始终送 480p 档位（按 aspectRatio 选 854x480 / 480x854）。
 *
 * 注意：本 provider 走 komaapi.com 网关，独立类型避免与 grok2api 混用字段格式。
 */

import type {
  ITVConfig,
  ITVOptions,
  ProviderStartResult,
  ProviderTaskSnapshot,
} from '../../types';
import { createLogger } from '../../store/logger';
import { sanitizeBodyForLog } from '../../utils/logFormatting';
import { safeFetch } from '../../utils/safeFetch';
import { buildChannelAuthRequest } from '../channel/auth';
import { extFromMime, fetchReferenceBytes } from '../utils/referenceAssets';
import {
  assertSupportedVideoCapabilities,
  type ITVProvider,
  type ITVRequest,
  type ITVResult,
} from './types';

// 与 Grok2API 对齐的最大参考图数量；Koma 即梦上游对全能引用模式无明确硬上限，
// 这里取 7 张（Grok 限制）作为安全档位，避免 prompt 编译阶段引用过多被截断不一致。
const SUIHE_MAX_REFERENCE_IMAGES = 7;

const logger = createLogger('SuiheITVProvider');

interface SuiheCreateResponse {
  // OpenAI 视频 API 风格响应（new-api 透传上游 task_id 到此字段）
  id?: string;
  task_id?: string;
  status?: string;
  model?: string;
  created_at?: number | string;
  error?: { code?: string; message?: string };
}

interface SuiheTaskResponse extends SuiheCreateResponse {
  // OpenAIVideo（new-api 标准视频任务响应）
  progress?: number | string;
  metadata?: {
    url?: string;
    result_urls?: string[];
    [k: string]: unknown;
  };
  // 兼容字段：网关或上游变体可能直接挂在顶层
  result_urls?: string[];
  fail_reason?: string;
  progress_pct?: number | string;
  progress_text?: string;
  task_type?: string;
  // 兼容 sora 风格
  result?: { type?: string; data?: Array<{ url?: string }> };
}

const MODEL_DURATION_MAX: Record<string, number> = {
  'seedance-2.0': 15,
  'seedance-2.0-fast': 15,
};

function joinUrl(base: string, path: string): string {
  return `${base.replace(/\/+$/, '')}${path.startsWith('/') ? path : `/${path}`}`;
}

/**
 * video_resolution：接受 480p/720p/1080p/2k/4k 直传；WxH 按高度归档；识别不了给 720p。
 * 与穗禾直连 provider 同一口径，两个渠道行为保持一致。
 */
function normalizeSuiheResolution(value?: string): string {
  const raw = String(value || '').trim().toLowerCase();
  if (/^(480p|720p|1080p|2k|4k)$/.test(raw)) return raw;
  const matched = raw.match(/^(\d{2,5})x(\d{2,5})$/);
  if (matched) {
    const height = Number(matched[2]);
    if (height <= 480) return '480p';
    if (height <= 720) return '720p';
    return '1080p';
  }
  return '720p';
}

/**
 * 是否支持全能参考（image_file* / video_file* / audio_file*）。
 * seedance-1.5-pro 只支持首尾帧，传全能参考字段会被忽略或报错。
 */
function modelSupportsOmniReference(model: string): boolean {
  return !/^seedance-1\.5-pro/i.test(String(model || '').trim());
}

// Koma 即梦上游接受的比例白名单（来自 400 错误响应 supported 字段）
const SUIHE_SUPPORTED_RATIOS = new Set([
  '1:1', '4:3', '3:4', '16:9', '9:16', '3:2', '2:3', '21:9',
]);

function normalizeSuiheRatio(aspectRatio?: string): string {
  const normalized = String(aspectRatio || '').trim();
  if (SUIHE_SUPPORTED_RATIOS.has(normalized)) return normalized;
  if (normalized === 'portrait') return '9:16';
  if (normalized === 'landscape') return '16:9';
  if (normalized === 'square') return '1:1';
  // 默认横屏，避免送出 240:427 等非白名单比例
  return '16:9';
}

/**
 * 选 size：必须 gcd 后落到 SUIHE_SUPPORTED_RATIOS 白名单内的尺寸。
 *
 * 关键：new-api 网关会用 gcd 简化 size 推 ratio，比如 480x854 → gcd(480,854)=2 → "240:427"
 * 不在Koma 即梦白名单里 → 上游 400。所以必须送标准 OpenAI Sora 尺寸（720x1280 / 1280x720 / 1024x1024）
 * 这些 gcd 化后正好命中标准比例。
 *
 * video_resolution 由网关侧 suiheLockedResolution 强制锁 480p，客户端送的 size 仅用于推 ratio，
 * 实际渲染分辨率与 size 像素值无关。
 */
function pickSize(ratio: string): string {
  if (ratio === '9:16') return '720x1280';
  if (ratio === '1:1') return '1024x1024';
  if (ratio === '4:3') return '1024x768';
  if (ratio === '3:4') return '768x1024';
  if (ratio === '3:2') return '1080x720';
  if (ratio === '2:3') return '720x1080';
  if (ratio === '21:9') return '2520x1080';
  // 16:9
  return '1280x720';
}

function clampDuration(model: string, raw: unknown, fallback: number): number {
  const max = MODEL_DURATION_MAX[model] ?? 15;
  const n = typeof raw === 'number' ? raw : Number(raw);
  const v = Number.isFinite(n) ? Math.floor(n) : fallback;
  return Math.min(Math.max(v, 4), max);
}

export class SuiheITVProvider implements ITVProvider {
  type = 'koma-suihe-itv' as const;
  config: ITVConfig;

  // 网关接受 OpenAI images:[url]，所以远程 URL 与 data-url 都可由网关下载后转发；
  // 但为减少网关压力，前端优先 remote-url。
  assetTransports = {
    primaryImage: ['remote-url', 'data-url'] as const,
    additionalReferences: ['remote-url'] as const,
    referenceImages: ['remote-url'] as const,
    startFrame: ['remote-url', 'data-url'] as const,
    endFrame: ['remote-url', 'data-url'] as const,
  };

  constructor(config: ITVConfig) {
    // 默认走 Koma 即梦协议：prompt 编译占位符为 @image_file_N / @video_file_N / @audio_file_N，
    // 网关按 metadata.image_urls / video_urls / audio_urls 分发到上游 multipart 各类字段。
    // 老配置如显式设了 grok-image-index 仍然兼容（图片走 @Image N 路径，视频 / 音频不上传）。
    this.config = { ...config, promptProtocol: config.promptProtocol ?? 'koma-jimeng' };
  }

  private getBaseUrl(): string {
    return this.config.baseUrl || 'https://komaapi.com';
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

  private getModelName(): string {
    const value = String(this.config.modelName || '').trim();
    if (!value) throw new Error('模型名称未配置');
    return value;
  }

  validate(): boolean {
    const hasCredential = Boolean(this.config.profileId) || Boolean(this.config.apiKey);
    return hasCredential && Boolean(String(this.config.modelName || '').trim());
  }

  async testConnection(): Promise<boolean> {
    if (!this.validate()) return false;
    try {
      // 仅探测鉴权是否通畅，不真正下任务（避免 testConnection 触发计费）。
      const response = await safeFetch(joinUrl(this.getBaseUrl(), '/v1/models'), {
        method: 'GET',
        headers: this.getAuthOnlyHeaders(),
      });
      return response.status !== 401 && response.status !== 403;
    } catch (err) {
      logger.warn('Suihe testConnection failed', { error: err instanceof Error ? err.message : err });
      return false;
    }
  }

  /**
   * 参考素材 → multipart 表单值。
   *
   * 两种形态都由上游直接接受，所以不再需要图床中转：
   *  - 已经是公网 http(s) 链接 → 原样作为字符串字段值（上游直接拉取）
   *  - 本地素材（data URL）→ 取字节作为文件字段直传，由上游完成中转
   * 取字节失败只跳过该条，不影响整个任务。
   */
  private async toFormValue(
    ref: { transport?: string; value?: string; mimeType?: string } | undefined,
    kind: 'image' | 'video' | 'audio',
    label: string,
  ): Promise<string | Blob | undefined> {
    const value = ref?.value;
    if (!value) return undefined;
    if (ref?.transport === 'remote-url' || /^https?:\/\//i.test(value)) {
      return value;
    }
    try {
      const { bytes, mimeType } = await fetchReferenceBytes({
        transport: ref?.transport || 'data-url',
        value,
        mimeType: ref?.mimeType,
      });
      const resolvedMime = mimeType
        || (kind === 'video' ? 'video/mp4' : kind === 'audio' ? 'audio/wav' : 'image/png');
      return new Blob([bytes as BlobPart], { type: resolvedMime });
    } catch (error) {
      logger.warn(`${label} 读取失败，已跳过`, {
        error: error instanceof Error ? error.message : String(error),
      });
      return undefined;
    }
  }

  /** 把一组素材按 field / field_2 / field_3 … 的命名规则塞进表单 */
  private async appendRefs(
    form: FormData,
    refs: Array<{ transport?: string; value?: string; mimeType?: string } | undefined>,
    baseField: string,
    kind: 'image' | 'video' | 'audio',
    max: number,
  ): Promise<number> {
    let index = 0;
    for (const ref of refs) {
      if (index >= max) break;
      const value = await this.toFormValue(ref, kind, baseField);
      if (value === undefined) continue;
      index += 1;
      // 主素材字段不带序号，附加素材从 _2 开始（与接口文档一致）
      const field = index === 1 ? baseField : `${baseField}_${index}`;
      if (typeof value === 'string') {
        form.append(field, value);
      } else {
        form.append(field, value, `${baseField}-${index}.${extFromMime(value.type)}`);
      }
    }
    return index;
  }

  async start(request: ITVRequest): Promise<ProviderStartResult<ITVResult>> {
    if (!this.validate()) throw new Error('Koma 即梦 API Key 或模型未配置');
    assertSupportedVideoCapabilities(request, 'Koma 即梦', [
      'video.text-to-video',
      'video.image-to-video',
      'video.start-end-to-video',
      'video.reference-to-video',
    ]);

    const options = request.options as ITVOptions | undefined;
    const model = this.getModelName();
    const duration = clampDuration(model, options?.duration ?? this.config.defaultDuration, 5);
    const ratio = normalizeSuiheRatio(options?.aspectRatio);
    const resolution = normalizeSuiheResolution(options?.resolution ?? this.config.defaultResolution);

    const form = new FormData();
    form.append('model', model);
    form.append('prompt', String(request.prompt || '').trim());
    form.append('ratio', ratio);
    form.append('duration', String(duration));
    form.append('video_resolution', resolution);
    // creative_mode 一律省略：480p 服务端默认 native，高于 480p 默认 super_economy；
    // 且 sora-v3-933-pro / seedance-1.5-pro 明确不接受该参数，省略最省事也最安全。

    // koma-jimeng 协议编译器按 kind 拆好的素材（提示词里的 @image_file_N 等占位符与此一一对应）
    const komaAssets = (request.metadata?.komaJimengAssets ?? null) as
      | { image_urls?: string[]; video_urls?: string[]; audio_urls?: string[] }
      | null;
    const asRefs = (values?: string[]) => (values || []).map(value => ({ value }));

    type MediaRef = { transport?: string; value?: string; mimeType?: string };
    const voiceRefs = (request.metadata?.komaVoiceReferences as MediaRef[] | undefined) ?? [];
    const videoRefs = (request.metadata?.komaVideoReferences as MediaRef[] | undefined) ?? [];

    const supportsOmni = modelSupportsOmniReference(model);
    let functionMode: string | undefined;
    let imageCount = 0;

    if (!supportsOmni && request.capability !== 'video.text-to-video') {
      // seedance-1.5-pro 只支持首尾帧：传 image_file*/video_file*/audio_file* 会被忽略或报错
      const first = request.primaryImage ?? request.startFrame ?? request.referenceImages?.[0];
      imageCount = await this.appendRefs(form, [first], 'first_frame', 'image', 1);
      if (request.endFrame) {
        await this.appendRefs(form, [request.endFrame], 'end_frame', 'image', 1);
      }
      functionMode = 'first_last_frames';
    } else if (request.capability === 'video.start-end-to-video') {
      imageCount = await this.appendRefs(form, [request.startFrame], 'first_frame', 'image', 1);
      await this.appendRefs(form, [request.endFrame], 'end_frame', 'image', 1);
      functionMode = 'first_last_frames';
    } else {
      // 其余一律走全能参考：提示词里的占位符固定是 @image_file_N / @video_file_N / @audio_file_N，
      // 只有 omni_reference 的字段命名对得上；首帧场景也按 image_file 送，语义等价且字段一致。
      const imageRefs = [
        ...asRefs(komaAssets?.image_urls),
        ...(request.primaryImage ? [request.primaryImage] : []),
        ...(request.referenceImages || []),
        ...(request.additionalReferences || []),
      ];
      imageCount = await this.appendRefs(form, imageRefs, 'image_file', 'image', SUIHE_MAX_REFERENCE_IMAGES);
      const videoCount = await this.appendRefs(
        form, [...asRefs(komaAssets?.video_urls), ...videoRefs], 'video_file', 'video', 3,
      );
      // 参考音频不能单独使用，必须同时有图片或视频参考才生效
      const audioRefs = [...asRefs(komaAssets?.audio_urls), ...voiceRefs];
      if (audioRefs.length > 0 && imageCount + videoCount === 0) {
        logger.warn('参考音频缺少图片/视频参考，按上游约束丢弃', { count: audioRefs.length });
      } else {
        await this.appendRefs(form, audioRefs, 'audio_file', 'audio', 3);
      }
      if (imageCount + videoCount > 0 || audioRefs.length > 0) {
        functionMode = 'omni_reference';
      }
    }
    if (functionMode) form.append('function_mode', functionMode);

    logger.info('Koma 即梦 start request (multipart)', {
      provider: this.config.provider,
      capability: request.capability,
      model,
      ratio,
      duration,
      resolution,
      functionMode,
      imageCount,
    });

    // multipart 直传：素材由上游中转，不再需要图床
    const response = await safeFetch(joinUrl(this.getBaseUrl(), '/v1/videos/generations'), {
      method: 'POST',
      // 不能手写 Content-Type —— boundary 由 FormData 自己生成
      headers: this.getAuthOnlyHeaders(),
      body: form as unknown as BodyInit,
    });
    const raw = await response.text();
    // 表单直传分支常见 202，JSON 分支常见 200；都以响应体里的 task_id 为准
    if (!response.ok && response.status !== 202) {
      logger.error('Suihe start failed', { status: response.status, response: raw.slice(0, 1200) });
      throw new Error(`即梦视频任务创建失败 (HTTP ${response.status}): ${raw.slice(0, 600)}`);
    }
    let data: SuiheCreateResponse;
    try {
      data = JSON.parse(raw) as SuiheCreateResponse;
    } catch {
      throw new Error('即梦上游返回非 JSON 响应');
    }
    // 必须用 task_id（UUID）；受理响应里的 id 可能是 cgt- 前缀形态，
    // 不能直接当 GET /v1/tasks/{task_id} 的路径参数。
    const taskId = data.task_id || data.id;
    if (!taskId) {
      throw new Error(data.error?.message || '即梦上游未返回 task_id');
    }
    return { mode: 'async', taskId };
  }

  async getTaskSnapshot(taskId: string): Promise<ProviderTaskSnapshot<ITVResult>> {
    // 轮询完成状态与取成片以 tasks 接口为准（/v1/videos/{id} 只返回受理侧简要信息）
    const response = await safeFetch(
      joinUrl(this.getBaseUrl(), `/v1/tasks/${encodeURIComponent(taskId)}`),
      { method: 'GET', headers: this.getAuthOnlyHeaders() },
    );
    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      return { state: 'failed', progress: 0, error: errorText || `查询失败 HTTP ${response.status}` };
    }
    let data: SuiheTaskResponse;
    try {
      data = (await response.json()) as SuiheTaskResponse;
    } catch {
      return { state: 'failed', progress: 0, error: '查询返回非 JSON' };
    }

    // 状态映射：兼容 OpenAI 标准（queued/in_progress/completed/failed）+ Koma 即梦枚举（pending/submitted/generating/post_processing/success/failed）
    const status = String(data.status || '').toLowerCase();
    let state: ProviderTaskSnapshot<ITVResult>['state'];
    if (status === 'success' || status === 'completed' || status === 'succeeded') state = 'succeeded';
    else if (status === 'failed' || status === 'error') state = 'failed';
    else if (status === 'pending' || status === 'submitted' || status === 'queued') state = 'queued';
    else state = 'running';

    // 进度：OpenAIVideo 顶层 progress 是 number；Koma 即梦原生还可能给 progress_pct/progress_text
    const pctRaw = data.progress_pct ?? data.progress;
    const progress = typeof pctRaw === 'number'
      ? Math.max(0, Math.min(100, Math.round(pctRaw)))
      : typeof pctRaw === 'string'
        ? Math.max(0, Math.min(100, Math.round(Number(pctRaw) || 0)))
        : (state === 'succeeded' ? 100 : 0);

    // 终态成片地址取 result_urls[0]；同时兼容 metadata 透传与 sora 风格结构
    const resultUrl = (Array.isArray(data.result_urls) && data.result_urls[0])
      || data.metadata?.url
      || (Array.isArray(data.metadata?.result_urls) && data.metadata?.result_urls?.[0])
      || data.result?.data?.[0]?.url;

    if (state === 'succeeded') {
      if (!resultUrl) {
        return { state: 'failed', progress: 100, error: '任务完成但未返回视频地址' };
      }
      return {
        state: 'succeeded',
        progress: 100,
        output: { source: resultUrl, taskId },
      };
    }
    if (state === 'failed') {
      return { state: 'failed', progress, error: data.fail_reason || data.error?.message || '任务失败' };
    }
    return { state, progress };
  }
}

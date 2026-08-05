/**
 * 穗禾（Suihe）直连 ITV Provider — https://www.suihemedia.cloud
 *（文档写的 api.suihemedia.cloud 实测无创作路由/鉴权 403，官网 www 域才是实际 API 网关）
 *
 * 协议（对齐穗禾开放 API 文档）：
 *   - POST /v1/videos/generations，**multipart/form-data**（官方推荐）：
 *     文本字段 prompt / model / ratio / duration / video_resolution / watermark；
 *     首尾帧 first_frame / end_frame，全能参考 image_file / image_file_2…image_file_10
 *     均为原始文件直传，由穗禾完成中转与可拉取编排。
 *     （出现 image_file* 字段时服务端自动推断 function_mode=omni_reference，无需显式传。）
 *   - 创作接口为异步任务：受理（表单模式多为 202）后取 **task_id**（UUID）——
 *     响应里的 id 可能为 cgt- 前缀，不能用于轮询路径。
 *     轮询 GET /v1/tasks/{task_id} 至 success/failed，从 result_urls 取成片。
 *   - 鉴权 Authorization: Bearer <sk-…>，统一走 buildChannelAuthRequest。
 *
 * creative_mode 不传：480p 服务端默认 native，高于 480p 默认 super_economy（与文档一致）。
 * watermark 恒 false。不启用 Koma 提示词协议。
 *
 * 与 koma-suihe-itv（SuiheITVProvider）的区别：那个走 komaapi.com 网关的 OpenAI 标准
 * 视频 API；本 Provider 是穗禾开放 API 直连（multipart + /v1/tasks 轮询）。
 */
import type {
  ITVConfig,
  ITVOptions,
  ProviderStartResult,
  ProviderTaskSnapshot,
  ProviderAssetInput,
} from '../../types';
import { createLogger } from '../../store/logger';
import { safeFetch } from '../../utils/safeFetch';
import { buildChannelAuthRequest } from '../channel/auth';
import { fetchReferenceBytes, extFromMime } from '../utils/referenceAssets';
import {
  assertSupportedVideoCapabilities,
  type ITVProvider,
  type ITVRequest,
  type ITVResult,
} from './types';

const logger = createLogger('SuiheDirectITV');

const SUIHE_VIDEO_GENERATIONS_PATH = '/v1/videos/generations';
const SUIHE_TASKS_PATH = '/v1/tasks';
const SUIHE_MODELS_PATH = '/v1/models';

/** 全能参考图上限：image_file（主）+ image_file_2…image_file_10（附加 9） */
const SUIHE_MAX_OMNI_IMAGES = 10;

function joinUrl(base: string, path: string): string {
  const b = base.replace(/\/+$/, '');
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${b}${p}`;
}

/** 穗禾视频比例白名单（与 koma-suihe-itv 上游一致） */
const SUIHE_SUPPORTED_RATIOS = new Set([
  '1:1', '4:3', '3:4', '16:9', '9:16', '3:2', '2:3', '21:9',
]);

function normalizeSuiheRatio(aspectRatio?: string): string {
  const normalized = String(aspectRatio || '').trim();
  if (SUIHE_SUPPORTED_RATIOS.has(normalized)) return normalized;
  if (normalized === 'portrait') return '9:16';
  if (normalized === 'landscape') return '16:9';
  if (normalized === 'square') return '1:1';
  return '16:9';
}

/**
 * video_resolution：接受 '480p'/'720p'/'1080p'/'2k'/'4k' 直传；
 * 'WxH' 像素形式按高度归一到档位；默认 720p。
 */
function normalizeVideoResolution(value?: string): string {
  const raw = String(value || '').trim().toLowerCase();
  if (/^(480p|720p|1080p|2k|4k)$/.test(raw)) return raw;
  const m = raw.match(/^(\d{2,5})x(\d{2,5})$/);
  if (m) {
    const height = Number(m[2]);
    if (height <= 480) return '480p';
    if (height <= 720) return '720p';
    return '1080p';
  }
  return '720p';
}

interface SuiheTaskStatus {
  status?: string;
  progress?: number | string;
  progress_pct?: number | string;
  result_urls?: string[];
  fail_reason?: string;
  error?: { code?: string; message?: string };
}

export class SuiheDirectITVProvider implements ITVProvider {
  type = 'suihe-itv' as const;
  config: ITVConfig;

  /**
   * 素材由本 Provider 自己读字节再 multipart 直传，所以有本地副本时一律用本地：
   * 生成结果的远程 URL 多是带签名的临时地址（如火山 TOS X-Tos-Expires=86400），过期后会 403。
   */
  prefersLocalAssets = true;

  // multipart 直传：remote-url 由前端下载字节、data-url 直接解字节，两种传输都支持
  assetTransports = {
    primaryImage: ['remote-url', 'data-url'] as const,
    additionalReferences: ['remote-url', 'data-url'] as const,
    referenceImages: ['remote-url', 'data-url'] as const,
    startFrame: ['remote-url', 'data-url'] as const,
    endFrame: ['remote-url', 'data-url'] as const,
  };

  constructor(config: ITVConfig) {
    // 不默认启用 Koma 提示词协议。
    this.config = { ...config };
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

  private getModelName(): string {
    const value = String(this.config.modelName || '').trim();
    if (!value) throw new Error('模型名称未配置');
    return value;
  }

  /** 时长范围优先读模型 defaults（durationMin/durationMax，设置面板可配），缺省 4-15s */
  private clampDuration(raw: unknown, fallback: number): number {
    const defaults = (this.config.modelDefaults || {}) as Record<string, unknown>;
    const min = Number.isFinite(Number(defaults.durationMin)) ? Number(defaults.durationMin) : 4;
    const max = Number.isFinite(Number(defaults.durationMax)) ? Number(defaults.durationMax) : 15;
    const n = typeof raw === 'number' ? raw : Number(raw);
    const v = Number.isFinite(n) ? Math.floor(n) : fallback;
    return Math.min(Math.max(v, min), max);
  }

  validate(): boolean {
    const hasCredential = Boolean(this.config.profileId) || Boolean(this.config.apiKey);
    return hasCredential && Boolean(this.config.baseUrl) && Boolean(String(this.config.modelName || '').trim());
  }

  async testConnection(): Promise<boolean> {
    if (!this.validate()) return false;
    try {
      // 仅探测鉴权是否通畅，不真正下任务（避免 testConnection 触发计费）
      const response = await safeFetch(joinUrl(this.getBaseUrl(), SUIHE_MODELS_PATH), {
        method: 'GET',
        headers: this.getAuthOnlyHeaders(),
      });
      return response.status !== 401 && response.status !== 403;
    } catch {
      return false;
    }
  }

  private async appendImageFile(
    form: FormData,
    field: string,
    ref: ProviderAssetInput | undefined,
    filename: string,
  ): Promise<boolean> {
    if (!ref?.value) return false;
    const { bytes, mimeType } = await fetchReferenceBytes(ref);
    if (!bytes || bytes.length === 0) return false;
    form.append(field, new Blob([bytes], { type: mimeType }), `${filename}.${extFromMime(mimeType)}`);
    return true;
  }

  /**
   * 提交视频任务（multipart 直传首尾帧/参考原文件），恒返回异步 taskId。
   */
  async start(request: ITVRequest): Promise<ProviderStartResult<ITVResult>> {
    if (!this.validate()) throw new Error('穗禾 API Key、API 地址或模型未配置');
    assertSupportedVideoCapabilities(request, '穗禾', [
      'video.text-to-video',
      'video.image-to-video',
      'video.start-end-to-video',
      'video.reference-to-video',
    ]);

    const options = request.options as ITVOptions | undefined;
    const model = this.getModelName();
    const duration = this.clampDuration(options?.duration ?? this.config.defaultDuration, 5);
    const ratio = normalizeSuiheRatio(options?.aspectRatio);
    const videoResolution = normalizeVideoResolution(options?.resolution ?? this.config.defaultResolution);

    const form = new FormData();
    form.append('prompt', String(request.prompt || '').trim());
    form.append('model', model);
    form.append('ratio', ratio);
    form.append('duration', String(duration));
    form.append('video_resolution', videoResolution);
    // 不添加水印；creative_mode 省略（480p 默认 native，高于 480p 默认 super_economy）
    form.append('watermark', 'false');

    let uploadedFrames = 0;
    let uploadedOmniImages = 0;
    const appendOmniImage = async (ref: ProviderAssetInput | undefined): Promise<void> => {
      if (uploadedOmniImages >= SUIHE_MAX_OMNI_IMAGES) return;
      const field = uploadedOmniImages === 0 ? 'image_file' : `image_file_${uploadedOmniImages + 1}`;
      const ok = await this.appendImageFile(form, field, ref, `reference-${uploadedOmniImages + 1}`);
      if (ok) uploadedOmniImages += 1;
    };

    if (request.capability === 'video.image-to-video') {
      if (await this.appendImageFile(form, 'first_frame', request.primaryImage, 'first-frame')) {
        uploadedFrames += 1;
      }
      // 图生视频的附加参考图走全能参考字段（服务端自动推断 omni_reference）
      for (const ref of request.additionalReferences || []) {
        await appendOmniImage(ref);
      }
    } else if (request.capability === 'video.start-end-to-video') {
      if (await this.appendImageFile(form, 'first_frame', request.startFrame, 'first-frame')) {
        uploadedFrames += 1;
      }
      if (await this.appendImageFile(form, 'end_frame', request.endFrame, 'end-frame')) {
        uploadedFrames += 1;
      }
    } else if (request.capability === 'video.reference-to-video') {
      for (const ref of request.referenceImages || []) {
        await appendOmniImage(ref);
      }
    }

    // 音色参考（音画同出）：渲染工作流经 metadata.komaVoiceReferences 传入，
    // 直传到穗禾全能参考的 audio_file / audio_file_2 / audio_file_3（上限 3）
    const voiceRefs = (request.metadata?.komaVoiceReferences as ProviderAssetInput[] | undefined) ?? [];
    let uploadedVoiceRefs = 0;
    for (const ref of voiceRefs.slice(0, 3)) {
      if (!ref?.value) continue;
      const field = uploadedVoiceRefs === 0 ? 'audio_file' : `audio_file_${uploadedVoiceRefs + 1}`;
      try {
        const { bytes, mimeType } = await fetchReferenceBytes(ref);
        if (!bytes || bytes.length === 0) continue;
        form.append(field, new Blob([bytes], { type: mimeType }), `voice-ref-${uploadedVoiceRefs + 1}.${extFromMime(mimeType)}`);
        uploadedVoiceRefs += 1;
      } catch (error) {
        logger.warn('音色参考音频读取失败，跳过', {
          field,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    logger.info('Suihe video start request', {
      provider: this.config.provider,
      capability: request.capability,
      model,
      duration,
      ratio,
      videoResolution,
      uploadedFrames,
      uploadedOmniImages,
      uploadedVoiceRefs,
      promptPreview: String(request.prompt || '').slice(0, 80),
    });

    // multipart：手动覆盖 Content-Type 让浏览器自动加 boundary
    const response = await safeFetch(joinUrl(this.getBaseUrl(), SUIHE_VIDEO_GENERATIONS_PATH), {
      method: 'POST',
      headers: this.getAuthOnlyHeaders(),
      body: form as any,
    });

    const raw = await response.text();
    let data: { task_id?: string; id?: string; error?: { code?: string; message?: string } };
    try {
      data = JSON.parse(raw);
    } catch {
      logger.warn('Suihe video accept response is not JSON', { status: response.status, preview: raw.slice(0, 600) });
      throw new Error(`穗禾视频受理返回了非 JSON 响应 (HTTP ${response.status})`);
    }
    if (!response.ok) {
      const code = data?.error?.code ? `, ${data.error.code}` : '';
      const message = data?.error?.message || raw.slice(0, 300);
      throw new Error(`穗禾视频任务创建失败 (HTTP ${response.status}${code}): ${message}`);
    }

    // 关键：受理响应的 id 可能为 cgt- 前缀（不能用于 /v1/tasks/...），必须优先 task_id
    const taskId = data.task_id || data.id;
    if (!taskId) {
      throw new Error('穗禾视频受理响应未返回 task_id');
    }
    return { mode: 'async', taskId };
  }

  /**
   * 轮询任务：GET /v1/tasks/{task_id}，success 时从 result_urls 取成片。
   */
  async getTaskSnapshot(taskId: string): Promise<ProviderTaskSnapshot<ITVResult>> {
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

    const status = String(data.status || '').toLowerCase();
    let state: ProviderTaskSnapshot<ITVResult>['state'];
    if (status === 'success' || status === 'completed' || status === 'succeeded') state = 'succeeded';
    else if (status === 'failed' || status === 'error' || status === 'cancelled' || status === 'canceled') state = 'failed';
    else if (status === 'pending' || status === 'submitted' || status === 'queued') state = 'queued';
    else state = 'running';

    const pctRaw = data.progress_pct ?? data.progress;
    const pctNum = typeof pctRaw === 'number' ? pctRaw : Number(pctRaw);
    const progress = Number.isFinite(pctNum)
      ? Math.max(0, Math.min(100, Math.round(pctNum)))
      : (state === 'succeeded' ? 100 : 0);

    if (state === 'succeeded') {
      const resultUrl = Array.isArray(data.result_urls) ? data.result_urls.find(Boolean) : undefined;
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

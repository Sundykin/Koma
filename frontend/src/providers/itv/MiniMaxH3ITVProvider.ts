/**
 * MiniMax H3 官方 API ITV Provider（api.minimaxi.com，V2 接口）
 *
 * 协议（参考 template_/minimax文档.md 的 OpenAPI）：
 *   - POST /v2/video_generation      创建视频生成任务（多模态 content[]，异步）
 *   - POST /v2/h3_context_ir         可选：先创建 H3-Context-IR 任务，获取增强提示词
 *   - GET  /v2/query/video_generation/{task_id}  轮询（status: succeeded/failed/cancelled，
 *     成功从 task.content.url 取成片）
 *
 * 与 ComfyUI MiniMax H3 的区别：这是官方云端 API（OpenAI 风格 JSON），不是本地工作流。
 * 多模态 content[] 结构：text / image_url / video_url / audio_url，role 标注用途：
 *   first_frame / last_frame / reference_image / reference_video / reference_audio。
 * 图生视频与多模态参考互斥：content 里出现任一 reference_* 就不能再出现 first/last_frame。
 *
 * 提示词协议：minimax-image-tag（<图片 N> / <视频 N> / <音频 N>），与上游原生识别的
 * 中文标签一致，编译层产物直接可用。
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
import {
  assertSupportedVideoCapabilities,
  type ITVProvider,
  type ITVRequest,
  type ITVResult,
} from './types';
import type { ITVRequest as BaseITVRequest } from '../../types/media';

const logger = createLogger('MiniMaxH3ITV');

const MINIMAX_BASE_URL = 'https://api.minimaxi.com';
const VIDEO_GENERATION_PATH = '/v2/video_generation';
const H3_CONTEXT_IR_PATH = '/v2/h3_context_ir';

/** 官方文档：单视频 ≤ 50 MB、图片 ≤ 30 MB、音频 ≤ 15 MB；参考视频 / 音频 ≤ 3 个 */
const MAX_VIDEO_REFS = 3;
const MAX_AUDIO_REFS = 3;
const MAX_IMAGE_REFS = 9;

type H3Role =
  | 'first_frame'
  | 'last_frame'
  | 'reference_image'
  | 'reference_video'
  | 'reference_audio';

interface H3ContentItem {
  type: 'text' | 'image_url' | 'video_url' | 'audio_url';
  text?: string;
  image_url?: { url: string };
  video_url?: { url: string };
  audio_url?: { url: string };
  role?: H3Role;
}

interface H3TaskResponse {
  task?: {
    id?: string;
    task_id?: string;
    status?: string;
    content?: { url?: string; prompt?: string };
    error?: unknown;
  };
  task_id?: string;
  error?: { message?: string } | string;
  base_resp?: { status_code?: number; status_msg?: string };
}

/** 把 URL 素材规整成可上传的字符串值（本地文件需先经 imageHostingService 换公网 URL）。 */
async function toUrlValue(asset: unknown): Promise<string | undefined> {
  const providerAsset = asset as ProviderAssetInput | undefined;
  if (!providerAsset) return undefined;
  const value = providerAsset.value;
  if (!value) return undefined;
  if (providerAsset.transport === 'remote-url' || /^https?:\/\//i.test(value)) return value;
  // data URL / 本地路径：H3 只收公网 URL，先传图床
  if (value.startsWith('data:')) {
    try {
      const { uploadBytesToImageHostingWithRetry } = await import('../../services/imageHostingService');
      const { parseDataUrl } = await import('../../utils/encoding');
      const { mimeType, bytes } = parseDataUrl(value);
      const ext = (mimeType || 'application/octet-stream').includes('png') ? 'png'
        : (mimeType || '').includes('webp') ? 'webp'
          : (mimeType || '').includes('jpeg') || (mimeType || '').includes('jpg') ? 'jpg'
            : (mimeType || '').includes('audio') ? 'mp3' : 'mp4';
      const result = await uploadBytesToImageHostingWithRetry(bytes, {
        filename: `koma-h3-ref-${Date.now()}.${ext}`,
      });
      if (result?.success && result.url) return result.url;
      logger.warn('H3 参考素材上传图床失败，跳过', { error: result?.error });
    } catch (error) {
      logger.warn('H3 参考素材上传图床异常，跳过', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return undefined;
}

async function buildContentItems(request: BaseITVRequest<unknown, unknown>): Promise<H3ContentItem[]> {
  const items: H3ContentItem[] = [];
  const pending: Promise<void>[] = [];
  const pushText = (text: string) => {
    if (text.trim()) items.push({ type: 'text', text: text.trim() });
  };
  const pushImage = async (asset: unknown, role: 'first_frame' | 'last_frame' | 'reference_image') => {
    const url = await toUrlValue(asset);
    if (url) items.push({ type: 'image_url', image_url: { url }, role });
  };
  const pushVideo = async (asset: unknown) => {
    const url = await toUrlValue(asset);
    if (url) items.push({ type: 'video_url', video_url: { url }, role: 'reference_video' });
  };
  const pushAudio = async (asset: unknown) => {
    const url = await toUrlValue(asset);
    if (url) items.push({ type: 'audio_url', audio_url: { url }, role: 'reference_audio' });
  };

  // 音色参考（音画同出）：metadata.komaVoiceReferences 是 ProviderAssetInput[]
  const voiceRefs = (request.metadata?.komaVoiceReferences as ProviderAssetInput[] | undefined) ?? [];
  // 视频延长参考：metadata.komaVideoReferences
  const videoRefs = (request.metadata?.komaVideoReferences as ProviderAssetInput[] | undefined) ?? [];

  const schedule = (fn: Promise<void>) => { pending.push(fn); };

  if (request.capability === 'video.text-to-video') {
    pushText(request.prompt);
  } else if (request.capability === 'video.image-to-video') {
    pushText(request.prompt);
    schedule(pushImage(request.primaryImage, 'first_frame'));
    for (const ref of request.additionalReferences || []) schedule(pushImage(ref, 'reference_image'));
  } else if (request.capability === 'video.start-end-to-video') {
    pushText(request.prompt);
    schedule(pushImage(request.startFrame, 'first_frame'));
    schedule(pushImage(request.endFrame, 'last_frame'));
  } else if (request.capability === 'video.reference-to-video') {
    pushText(request.prompt);
    for (const ref of (request.referenceImages || []).slice(0, MAX_IMAGE_REFS)) schedule(pushImage(ref, 'reference_image'));
    for (const ref of videoRefs.slice(0, MAX_VIDEO_REFS)) schedule(pushVideo(ref));
    for (const ref of voiceRefs.slice(0, MAX_AUDIO_REFS)) schedule(pushAudio(ref));
  } else {
    // 兜底：把能给的都当全能参考
    pushText(request.prompt);
    for (const ref of (request.referenceImages || []).slice(0, MAX_IMAGE_REFS)) schedule(pushImage(ref, 'reference_image'));
    for (const ref of videoRefs.slice(0, MAX_VIDEO_REFS)) schedule(pushVideo(ref));
    for (const ref of voiceRefs.slice(0, MAX_AUDIO_REFS)) schedule(pushAudio(ref));
  }

  await Promise.all(pending);
  return items;
}

export class MiniMaxH3ITVProvider implements ITVProvider {
  type = 'minimax-h3-itv' as const;
  config: ITVConfig;

  constructor(config: ITVConfig) {
    this.config = {
      ...config,
      baseUrl: config.baseUrl || MINIMAX_BASE_URL,
      promptProtocol: config.promptProtocol ?? 'minimax-image-tag',
    };
  }

  validate(): boolean {
    return Boolean(this.config.apiKey);
  }

  getModelName(): string {
    return this.config.modelName || 'MiniMax-H3';
  }

  get defaultDuration(): number {
    return this.config.defaultDuration ?? 5;
  }

  /** 测试注入：Context-IR 轮询间隔（生产 10s）。 */
  pollIntervalMs?: number;

  /** 模型 defaults.useH3ContextIR：出片前是否先调 H3-Context-IR 增强提示词。 */
  get useH3ContextIR(): boolean {
    const defaults = (this.config as unknown as { modelDefaults?: Record<string, unknown> }).modelDefaults;
    return Boolean(defaults?.useH3ContextIR);
  }

  private getBaseUrl(): string {
    return (this.config.baseUrl || MINIMAX_BASE_URL).replace(/\/+$/, '');
  }

  /** 构造带凭据的请求（channelId 走主进程代理；回退明文 apiKey）。 */
  private authRequest(method: 'GET' | 'POST', path: string, body?: string) {
    return buildChannelAuthRequest({
      channelId: this.config.profileId,
      mode: 'bearer-header',
      headers: {
        'Content-Type': 'application/json',
        ...(body ? {} : {}),
      },
      apiKey: this.config.apiKey,
    });
  }

  private async createTask(payload: Record<string, unknown>): Promise<{ taskId: string; body: H3TaskResponse }> {
    const request = this.authRequest('POST', VIDEO_GENERATION_PATH, JSON.stringify(payload));
    const response = await safeFetch(request.url(this.getBaseUrl() + VIDEO_GENERATION_PATH), {
      method: 'POST',
      headers: request.headers,
      body: JSON.stringify(payload),
    });
    const raw = await response.text();
    let body: H3TaskResponse;
    try {
      body = JSON.parse(raw) as H3TaskResponse;
    } catch {
      throw new Error(`MiniMax H3 响应不是合法 JSON: ${raw.slice(0, 300)}`);
    }
    if (!response.ok) {
      const message = typeof body.error === 'string'
        ? body.error
        : (body.error as { message?: string } | undefined)?.message
          || body.base_resp?.status_msg
          || raw.slice(0, 300);
      throw new Error(`MiniMax H3 任务创建失败（${response.status}）: ${message}`);
    }
    const taskId = body.task_id || body.task?.id || body.task?.task_id;
    if (!taskId) {
      throw new Error(`MiniMax H3 响应缺少 task_id: ${raw.slice(0, 300)}`);
    }
    return { taskId, body };
  }

  /**
   * H3-Context-IR 增强提示词（可选）。
   * 吃与视频生成相同的多模态 content，返回增强后的 prompt（task.content.prompt）。
   * 失败返回 undefined——增强是锦上添花，不能让它拖垮整条出片。
   */
  async enhancePromptWithContextIR(
    request: BaseITVRequest<unknown, unknown>,
    duration: number,
    aspectRatio?: string,
  ): Promise<string | undefined> {
    if (!this.validate()) return undefined;
    const content = await buildContentItems(request);
    if (!content.some(item => item.type === 'text')) return undefined;
    try {
      const payload: Record<string, unknown> = {
        model: this.getModelName(),
        content,
        duration,
      };
      if (aspectRatio && aspectRatio !== 'adaptive') payload.ratio = aspectRatio;
      const requestBody = this.authRequest('POST', H3_CONTEXT_IR_PATH, JSON.stringify(payload));
      const response = await safeFetch(requestBody.url(this.getBaseUrl() + H3_CONTEXT_IR_PATH), {
        method: 'POST',
        headers: requestBody.headers,
        body: JSON.stringify(payload),
      });
      const raw = await response.text();
      const body = JSON.parse(raw) as H3TaskResponse;
      if (!response.ok) {
        const message = typeof body.error === 'string'
          ? body.error
          : (body.error as { message?: string } | undefined)?.message
            || body.base_resp?.status_msg
            || raw.slice(0, 300);
        logger.warn('H3-Context-IR 创建失败，跳过增强', { status: response.status, message });
        return undefined;
      }
      const taskId = body.task_id || body.task?.id;
      if (!taskId) {
        logger.warn('H3-Context-IR 响应缺少 task_id，跳过增强', { raw: raw.slice(0, 200) });
        return undefined;
      }
      // 轮询（官方推荐 10s 间隔；给足 3 分钟）。pollIntervalMs 仅测试注入。
      const pollIntervalMs = this.pollIntervalMs ?? 10000;
      for (let i = 0; i < 18; i += 1) {
        await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
        const query = await safeFetch(
          this.authRequest('GET', '').url(`${this.getBaseUrl()}/v2/query/video_generation/${taskId}`),
          {
            method: 'GET',
            headers: this.authRequest('GET', '').headers,
          },
        );
        const queryRaw = await query.text();
        const task = JSON.parse(queryRaw) as H3TaskResponse;
        const status = task.task?.status;
        if (status === 'succeeded') {
          const enhanced = task.task?.content?.prompt;
          if (enhanced) {
            logger.info('H3-Context-IR 增强完成', { taskId, promptLength: enhanced.length });
            return enhanced;
          }
          logger.warn('H3-Context-IR 成功但缺少 content.prompt，跳过增强', { raw: queryRaw.slice(0, 300) });
          return undefined;
        }
        if (status === 'failed' || status === 'cancelled') {
          logger.warn('H3-Context-IR 任务未成功，跳过增强', { taskId, status, raw: queryRaw.slice(0, 300) });
          return undefined;
        }
      }
      logger.warn('H3-Context-IR 轮询超时，跳过增强', { taskId });
      return undefined;
    } catch (error) {
      logger.warn('H3-Context-IR 异常，跳过增强', {
        error: error instanceof Error ? error.message : String(error),
      });
      return undefined;
    }
  }

  async start(request: BaseITVRequest<unknown, unknown>): Promise<ProviderStartResult<ITVResult>> {
    if (!this.validate()) throw new Error('MiniMax H3 API Key 未配置');
    assertSupportedVideoCapabilities(request as ITVRequest, 'MiniMax H3', [
      'video.text-to-video',
      'video.image-to-video',
      'video.start-end-to-video',
      'video.reference-to-video',
    ]);
    const options = request.options as ITVOptions | undefined;
    const duration = Math.min(
      Math.max(Math.round(options?.duration ?? this.defaultDuration), 4),
      15,
    );
    const ratio = options?.aspectRatio && options.aspectRatio !== 'adaptive'
      ? options.aspectRatio
      : 'adaptive';
    const content = await buildContentItems(request);
    const payload: Record<string, unknown> = {
      model: this.getModelName(),
      content,
      duration,
      resolution: options?.resolution || '768P',
      ratio,
    };
    const { taskId } = await this.createTask(payload);
    return {
      mode: 'async',
      taskId,
      output: { taskId },
    } as unknown as ProviderStartResult<ITVResult>;
  }

  prefersLocalAssets = false;

  async testConnection(): Promise<boolean> {
    return this.validate();
  }

  assetTransports = {
    primaryImage: ['remote-url' as const],
    additionalReferences: ['remote-url' as const],
    referenceImages: ['remote-url' as const],
    startFrame: ['remote-url' as const],
    endFrame: ['remote-url' as const],
  };

  async getTaskSnapshot(taskId: string): Promise<ProviderTaskSnapshot<ITVResult>> {
    const query = await safeFetch(
      this.authRequest('GET', '').url(`${this.getBaseUrl()}/v2/query/video_generation/${taskId}`),
      {
        method: 'GET',
        headers: this.authRequest('GET', '').headers,
      },
    );
    const raw = await query.text();
    const body = JSON.parse(raw) as H3TaskResponse;
    const task = body.task || {};
    const status = String(task.status || '').toLowerCase();
    const state: ProviderTaskSnapshot<ITVResult>['state'] = status === 'succeeded'
      ? 'succeeded'
      : status === 'failed' || status === 'cancelled'
        ? 'failed'
        : status === 'pending' || status === 'queued'
          ? 'queued'
          : 'running';
    const resultUrl = task.content?.url;
    if (state === 'succeeded') {
      if (!resultUrl) return { state: 'failed', progress: 100, error: '任务完成但未返回视频地址' };
      return { state: 'succeeded', progress: 100, output: { source: resultUrl, taskId } };
    }
    if (state === 'failed') {
      return { state: 'failed', progress: 0, error: task.error ? String(task.error) : '任务失败' };
    }
    return { state, progress: status === 'processing' ? 50 : undefined };
  }
}

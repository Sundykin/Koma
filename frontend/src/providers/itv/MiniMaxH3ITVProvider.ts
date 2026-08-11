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
 * 素材上传：直接传 base64 data: URL（H3 官方 content[].xxx_url 支持），不经过图床——
 * 本地素材不需要先传公网，避免依赖图床 / 激活链路的可用性。请求体上限 64 MB。
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

/**
 * MiniMax 状态码 → 中文原因 + 处置建议。
 *
 * 上游只回英文短语（例如 1026 只有 `input new_sensitive, input text sensitive`），
 * 用户在分镜面板上看到的就是这串东西，既不知道是审核拦截，也不知道该改什么。
 * 这里把常见码翻成"发生了什么 + 下一步做什么"。
 */
const MINIMAX_ERROR_HINTS: Record<string, string> = {
  1000: 'MiniMax 未知错误',
  1001: 'MiniMax 请求超时，请稍后重试',
  1002: 'MiniMax 触发限流（RPM），请降低并发或稍后重试',
  1004: 'MiniMax 鉴权失败，请检查渠道 API Key 是否有效',
  1008: 'MiniMax 账户余额不足，请充值后重试',
  1013: 'MiniMax 服务内部错误，请稍后重试',
  1026: 'MiniMax 内容审核未通过：输入内容命中敏感词',
  1027: 'MiniMax 内容审核未通过：生成结果命中敏感词',
  1039: 'MiniMax 触发限流（TPM），请稍后重试',
  2013: 'MiniMax 入参异常，请检查提示词与参考素材',
  2049: 'MiniMax API Key 无效，请检查渠道配置',
};

/** 输入审核（1026）的补充指引：上游会在 message 里说明是文本还是素材命中。 */
function describeInputSensitive(message: string): string {
  const lower = message.toLowerCase();
  const parts: string[] = [];
  if (lower.includes('text')) parts.push('提示词文本');
  if (lower.includes('image') || lower.includes('img')) parts.push('参考图');
  if (lower.includes('video')) parts.push('参考视频');
  if (lower.includes('audio')) parts.push('参考音频');
  const target = parts.length ? parts.join(' / ') : '输入内容';
  return `请修改该分镜的${target}后重新生成，或改用其它视频渠道`;
}

/**
 * 上游错误可读化。
 * error 可能是 string / {code,message} / 更深嵌套对象；命中已知状态码时补中文原因和建议。
 */
function formatMiniMaxError(error: unknown): string {
  if (!error) return '任务失败';
  if (typeof error === 'string') return error;
  if (typeof error === 'object') {
    const record = error as Record<string, unknown>;
    const code = typeof record.code === 'string' || typeof record.code === 'number' ? String(record.code) : '';
    const message = typeof record.message === 'string' ? record.message : '';
    const hint = code ? MINIMAX_ERROR_HINTS[code] : undefined;
    if (hint) {
      const advice = code === '1026' ? `。${describeInputSensitive(message)}` : '';
      const raw = message ? `（[${code}] ${message}）` : `（[${code}]）`;
      return `${hint}${advice}${raw}`;
    }
    if (message && code) return `[${code}] ${message}`;
    if (message) return message;
    if (code) return `[${code}]`;
    try {
      return JSON.stringify(error).slice(0, 400);
    } catch {
      return String(error);
    }
  }
  return String(error);
}

/**
 * base_resp 里的失败（status_code ≠ 0）也要可读化。
 *
 * MiniMax 的审核 / 鉴权 / 限流经常是 HTTP 200 + base_resp.status_code≠0，只判 response.ok
 * 会漏过去，最后死在"响应缺少 task_id"这种完全指错方向的报错上。
 */
function formatBaseRespError(baseResp: H3TaskResponse['base_resp']): string | undefined {
  const statusCode = baseResp?.status_code;
  if (statusCode === undefined || statusCode === null || statusCode === 0) return undefined;
  return formatMiniMaxError({ code: statusCode, message: baseResp?.status_msg || '' });
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

/**
 * 把素材规整成 MiniMax H3 可直接接收的 data: URL（base64）。
 *
 * H3 官方接口的 image_url / video_url / audio_url 直接支持 base64（请求体 ≤ 64 MB），
 * 不走图床——这样本地素材不需要先传公网，也就不依赖图床 / 激活链路的可用性。
 *   - 已是 data: URL        → 原样透传
 *   - 远程 URL（http/https）→ 原样透传（留给本来就是外链的素材，省一次下载）
 *   - 本地文件路径           → 读字节转 data: URL
 *   - blob: URL              → fetch 后转 data: URL
 * 任何一步失败都返回 undefined，由调用方跳过该参考并记录。
 */
async function toBase64DataUrl(asset: unknown): Promise<string | undefined> {
  const providerAsset = asset as ProviderAssetInput | undefined;
  if (!providerAsset) return undefined;
  let value = providerAsset.value;
  if (!value) return undefined;

  if (value.startsWith('data:')) return value;
  // 远程素材只在值本身就是 http/https URL 时透传；值为本地路径的走下方读字节转 data URL
  if (/^https?:\/\//i.test(value)) return value;

  // blob: URL → fetch → data URL
  if (value.startsWith('blob:')) {
    try {
      const response = await fetch(value);
      const bytes = new Uint8Array(await response.arrayBuffer());
      const mimeType = response.headers.get('content-type') || 'application/octet-stream';
      const { bytesToBase64 } = await import('../../utils/encoding');
      return `data:${mimeType};base64,${bytesToBase64(bytes)}`;
    } catch {
      return undefined;
    }
  }

  // 本地路径 → 读字节 → data URL
  if (!/^(https?:|data:|blob:)/i.test(value)) {
    try {
      const { electronService } = await import('../../services/electronService');
      if (!electronService.isElectron()) return undefined;
      const base64 = await electronService.fs.readFileAsBase64(value);
      if (!base64) return undefined;
      const ext = (value.split('.').pop() || '').toLowerCase();
      const mime = ext === 'png' ? 'image/png'
        : ext === 'webp' ? 'image/webp'
          : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg'
            : ext === 'mp3' ? 'audio/mpeg'
              : ext === 'wav' ? 'audio/wav'
                : ext === 'mov' ? 'video/quicktime'
                  : 'video/mp4';
      return `data:${mime};base64,${base64}`;
    } catch {
      return undefined;
    }
  }

  return undefined;
}

/** 这次请求要带的素材，按 H3 的两种模式（i2va 首尾帧 / r2va 多模态参考）分好类。 */
interface H3AssetPlan {
  /** 首尾帧（只在 i2va 模式下成立） */
  frames: Array<{ asset: unknown; role: 'first_frame' | 'last_frame' }>;
  referenceImages: unknown[];
  videos: ProviderAssetInput[];
  audios: ProviderAssetInput[];
}

function collectAssets(request: BaseITVRequest<unknown, unknown>): H3AssetPlan {
  // 音色参考（音画同出）：metadata.komaVoiceReferences；视频延长承接：metadata.komaVideoReferences
  const voiceRefs = (request.metadata?.komaVoiceReferences as ProviderAssetInput[] | undefined) ?? [];
  const videoRefs = (request.metadata?.komaVideoReferences as ProviderAssetInput[] | undefined) ?? [];
  const plan: H3AssetPlan = {
    frames: [],
    referenceImages: [],
    videos: videoRefs.slice(0, MAX_VIDEO_REFS),
    audios: voiceRefs.slice(0, MAX_AUDIO_REFS),
  };

  if (request.capability === 'video.image-to-video') {
    plan.frames.push({ asset: request.primaryImage, role: 'first_frame' });
    plan.referenceImages.push(...(request.additionalReferences || []));
  } else if (request.capability === 'video.start-end-to-video') {
    plan.frames.push({ asset: request.startFrame, role: 'first_frame' });
    plan.frames.push({ asset: request.endFrame, role: 'last_frame' });
  } else if (request.capability !== 'video.text-to-video') {
    // reference-to-video 与兜底：全部当多模态参考
    plan.referenceImages.push(...(request.referenceImages || []));
  }
  plan.referenceImages = plan.referenceImages.slice(0, MAX_IMAGE_REFS);
  return plan;
}

async function buildContentItems(request: BaseITVRequest<unknown, unknown>): Promise<H3ContentItem[]> {
  const items: H3ContentItem[] = [];
  const pending: Promise<void>[] = [];
  const pushText = (text: string) => {
    if (text.trim()) items.push({ type: 'text', text: text.trim() });
  };
  const pushImage = async (asset: unknown, role: 'first_frame' | 'last_frame' | 'reference_image') => {
    const url = await toBase64DataUrl(asset);
    if (url) items.push({ type: 'image_url', image_url: { url }, role });
  };
  const pushVideo = async (asset: unknown) => {
    const url = await toBase64DataUrl(asset);
    if (url) items.push({ type: 'video_url', video_url: { url }, role: 'reference_video' });
  };
  const pushAudio = async (asset: unknown) => {
    const url = await toBase64DataUrl(asset);
    if (url) items.push({ type: 'audio_url', audio_url: { url }, role: 'reference_audio' });
  };
  const schedule = (fn: Promise<void>) => { pending.push(fn); };

  pushText(request.prompt);
  const plan = collectAssets(request);

  // H3 的硬规则：content 里出现任一 reference_*，就不能再出现 first_frame / last_frame。
  //
  // 参考视频（上一镜延长承接）和参考音频（音色）只存在于多模态模式，而且都是用户在分镜上
  // 显式打开的开关——它们出现时整条请求切到多模态，首尾帧降级成 reference_image。
  // 旧实现是在 i2va 分支里直接**不发**视频/音频：提示词里写着"将 <视频 1> 延长 N 秒"，
  // 请求里却没有那段视频，模型只能照着不存在的参考硬编。
  const forcesMultimodal = plan.videos.length > 0 || plan.audios.length > 0;

  if (forcesMultimodal) {
    for (const frame of plan.frames) schedule(pushImage(frame.asset, 'reference_image'));
    for (const ref of plan.referenceImages) schedule(pushImage(ref, 'reference_image'));
    for (const ref of plan.videos) schedule(pushVideo(ref));
    for (const ref of plan.audios) schedule(pushAudio(ref));
  } else if (plan.frames.length > 0) {
    // i2va：上游只认首尾帧，多余的参考图带上去就是混用（会被判非法），直接丢掉并留日志
    for (const frame of plan.frames) schedule(pushImage(frame.asset, frame.role));
    if (plan.referenceImages.length > 0) {
      logger.warn('MiniMax H3 图生视频不支持在首尾帧之外再带参考图（上游规定二者互斥），已丢弃', {
        capability: request.capability,
        dropped: plan.referenceImages.length,
      });
    }
  } else {
    for (const ref of plan.referenceImages) schedule(pushImage(ref, 'reference_image'));
  }

  await Promise.all(pending);
  return items;
}

/** content 里是否已经进入多模态参考模式（决定 ratio 规则与互斥校验）。 */
function hasMultimodalReference(items: H3ContentItem[]): boolean {
  return items.some(item => item.role === 'reference_image'
    || item.role === 'reference_video'
    || item.role === 'reference_audio');
}

/** content 是否只有文本（t2va：上游要求 ratio 必填且不能是 adaptive）。 */
function isTextOnly(items: H3ContentItem[]): boolean {
  return items.every(item => item.type === 'text');
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
    // 代理模式（profileId）下 apiKey 由主进程注入，前端 config 里是空的——单查 apiKey 会误报
    return Boolean(this.config.profileId) || Boolean(this.config.apiKey);
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
      const message = formatBaseRespError(body.base_resp)
        || (typeof body.error === 'string'
          ? body.error
          : body.error
            ? formatMiniMaxError(body.error)
            : raw.slice(0, 300));
      throw new Error(`MiniMax H3 任务创建失败（${response.status}）: ${message}`);
    }
    // HTTP 200 但 base_resp 报错（审核 / 鉴权 / 限流的常见形态）
    const baseRespError = formatBaseRespError(body.base_resp);
    if (baseRespError) {
      throw new Error(`MiniMax H3 任务创建失败: ${baseRespError}`);
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
      const createError = !response.ok
        ? (formatBaseRespError(body.base_resp)
          || (typeof body.error === 'string' ? body.error : body.error ? formatMiniMaxError(body.error) : raw.slice(0, 300)))
        : formatBaseRespError(body.base_resp);
      if (createError) {
        logger.warn('H3-Context-IR 创建失败，跳过增强', { status: response.status, message: createError });
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
    if (!this.validate()) throw new Error('MiniMax H3 API Key 未配置（代理渠道请检查主进程凭据注入）');
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
    const content = await buildContentItems(request);
    // 文生视频（content 只有 text）上游要求 ratio 必填且不能是 adaptive；
    // 图生视频的 ratio 由输入图决定（传了也会被忽略），多模态参考则可选。
    const requestedRatio = options?.aspectRatio && options.aspectRatio !== 'adaptive'
      ? options.aspectRatio
      : undefined;
    const ratio = isTextOnly(content)
      ? (requestedRatio || '16:9')
      : (requestedRatio || 'adaptive');
    const payload: Record<string, unknown> = {
      model: this.getModelName(),
      content,
      duration,
      resolution: options?.resolution || '768P',
      ratio,
    };
    logger.info('MiniMax H3 请求组装完成', {
      capability: request.capability,
      mode: isTextOnly(content) ? 't2va' : hasMultimodalReference(content) ? 'r2va' : 'i2va',
      ratio,
      duration,
      roles: content.map(item => item.role || item.type),
    });
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
    // 审核拦截有时不进 task.error，只体现在 base_resp 上；没有任何 task 状态时也按失败处理
    const baseRespError = formatBaseRespError(body.base_resp);
    if (baseRespError && status !== 'succeeded') {
      return { state: 'failed', progress: 0, error: baseRespError };
    }
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
      return {
        state: 'failed',
        progress: 0,
        error: formatMiniMaxError(task.error ?? body.error),
      };
    }
    return { state, progress: status === 'processing' ? 50 : undefined };
  }
}

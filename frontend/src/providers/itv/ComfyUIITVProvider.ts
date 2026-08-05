/**
 * ComfyUI ITV Provider —— 直连 ComfyUI 服务端（本地或远程容器）
 *
 * 协议（ComfyUI 原生 HTTP API，无 SDK）：
 *   POST /upload/image     multipart 上传参考图原文件 → { name, subfolder, type }
 *   POST /prompt           提交 API 格式工作流 → { prompt_id }
 *   GET  /history/{id}     查询任务 → { [id]: { status, outputs } }
 *   GET  /queue            history 尚无记录时区分「排队中 / 执行中」
 *   GET  /view?filename=…  取成片下载地址
 *   POST /interrupt        中断当前执行
 *   GET  /system_stats     连通性探测（不触发任务、不计费）
 *
 * 默认工作流为内置的 MiniMax H3 参考生视频（见 comfyui/minimaxH3Workflow.ts，
 * 源自 comfyui/多模态.json）：多张参考图 + 提示词 → 带音轨的视频。
 * 渠道模型的 defaults 可覆盖：
 *   workflowJson      自定义 API 格式工作流（字符串或对象）
 *   nodeBindings      节点绑定覆盖（如 { promptNodeId: '138' }）
 *   maxReferenceImages / steps / fps / megapixels
 *   authMode: 'bearer' 给套了鉴权网关的 ComfyUI 用（默认不发 Authorization）
 *
 * 说明：ComfyUI 原生无鉴权，所以默认不携带任何凭据 header —— 若带上
 * x-koma-channel-id 而渠道又没存 apiKey，主进程 NetController 会直接 401。
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
import { createMiniMaxH3Workflow } from './comfyui/minimaxH3Workflow';
import {
  applyComfyWorkflowParams,
  resolveComfyBindings,
  type ComfyNodeBindingOverrides,
} from './comfyui/workflowBinding';
import type { ComfyWorkflow, ComfyUploadedImage } from './comfyui/types';
import { toLoadImageValue } from './comfyui/types';

const logger = createLogger('ComfyUIITV');

const COMFY_UPLOAD_IMAGE_PATH = '/upload/image';
const COMFY_PROMPT_PATH = '/prompt';
const COMFY_HISTORY_PATH = '/history';
const COMFY_QUEUE_PATH = '/queue';
const COMFY_VIEW_PATH = '/view';
const COMFY_INTERRUPT_PATH = '/interrupt';
const COMFY_SYSTEM_STATS_PATH = '/system_stats';

/** MiniMaxH3ReferenceToVideo 的 ref_images autogrow 上限 */
const COMFY_DEFAULT_MAX_REFERENCES = 9;
const COMFY_DEFAULT_DURATION_SEC = 15;
const COMFY_DURATION_MIN = 5;
const COMFY_DURATION_MAX = 15;

const VIDEO_FILE_RE = /\.(mp4|webm|mov|mkv|avi|gif)$/i;
/** ComfyUI 核心 SaveVideo 把成片挂在 outputs[node].images 下（animated=true），第三方节点常用 videos/gifs */
const OUTPUT_FILE_KEYS = ['videos', 'gifs', 'images', 'files'] as const;

interface ComfyOutputFile {
  filename?: string;
  subfolder?: string;
  type?: string;
}

interface ComfyHistoryEntry {
  status?: {
    status_str?: string;
    completed?: boolean;
    messages?: Array<[string, Record<string, unknown>]>;
  };
  outputs?: Record<string, Record<string, unknown>>;
}

interface ComfyPromptResponse {
  prompt_id?: string;
  number?: number;
  error?: { type?: string; message?: string; details?: string };
  node_errors?: Record<string, {
    class_type?: string;
    errors?: Array<{ type?: string; message?: string; details?: string }>;
  }>;
}

function joinUrl(base: string, path: string): string {
  const b = base.replace(/\/+$/, '');
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${b}${p}`;
}

/** 用户常直接粘贴带 `#workflow-id` 的画布地址，这里归一为纯 API 根地址 */
export function normalizeComfyBaseUrl(raw?: string): string {
  const value = String(raw || '').trim();
  if (!value) return '';
  try {
    const url = new URL(value);
    const path = url.pathname.replace(/\/+$/, '');
    return `${url.origin}${path}`;
  } catch {
    return value.replace(/[#?].*$/, '').replace(/\/+$/, '');
  }
}

function toNumber(value: unknown): number | undefined {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : undefined;
}

/** ComfyUI 校验失败时把 node_errors 拍平成一行可读信息 */
function formatPromptError(data: ComfyPromptResponse, raw: string, status: number): string {
  const parts: string[] = [];
  if (data?.error?.message) {
    parts.push(data.error.message);
    if (data.error.details) parts.push(data.error.details);
  }
  for (const [nodeId, nodeError] of Object.entries(data?.node_errors ?? {})) {
    const detail = (nodeError.errors ?? [])
      .map(e => [e.message, e.details].filter(Boolean).join(': '))
      .filter(Boolean)
      .join('; ');
    parts.push(`节点 ${nodeId}(${nodeError.class_type ?? '?'}): ${detail || '参数校验失败'}`);
  }
  const message = parts.filter(Boolean).join(' | ') || raw.slice(0, 300);
  return `ComfyUI 任务提交失败 (HTTP ${status}): ${message}`;
}

export class ComfyUIITVProvider implements ITVProvider {
  type = 'comfyui-itv' as const;
  config: ITVConfig;

  /**
   * 参考图由本 Provider 自己读字节再上传到 ComfyUI，所以素材有本地副本时一律用本地：
   * 生成结果的远程 URL 多是带签名的临时地址（如火山 TOS X-Tos-Expires=86400），过期后会 403。
   */
  prefersLocalAssets = true;

  // 参考图以原始文件 multipart 直传到 ComfyUI，本地与远端素材都支持
  assetTransports = {
    primaryImage: ['remote-url', 'data-url'] as const,
    additionalReferences: ['remote-url', 'data-url'] as const,
    referenceImages: ['remote-url', 'data-url'] as const,
    startFrame: ['remote-url', 'data-url'] as const,
    endFrame: ['remote-url', 'data-url'] as const,
  };

  constructor(config: ITVConfig) {
    // 默认启用 MiniMax H3 协议：把 @角色名/@场景名/@道具名 编译成模型原生识别的
    // <图片 N>，N 与 ref_images.ref_image_(N-1) 槽位顺序一一对应。
    this.config = { ...config, promptProtocol: config.promptProtocol ?? 'minimax-image-tag' };
  }

  private getModelDefaults(): Record<string, unknown> {
    return (this.config.modelDefaults || {}) as Record<string, unknown>;
  }

  private getBaseUrl(): string {
    return normalizeComfyBaseUrl(this.config.baseUrl);
  }

  /**
   * ComfyUI 原生无鉴权 → 默认不带任何凭据 header。
   * 仅当模型 defaults.authMode='bearer'（前置了鉴权网关）时才走渠道凭据代理。
   */
  private getHeaders(extra?: Record<string, string>): Record<string, string> {
    const headers = { ...(extra ?? {}) };
    if (String(this.getModelDefaults().authMode || '').toLowerCase() !== 'bearer') {
      return headers;
    }
    return buildChannelAuthRequest({
      channelId: this.config.profileId,
      apiKey: this.config.apiKey,
      mode: 'bearer-header',
      headers,
    }).headers;
  }

  validate(): boolean {
    // ComfyUI 只要求服务地址；模型名仅用于渠道列表展示，工作流才是真正的「模型」
    return Boolean(this.getBaseUrl());
  }

  async testConnection(): Promise<boolean> {
    if (!this.validate()) return false;
    try {
      const response = await safeFetch(joinUrl(this.getBaseUrl(), COMFY_SYSTEM_STATS_PATH), {
        method: 'GET',
        headers: this.getHeaders(),
      });
      return response.ok;
    } catch (error) {
      logger.warn('ComfyUI testConnection failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  private clampDuration(raw: unknown, fallback: number): number {
    const defaults = this.getModelDefaults();
    const min = toNumber(defaults.durationMin) ?? COMFY_DURATION_MIN;
    const max = toNumber(defaults.durationMax) ?? COMFY_DURATION_MAX;
    const value = toNumber(raw) ?? fallback;
    return Math.min(Math.max(value, min), max);
  }

  /** 载入工作流模板：优先模型 defaults.workflowJson，否则用内置 MiniMax H3 */
  private loadWorkflowTemplate(): ComfyWorkflow {
    const custom = this.getModelDefaults().workflowJson;
    if (custom && typeof custom === 'object') {
      return custom as ComfyWorkflow;
    }
    if (typeof custom === 'string' && custom.trim()) {
      try {
        return JSON.parse(custom) as ComfyWorkflow;
      } catch (error) {
        throw new Error(
          `自定义 ComfyUI 工作流不是合法 JSON（模型 defaults.workflowJson）：${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
    return createMiniMaxH3Workflow();
  }

  /** 上传单张参考图到 ComfyUI 的 input 目录，返回 LoadImage 可用的取值 */
  private async uploadReferenceImage(ref: ProviderAssetInput, index: number): Promise<string> {
    const { bytes, mimeType } = await fetchReferenceBytes(ref);
    if (!bytes || bytes.length === 0) {
      throw new Error('参考图为空，无法上传到 ComfyUI');
    }

    const filename = `koma-${Date.now()}-${index + 1}.${extFromMime(mimeType)}`;
    const form = new FormData();
    form.append('image', new Blob([bytes], { type: mimeType }), filename);
    form.append('overwrite', 'true');

    const response = await safeFetch(joinUrl(this.getBaseUrl(), COMFY_UPLOAD_IMAGE_PATH), {
      method: 'POST',
      headers: this.getHeaders(),
      body: form as any,
    });

    const raw = await response.text();
    if (!response.ok) {
      throw new Error(`ComfyUI 参考图上传失败 (HTTP ${response.status}): ${raw.slice(0, 200)}`);
    }
    let uploaded: ComfyUploadedImage;
    try {
      uploaded = JSON.parse(raw) as ComfyUploadedImage;
    } catch {
      throw new Error('ComfyUI 参考图上传返回了非 JSON 响应');
    }
    if (!uploaded?.name) {
      throw new Error('ComfyUI 参考图上传未返回文件名');
    }
    return toLoadImageValue(uploaded);
  }

  /**
   * 上传音色参考音频到 ComfyUI input 目录，返回 LoadAudio 可用的取值。
   * 优先 /upload/audio（字段 audio）；老版本 ComfyUI 没有该端点时回退 /upload/image。
   */
  private async uploadReferenceAudio(ref: ProviderAssetInput, index: number): Promise<string> {
    const { bytes, mimeType } = await fetchReferenceBytes(ref);
    if (!bytes || bytes.length === 0) {
      throw new Error('音色参考音频为空，无法上传到 ComfyUI');
    }
    const filename = `koma-voice-${Date.now()}-${index + 1}.${extFromMime(mimeType)}`;

    const attempt = async (path: string, field: string): Promise<string | null> => {
      const form = new FormData();
      form.append(field, new Blob([bytes], { type: mimeType }), filename);
      form.append('overwrite', 'true');
      const response = await safeFetch(joinUrl(this.getBaseUrl(), path), {
        method: 'POST',
        headers: this.getHeaders(),
        body: form as any,
      });
      if (!response.ok) return null;
      try {
        const uploaded = JSON.parse(await response.text()) as ComfyUploadedImage;
        return uploaded?.name ? toLoadImageValue(uploaded) : null;
      } catch {
        return null;
      }
    };

    const uploaded = await attempt('/upload/audio', 'audio')
      ?? await attempt(COMFY_UPLOAD_IMAGE_PATH, 'image');
    if (!uploaded) {
      throw new Error(`ComfyUI 音色参考音频上传失败（/upload/audio 与 /upload/image 均不可用）`);
    }
    return uploaded;
  }

  private collectReferences(request: ITVRequest): ProviderAssetInput[] {
    if (request.capability === 'video.image-to-video') {
      return [request.primaryImage, ...(request.additionalReferences || [])]
        .filter(Boolean) as ProviderAssetInput[];
    }
    if (request.capability === 'video.reference-to-video') {
      return (request.referenceImages || []).filter(Boolean) as ProviderAssetInput[];
    }
    return [];
  }

  async start(request: ITVRequest): Promise<ProviderStartResult<ITVResult>> {
    if (!this.validate()) {
      throw new Error('ComfyUI 服务地址未配置');
    }
    assertSupportedVideoCapabilities(request, 'ComfyUI', [
      'video.text-to-video',
      'video.image-to-video',
      'video.reference-to-video',
    ]);

    const options = request.options as ITVOptions | undefined;
    const defaults = this.getModelDefaults();
    const maxReferenceImages = toNumber(defaults.maxReferenceImages) ?? COMFY_DEFAULT_MAX_REFERENCES;

    const template = this.loadWorkflowTemplate();
    const bindings = resolveComfyBindings(
      template,
      (defaults.nodeBindings || undefined) as ComfyNodeBindingOverrides | undefined,
    );

    // 参考图逐张 multipart 直传（顺序上传，保持槽位顺序且不给 GPU 容器瞬时压力）
    const references = this.collectReferences(request).slice(0, maxReferenceImages);
    const uploadedImages: string[] = [];
    for (let i = 0; i < references.length; i += 1) {
      uploadedImages.push(await this.uploadReferenceImage(references[i], i));
    }

    // 音色参考（音画同出）：渲染工作流经 metadata.komaVoiceReferences 传入，
    // 上传后接 MiniMaxH3ReferenceToVideo 的 ref_audios（上限 3）
    const voiceRefs = (request.metadata?.komaVoiceReferences as ProviderAssetInput[] | undefined) ?? [];
    const maxAudioReferences = toNumber(defaults.maxAudioReferences) ?? 3;
    const uploadedAudios: string[] = [];
    for (let i = 0; i < Math.min(voiceRefs.length, maxAudioReferences); i += 1) {
      uploadedAudios.push(await this.uploadReferenceAudio(voiceRefs[i], i));
    }

    const workflow = applyComfyWorkflowParams(template, bindings, {
      prompt: String(request.prompt || '').trim(),
      referenceImages: uploadedImages,
      audioReferences: uploadedAudios,
      durationSec: this.clampDuration(options?.duration ?? this.config.defaultDuration, COMFY_DEFAULT_DURATION_SEC),
      aspectRatio: options?.aspectRatio,
      resolution: options?.resolution ?? this.config.defaultResolution,
      seed: options?.seed ?? Math.floor(Math.random() * 1_000_000_000_000),
      steps: toNumber(defaults.steps),
      fps: options?.fps ?? toNumber(defaults.fps),
      maxReferenceImages,
      maxAudioReferences,
    });

    logger.info('ComfyUI start request', {
      provider: this.config.provider,
      capability: request.capability,
      baseUrl: this.getBaseUrl(),
      nodeCount: Object.keys(workflow).length,
      uploadedReferences: uploadedImages.length,
      bindings: {
        hostNodeId: bindings.hostNodeId,
        promptNodeId: bindings.promptNodeId,
        durationNodeId: bindings.durationNodeId,
        resolutionNodeId: bindings.resolutionNodeId,
      },
      promptPreview: String(request.prompt || '').slice(0, 80),
    });

    const response = await safeFetch(joinUrl(this.getBaseUrl(), COMFY_PROMPT_PATH), {
      method: 'POST',
      headers: this.getHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        prompt: workflow,
        client_id: `koma-${Date.now()}`,
      }),
    });

    const raw = await response.text();
    let data: ComfyPromptResponse;
    try {
      data = JSON.parse(raw) as ComfyPromptResponse;
    } catch {
      logger.warn('ComfyUI prompt response is not JSON', {
        status: response.status,
        preview: raw.slice(0, 400),
      });
      throw new Error(`ComfyUI 返回了非 JSON 响应 (HTTP ${response.status})`);
    }

    if (!response.ok || data.error || !data.prompt_id) {
      throw new Error(formatPromptError(data, raw, response.status));
    }
    return { mode: 'async', taskId: String(data.prompt_id) };
  }

  /** 从 history.outputs 里挑出成片，优先带视频扩展名的条目 */
  private extractVideoUrl(outputs?: Record<string, Record<string, unknown>>): string | undefined {
    const candidates: ComfyOutputFile[] = [];
    for (const nodeOutput of Object.values(outputs ?? {})) {
      for (const key of OUTPUT_FILE_KEYS) {
        const files = nodeOutput?.[key];
        if (Array.isArray(files)) {
          candidates.push(...(files as ComfyOutputFile[]));
        }
      }
    }
    const valid = candidates.filter(file => Boolean(file?.filename));
    const picked = valid.find(file => VIDEO_FILE_RE.test(file.filename!)) ?? valid[0];
    if (!picked) return undefined;

    const params = new URLSearchParams({
      filename: picked.filename!,
      subfolder: picked.subfolder ?? '',
      type: picked.type ?? 'output',
    });
    return `${joinUrl(this.getBaseUrl(), COMFY_VIEW_PATH)}?${params.toString()}`;
  }

  /** history 尚无记录时，用队列区分「排队中」与「执行中」 */
  private async peekQueueState(taskId: string): Promise<ProviderTaskSnapshot<ITVResult>> {
    try {
      const response = await safeFetch(joinUrl(this.getBaseUrl(), COMFY_QUEUE_PATH), {
        method: 'GET',
        headers: this.getHeaders(),
      });
      if (response.ok) {
        const queue = await response.json() as {
          queue_running?: unknown[][];
          queue_pending?: unknown[][];
        };
        const inList = (list?: unknown[][]) =>
          (list ?? []).some(item => Array.isArray(item) && item.some(v => String(v) === taskId));
        if (inList(queue.queue_running)) return { state: 'running', progress: 50 };
        if (inList(queue.queue_pending)) return { state: 'queued', progress: 5 };
      }
    } catch {
      // 队列查询失败不影响主流程，按排队中处理，等下一轮轮询
    }
    return { state: 'queued', progress: 5 };
  }

  async getTaskSnapshot(taskId: string): Promise<ProviderTaskSnapshot<ITVResult>> {
    const response = await safeFetch(
      joinUrl(this.getBaseUrl(), `${COMFY_HISTORY_PATH}/${encodeURIComponent(taskId)}`),
      { method: 'GET', headers: this.getHeaders() },
    );
    if (!response.ok) {
      // 历史接口偶发 5xx 时不要直接判失败，交给下一轮轮询
      return { state: 'running', progress: 10 };
    }

    let history: Record<string, ComfyHistoryEntry>;
    try {
      history = (await response.json()) as Record<string, ComfyHistoryEntry>;
    } catch {
      return { state: 'failed', progress: 0, error: 'ComfyUI 任务查询返回非 JSON' };
    }

    const entry = history?.[taskId];
    if (!entry) {
      return this.peekQueueState(taskId);
    }

    const statusStr = String(entry.status?.status_str || '').toLowerCase();
    if (statusStr === 'error') {
      const messages = entry.status?.messages ?? [];
      // 取消/中断也会落到 status_str='error'，但 messages 里只有 execution_interrupted，
      // 没有 execution_error —— 区分开，避免把用户主动取消报成生成失败。
      const interrupted = messages.some(([type]) => String(type) === 'execution_interrupted');
      const message = messages
        .filter(([type]) => String(type).includes('error'))
        .map(([, payload]) => {
          const p = payload as Record<string, unknown>;
          return [p?.exception_type, p?.exception_message ?? p?.node_type]
            .filter(Boolean)
            .join(': ');
        })
        .filter(Boolean)
        .join(' | ');
      if (!message && interrupted) {
        return { state: 'failed', progress: 0, error: 'ComfyUI 任务已被中断（取消或服务端停止）' };
      }
      return { state: 'failed', progress: 0, error: message || 'ComfyUI 任务执行失败' };
    }

    if (entry.status?.completed || statusStr === 'success') {
      const source = this.extractVideoUrl(entry.outputs);
      if (!source) {
        return { state: 'failed', progress: 100, error: 'ComfyUI 任务完成但未返回视频文件' };
      }
      return { state: 'succeeded', progress: 100, output: { source, taskId } };
    }

    return { state: 'running', progress: 50 };
  }

  async cancelTask(taskId: string): Promise<void> {
    // 先尝试从队列摘掉（未开始执行的任务），再中断当前执行
    try {
      await safeFetch(joinUrl(this.getBaseUrl(), COMFY_QUEUE_PATH), {
        method: 'POST',
        headers: this.getHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ delete: [taskId] }),
      });
    } catch (error) {
      logger.warn('ComfyUI 队列删除失败', {
        taskId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    await safeFetch(joinUrl(this.getBaseUrl(), COMFY_INTERRUPT_PATH), {
      method: 'POST',
      headers: this.getHeaders(),
    });
  }
}

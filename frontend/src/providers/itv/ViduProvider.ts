import type { ITVConfig, ITVOptions, ProviderStartResult, ProviderTaskSnapshot } from '../../types';
import {
  isImageToVideoRequest,
  isReferenceToVideoRequest,
  isStartEndToVideoRequest,
  isTextToVideoRequest,
} from '../../types';
import { createLogger } from '../../store/logger';
import { buildAITraceHeaders } from '../../utils/aiTrace';
import { sanitizeBodyForLog, truncateString } from '../../utils/logFormatting';
import type { ITVProvider, ITVRequest, ITVResult } from './types';
import { safeFetch } from '../../utils/safeFetch';
import { readVideoTraceContext, summarizeVideoRequestForLog } from '../../utils/videoGenerationTrace';
import { VIDU_MODEL_RULES } from './modelCatalog';

type ViduTaskState = 'queued' | 'running' | 'succeeded' | 'failed';

type ViduRequestBody = Record<string, unknown> & {
  model: string;
  prompt: string;
  duration: number;
  seed: number;
  resolution: string;
  movement_amplitude: 'auto' | 'small' | 'medium' | 'large';
  off_peak: boolean;
};

const VIDU_RESOLUTIONS = new Set(['360p', '540p', '720p', '1080p']);
const VIDU_MOVEMENT_AMPLITUDES = new Set(['auto', 'small', 'medium', 'large']);
const logger = createLogger('ViduProvider');

function joinUrl(baseUrl: string, path: string): string {
  const normalizedBase = baseUrl.replace(/\/+$/, '');
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${normalizedBase}${normalizedPath}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function findNestedString(value: unknown, matcher: (key: string, value: string) => boolean): string | undefined {
  const queue: unknown[] = [value];
  const visited = new Set<unknown>();

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || typeof current !== 'object') continue;
    if (visited.has(current)) continue;
    visited.add(current);

    if (Array.isArray(current)) {
      queue.push(...current);
      continue;
    }

    for (const [key, child] of Object.entries(current)) {
      if (typeof child === 'string' && matcher(key, child)) {
        return child;
      }
      queue.push(child);
    }
  }

  return undefined;
}

function findTaskId(payload: unknown): string | undefined {
  return findNestedString(payload, (key, value) => {
    const normalizedKey = key.toLowerCase();
    return (
      ['task_id', 'taskid', 'id', 'job_id', 'jobid'].includes(normalizedKey) &&
      value.trim().length > 0
    );
  });
}

function findVideoSource(payload: unknown): string | undefined {
  return findNestedString(payload, (key, value) => {
    const normalizedKey = key.toLowerCase();
    return (
      ['url', 'video_url', 'videourl', 'source', 'file_url', 'play_url'].includes(normalizedKey) &&
      /^https?:\/\//i.test(value)
    );
  });
}

function findProgress(payload: unknown): number | undefined {
  const raw = findNestedString(payload, (key, value) => key.toLowerCase() === 'progress' && /^\d+(\.\d+)?$/.test(value));
  if (raw) {
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  if (!isRecord(payload)) return undefined;
  const direct = payload.progress;
  return typeof direct === 'number' && Number.isFinite(direct) ? direct : undefined;
}

function resolveTaskState(payload: unknown): ViduTaskState {
  const state = findNestedString(payload, (key, value) => {
    const normalizedKey = key.toLowerCase();
    return ['state', 'status', 'task_status', 'taskstatus'].includes(normalizedKey) && value.trim().length > 0;
  })?.toLowerCase();

  if (!state) return 'running';
  if (['queued', 'pending', 'waiting', 'created'].includes(state)) return 'queued';
  if (['running', 'processing', 'submitted', 'in_progress', 'progress'].includes(state)) return 'running';
  if (['success', 'succeeded', 'completed', 'done', 'finish', 'finished'].includes(state)) return 'succeeded';
  if (['failed', 'error', 'cancelled', 'canceled'].includes(state)) return 'failed';
  return 'running';
}

function ensurePrompt(value: string): string {
  return String(value || '').trim();
}

function toArray<T>(values: Array<T | undefined | null>): T[] {
  return values.filter(Boolean) as T[];
}

export class ViduProvider implements ITVProvider {
  type = 'vidu' as const;
  config: ITVConfig;

  assetTransports = {
    primaryImage: ['remote-url', 'data-url'] as const,
    additionalReferences: ['remote-url', 'data-url'] as const,
    referenceImages: ['remote-url', 'data-url'] as const,
    startFrame: ['remote-url', 'data-url'] as const,
    endFrame: ['remote-url', 'data-url'] as const,
  };

  constructor(config: ITVConfig) {
    this.config = config;
  }

  validate(): boolean {
    const hasCredentialRef = Boolean(this.config.profileId) || Boolean(this.config.apiKey);
    return Boolean(this.config.baseUrl) && hasCredentialRef && Boolean(String(this.config.modelName || '').trim());
  }

  private getHeaders(request?: ITVRequest): Record<string, string> {
    const traceContext = request ? readVideoTraceContext(request) : undefined;
    const authHeader: Record<string, string> = this.config.profileId
      ? { 'x-koma-channel-id': this.config.profileId }
      : { Authorization: `Bearer ${this.config.apiKey || ''}` };
    return {
      ...authHeader,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...buildAITraceHeaders(traceContext),
      ...(traceContext?.debugBody ? { 'x-koma-debug-body': '1' } : undefined),
    };
  }

  private getModelId(): string {
    const candidate = String(this.config.modelName || '').trim();
    if (!candidate) {
      throw new Error('模型名称未配置');
    }
    return candidate;
  }

  private normalizeResolution(value: unknown): string {
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (VIDU_RESOLUTIONS.has(normalized)) {
        return normalized;
      }

      const match = normalized.match(/^(\d{3,5})\s*x\s*(\d{3,5})$/);
      if (match) {
        const width = Number(match[1]);
        const height = Number(match[2]);
        const shortEdge = Math.min(width, height);
        if (shortEdge <= 360) return '360p';
        if (shortEdge <= 540) return '540p';
        if (shortEdge <= 720) return '720p';
        return '1080p';
      }
    }
    return '720p';
  }

  private normalizeDuration(value: unknown): number {
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
      return Math.floor(value);
    }
    if (typeof value === 'string') {
      const parsed = Number(value.trim());
      if (Number.isFinite(parsed) && parsed > 0) {
        return Math.floor(parsed);
      }
    }
    return 5;
  }

  private normalizeMovementAmplitude(value: unknown): 'auto' | 'small' | 'medium' | 'large' {
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (VIDU_MOVEMENT_AMPLITUDES.has(normalized)) {
        return normalized as 'auto' | 'small' | 'medium' | 'large';
      }
    }
    return 'auto';
  }

  private normalizeBoolean(value: unknown): boolean | undefined {
    return typeof value === 'boolean' ? value : undefined;
  }

  private normalizeWatermarkPosition(value: unknown): number | undefined {
    const parsed = typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number(value.trim())
        : NaN;
    if (Number.isFinite(parsed) && parsed >= 1 && parsed <= 4) {
      return Math.floor(parsed);
    }
    return undefined;
  }

  private normalizeMetaData(value: unknown): string | undefined {
    if (typeof value === 'string') {
      const normalized = value.trim();
      return normalized || undefined;
    }
    if (value && typeof value === 'object') {
      try {
        return JSON.stringify(value);
      } catch {
        return undefined;
      }
    }
    return undefined;
  }

  private stripUndefined<T extends Record<string, unknown>>(value: T): T {
    return Object.fromEntries(
      Object.entries(value).filter(([, item]) => item !== undefined),
    ) as T;
  }

  private buildCommonBody(request: ITVRequest, options?: ITVOptions): ViduRequestBody {
    const defaults = {
      duration: this.config.defaultDuration,
      resolution: this.config.defaultResolution,
      movementAmplitude: (this.config as any)?.movementAmplitude,
      offPeak: (this.config as any)?.offPeak,
      seed: (this.config as any)?.seed,
    } as const;

    const body: ViduRequestBody = {
      model: this.getModelId(),
      prompt: ensurePrompt(request.prompt),
      duration: this.normalizeDuration(options?.duration ?? defaults.duration),
      seed: typeof options?.seed === 'number'
        ? Math.floor(options.seed)
        : typeof defaults.seed === 'number'
          ? Math.floor(defaults.seed)
          : 0,
      resolution: this.normalizeResolution(options?.resolution ?? defaults.resolution),
      movement_amplitude: this.normalizeMovementAmplitude(
        (options as Record<string, unknown> | undefined)?.movementAmplitude
        ?? defaults.movementAmplitude,
      ),
      off_peak: this.normalizeBoolean((options as Record<string, unknown> | undefined)?.offPeak ?? defaults.offPeak) ?? false,
    };
    this.assertKnownModelOptionCompatibility(body);
    return body;
  }

  private assertKnownModelOptionCompatibility(body: ViduRequestBody): void {
    const rule = VIDU_MODEL_RULES[body.model];
    if (!rule) {
      return;
    }

    if (!rule.durations.includes(body.duration)) {
      throw new Error(`Vidu 模型 ${body.model} 不支持 ${body.duration}s，当前仅支持 ${rule.durations.join(' / ')}s`);
    }

    if (!rule.resolutions.includes(body.resolution)) {
      throw new Error(`Vidu 模型 ${body.model} 不支持 ${body.resolution}，当前仅支持 ${rule.resolutions.join(' / ')}`);
    }
  }

  private buildRequest(
    params: ITVRequest,
    variant: 'default' | 'compat-406' = 'default',
  ): { path: string; body: Record<string, unknown> } {
    const options = params.options as ITVOptions | undefined;
    const baseBody = this.buildCommonBody(params, options);
    const optionalFields = variant === 'compat-406'
      ? {}
      : {
          is_rec: this.normalizeBoolean(options?.isRecommendedPrompt),
          bgm: this.normalizeBoolean(options?.bgm),
          watermark: this.normalizeBoolean(options?.watermark),
          wm_position: this.normalizeWatermarkPosition(options?.watermarkPosition),
          wm_url: typeof options?.watermarkUrl === 'string' && options.watermarkUrl.trim()
            ? options.watermarkUrl.trim()
            : undefined,
          payload: typeof options?.payload === 'string' && options.payload.trim()
            ? options.payload
            : undefined,
          meta_data: this.normalizeMetaData(options?.metaData),
        };
    const body = this.stripUndefined({
      ...baseBody,
      ...optionalFields,
    });

    if (isTextToVideoRequest(params)) {
      return {
        path: '/vidu/v2/text2video',
        body: variant === 'compat-406'
          ? {
              ...body,
              images: [],
            }
          : body,
      };
    }

    if (isImageToVideoRequest(params)) {
      return {
        path: '/vidu/v2/img2video',
        body: {
          ...body,
          images: toArray([
            params.primaryImage?.value,
            ...((params.additionalReferences || []).map(item => item?.value)),
          ]),
        },
      };
    }

    if (isReferenceToVideoRequest(params)) {
      return {
        path: '/vidu/v2/reference2video',
        body: {
          ...body,
          images: params.referenceImages.map(item => item.value),
        },
      };
    }

    if (isStartEndToVideoRequest(params)) {
      return {
        path: '/vidu/v2/start-end2video',
        body: {
          ...body,
          images: toArray([
            params.startFrame?.value,
            params.endFrame?.value,
          ]),
        },
      };
    }

    throw new Error(`ViduProvider 不支持的视频能力: ${params.capability}`);
  }

  private async readResponsePreview(response: Response): Promise<string | undefined> {
    try {
      const text = await response.clone().text();
      return text ? truncateString(text, 2000) : undefined;
    } catch {
      return undefined;
    }
  }

  async testConnection(): Promise<boolean> {
    if (!this.validate()) return false;
    try {
      const response = await safeFetch(
        joinUrl(this.config.baseUrl || '', '/vidu/v2/tasks/test/creations'),
        {
          method: 'GET',
          headers: this.getHeaders(),
        }
      );
      return response.status !== 401 && response.status !== 403;
    } catch {
      return false;
    }
  }

  async start(request: ITVRequest): Promise<ProviderStartResult<ITVResult>> {
    const traceContext = readVideoTraceContext(request);
    if (!this.validate()) {
      logger.error('Vidu 配置缺失，无法提交任务', {
        traceId: traceContext?.traceId,
        provider: this.config.provider,
        capability: request.capability,
      });
      throw new Error('Vidu baseUrl、API Key 或模型名称未配置');
    }

    logger.info('Vidu 开始提交视频任务', {
      traceId: traceContext?.traceId,
      provider: this.config.provider,
      capability: request.capability,
      model: this.getModelId(),
      request: summarizeVideoRequestForLog(request),
    });

    const attempt = async (variant: 'default' | 'compat-406') => {
      const { path, body } = this.buildRequest(request, variant);
      const url = joinUrl(this.config.baseUrl || '', path);

      logger.info('Vidu 提交请求', {
        traceId: traceContext?.traceId,
        variant,
        url,
        path,
        capability: request.capability,
        body: sanitizeBodyForLog(body),
      });

      let response: Response;
      try {
        response = await safeFetch(url, {
          method: 'POST',
          headers: this.getHeaders(request),
          body: JSON.stringify(body),
        });
      } catch (error) {
        logger.error('Vidu 提交请求异常', {
          traceId: traceContext?.traceId,
          variant,
          url,
          path,
          error: error instanceof Error ? error.message : String(error),
          body: sanitizeBodyForLog(body),
        });
        throw error;
      }

      const responsePreview = !response.ok ? await this.readResponsePreview(response) : undefined;
      logger.info('Vidu 提交响应', {
        traceId: traceContext?.traceId,
        variant,
        url,
        path,
        status: response.status,
        ok: response.ok,
        responsePreview,
      });

      return { path, url, body, response, responsePreview, variant };
    };

    let finalAttempt = await attempt('default');
    if (finalAttempt.response.status === 406) {
      const compatRequest = this.buildRequest(request, 'compat-406');
      logger.warn('Vidu 返回 406，尝试兼容重试', {
        traceId: traceContext?.traceId,
        provider: this.config.provider,
        capability: request.capability,
        defaultPath: finalAttempt.path,
        defaultResponsePreview: finalAttempt.responsePreview,
        defaultBody: sanitizeBodyForLog(finalAttempt.body),
        compatBody: sanitizeBodyForLog(compatRequest.body),
      });
      finalAttempt = await attempt('compat-406');
    }

    if (!finalAttempt.response.ok) {
      const errorText = await finalAttempt.response.text().catch(() => '');
      logger.error('Vidu 提交失败', {
        traceId: traceContext?.traceId,
        provider: this.config.provider,
        capability: request.capability,
        variant: finalAttempt.variant,
        url: finalAttempt.url,
        path: finalAttempt.path,
        status: finalAttempt.response.status,
        responsePreview: finalAttempt.responsePreview,
        body: sanitizeBodyForLog(finalAttempt.body),
      });
      throw new Error(errorText || `Vidu 请求失败 (${finalAttempt.response.status})`);
    }

    const payload = await finalAttempt.response.json().catch(() => ({}));
    const taskId = findTaskId(payload);
    if (!taskId) {
      const source = findVideoSource(payload);
      if (source) {
        logger.info('Vidu 返回即时视频结果', {
          traceId: traceContext?.traceId,
          provider: this.config.provider,
          capability: request.capability,
          variant: finalAttempt.variant,
          source,
        });
        return {
          mode: 'immediate',
          output: {
            source,
            metadata: { raw: payload },
          },
        };
      }
      logger.error('Vidu 返回缺少任务 ID', {
        traceId: traceContext?.traceId,
        provider: this.config.provider,
        capability: request.capability,
        variant: finalAttempt.variant,
        payload: sanitizeBodyForLog(payload),
      });
      throw new Error('Vidu 返回中缺少任务 ID');
    }

    logger.info('Vidu 任务提交成功', {
      traceId: traceContext?.traceId,
      provider: this.config.provider,
      capability: request.capability,
      variant: finalAttempt.variant,
      taskId,
    });

    return {
      mode: 'async',
      taskId,
    };
  }

  async getTaskSnapshot(taskId: string): Promise<ProviderTaskSnapshot<ITVResult>> {
    if (!this.validate()) {
      throw new Error('Vidu baseUrl 或 API Key 未配置');
    }

    const url = joinUrl(this.config.baseUrl || '', `/vidu/v2/tasks/${encodeURIComponent(taskId)}/creations`);
    logger.info('Vidu 查询任务状态', {
      taskId,
      url,
      provider: this.config.provider,
    });

    const response = await safeFetch(
      url,
      {
        method: 'GET',
        headers: this.getHeaders(),
      }
    );

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      logger.error('Vidu 查询任务失败', {
        taskId,
        url,
        provider: this.config.provider,
        status: response.status,
        responsePreview: truncateString(errorText, 2000),
      });
      throw new Error(errorText || `Vidu 查询任务失败 (${response.status})`);
    }

    const payload = await response.json().catch(() => ({}));
    const state = resolveTaskState(payload);
    const progress = findProgress(payload);
    const source = findVideoSource(payload);

    logger.info('Vidu 任务状态已解析', {
      taskId,
      url,
      provider: this.config.provider,
      state,
      progress,
      hasSource: Boolean(source),
    });

    if (state === 'failed') {
      const errorMessage = findNestedString(payload, (key, value) => key.toLowerCase() === 'message' && value.trim().length > 0) || 'Vidu 任务失败';
      logger.error('Vidu 任务执行失败', {
        taskId,
        provider: this.config.provider,
        state,
        progress,
        error: errorMessage,
        payload: sanitizeBodyForLog(payload),
      });
      return {
        state: 'failed',
        progress,
        error: errorMessage,
      };
    }

    if (state === 'succeeded' && source) {
      logger.info('Vidu 任务已产出视频', {
        taskId,
        provider: this.config.provider,
        source,
      });
      return {
        state: 'succeeded',
        progress: progress ?? 100,
        output: {
          source,
          taskId,
          metadata: { raw: payload },
        },
      };
    }

    return {
      state: state === 'queued' ? 'queued' : 'running',
      progress,
    };
  }
}

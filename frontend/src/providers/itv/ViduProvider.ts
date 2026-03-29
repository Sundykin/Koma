import type { ITVConfig, ITVOptions, ProviderStartResult, ProviderTaskSnapshot } from '../../types';
import {
  isImageToVideoRequest,
  isReferenceToVideoRequest,
  isStartEndToVideoRequest,
  isTextToVideoRequest,
} from '../../types';
import type { ITVProvider, ITVRequest, ITVResult } from './types';
import { safeFetch } from '../../utils/safeFetch';

type ViduTaskState = 'queued' | 'running' | 'succeeded' | 'failed';

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
    return Boolean(this.config.baseUrl && this.config.apiKey && String(this.config.modelName || '').trim());
  }

  private getHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.config.apiKey || ''}`,
      'Content-Type': 'application/json',
    };
  }

  private getModelId(): string {
    const candidate = String(this.config.modelName || '').trim();
    if (!candidate) {
      throw new Error('模型名称未配置');
    }
    return candidate;
  }

  private buildCommonBody(request: ITVRequest, options?: ITVOptions): Record<string, unknown> {
    const defaults = {
      duration: this.config.defaultDuration,
      resolution: this.config.defaultResolution,
      movementAmplitude: (this.config as any)?.movementAmplitude,
      offPeak: (this.config as any)?.offPeak,
    } as const;

    return {
      model: this.getModelId(),
      prompt: ensurePrompt(request.prompt),
      duration: options?.duration ?? defaults.duration,
      seed: options?.seed ?? 0,
      resolution: options?.resolution ?? defaults.resolution,
      is_rec: options?.isRecommendedPrompt,
      bgm: options?.bgm,
      watermark: options?.watermark,
      wm_position: options?.watermarkPosition,
      wm_url: options?.watermarkUrl,
      payload: options?.payload,
      meta_data: options?.metaData,
      movement_amplitude: (options as Record<string, unknown> | undefined)?.movementAmplitude
        ?? defaults.movementAmplitude
        ?? 'auto',
      off_peak: (options as Record<string, unknown> | undefined)?.offPeak
        ?? defaults.offPeak
        ?? false,
    };
  }

  private buildRequest(params: ITVRequest): { path: string; body: Record<string, unknown> } {
    const options = params.options as ITVOptions | undefined;
    const body = this.buildCommonBody(params, options);

    if (isTextToVideoRequest(params)) {
      return {
        path: '/vidu/v2/text2video',
        body: {
          ...body,
          images: [],
        },
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
    if (!this.validate()) {
      throw new Error('Vidu baseUrl、API Key 或模型名称未配置');
    }

    const { path, body } = this.buildRequest(request);
    const response = await safeFetch(joinUrl(this.config.baseUrl || '', path), {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(errorText || `Vidu 请求失败 (${response.status})`);
    }

    const payload = await response.json().catch(() => ({}));
    const taskId = findTaskId(payload);
    if (!taskId) {
      const source = findVideoSource(payload);
      if (source) {
        return {
          mode: 'immediate',
          output: {
            source,
            metadata: { raw: payload },
          },
        };
      }
      throw new Error('Vidu 返回中缺少任务 ID');
    }

    return {
      mode: 'async',
      taskId,
    };
  }

  async getTaskSnapshot(taskId: string): Promise<ProviderTaskSnapshot<ITVResult>> {
    if (!this.validate()) {
      throw new Error('Vidu baseUrl 或 API Key 未配置');
    }

    const response = await safeFetch(
      joinUrl(this.config.baseUrl || '', `/vidu/v2/tasks/${encodeURIComponent(taskId)}/creations`),
      {
        method: 'GET',
        headers: this.getHeaders(),
      }
    );

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(errorText || `Vidu 查询任务失败 (${response.status})`);
    }

    const payload = await response.json().catch(() => ({}));
    const state = resolveTaskState(payload);
    const progress = findProgress(payload);
    const source = findVideoSource(payload);

    if (state === 'failed') {
      return {
        state: 'failed',
        progress,
        error: findNestedString(payload, (key, value) => key.toLowerCase() === 'message' && value.trim().length > 0) || 'Vidu 任务失败',
      };
    }

    if (state === 'succeeded' && source) {
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

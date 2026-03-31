/**
 * Kling (可灵) Provider
 *
 * Contract source:
 * - apidocs/kling视频API文档.md
 */
import type {
  ITVConfig,
  ITVOptions,
  ProviderStartResult,
  ProviderTaskSnapshot,
  VideoGenerationCapability,
} from '../../types';
import {
  isReferenceToVideoRequest,
  isStartEndToVideoRequest,
  isTextToVideoRequest,
} from '../../types';
import {
  assertSupportedVideoCapabilities,
  requirePrimaryImage,
  type ITVProvider,
  type ITVRequest,
  type ITVResult,
  type ITVTaskSnapshotContext,
} from './types';
import { safeFetch } from '../../utils/safeFetch';

interface KlingCreateResponse {
  code?: number | string;
  message?: string;
  request_id?: string;
  task_id?: string;
  id?: string;
  data?: {
    task_id?: string;
    id?: string;
    task_status?: string;
    request_id?: string;
  };
}

interface KlingTaskVideoResult {
  id?: string;
  url?: string;
  duration?: string;
}

interface KlingTaskResponse {
  code?: number | string;
  message?: string;
  request_id?: string;
  data?: {
    task_id?: string;
    task_status?: string;
    task_status_msg?: string;
    created_at?: string | number;
    updated_at?: string | number;
    task_result?: {
      videos?: KlingTaskVideoResult[];
    };
  };
}

type KlingRequestBody = Record<string, unknown> & {
  model_name: string;
  duration: '5' | '10';
};

type KlingMode = 'std' | 'pro';

const KLING_SUPPORTED_CAPABILITIES: VideoGenerationCapability[] = [
  'video.text-to-video',
  'video.image-to-video',
  'video.reference-to-video',
  'video.start-end-to-video',
];
const KLING_MODEL_NAMES = new Set(['kling-v1', 'kling-v1-5', 'kling-v1-6']);

function isSuccessCode(code: unknown): boolean {
  return code === undefined
    || code === 0
    || code === 200
    || code === '0'
    || code === '200';
}

export class KlingProvider implements ITVProvider {
  type = 'kling' as const;
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
    return Boolean(this.config.apiKey && String(this.config.modelName || '').trim());
  }

  private getBaseUrl(): string {
    return this.config.baseUrl || 'https://api.klingai.com';
  }

  private getModelName(): string {
    const value = String(this.config.modelName || '').trim();
    if (!value) {
      throw new Error('Kling 模型名称未配置');
    }
    if (!KLING_MODEL_NAMES.has(value)) {
      throw new Error('Kling 模型名称无效，仅支持 kling-v1、kling-v1-5、kling-v1-6');
    }
    return value;
  }

  private getHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.config.apiKey || ''}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    };
  }

  private buildUrl(endpoint: string): string {
    const base = this.getBaseUrl().replace(/\/+$/, '');
    const normalized = endpoint.replace(/^\/+/, '');
    if (/\/kling\/v1$/.test(base) || /\/v1$/.test(base)) {
      return `${base}/${normalized}`;
    }
    if (/\/kling$/.test(base)) {
      return `${base}/v1/${normalized}`;
    }
    return `${base}/kling/v1/${normalized}`;
  }

  private stripUndefined<T extends Record<string, unknown>>(value: T): T {
    return Object.fromEntries(
      Object.entries(value).filter(([, item]) => item !== undefined),
    ) as T;
  }

  private parseResolution(options?: ITVOptions): { width: number; height: number } {
    const resolution = options?.resolution || this.config.defaultResolution;
    if (resolution) {
      const match = resolution.match(/(\d+)\s*x\s*(\d+)/i);
      if (match) {
        return { width: Number(match[1]), height: Number(match[2]) };
      }
    }
    return { width: 1280, height: 720 };
  }

  private resolveAspectRatio(options?: ITVOptions): '16:9' | '9:16' | '1:1' | undefined {
    if (options?.aspectRatio) {
      const normalized = options.aspectRatio.replace(/\s+/g, '');
      if (normalized === '16:9' || normalized === '9:16' || normalized === '1:1') {
        return normalized;
      }
    }

    const { width, height } = this.parseResolution(options);
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
      return undefined;
    }
    if (width === height) return '1:1';
    return width > height ? '16:9' : '9:16';
  }

  private normalizeDuration(value: unknown): '5' | '10' {
    const candidate = typeof value === 'number'
      ? String(Math.floor(value))
      : typeof value === 'string'
        ? value.trim()
        : '';

    if (candidate === '10') return '10';
    if (candidate === '5' || candidate === '') return '5';
    throw new Error('Kling 仅支持 5s 或 10s 视频时长');
  }

  private normalizeMode(value: unknown): KlingMode | undefined {
    if (typeof value !== 'string') return undefined;
    const normalized = value.trim().toLowerCase();
    if (normalized.startsWith('std')) return 'std';
    if (normalized.startsWith('pro')) return 'pro';
    return undefined;
  }

  private normalizeCallbackUrl(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
  }

  private normalizeCameraControl(value: unknown): Record<string, unknown> | undefined {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? value as Record<string, unknown>
      : undefined;
  }

  private normalizeImageInput(value: string): string {
    if (!value.startsWith('data:')) {
      return value;
    }

    const marker = ';base64,';
    const markerIndex = value.indexOf(marker);
    if (markerIndex === -1) {
      throw new Error('Kling 图片输入格式无效，仅支持图片 URL 或纯 Base64 内容');
    }

    return value.slice(markerIndex + marker.length).replace(/\s+/g, '');
  }

  private resolveTaskId(data: KlingCreateResponse): string | undefined {
    return data.task_id
      || data.id
      || data.data?.task_id
      || data.data?.id
      || data.request_id
      || data.data?.request_id;
  }

  private mapTaskState(rawStatus?: string): ProviderTaskSnapshot<ITVResult>['state'] {
    const status = (rawStatus || '').toLowerCase();
    if (['succeed', 'succeeded', 'success', 'completed', 'done'].includes(status)) return 'succeeded';
    if (['failed', 'error', 'timeout', 'cancelled', 'canceled'].includes(status)) return 'failed';
    if (['queued', 'pending', 'submitted', 'submitting', 'waiting'].includes(status)) return 'queued';
    if (['processing', 'running', 'in_progress', 'progress'].includes(status)) return 'running';
    return 'running';
  }

  private parseDurationSec(value?: string): number | undefined {
    if (!value) return undefined;
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
  }

  private translateError(message: string): string {
    if (!message) return '未知错误';
    const lower = message.toLowerCase();
    if (lower.includes('gateway timeout') || lower.includes('upstream') || lower.includes('524') || lower.includes('504')) {
      return '网关超时或代理服务异常，请稍后重试';
    }
    if (lower.includes('base64')) {
      return '图片内容不是有效的 Base64，Kling 仅接受图片 URL 或纯 Base64 内容（不要带 data:image/... 前缀）';
    }
    if (lower.includes('sensitive') || lower.includes('nsfw')) return '内容包含敏感词或违规元素，请修改提示词';
    if (lower.includes('balance') || lower.includes('credit')) return '账户余额不足';
    if (lower.includes('timeout')) return '任务处理超时';
    if (lower.includes('network') || lower.includes('fetch')) return '网络连接失败';
    if (lower.includes('unauthorized') || lower.includes('401')) return 'API Key 无效或过期';
    return message;
  }

  private buildCommonBody(request: ITVRequest, options?: ITVOptions): KlingRequestBody {
    const extraOptions = options as Record<string, unknown> | undefined;
    const extraConfig = this.config as unknown as Record<string, unknown>;
    return this.stripUndefined({
      model_name: this.getModelName(),
      prompt: String(request.prompt || ''),
      negative_prompt: options?.negativePrompt?.trim() || undefined,
      cfg_scale: typeof options?.motionStrength === 'number' ? options.motionStrength : undefined,
      mode: this.normalizeMode(extraOptions?.mode ?? extraConfig.mode),
      duration: this.normalizeDuration(options?.duration ?? this.config.defaultDuration),
      callback_url: this.normalizeCallbackUrl(
        extraOptions?.callbackUrl ?? extraConfig.callbackUrl,
      ),
    });
  }

  private buildRequest(request: ITVRequest): { endpoint: string; body: Record<string, unknown> } {
    const options = request.options as ITVOptions | undefined;
    const commonBody = this.buildCommonBody(request, options);

    if (isTextToVideoRequest(request)) {
      const extraConfig = this.config as unknown as Record<string, unknown>;
      return {
        endpoint: 'videos/text2video',
        body: this.stripUndefined({
          ...commonBody,
          aspect_ratio: this.resolveAspectRatio(options),
          camera_control: this.normalizeCameraControl(
            (options as Record<string, unknown> | undefined)?.cameraControl
            ?? extraConfig.cameraControl,
          ),
        }),
      };
    }

    if (isReferenceToVideoRequest(request)) {
      if (!request.referenceImages?.length) {
        throw new Error('Kling 参考生视频至少需要一张参考图');
      }
      return {
        endpoint: 'videos/multi-image2video',
        body: {
          ...commonBody,
          image_list: request.referenceImages.map((item) => ({ image: this.normalizeImageInput(item.value) })),
        },
      };
    }

    if (isStartEndToVideoRequest(request)) {
      if (!request.startFrame || !request.endFrame) {
        throw new Error('Kling 首尾帧视频需要同时提供首帧和尾帧');
      }
      if (commonBody.duration !== '5') {
        throw new Error('Kling 尾帧控制仅支持 5s 视频时长');
      }
      return {
        endpoint: 'videos/image2video',
        body: {
          ...commonBody,
          image: this.normalizeImageInput(request.startFrame.value),
          image_tail: this.normalizeImageInput(request.endFrame.value),
        },
      };
    }

    const primaryImage = requirePrimaryImage(request, 'Kling');
    const tailFrame = request.additionalReferences?.[0]?.value || options?.endFrame;
    if (tailFrame && commonBody.duration !== '5') {
      throw new Error('Kling 尾帧控制仅支持 5s 视频时长');
    }

    return {
      endpoint: 'videos/image2video',
      body: this.stripUndefined({
        ...commonBody,
        image: this.normalizeImageInput(primaryImage.value),
        image_tail: tailFrame ? this.normalizeImageInput(tailFrame) : undefined,
      }),
    };
  }

  private buildTaskQueryEndpoint(capability: VideoGenerationCapability, taskId: string): string {
    const encodedTaskId = encodeURIComponent(taskId);
    if (capability === 'video.text-to-video') {
      return `images/text2video/${encodedTaskId}`;
    }
    if (capability === 'video.reference-to-video') {
      return `videos/multi-image2video/${encodedTaskId}`;
    }
    return `images/image2video/${encodedTaskId}`;
  }

  private getTaskQueryEndpoints(taskId: string, capability?: VideoGenerationCapability): string[] {
    if (capability) {
      return [this.buildTaskQueryEndpoint(capability, taskId)];
    }

    return [
      this.buildTaskQueryEndpoint('video.image-to-video', taskId),
      this.buildTaskQueryEndpoint('video.text-to-video', taskId),
      this.buildTaskQueryEndpoint('video.reference-to-video', taskId),
    ];
  }

  private async readErrorMessage(response: Response): Promise<string> {
    const text = await response.text().catch(() => '');
    if (!text) {
      return response.statusText || `请求失败 (${response.status})`;
    }
    try {
      const parsed = JSON.parse(text);
      return parsed.message || parsed.error?.message || text;
    } catch {
      return text;
    }
  }

  private toSnapshot(payload: KlingTaskResponse, taskId: string): ProviderTaskSnapshot<ITVResult> {
    const data = payload.data || {};
    const state = this.mapTaskState(data.task_status);
    const video = data.task_result?.videos?.[0];
    const source = video?.url;
    const progress = state === 'succeeded'
      ? 100
      : state === 'running'
        ? 50
        : 0;
    const error = data.task_status_msg || payload.message;

    if (state === 'failed') {
      return {
        state: 'failed',
        progress,
        error: this.translateError(error || 'Kling 任务失败'),
      };
    }

    if (state === 'succeeded' && source) {
      return {
        state: 'succeeded',
        progress: 100,
        output: {
          source,
          taskId,
          durationSec: this.parseDurationSec(video?.duration),
          metadata: { raw: payload },
        },
      };
    }

    return {
      state: state === 'queued' ? 'queued' : 'running',
      progress,
    };
  }

  async testConnection(): Promise<boolean> {
    if (!this.validate()) return false;

    try {
      const response = await safeFetch(this.buildUrl('images/text2video/test'), {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.config.apiKey || ''}`,
          Accept: 'application/json',
        },
      });
      return response.status !== 401 && response.status !== 403;
    } catch {
      return false;
    }
  }

  async start(request: ITVRequest): Promise<ProviderStartResult<ITVResult>> {
    if (!this.validate()) {
      throw new Error('Kling API Key 或模型名称未配置');
    }

    assertSupportedVideoCapabilities(request, 'Kling', KLING_SUPPORTED_CAPABILITIES);
    const { endpoint, body } = this.buildRequest(request);

    const response = await safeFetch(this.buildUrl(endpoint), {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await this.readErrorMessage(response);
      throw new Error(`Kling 生成失败: ${this.translateError(errorText)}`);
    }

    const data: KlingCreateResponse = await response.json().catch(() => ({}));
    if (!isSuccessCode(data.code)) {
      throw new Error(this.translateError(data.message || 'Kling 创建任务失败'));
    }

    const taskId = this.resolveTaskId(data);
    if (!taskId) {
      throw new Error('Kling 任务ID获取失败');
    }

    return { mode: 'async', taskId };
  }

  async getTaskSnapshot(taskId: string, context?: ITVTaskSnapshotContext): Promise<ProviderTaskSnapshot<ITVResult>> {
    const endpoints = this.getTaskQueryEndpoints(taskId, context?.capability);
    let lastError: string | undefined;

    for (const endpoint of endpoints) {
      try {
        const response = await safeFetch(this.buildUrl(endpoint), {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${this.config.apiKey || ''}`,
            Accept: 'application/json',
          },
        });

        if (!response.ok) {
          lastError = this.translateError(await this.readErrorMessage(response));
          if (!context?.capability && (response.status === 400 || response.status === 404)) {
            continue;
          }
          return { state: 'failed', progress: 0, error: lastError };
        }

        const payload: KlingTaskResponse = await response.json().catch(() => ({}));
        if (!isSuccessCode(payload.code)) {
          return {
            state: 'failed',
            progress: 0,
            error: this.translateError(payload.message || payload.data?.task_status_msg || 'Kling 查询任务失败'),
          };
        }

        return this.toSnapshot(payload, taskId);
      } catch (error) {
        lastError = this.translateError(error instanceof Error ? error.message : String(error));
      }
    }

    return {
      state: 'failed',
      progress: 0,
      error: lastError || 'Kling 查询任务状态失败，请稍后重试',
    };
  }

  async cancelTask(taskId: string): Promise<void> {
    const endpoints = [
      this.buildUrl(`videos/text2video/${encodeURIComponent(taskId)}/cancel`),
      this.buildUrl(`videos/image2video/${encodeURIComponent(taskId)}/cancel`),
      this.buildUrl(`videos/multi-image2video/${encodeURIComponent(taskId)}/cancel`),
    ];

    for (const url of endpoints) {
      try {
        const response = await safeFetch(url, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.config.apiKey || ''}`,
          },
        });
        if (response.ok) return;
      } catch {
        // ignore and try next endpoint
      }
    }
  }
}

export default KlingProvider;

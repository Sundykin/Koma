/**
 * OpenAI-Compatible TTI Provider
 * 兼容 OpenAI /v1/images/generations 接口的自定义文生图服务
 * 支持 url 和 b64_json 两种返回格式
 */
import type { TTIModelConfig, ProviderStartResult, ProviderTaskSnapshot } from '../../types';
import type { TTIProvider, TTIOptions, TTIRequest, ImageResult } from './types';
import { safeFetch } from '../../utils/safeFetch';
import { createLogger } from '../../store/logger';
import { resolveTTISize } from './utils/ttiSize';

const logger = createLogger('OpenAICompatibleTTI');

const OPENAI_COMPATIBLE_MAX_BATCH_IMAGES = 10;

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

interface ImageData {
  url?: string;
  b64_json?: string;
  revised_prompt?: string;
}

interface CreateResponse {
  id?: string;
  created?: number;
  // 异步模式字段
  status?: 'queued' | 'in_progress' | 'completed' | 'failed';
  progress?: number;
  // 同步模式：直接返回结果
  data?: ImageData[];
}

interface TaskResponse {
  id: string;
  status: 'queued' | 'in_progress' | 'completed' | 'failed';
  progress: number;
  result?: {
    type: string;
    data: ImageData[];
  };
  data?: ImageData[];
  error?: {
    code: string;
    message: string;
  };
}

export class OpenAICompatibleTTIProvider implements TTIProvider {
  type = 'openai-compatible-tti' as const;
  config: TTIModelConfig;
  supportsMultiAngle = true;
  private readonly taskSnapshotPathById = new Map<string, string>();

  constructor(config: TTIModelConfig) {
    this.config = config;
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

  private normalizeEndpointPath(path?: string): string {
    const normalized = String(path || '').trim() || '/v1/images/generations';
    return normalized.startsWith('/') ? normalized : `/${normalized}`;
  }

  private buildTaskSnapshotCandidates(taskId: string): string[] {
    const candidates: string[] = [];
    const customPath = this.taskSnapshotPathById.get(taskId);
    if (customPath) {
      const normalizedCustomPath = this.normalizeEndpointPath(customPath).replace(/\/+$/, '');
      candidates.push(`${this.getBaseUrl()}${normalizedCustomPath}/${encodeURIComponent(taskId)}`);

      if (normalizedCustomPath.endsWith('/generations')) {
        candidates.push(
          `${this.getBaseUrl()}${normalizedCustomPath.replace(/\/generations$/, '')}/${encodeURIComponent(taskId)}`,
        );
      } else {
        candidates.push(`${this.getBaseUrl()}${normalizedCustomPath}/generations/${encodeURIComponent(taskId)}`);
      }
    }

    candidates.push(`${this.getBaseUrl()}/v1/images/generations/${encodeURIComponent(taskId)}`);
    return [...new Set(candidates)];
  }

  private getHeaders(): Record<string, string> {
    if (this.config.profileId) {
      return {
        'x-koma-channel-id': this.config.profileId,
        'Content-Type': 'application/json',
      };
    }
    return {
      'Authorization': `Bearer ${this.config.apiKey || ''}`,
      'Content-Type': 'application/json',
    };
  }

  private getAuthOnlyHeaders(): Record<string, string> {
    if (this.config.profileId) {
      return { 'x-koma-channel-id': this.config.profileId };
    }
    return { 'Authorization': `Bearer ${this.config.apiKey || ''}` };
  }

  validate(): boolean {
    const hasCredentialRef = Boolean(this.config.profileId) || Boolean(this.config.apiKey);
    return hasCredentialRef && Boolean(this.config.baseUrl) && Boolean(String(this.config.modelName || '').trim());
  }

  async testConnection(): Promise<boolean> {
    if (!this.validate()) return false;

    try {
      const response = await safeFetch(`${this.getBaseUrl()}/v1/models`, {
        method: 'GET',
        headers: this.getAuthOnlyHeaders(),
      });
      return response.status !== 401 && response.status !== 403;
    } catch {
      return false;
    }
  }

  private clampCount(value: unknown, max = OPENAI_COMPATIBLE_MAX_BATCH_IMAGES): number {
    const normalized = Number(value);
    if (!Number.isFinite(normalized)) return 1;
    return Math.max(1, Math.min(max, Math.floor(normalized)));
  }

  /**
   * 从 ImageData 中提取可用的图片结果
   * 支持 url 和 b64_json 两种格式
   */
  private extractImageResult(item: ImageData): ImageResult | null {
    if (item.url) {
      return {
        path: item.url,
        url: item.url,
      };
    }
    if (item.b64_json) {
      const dataUrl = `data:image/jpeg;base64,${item.b64_json}`;
      return {
        path: dataUrl,
        url: dataUrl,
      };
    }
    return null;
  }

  private createImmediateOutput(items?: ImageData[]): ImageResult | null {
    const images = (items ?? [])
      .map(item => this.extractImageResult(item))
      .filter(Boolean) as ImageResult[];
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
   * 生成图片
   * 同步返回（直接拿到结果）或异步（返回 taskId 轮询）
   */
  async start(request: TTIRequest): Promise<ProviderStartResult<ImageResult>> {
    if ((!this.config.apiKey && !this.config.profileId) || !this.config.baseUrl) {
      throw new Error('API Key 或 API 地址未配置');
    }
    if (!String(this.config.modelName || '').trim()) {
      throw new Error('模型名称未配置');
    }

    const options: TTIOptions | undefined = request.options;
    const isMultiAngle = request.requestType === 'multi-angle' && Boolean(request.multiAngle);
    const count = this.clampCount(request.count);
    const body: Record<string, any> = {
      model: this.getModelName(),
      prompt: request.prompt,
      n: count,
    };

    const size = resolveTTISize(options, this.config.defaultSize);
    if (size) {
      body.size = size;
    }

    if (request.references && request.references.length > 0) {
      body.image_urls = request.references.map(item => ({ url: item.value }));
    }

    if (isMultiAngle && request.multiAngle) {
      const referenceUrls = (request.references ?? []).map(item => item.value);
      if (!referenceUrls.length) {
        throw new Error('多角度接口需要至少一张参考图片');
      }

      body.source_image = referenceUrls[request.multiAngle.sourceReferenceIndex ?? 0] ?? referenceUrls[0];
      body.reference_images = referenceUrls;
      if (request.multiAngle.originalPrompt) {
        body.original_prompt = request.multiAngle.originalPrompt;
      }
      body.angle_prompt = request.multiAngle.anglePrompt;
      body.compiled_prompt = request.multiAngle.compiledPrompt;
      body.camera = {
        azimuth: request.multiAngle.azimuth,
        elevation: request.multiAngle.elevation,
        distance: request.multiAngle.distance,
        promptProtocol: request.multiAngle.promptProtocol,
      };
      body.multi_angle = {
        enabled: true,
        sourceReferenceIndex: request.multiAngle.sourceReferenceIndex ?? 0,
        endpointPath: request.multiAngle.endpointPath,
      };
    }

    const protocol = (this.config as any)?.promptProtocol;
    const debugBody = Boolean(protocol) || isMultiAngle || (import.meta as any)?.env?.DEV === true;
    if (debugBody) {
      logger.info('TTI start request body', {
        provider: this.config.provider,
        ...(protocol ? { promptProtocol: protocol } : undefined),
        ...(isMultiAngle ? { requestType: 'multi-angle', endpointPath: request.multiAngle?.endpointPath } : undefined),
        size,
        requestedAspectRatio: options?.aspectRatio,
        defaultSize: this.config.defaultSize,
        body: sanitizeBodyForLog(body),
      });
    }

    const endpointPath = isMultiAngle
      ? this.normalizeEndpointPath(request.multiAngle?.endpointPath || '/v1/images/multi-angle')
      : '/v1/images/generations';

    const response = await safeFetch(`${this.getBaseUrl()}${endpointPath.startsWith('/') ? endpointPath : `/${endpointPath}`}`, {
      method: 'POST',
      headers: {
        ...this.getHeaders(),
        ...(debugBody ? { 'x-koma-debug-body': '1' } : undefined),
        ...(debugBody ? { 'x-koma-trace-operation': 'tti.start' } : undefined),
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`创建任务失败: ${errorText}`);
    }

    const data: CreateResponse = await response.json();

    // 同步模式：响应中直接包含图片数据
    if (data.data?.[0]) {
      const output = this.createImmediateOutput(data.data);
      if (output) {
        return {
          mode: 'immediate',
          output,
        };
      }
    }

    // 异步模式：返回 taskId
    if (data.id) {
      if (isMultiAngle) {
        this.taskSnapshotPathById.set(data.id, endpointPath);
      }
      return { mode: 'async', taskId: data.id };
    }

    throw new Error('API 返回了无法识别的响应格式');
  }

  /**
   * 轮询任务状态（异步模式）
   */
  async getTaskSnapshot(taskId: string): Promise<ProviderTaskSnapshot<ImageResult>> {
    const candidates = this.buildTaskSnapshotCandidates(taskId);
    let data: TaskResponse | null = null;
    let lastStatus = 0;
    let matchedUrl = '';

    for (const url of candidates) {
      logger.info('TTI snapshot request', {
        provider: this.config.provider,
        taskId,
        url,
      });

      const response = await safeFetch(url, {
        method: 'GET',
        headers: this.getAuthOnlyHeaders(),
      });

      lastStatus = response.status;
      if (!response.ok) {
        continue;
      }

      data = await response.json();
      matchedUrl = url;
      break;
    }

    if (!data) {
      logger.error('TTI snapshot request failed', {
        provider: this.config.provider,
        taskId,
        candidates,
        status: lastStatus,
      });
      return {
        state: 'failed',
        progress: 0,
        error: '查询失败',
      };
    }

    logger.info('TTI snapshot response', {
      provider: this.config.provider,
      taskId,
      url: matchedUrl,
      status: data.status,
      progress: data.progress,
    });

    const stateMap: Record<string, ProviderTaskSnapshot<ImageResult>['state']> = {
      queued: 'queued',
      in_progress: 'running',
      completed: 'succeeded',
      failed: 'failed',
    };

    const snapshot: ProviderTaskSnapshot<ImageResult> = {
      state: stateMap[data.status] || 'running',
      progress: data.progress || 0,
    };

    if (data.status === 'completed') {
      const items = data.result?.data || data.data;
      if (items?.[0]) {
        const output = this.createImmediateOutput(items);
        if (output) {
          this.taskSnapshotPathById.delete(taskId);
          snapshot.output = output;
        }
      }
    }

    if (data.status === 'failed' && data.error) {
      this.taskSnapshotPathById.delete(taskId);
      snapshot.error = data.error.message || '任务失败';
    }

    return snapshot;
  }
}

import type {
  ITVConfig,
  ITVOptions,
  ProviderAssetInput,
  ProviderStartResult,
  ProviderTaskSnapshot,
} from '../../types';
import {
  isImageToVideoRequest,
  isReferenceToVideoRequest,
  isStartEndToVideoRequest,
  isTextToVideoRequest,
} from '../../types';
import { createLogger } from '../../store/logger';
import { sanitizeBodyForLog } from '../../utils/logFormatting';
import { base64ToBytes, stripDataHeader } from '../../utils/encoding';
import { safeFetch } from '../../utils/safeFetch';
import {
  assertSupportedVideoCapabilities,
  type ITVProvider,
  type ITVRequest,
  type ITVResult,
} from './types';

type SeedanceImageRole = 'first_frame' | 'last_frame' | 'reference_image';

interface SeedanceImageWithRole {
  url: string;
  role: SeedanceImageRole;
}

interface SeedanceCreateResponse {
  id?: string;
  object?: string;
  model?: string;
  status?: 'queued' | 'in_progress' | 'completed' | 'failed';
  progress?: number;
  created_at?: number;
  metadata?: Record<string, unknown>;
  error?: {
    code?: string;
    message?: string;
  };
}

interface SeedanceTaskResponse extends SeedanceCreateResponse {
  completed_at?: number;
  expires_at?: number;
  result?: {
    type?: string;
    data?: Array<{
      url?: string;
      format?: string;
    }>;
  };
}

interface SeedanceErrorEnvelope {
  code?: string;
  message?: string;
  error?: {
    code?: string;
    message?: string;
    type?: string;
  };
}

interface ParsedSeedanceError {
  code?: string;
  message: string;
  rawMessage: string;
  kind: 'model-route-missing' | 'base64-not-allowed' | 'invalid-image-url' | 'generic';
}

interface SeedanceUploadResponse {
  success?: boolean;
  data?: {
    id?: string;
    url?: string;
    mime_type?: string;
    size?: number;
  };
  error?: {
    code?: string;
    message?: string;
  };
  code?: string;
  message?: string;
}

const logger = createLogger('SeedanceProvider');
const SEEDANCE_ASPECT_RATIOS = new Set(['21:9', '16:9', '4:3', '1:1', '3:4', '9:16', 'adaptive']);
const SEEDANCE_RESOLUTIONS = new Set(['480p', '720p']);

function joinUrl(baseUrl: string, path: string): string {
  const normalizedBase = baseUrl.replace(/\/+$/, '');
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${normalizedBase}${normalizedPath}`;
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

function normalizeAspectRatio(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) {
    return 'adaptive';
  }

  const normalized = value.trim().replace(/\s+/g, '');
  if (SEEDANCE_ASPECT_RATIOS.has(normalized)) {
    return normalized;
  }

  const sizeMatch = normalized.match(/^(\d{3,5})x(\d{3,5})$/i);
  if (!sizeMatch) {
    return 'adaptive';
  }

  const width = Number(sizeMatch[1]);
  const height = Number(sizeMatch[2]);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return 'adaptive';
  }

  const divisor = gcd(width, height);
  const ratio = `${Math.round(width / divisor)}:${Math.round(height / divisor)}`;
  return SEEDANCE_ASPECT_RATIOS.has(ratio) ? ratio : 'adaptive';
}

function normalizeResolution(value: unknown): '480p' | '720p' {
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (SEEDANCE_RESOLUTIONS.has(normalized)) {
      return normalized as '480p' | '720p';
    }

    const match = normalized.match(/^(\d{3,5})\s*x\s*(\d{3,5})$/);
    if (match) {
      const width = Number(match[1]);
      const height = Number(match[2]);
      const shortEdge = Math.min(width, height);
      return shortEdge <= 560 ? '480p' : '720p';
    }

    if (normalized === '1080p') {
      return '720p';
    }
  }

  return '720p';
}

function normalizeDuration(model: string, value: unknown): number {
  if (value === -1 || value === '-1') {
    return -1;
  }

  const parsed = typeof value === 'number'
    ? value
    : typeof value === 'string'
      ? Number(value.trim())
      : NaN;
  const fallback = 5;
  const resolved = Number.isFinite(parsed) ? Math.floor(parsed) : fallback;
  const maxDuration = model === 'seedance-2.0-fast' ? 12 : 15;
  return Math.min(Math.max(resolved, 4), maxDuration);
}

function getErrorMessage(payload: SeedanceCreateResponse | SeedanceTaskResponse): string | undefined {
  return payload.error?.message || payload.error?.code;
}

function getCompletedVideoUrl(payload: SeedanceTaskResponse): string | undefined {
  const resultUrl = payload.result?.data?.[0]?.url;
  if (typeof resultUrl === 'string' && resultUrl.trim()) {
    return resultUrl.trim();
  }
  const metadataUrl = payload.metadata?.url;
  return typeof metadataUrl === 'string' && metadataUrl.trim()
    ? metadataUrl.trim()
    : undefined;
}

function getCompletedVideoFormat(payload: SeedanceTaskResponse): string | undefined {
  const resultFormat = payload.result?.data?.[0]?.format;
  if (typeof resultFormat === 'string' && resultFormat.trim()) {
    return resultFormat.trim();
  }

  const url = getCompletedVideoUrl(payload);
  if (!url) {
    return undefined;
  }

  try {
    const pathname = new URL(url).pathname;
    const ext = pathname.split('.').pop()?.trim().toLowerCase();
    return ext || undefined;
  } catch {
    return undefined;
  }
}

function parseSeedanceError(raw: string): ParsedSeedanceError {
  const fallback = raw.trim() || '未知错误';
  let code: string | undefined;
  let message = fallback;

  try {
    const parsed = JSON.parse(raw) as SeedanceErrorEnvelope;
    code = typeof parsed.error?.code === 'string'
      ? parsed.error.code.trim() || undefined
      : typeof parsed.code === 'string'
        ? parsed.code.trim() || undefined
        : undefined;
    message = typeof parsed.error?.message === 'string' && parsed.error.message.trim()
      ? parsed.error.message.trim()
      : typeof parsed.message === 'string' && parsed.message.trim()
        ? parsed.message.trim()
        : fallback;
  } catch {
    // Ignore JSON parse errors and fall back to the raw response body.
  }

  if ((message.startsWith('{') || message.startsWith('[')) && message !== fallback) {
    try {
      const nested = JSON.parse(message) as SeedanceErrorEnvelope;
      if (typeof nested.error?.message === 'string' && nested.error.message.trim()) {
        message = nested.error.message.trim();
      }
      if (!code && typeof nested.error?.code === 'string' && nested.error.code.trim()) {
        code = nested.error.code.trim();
      }
    } catch {
      // Keep the original message when nested payload parsing fails.
    }
  }

  const normalizedMessage = message.toLowerCase();
  if (
    code === 'model_not_found'
    || message.includes('未配置渠道能力')
    || message.includes('ChannelCapability')
    || message.includes('SKU 路由')
  ) {
    return {
      code,
      message,
      rawMessage: fallback,
      kind: 'model-route-missing',
    };
  }

  if (normalizedMessage.includes('base64 image is not allowed')) {
    return {
      code,
      message,
      rawMessage: fallback,
      kind: 'base64-not-allowed',
    };
  }

  if (normalizedMessage.includes('invalid image_url') || normalizedMessage.includes('invalid image url')) {
    return {
      code,
      message,
      rawMessage: fallback,
      kind: 'invalid-image-url',
    };
  }

  return {
    code,
    message,
    rawMessage: fallback,
    kind: 'generic',
  };
}

function formatSeedanceErrorMessage(status: number, model: string, raw: string): string {
  const parsed = parseSeedanceError(raw);
  if (parsed.kind === 'model-route-missing') {
    return `Seedance 视频生成失败 (${status}): 当前 API Key/渠道未开通模型 ${model}，上游返回未配置 ChannelCapability / SKU 路由。请联系管理员开通该模型，或在视频渠道设置中切换到已开通的 Seedance 模型后重试。`;
  }

  if (parsed.kind === 'base64-not-allowed') {
    return `Seedance 视频生成失败 (${status}): 上游拒绝 base64 图片输入。请确认 Seedance 渠道图片上传流程可用，并确保提交前已完成 ToAPIs 上传。`;
  }

  if (parsed.kind === 'invalid-image-url') {
    return `Seedance 视频生成失败 (${status}): 上游无法读取参考图 URL（invalid image_url）。请确认传入的是可直接访问的原始图片文件，而不是网页、防盗链页或失效地址。`;
  }

  return `Seedance 视频生成失败 (${status}): ${parsed.message || parsed.rawMessage}`;
}

function inferMimeTypeFromFilename(filename: string): string {
  const normalized = filename.toLowerCase();
  if (normalized.endsWith('.jpg') || normalized.endsWith('.jpeg')) return 'image/jpeg';
  if (normalized.endsWith('.png')) return 'image/png';
  if (normalized.endsWith('.webp')) return 'image/webp';
  if (normalized.endsWith('.gif')) return 'image/gif';
  return 'application/octet-stream';
}

function inferExtensionFromMimeType(mimeType?: string): string {
  switch ((mimeType || '').toLowerCase()) {
    case 'image/jpeg':
      return '.jpg';
    case 'image/png':
      return '.png';
    case 'image/webp':
      return '.webp';
    case 'image/gif':
      return '.gif';
    default:
      return '.bin';
  }
}

function normalizeMimeType(value?: string): string | undefined {
  if (!value) {
    return undefined;
  }
  return value.split(';')[0]?.trim() || undefined;
}

function inferFilenameFromAsset(asset: ProviderAssetInput, index: number): string {
  if (asset.transport === 'remote-url') {
    try {
      const pathname = new URL(asset.value).pathname;
      const name = pathname.split('/').pop();
      if (name && /\.[a-z0-9]+$/i.test(name)) {
        return name;
      }
    } catch {
      // Fall back to generated filename below.
    }
  }

  if (asset.mimeType?.startsWith('image/')) {
    return `seedance-upload-${index + 1}${inferExtensionFromMimeType(asset.mimeType)}`;
  }

  if (asset.transport === 'data-url') {
    const mimeType = asset.value.startsWith('data:')
      ? asset.value.slice(5, asset.value.indexOf(';'))
      : undefined;
    return `seedance-upload-${index + 1}${inferExtensionFromMimeType(mimeType)}`;
  }

  return `seedance-upload-${index + 1}.jpg`;
}

export class SeedanceProvider implements ITVProvider {
  type = 'seedance' as const;
  config: ITVConfig;

  assetTransports = {
    // Let the host pass data-url inputs through so Seedance can upload them with its
    // own /v1/uploads/images endpoint instead of depending on global image-hosting.
    primaryImage: ['remote-url', 'data-url'] as const,
    additionalReferences: ['remote-url', 'data-url'] as const,
    referenceImages: ['remote-url', 'data-url'] as const,
    startFrame: ['remote-url', 'data-url'] as const,
    endFrame: ['remote-url', 'data-url'] as const,
  };

  constructor(config: ITVConfig) {
    this.config = config;
  }

  private getBaseUrl(): string {
    return this.config.baseUrl || 'https://toapis.com';
  }

  private getHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.config.apiKey || ''}`,
      'Content-Type': 'application/json',
    };
  }

  private getUploadHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.config.apiKey || ''}`,
    };
  }

  private getModelName(): string {
    const value = String(this.config.modelName || '').trim();
    if (!value) {
      throw new Error('模型名称未配置');
    }
    return value;
  }

  validate(): boolean {
    return Boolean(this.config.apiKey && String(this.config.modelName || '').trim());
  }

  async testConnection(): Promise<boolean> {
    if (!this.validate()) return false;

    try {
      const model = this.getModelName();
      const response = await safeFetch(joinUrl(this.getBaseUrl(), '/v1/videos/generations'), {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          model,
          prompt: 'test',
          duration: 4,
          metadata: {
            resolution: '480p',
          },
        }),
      });

      const raw = await response.text();
      if (response.status === 401 || response.status === 403) {
        return false;
      }
      if (!response.ok) {
        throw new Error(formatSeedanceErrorMessage(response.status, model, raw));
      }
      return true;
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      return false;
    }
  }

  private async uploadImage(asset: ProviderAssetInput, index: number): Promise<string> {
    const filename = inferFilenameFromAsset(asset, index);
    let bytes: Uint8Array;
    let resolvedMimeType: string | undefined;

    if (asset.transport === 'remote-url') {
      logger.info('Seedance image download start', {
        provider: this.config.provider,
        filename,
        index,
        url: asset.value,
      });

      let response: Response;
      try {
        response = await fetch(asset.value, { method: 'GET' });
      } catch (error) {
        logger.error('Seedance image download failed', {
          provider: this.config.provider,
          filename,
          index,
          url: asset.value,
          error: error instanceof Error ? error.message : String(error),
        });
        throw new Error(`Seedance 远程图片下载失败：${asset.value}`);
      }

      if (!response.ok) {
        const raw = await response.text();
        logger.error('Seedance image download failed', {
          provider: this.config.provider,
          filename,
          index,
          url: asset.value,
          status: response.status,
          response: raw.slice(0, 1200),
        });
        throw new Error(`Seedance 远程图片下载失败 (${response.status}): ${raw.slice(0, 300)}`);
      }

      bytes = new Uint8Array(await response.arrayBuffer());
      resolvedMimeType = normalizeMimeType(response.headers.get('content-type'))
        || asset.mimeType
        || inferMimeTypeFromFilename(filename);

      logger.info('Seedance image download succeeded', {
        provider: this.config.provider,
        filename,
        index,
        url: asset.value,
        bytes: bytes.byteLength,
        mimeType: resolvedMimeType,
      });
    } else {
      const { mimeType, base64 } = stripDataHeader(asset.value);
      bytes = base64ToBytes(base64);
      resolvedMimeType = mimeType || asset.mimeType || inferMimeTypeFromFilename(filename);
    }

    const blob = new Blob([bytes], {
      type: resolvedMimeType || inferMimeTypeFromFilename(filename),
    });
    const formData = new FormData();
    formData.append('file', blob, filename);
    formData.append('purpose', 'generation');

    logger.info('Seedance image upload start', {
      provider: this.config.provider,
      filename,
      bytes: bytes.byteLength,
      mimeType: blob.type,
      index,
    });

    const response = await safeFetch(joinUrl(this.getBaseUrl(), '/v1/uploads/images'), {
      method: 'POST',
      headers: this.getUploadHeaders(),
      body: formData,
    });

    const raw = await response.text();
    if (!response.ok) {
      logger.error('Seedance image upload failed', {
        provider: this.config.provider,
        status: response.status,
        response: raw.slice(0, 1200),
        filename,
        index,
      });
      throw new Error(`Seedance 图片上传失败 (${response.status}): ${raw.slice(0, 600)}`);
    }

    const data = JSON.parse(raw) as SeedanceUploadResponse;
    const uploadedUrl = data.data?.url;
    if (!uploadedUrl) {
      throw new Error(`Seedance 图片上传失败：未返回可用 URL（${filename}）`);
    }

    logger.info('Seedance image upload succeeded', {
      provider: this.config.provider,
      filename,
      index,
      uploadedUrl,
      mimeType: data.data?.mime_type,
      size: data.data?.size,
    });

    return uploadedUrl;
  }

  private async buildImageWithRoles(request: ITVRequest): Promise<SeedanceImageWithRole[] | undefined> {
    if (isTextToVideoRequest(request)) {
      return undefined;
    }

    if (isStartEndToVideoRequest(request)) {
      const [firstFrameUrl, lastFrameUrl] = await Promise.all([
        this.uploadImage(request.startFrame, 0),
        this.uploadImage(request.endFrame, 1),
      ]);
      return [
        { url: firstFrameUrl, role: 'first_frame' },
        { url: lastFrameUrl, role: 'last_frame' },
      ];
    }

    if (isReferenceToVideoRequest(request)) {
      const uploaded = await Promise.all(
        request.referenceImages.map((image, index) => this.uploadImage(image, index)),
      );
      return uploaded.map((url) => ({
        url,
        role: 'reference_image' as const,
      }));
    }

    if (isImageToVideoRequest(request)) {
      const additional = request.additionalReferences || [];
      if (additional.length > 0) {
        const uploaded = await Promise.all(
          [request.primaryImage, ...additional].map((image, index) => this.uploadImage(image, index)),
        );
        return uploaded.map((url) => ({
          url,
          role: 'reference_image' as const,
        }));
      }

      const firstFrameUrl = await this.uploadImage(request.primaryImage, 0);
      return [
        {
          url: firstFrameUrl,
          role: 'first_frame',
        },
      ];
    }

    return undefined;
  }

  async start(request: ITVRequest): Promise<ProviderStartResult<ITVResult>> {
    if (!this.validate()) {
      throw new Error('Seedance API Key 或模型未配置');
    }

    assertSupportedVideoCapabilities(request, 'Seedance', [
      'video.text-to-video',
      'video.image-to-video',
      'video.reference-to-video',
      'video.start-end-to-video',
    ]);

    const options = request.options as ITVOptions | undefined;
    const model = this.getModelName();
    const imageWithRoles = await this.buildImageWithRoles(request);
    const metadata: Record<string, unknown> = {
      resolution: normalizeResolution(options?.resolution ?? this.config.defaultResolution),
    };

    const body: Record<string, unknown> = {
      model,
      prompt: String(request.prompt || '').trim(),
      duration: normalizeDuration(model, options?.duration ?? this.config.defaultDuration),
      aspect_ratio: normalizeAspectRatio(options?.aspectRatio),
      metadata,
      ...(imageWithRoles?.length ? { image_with_roles: imageWithRoles } : undefined),
    };

    logger.info('Seedance start request', {
      provider: this.config.provider,
      capability: request.capability,
      model,
      body: sanitizeBodyForLog(body),
    });

    const response = await safeFetch(joinUrl(this.getBaseUrl(), '/v1/videos/generations'), {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(body),
    });

    const raw = await response.text();
    if (!response.ok) {
      logger.error('Seedance start request failed', {
        provider: this.config.provider,
        capability: request.capability,
        status: response.status,
        response: raw.slice(0, 1200),
      });
      throw new Error(formatSeedanceErrorMessage(response.status, model, raw));
    }

    const data = JSON.parse(raw) as SeedanceCreateResponse;
    if (!data.id) {
      throw new Error(getErrorMessage(data) || 'Seedance 未返回任务 ID');
    }

    return { mode: 'async', taskId: data.id };
  }

  async getTaskSnapshot(taskId: string): Promise<ProviderTaskSnapshot<ITVResult>> {
    const response = await safeFetch(joinUrl(this.getBaseUrl(), `/v1/videos/generations/${taskId}`), {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${this.config.apiKey || ''}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        state: 'failed',
        progress: 0,
        error: errorText || '查询失败',
      };
    }

    const raw = await response.text();
    const data = JSON.parse(raw) as SeedanceTaskResponse;
    const stateMap: Record<string, ProviderTaskSnapshot<ITVResult>['state']> = {
      queued: 'queued',
      in_progress: 'running',
      completed: 'succeeded',
      failed: 'failed',
    };

    const state = stateMap[String(data.status || '')] || 'running';
    const snapshot: ProviderTaskSnapshot<ITVResult> = {
      state,
      progress: Number.isFinite(data.progress) ? data.progress : undefined,
    };

    const videoUrl = getCompletedVideoUrl(data);
    if (state === 'succeeded' && videoUrl) {
      snapshot.output = {
        source: videoUrl,
        taskId,
        metadata: {
          format: getCompletedVideoFormat(data),
          model: data.model,
          completedAt: data.completed_at,
          expiresAt: data.expires_at,
        },
      };
    }

    if (state === 'succeeded' && !videoUrl) {
      logger.error('Seedance completed task missing video url', {
        provider: this.config.provider,
        taskId,
        status: data.status,
        progress: data.progress,
        response: sanitizeBodyForLog(data),
      });
      logger.error('Seedance completed task raw body', {
        provider: this.config.provider,
        taskId,
        rawBody: raw,
      });
      snapshot.state = 'failed';
      snapshot.error = 'Seedance 任务已完成，但未返回可用视频 URL';
      return snapshot;
    }

    if (state === 'failed') {
      snapshot.error = getErrorMessage(data) || '任务失败';
    }

    return snapshot;
  }
}

export default SeedanceProvider;

/**
 * ComfyUI TTI Provider —— 直连 ComfyUI 服务端做文生图 / 参考风格图生图。
 *
 * 协议与 ITV 版一致（见 providers/itv/ComfyUIITVProvider.ts 头注）：
 *   POST /upload/image（参考图原文件直传）→ POST /prompt → GET /history/{id} 轮询
 *   → SaveImage 输出 → /view 取图。
 *
 * 工作流来源（优先级从高到低）：
 *   1. 模型 defaults.workflowJson —— 用户在渠道配置里粘贴的任意「API 格式」工作流，
 *      由 workflowImport.ts 自动识别节点角色（提示词/种子/尺寸/批量/参考图）并注入参数，
 *      可用 defaults.nodeBindings 覆盖识别结果、defaults.negativePrompt 覆盖负面词、
 *      defaults.steps 覆盖步数 —— 接新工作流不需要改代码。
 *   2. 内置模板（comfyui/workflows.ts），按 modelDefaults.workflowId 或模型名选择：
 *      - krea2（参考风格生图）：提示词 → TextGenerate 反推/润色 → Krea2 采样；
 *        参考图可选，没有时自动摘除 LoadImage 节点与 TextGenerate.image 连线。
 *      - z-image（文生图）：Z-Image Turbo 纯文生图，不支持参考图。
 *
 * ComfyUI 原生无鉴权 → 默认不带凭据 header；前置鉴权网关时设 defaults.authMode='bearer'。
 */
import type { TTIModelConfig, ProviderStartResult, ProviderTaskSnapshot, ProviderAssetInput } from '../../types';
import type { TTIProvider, TTIOptions, TTIRequest, ImageResult } from './types';
import { safeFetch } from '../../utils/safeFetch';
import { buildChannelAuthRequest } from '../channel/auth';
import { buildTunnelHeaders, resolveComfyAuthMode, validateBasicCredential } from '../comfyui/remoteAccess';
import { createLogger } from '../../store/logger';
import { fetchReferenceBytes, extFromMime } from '../utils/referenceAssets';
import { normalizeAspectRatioOption } from '../itv/comfyui/workflowBinding';
import type { ComfyWorkflow, ComfyUploadedImage } from '../itv/comfyui/types';
import { toLoadImageValue } from '../itv/comfyui/types';
import {
  createComfyTTIWorkflow,
  resolveComfyTTIWorkflowId,
  type ComfyTTIWorkflowId,
} from './comfyui/workflows';
import {
  parseComfyWorkflowJson,
  analyzeComfyWorkflow,
  applyComfyImageParams,
  type ComfyImageBindingOverrides,
} from '../itv/comfyui/workflowImport';

const logger = createLogger('ComfyUITTI');

const COMFY_UPLOAD_IMAGE_PATH = '/upload/image';
const COMFY_PROMPT_PATH = '/prompt';
const COMFY_HISTORY_PATH = '/history';
const COMFY_QUEUE_PATH = '/queue';
const COMFY_VIEW_PATH = '/view';
const COMFY_SYSTEM_STATS_PATH = '/system_stats';

const MAX_BATCH_IMAGES = 4;

/** Z-Image 常用比例 → latent 尺寸（2K 档；1K 档约 0.75 倍） */
const ZIMAGE_ASPECT_TO_SIZE_2K: Record<string, [number, number]> = {
  '1:1': [1024, 1024],
  '16:9': [1344, 768],
  '9:16': [768, 1344],
  '4:3': [1152, 864],
  '3:4': [864, 1152],
  '3:2': [1216, 832],
  '2:3': [832, 1216],
};

function joinUrl(base: string, path: string): string {
  const b = base.replace(/\/+$/, '');
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${b}${p}`;
}

function normalizeComfyBaseUrl(raw?: string): string {
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

/** 归一宽高比：接受 '16:9' / '1920x1080' / '16:9 (Widescreen)'，输出 '16:9' 短形式 */
function normalizeRatioShort(value?: string): string | undefined {
  const raw = String(value || '').trim().toLowerCase();
  const direct = raw.match(/^(\d{1,3})\s*:\s*(\d{1,3})/);
  if (direct) return `${Number(direct[1])}:${Number(direct[2])}`;
  const wxh = raw.match(/^(\d{2,5})x(\d{2,5})$/);
  if (wxh) {
    const w = Number(wxh[1]);
    const h = Number(wxh[2]);
    const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
    const d = gcd(w, h);
    return `${w / d}:${h / d}`;
  }
  return undefined;
}

/** 归一宽高比为 ComfyUI ResolutionSelector 的 COMBO 枚举值（如 '16:9 (Widescreen)'） */
function normalizeRatio(value?: string): string | undefined {
  return normalizeAspectRatioOption(value);
}

/** imageSize 档位 → krea2 megapixels（ResolutionSelector 总像素，约数即可） */
function megapixelsFromImageSize(imageSize?: string): number | undefined {
  const key = String(imageSize || '').trim().toLowerCase();
  if (key === '1k') return 0.5;
  if (key === '1.5k') return 0.75;
  if (key === '2k') return 1.0;
  if (key === '3k') return 1.5;
  if (key === '4k') return 2.0;
  return undefined;
}

/** imageSize 档位 → z-image 尺寸缩放（2K 表为基准） */
function scaleFromImageSize(imageSize?: string): number {
  const key = String(imageSize || '').trim().toLowerCase();
  if (key === '1k') return 0.75;
  if (key === '4k') return 1.5;
  return 1.0;
}

interface Krea2ApplyParams {
  prompt: string;
  referenceImage?: string;
  aspectRatio?: string;
  imageSize?: string;
  seed?: number;
  count: number;
}

function applyKrea2Params(workflow: ComfyWorkflow, params: Krea2ApplyParams): ComfyWorkflow {
  const next = JSON.parse(JSON.stringify(workflow)) as ComfyWorkflow;
  next['14'].inputs.value = params.prompt;
  if (params.referenceImage) {
    next['13'].inputs.image = params.referenceImage;
  } else {
    // 无参考图：摘除 LoadImage 与 TextGenerate.image 连线（TextGenerate.image 是可选输入）
    delete next['13'];
    delete next['19:11'].inputs.image;
  }
  const ratio = normalizeRatio(params.aspectRatio);
  if (ratio) next['6'].inputs.aspect_ratio = ratio;
  const mp = megapixelsFromImageSize(params.imageSize);
  if (mp !== undefined) next['6'].inputs.megapixels = mp;
  if (params.seed !== undefined) {
    next['1'].inputs.seed = params.seed;
    next['21'].inputs.seed = params.seed;
  }
  next['7'].inputs.batch_size = Math.max(1, params.count);
  return next;
}

function applyZImageParams(workflow: ComfyWorkflow, params: Omit<Krea2ApplyParams, 'referenceImage'>): ComfyWorkflow {
  const next = JSON.parse(JSON.stringify(workflow)) as ComfyWorkflow;
  next['67'].inputs.text = params.prompt;
  const ratio = normalizeRatioShort(params.aspectRatio);
  if (ratio) {
    const size = ZIMAGE_ASPECT_TO_SIZE_2K[ratio];
    if (size) {
      const scale = scaleFromImageSize(params.imageSize);
      next['68'].inputs.width = Math.round(size[0] * scale);
      next['68'].inputs.height = Math.round(size[1] * scale);
    }
  }
  if (params.seed !== undefined) next['70'].inputs.seed = params.seed;
  next['68'].inputs.batch_size = Math.max(1, params.count);
  return next;
}

interface ComfyPromptResponse {
  prompt_id?: string;
  error?: { type?: string; message?: string; details?: string };
  node_errors?: Record<string, { class_type?: string; errors?: Array<{ message?: string; details?: string }> }>;
}

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
  return `ComfyUI 生图提交失败 (HTTP ${status}): ${message}`;
}

export class ComfyUITTIProvider implements TTIProvider {
  type = 'comfyui-tti' as const;
  config: TTIModelConfig;
  /** data-url / remote-url 参考图都由 Provider 读字节上传到 ComfyUI，调用方无需先传图床 */
  supportsLocalReferences = true;

  constructor(config: TTIModelConfig) {
    // 不启用 Koma 提示词协议。
    this.config = { ...config };
  }

  /**
   * 模型 defaults（workflowJson / authMode / workflowId / nodeBindings）。
   * 兜底读一次平铺到顶层的同名字段：历史上 TTI 侧只做平铺不带 modelDefaults，
   * 老配置或第三方构造的 config 仍可能是那个形状。
   */
  private getModelDefaults(): Record<string, unknown> {
    const config = this.config as unknown as Record<string, unknown> & {
      modelDefaults?: Record<string, unknown>;
    };
    if (config.modelDefaults && typeof config.modelDefaults === 'object') {
      return config.modelDefaults;
    }
    const flattened: Record<string, unknown> = {};
    for (const key of ['workflowJson', 'workflowId', 'authMode', 'nodeBindings']) {
      if (config[key] !== undefined) flattened[key] = config[key];
    }
    return flattened;
  }

  private getBaseUrl(): string {
    return normalizeComfyBaseUrl(this.config.baseUrl);
  }

  private getWorkflowId(): ComfyTTIWorkflowId {
    return resolveComfyTTIWorkflowId(this.config.modelName, this.getModelDefaults().workflowId as string | undefined);
  }

  /** 模型 defaults.workflowJson 存在时走通用导入工作流（无需改代码接新工作流） */
  private getCustomWorkflow(): ComfyWorkflow | null {
    const raw = this.getModelDefaults().workflowJson;
    if (typeof raw !== 'string' || !raw.trim()) return null;
    const parsed = parseComfyWorkflowJson(raw);
    if (!parsed.ok || !parsed.workflow) {
      throw new Error(`自定义 ComfyUI 工作流无效（模型 defaults.workflowJson）：${parsed.error}`);
    }
    return parsed.workflow;
  }

  /**
   * 请求头：认证 + 隧道适配。
   *  - authMode=basic  反代做了 HTTP Basic（apiKey 填「用户名:密码」），
   *                    经主进程凭据代理注入 Authorization: Basic ...
   *  - authMode=bearer 反代认 Bearer token
   *  - 未声明        局域网直连，不带认证
   * ngrok 免费域名另需 skip-warning header，否则接口回的是 HTML 拦截页。
   */
  private getHeaders(extra?: Record<string, string>): Record<string, string> {
    const headers = { ...(extra ?? {}), ...buildTunnelHeaders(this.getBaseUrl()) };
    const authMode = resolveComfyAuthMode(this.getModelDefaults().authMode);
    if (authMode === 'none') {
      return headers;
    }
    if (authMode === 'basic') {
      // profileId 存在时明文 apiKey 在渲染进程是拿不到的（凭据代理会解密），
      // 这种情况跳过格式校验，交给主进程与上游判定。
      if (!this.config.profileId) {
        const error = validateBasicCredential(this.config.apiKey);
        if (error) throw new Error(error);
      }
    }
    return buildChannelAuthRequest({
      channelId: this.config.profileId,
      apiKey: this.config.apiKey,
      mode: authMode === 'basic' ? 'basic-authorization' : 'bearer-header',
      headers,
    }).headers;
  }

  validate(): boolean {
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
    } catch {
      return false;
    }
  }

  /** 上传参考图到 ComfyUI input 目录，返回 LoadImage 可用的取值 */
  private async uploadReferenceImage(ref: ProviderAssetInput): Promise<string> {
    const { bytes, mimeType } = await fetchReferenceBytes(ref);
    if (!bytes || bytes.length === 0) {
      throw new Error('参考图为空，无法上传到 ComfyUI');
    }
    const filename = `koma-tti-${Date.now()}.${extFromMime(mimeType)}`;
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

  async start(request: TTIRequest): Promise<ProviderStartResult<ImageResult>> {
    if (!this.validate()) {
      throw new Error('ComfyUI 服务地址未配置');
    }
    const options: TTIOptions | undefined = request.options;
    const count = Math.max(1, Math.min(MAX_BATCH_IMAGES, Math.floor(Number(request.count) || 1)));
    const references = (request.references ?? []).filter(ref => ref?.value);
    const seed = options?.seed ?? Math.floor(Math.random() * 1_000_000_000_000);

    // 自定义导入工作流优先；缺省走内置 krea2/z-image 模板
    const customWorkflow = this.getCustomWorkflow();
    let workflow: ComfyWorkflow;
    let workflowLabel: string;

    if (customWorkflow) {
      workflowLabel = 'custom';
      const analysis = analyzeComfyWorkflow(customWorkflow);
      if (!analysis.prompt) {
        throw new Error('自定义工作流中未识别到提示词节点，请在模型 defaults.nodeBindings 里指定 promptNodeId');
      }
      const maxSlots = analysis.referenceImages.length;
      const refsToUpload = references.slice(0, Math.max(maxSlots, 0));
      if (references.length > maxSlots && maxSlots > 0) {
        logger.warn('自定义工作流参考图槽位不足，已忽略多余参考图', { refs: references.length, slots: maxSlots });
      }
      const uploadedRefs: string[] = [];
      for (const ref of refsToUpload) {
        uploadedRefs.push(await this.uploadReferenceImage(ref));
      }
      workflow = applyComfyImageParams(customWorkflow, analysis, {
        prompt: request.prompt,
        negativePrompt: typeof this.getModelDefaults().negativePrompt === 'string'
          ? this.getModelDefaults().negativePrompt as string
          : undefined,
        referenceImages: uploadedRefs,
        seed,
        count,
        aspectRatio: options?.aspectRatio,
        imageSize: options?.imageSize,
        steps: typeof this.getModelDefaults().steps === 'number'
          ? this.getModelDefaults().steps as number
          : undefined,
      }, (this.getModelDefaults().nodeBindings || undefined) as ComfyImageBindingOverrides | undefined);
    } else {
      const workflowId = this.getWorkflowId();
      workflowLabel = workflowId;
      if (workflowId === 'z-image' && references.length > 0) {
        throw new Error('Z-Image 文生图工作流不支持参考图，请改用 krea2 参考风格生图或去掉参考图');
      }

      // krea2 参考图只取第一张（工作流单 LoadImage 输入）
      let uploadedReference: string | undefined;
      if (workflowId === 'krea2' && references.length > 0) {
        if (references.length > 1) {
          logger.warn('krea2 工作流只支持单张参考图，已忽略多余参考图', { refsCount: references.length });
        }
        uploadedReference = await this.uploadReferenceImage(references[0]);
      }

      const template = createComfyTTIWorkflow(workflowId);
      workflow = workflowId === 'z-image'
        ? applyZImageParams(template, {
            prompt: request.prompt,
            aspectRatio: options?.aspectRatio,
            imageSize: options?.imageSize,
            seed,
            count,
          })
        : applyKrea2Params(template, {
            prompt: request.prompt,
            referenceImage: uploadedReference,
            aspectRatio: options?.aspectRatio,
            imageSize: options?.imageSize,
            seed,
            count,
          });
    }

    logger.info('ComfyUI TTI start request', {
      provider: this.config.provider,
      workflowId: workflowLabel,
      count,
      hasReference: references.length > 0,
      aspectRatio: options?.aspectRatio,
      imageSize: options?.imageSize,
      promptPreview: request.prompt.slice(0, 80),
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
      logger.warn('ComfyUI prompt response is not JSON', { status: response.status, preview: raw.slice(0, 400) });
      throw new Error(`ComfyUI 返回了非 JSON 响应 (HTTP ${response.status})`);
    }
    if (!response.ok || data.error || !data.prompt_id) {
      throw new Error(formatPromptError(data, raw, response.status));
    }
    return { mode: 'async', taskId: String(data.prompt_id) };
  }

  /** 从 history.outputs 里挑 SaveImage 输出（SaveImage 输出挂在 images 下） */
  private extractImageResults(outputs?: Record<string, Record<string, unknown>>): ImageResult[] {
    const files: Array<{ filename: string; subfolder?: string; type?: string }> = [];
    for (const nodeOutput of Object.values(outputs ?? {})) {
      const images = nodeOutput?.images;
      if (Array.isArray(images)) {
        for (const file of images as Array<{ filename?: string; subfolder?: string; type?: string }>) {
          if (file?.filename) files.push(file as { filename: string; subfolder?: string; type?: string });
        }
      }
    }
    return files.map(file => {
      const params = new URLSearchParams({
        filename: file.filename,
        subfolder: file.subfolder ?? '',
        type: file.type ?? 'output',
      });
      const url = `${joinUrl(this.getBaseUrl(), COMFY_VIEW_PATH)}?${params.toString()}`;
      return { path: url, url };
    });
  }

  private async peekQueueState(taskId: string): Promise<ProviderTaskSnapshot<ImageResult>> {
    try {
      const response = await safeFetch(joinUrl(this.getBaseUrl(), COMFY_QUEUE_PATH), {
        method: 'GET',
        headers: this.getHeaders(),
      });
      if (response.ok) {
        const queue = await response.json() as { queue_running?: unknown[][]; queue_pending?: unknown[][] };
        const inList = (list?: unknown[][]) =>
          (list ?? []).some(item => Array.isArray(item) && item.some(v => String(v) === taskId));
        if (inList(queue.queue_running)) return { state: 'running', progress: 50 };
        if (inList(queue.queue_pending)) return { state: 'queued', progress: 5 };
      }
    } catch {
      // 队列查询失败按排队处理，等下一轮
    }
    return { state: 'queued', progress: 5 };
  }

  async getTaskSnapshot(taskId: string): Promise<ProviderTaskSnapshot<ImageResult>> {
    const response = await safeFetch(
      joinUrl(this.getBaseUrl(), `${COMFY_HISTORY_PATH}/${encodeURIComponent(taskId)}`),
      { method: 'GET', headers: this.getHeaders() },
    );
    if (!response.ok) {
      return { state: 'running', progress: 10 };
    }
    let history: Record<string, {
      status?: { status_str?: string; completed?: boolean; messages?: Array<[string, Record<string, unknown>]> };
      outputs?: Record<string, Record<string, unknown>>;
    }>;
    try {
      history = (await response.json()) as typeof history;
    } catch {
      return { state: 'failed', progress: 0, error: 'ComfyUI 任务查询返回非 JSON' };
    }

    const entry = history?.[taskId];
    if (!entry) {
      return this.peekQueueState(taskId);
    }

    const statusStr = String(entry.status?.status_str || '').toLowerCase();
    if (statusStr === 'error') {
      const message = (entry.status?.messages ?? [])
        .filter(([type]) => String(type).includes('error'))
        .map(([, payload]) => {
          const p = payload as Record<string, unknown>;
          return [p?.exception_type, p?.exception_message ?? p?.node_type].filter(Boolean).join(': ');
        })
        .filter(Boolean)
        .join(' | ');
      return { state: 'failed', progress: 0, error: message || 'ComfyUI 生图执行失败' };
    }

    if (entry.status?.completed || statusStr === 'success') {
      const images = this.extractImageResults(entry.outputs);
      if (!images.length) {
        return { state: 'failed', progress: 100, error: 'ComfyUI 生图完成但未返回图片文件' };
      }
      const output = images.length === 1
        ? images[0]
        : { ...images[0], metadata: { batchImages: images } };
      return { state: 'succeeded', progress: 100, output };
    }

    return { state: 'running', progress: 50 };
  }
}

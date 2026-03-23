/**
 * Gemini Native TTI Provider
 *
 * 直接调用 Google Gemini generateContent API 进行图像生成。
 * 端点: /v1beta/models/{model}:generateContent
 *
 * 特性:
 * - 可配置访问地址 (baseUrl)
 * - 支持多图参考 (multimodal content parts)
 * - 支持 grok-image-index 提示词编译协议
 */
import type { TTIModelConfig, ProviderStartResult } from '../../types';
import type { TTIProvider, TTIRequest, ImageResult } from './types';
import { safeFetch } from '../../utils/safeFetch';
import { createLogger } from '../../store/logger';
import { sanitizeBodyForLog } from '../../utils/logFormatting';

const logger = createLogger('GeminiNativeTTI');

const DEFAULT_BASE_URL = 'https://generativelanguage.googleapis.com';
const DEFAULT_MODEL = 'gemini-3-pro-image-preview';

// --- Gemini generateContent request/response types ---

interface GeminiPart {
  text?: string;
  inlineData?: {
    mimeType: string;
    data: string; // base64
  };
}

interface GeminiContent {
  role?: string;
  parts: GeminiPart[];
}

interface GeminiGenerateContentRequest {
  contents: GeminiContent[];
  generationConfig?: {
    responseModalities?: string[];
    [key: string]: unknown;
  };
}

interface GeminiCandidate {
  content?: {
    parts?: Array<{
      text?: string;
      inlineData?: {
        mimeType: string;
        data: string;
      };
    }>;
  };
  finishReason?: string;
}

interface GeminiGenerateContentResponse {
  candidates?: GeminiCandidate[];
  error?: {
    code: number;
    message: string;
    status: string;
  };
}

// --- Helpers ---

function joinUrl(baseUrl: string, path: string): string {
  const b = baseUrl.replace(/\/+$/, '');
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${b}${p}`;
}

/**
 * 将 ProviderAssetInput 转换为 Gemini inlineData part。
 * 支持 data-url 和 remote-url 两种传输方式。
 */
async function assetToInlineDataPart(
  asset: { transport: string; value: string; mimeType?: string },
): Promise<GeminiPart> {
  if (asset.transport === 'data-url' || asset.value.startsWith('data:')) {
    // data:image/png;base64,xxxx
    const match = asset.value.match(/^data:([^;]+);base64,(.+)$/);
    if (match) {
      return {
        inlineData: {
          mimeType: match[1],
          data: match[2],
        },
      };
    }
    throw new Error('无效的 data-url 格式');
  }

  if (asset.transport === 'remote-url') {
    // 下载远程图片并转为 base64
    const resp = await safeFetch(asset.value);
    if (!resp.ok) {
      throw new Error(`下载参考图失败 (${resp.status}): ${asset.value}`);
    }
    const buffer = await resp.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    const base64 = btoa(String.fromCharCode(...bytes));
    const mimeType = asset.mimeType
      || resp.headers.get('content-type')?.split(';')[0]
      || 'image/png';
    return {
      inlineData: {
        mimeType,
        data: base64,
      },
    };
  }

  throw new Error(`不支持的参考图传输方式: ${asset.transport}`);
}

/**
 * 从 Gemini 响应中提取生成的图片。
 */
function extractImageFromResponse(resp: GeminiGenerateContentResponse): ImageResult | null {
  if (!resp.candidates?.length) return null;

  for (const candidate of resp.candidates) {
    const parts = candidate.content?.parts;
    if (!parts) continue;

    for (const part of parts) {
      if (part.inlineData?.data) {
        const dataUrl = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
        return {
          path: dataUrl,
          mimeType: part.inlineData.mimeType,
        };
      }
    }
  }

  return null;
}

// --- Provider ---

export class GeminiNativeTTIProvider implements TTIProvider {
  type = 'gemini-native-tti' as const;
  config: TTIModelConfig;

  constructor(config: TTIModelConfig) {
    this.config = config;
  }

  private getBaseUrl(): string {
    return this.config.baseUrl || DEFAULT_BASE_URL;
  }

  private getModel(): string {
    return this.config.modelName || DEFAULT_MODEL;
  }

  validate(): boolean {
    return Boolean(this.config.apiKey);
  }

  async testConnection(): Promise<boolean> {
    if (!this.validate()) return false;

    try {
      const url = joinUrl(
        this.getBaseUrl(),
        `/v1beta/models/${this.getModel()}:generateContent?key=${this.config.apiKey}`,
      );
      const body: GeminiGenerateContentRequest = {
        contents: [{ parts: [{ text: 'Hello' }] }],
        generationConfig: { maxOutputTokens: 10 },
      };
      const resp = await safeFetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      return resp.status !== 401 && resp.status !== 403;
    } catch {
      return false;
    }
  }

  async start(request: TTIRequest): Promise<ProviderStartResult<ImageResult>> {
    if (!this.validate()) {
      throw new Error('API Key 未配置');
    }

    const model = this.getModel();
    const baseUrl = this.getBaseUrl();

    // 构建 content parts
    const parts: GeminiPart[] = [];

    // 添加参考图（多图支持）
    if (request.references && request.references.length > 0) {
      for (const ref of request.references) {
        try {
          const imagePart = await assetToInlineDataPart(ref);
          parts.push(imagePart);
        } catch (err) {
          logger.warn('跳过无法处理的参考图', {
            transport: ref.transport,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }

    // 添加文本提示
    parts.push({ text: request.prompt });

    const requestBody: GeminiGenerateContentRequest = {
      contents: [
        {
          role: 'user',
          parts,
        },
      ],
      generationConfig: {
        responseModalities: ['TEXT', 'IMAGE'],
      },
    };

    const url = joinUrl(baseUrl, `/v1beta/models/${model}:generateContent?key=${this.config.apiKey}`);

    logger.info('Gemini Native TTI request', {
      provider: this.config.provider,
      model,
      baseUrl,
      referencesCount: request.references?.length || 0,
      promptPreview: request.prompt.slice(0, 200),
      body: sanitizeBodyForLog(requestBody as any),
    });

    const resp = await safeFetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });

    const raw = await resp.text();

    if (!resp.ok) {
      logger.error('Gemini Native TTI request failed', {
        status: resp.status,
        response: raw.slice(0, 1200),
      });
      throw new Error(`Gemini 生图请求失败 (${resp.status}): ${raw.slice(0, 600)}`);
    }

    let data: GeminiGenerateContentResponse;
    try {
      data = JSON.parse(raw) as GeminiGenerateContentResponse;
    } catch {
      throw new Error(`Gemini 返回了非 JSON 响应: ${raw.slice(0, 600)}`);
    }

    if (data.error) {
      throw new Error(`Gemini API 错误: ${data.error.message} (${data.error.status})`);
    }

    const image = extractImageFromResponse(data);
    if (!image) {
      // 可能返回了纯文本（拒绝生图等情况）
      const textContent = data.candidates?.[0]?.content?.parts
        ?.filter(p => p.text)
        .map(p => p.text)
        .join('\n');
      if (textContent) {
        logger.warn('Gemini 未返回图片，返回了文本', { text: textContent.slice(0, 500) });
        throw new Error(`Gemini 未生成图片，模型回复: ${textContent.slice(0, 300)}`);
      }
      throw new Error('Gemini 返回了空响应，未包含图片');
    }

    logger.info('Gemini Native TTI 生成成功', {
      mimeType: image.mimeType,
    });

    return { mode: 'immediate', output: image };
  }
}

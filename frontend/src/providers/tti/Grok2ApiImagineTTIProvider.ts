/**
 * Grok2API Imagine TTI Provider
 *
 * Goal:
 * - Keep existing providers untouched.
 * - Speak Grok2API reverse-engineered multimodal shape:
 *   - No references: OpenAI-compatible `/v1/images/generations`
 *   - With references: `/v1/chat/completions` with image_url blocks + final text prompt
 */
import type { TTIModelConfig, ProviderStartResult, ProviderTaskSnapshot } from '../../types';
import type { TTIProvider, TTIRequest, ImageResult } from './types';
import { safeFetch } from '../../utils/safeFetch';
import { createLogger } from '../../store/logger';

const logger = createLogger('Grok2ApiImagineTTI');

type ChatContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

type ChatCompletionsResponse = {
  id?: string;
  choices?: Array<{
    message?: {
      content?: string | ChatContentBlock[];
    };
  }>;
};

type ImageGenResponse = {
  data?: Array<{ url?: string; b64_json?: string }>;
  id?: string;
  created?: number;
};

function sanitizeBodyForLog(body: Record<string, any>): Record<string, any> {
  const walk = (v: any): any => {
    if (typeof v === 'string') {
      if (v.startsWith('data:')) return `${v.slice(0, 140)}...(data-url ${v.length} chars)`;
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

function joinUrl(baseUrl: string, path: string): string {
  const b = baseUrl.replace(/\/+$/, '');
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${b}${p}`;
}

function extractFirstUrlFromText(text: string): string | null {
  if (!text) return null;
  // Prefer data: URLs first
  const dataMatch = text.match(/data:[^ \n\r\t]+/);
  if (dataMatch?.[0]) return dataMatch[0];
  const httpMatch = text.match(/https?:\/\/[^\s)]+/);
  if (httpMatch?.[0]) return httpMatch[0];
  return null;
}

function extractMediaUrlFromChat(resp: ChatCompletionsResponse): string | null {
  const content = resp.choices?.[0]?.message?.content;
  if (!content) return null;
  if (typeof content === 'string') return extractFirstUrlFromText(content);
  // If backend returns structured blocks, try to find any embedded URL
  for (const block of content) {
    if (block.type === 'image_url' && block.image_url?.url) return block.image_url.url;
    if (block.type === 'text') {
      const url = extractFirstUrlFromText(block.text);
      if (url) return url;
    }
  }
  return null;
}

function extractImageUrlFromGen(resp: ImageGenResponse): string | null {
  const item = resp.data?.[0];
  if (!item) return null;
  if (item.url) return item.url;
  if (item.b64_json) return `data:image/jpeg;base64,${item.b64_json}`;
  return null;
}

export class Grok2ApiImagineTTIProvider implements TTIProvider {
  type = 'grok2api-imagine-tti' as const;
  config: TTIModelConfig;

  constructor(config: TTIModelConfig) {
    this.config = config;
  }

  validate(): boolean {
    return Boolean(this.config.apiKey && this.config.baseUrl);
  }

  private getHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.config.apiKey || ''}`,
      'Content-Type': 'application/json',
    };
  }

  async testConnection(): Promise<boolean> {
    if (!this.validate()) return false;
    try {
      const resp = await safeFetch(joinUrl(this.config.baseUrl || '', '/v1/models'), {
        method: 'GET',
        headers: { Authorization: `Bearer ${this.config.apiKey || ''}` },
      });
      return resp.status !== 401 && resp.status !== 403;
    } catch {
      return false;
    }
  }

  async start(request: TTIRequest): Promise<ProviderStartResult<ImageResult>> {
    if (!this.validate()) throw new Error('API Key 或 API 地址未配置');

    const hasRefs = Boolean(request.references?.length);
    const protocol = (this.config as any)?.promptProtocol;
    const debugBody = Boolean(protocol) || (import.meta as any)?.env?.DEV === true;

    // 1) No references: call OpenAI-compatible images generation endpoint
    if (!hasRefs) {
      const w = request.options?.width;
      const h = request.options?.height;
      const body: Record<string, any> = {
        model: this.config.modelName || 'grok-imagine-1.0',
        prompt: request.prompt,
        n: 1,
        ...(typeof w === 'number' && typeof h === 'number' ? { size: `${w}x${h}` } : undefined),
      };

      if (debugBody) {
        logger.info('TTI generations request body', {
          provider: this.config.provider,
          ...(protocol ? { promptProtocol: protocol } : undefined),
          body: sanitizeBodyForLog(body),
        });
      }

      const resp = await safeFetch(joinUrl(this.config.baseUrl || '', '/v1/images/generations'), {
        method: 'POST',
        headers: {
          ...this.getHeaders(),
          ...(debugBody ? { 'x-koma-debug-body': '1' } : undefined),
          ...(debugBody ? { 'x-koma-trace-operation': 'tti.generations' } : undefined),
        },
        body: JSON.stringify(body),
      });
      if (!resp.ok) throw new Error(`创建任务失败: ${await resp.text()}`);

      const data = (await resp.json()) as ImageGenResponse;
      const url = extractImageUrlFromGen(data);
      if (!url) throw new Error('API 返回了无法识别的图片响应');
      return { mode: 'immediate', output: { path: url, url } };
    }

    // 2) With references: call chat multimodal endpoint
    const refBlocks: ChatContentBlock[] = (request.references || []).map(r => ({
      type: 'image_url',
      image_url: { url: r.value },
    }));
    const body: Record<string, any> = {
      model: this.config.modelName || 'grok-imagine-1.0-edit',
      messages: [
        {
          role: 'user',
          content: [
            ...refBlocks,
            { type: 'text', text: request.prompt },
          ],
        },
      ],
    };

    if (debugBody) {
      logger.info('TTI chat (edit) request body', {
        provider: this.config.provider,
        ...(protocol ? { promptProtocol: protocol } : undefined),
        body: sanitizeBodyForLog(body),
      });
    }

    const resp = await safeFetch(joinUrl(this.config.baseUrl || '', '/v1/chat/completions'), {
      method: 'POST',
      headers: {
        ...this.getHeaders(),
        ...(debugBody ? { 'x-koma-debug-body': '1' } : undefined),
        ...(debugBody ? { 'x-koma-trace-operation': 'tti.chat.edit' } : undefined),
      },
      body: JSON.stringify(body),
    });
    if (!resp.ok) throw new Error(`创建任务失败: ${await resp.text()}`);

    const data = (await resp.json()) as ChatCompletionsResponse;
    const url = extractMediaUrlFromChat(data);
    if (!url) {
      throw new Error('API 返回了无法识别的图片响应（chat/completions）');
    }
    return { mode: 'immediate', output: { path: url, url } };
  }

  // Grok2API endpoints are typically immediate; keep snapshot unimplemented for now.
  async getTaskSnapshot(_taskId: string): Promise<ProviderTaskSnapshot<ImageResult>> {
    return { state: 'failed', progress: 0, error: 'Grok2API TTI does not support task snapshots' };
  }
}


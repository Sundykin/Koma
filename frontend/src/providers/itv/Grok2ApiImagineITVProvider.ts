/**
 * Grok2API Imagine ITV Provider
 *
 * Uses Grok2API reverse-engineered multimodal `/v1/chat/completions` endpoint for i2v.
 * We intentionally keep this provider isolated to avoid impacting existing ITV providers.
 */
import type { ITVConfig, ProviderStartResult, ProviderTaskSnapshot } from '../../types';
import type { ITVProvider, ITVRequest, ITVResult } from './types';
import { safeFetch } from '../../utils/safeFetch';
import { createLogger } from '../../store/logger';

const logger = createLogger('Grok2ApiImagineITV');

type ChatContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

type ChatCompletionsResponse = {
  choices?: Array<{
    message?: {
      content?: string | ChatContentBlock[];
    };
  }>;
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
  const dataMatch = text.match(/data:[^ \n\r\t]+/);
  if (dataMatch?.[0]) return dataMatch[0];
  const httpMatch = text.match(/https?:\/\/[^\s)]+/);
  if (httpMatch?.[0]) return httpMatch[0];
  return null;
}

function extractVideoUrlFromChat(resp: ChatCompletionsResponse): string | null {
  const content = resp.choices?.[0]?.message?.content;
  if (!content) return null;
  if (typeof content === 'string') return extractFirstUrlFromText(content);
  for (const block of content) {
    if (block.type === 'text') {
      const url = extractFirstUrlFromText(block.text);
      if (url) return url;
    }
  }
  return null;
}

export class Grok2ApiImagineITVProvider implements ITVProvider {
  type = 'grok2api-imagine-itv' as const;
  config: ITVConfig;

  // Grok2API accepts URL or data-uri (base64) for images.
  assetTransports = {
    primaryImage: ['remote-url', 'data-url'] as const,
    additionalReferences: ['remote-url', 'data-url'] as const,
  };

  constructor(config: ITVConfig) {
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

  async start(request: ITVRequest): Promise<ProviderStartResult<ITVResult>> {
    if (!this.validate()) throw new Error('API Key 或 API 地址未配置');

    const protocol = (this.config as any)?.promptProtocol;
    const debugBody = Boolean(protocol) || (import.meta as any)?.env?.DEV === true;

    const blocks: ChatContentBlock[] = [];
    if (request.primaryImage?.value) {
      blocks.push({ type: 'image_url', image_url: { url: request.primaryImage.value } });
    }

    // Best-effort: include additional references (some Grok2API deployments may ignore beyond first).
    for (const ref of request.additionalReferences || []) {
      blocks.push({ type: 'image_url', image_url: { url: ref.value } });
    }

    blocks.push({ type: 'text', text: request.prompt });

    const opts = request.options || {};
    const duration = typeof opts.duration === 'number' ? opts.duration : this.config.defaultDuration;
    const resolutionName = typeof opts.resolution === 'string' ? opts.resolution : this.config.defaultResolution;

    const body: Record<string, any> = {
      model: (this.config as any).modelName || 'grok-imagine-1.0-video',
      messages: [{ role: 'user', content: blocks }],
      video_config: {
        ...(duration ? { video_length: duration } : undefined),
        ...(resolutionName ? { resolution_name: resolutionName } : undefined),
      },
    };

    if (debugBody) {
      logger.info('ITV chat (video) request body', {
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
        ...(debugBody ? { 'x-koma-trace-operation': 'itv.chat.video' } : undefined),
      },
      body: JSON.stringify(body),
    });
    if (!resp.ok) throw new Error(`提交视频任务失败 (${resp.status}): ${await resp.text()}`);

    const data = (await resp.json()) as ChatCompletionsResponse;
    const url = extractVideoUrlFromChat(data);
    if (!url) {
      throw new Error('API 返回了无法识别的视频响应（chat/completions）');
    }
    return { mode: 'immediate', output: { source: url } };
  }

  async getTaskSnapshot(_taskId: string): Promise<ProviderTaskSnapshot<ITVResult>> {
    return { state: 'failed', progress: 0, error: 'Grok2API ITV does not support task snapshots' };
  }
}

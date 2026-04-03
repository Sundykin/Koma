import { net as electronNet } from 'electron';
import { BaseController } from './base';
import { validateUrl } from '../service/url-validator';

// 每个 chunk 之间的最大空闲时间（5 分钟，兼容慢模型的首 token 等待）
const CHUNK_IDLE_TIMEOUT_MS = 300_000;
// 最大重试次数（应对代理断连 UND_ERR_SOCKET）
const MAX_RETRIES = 2;
// 可重试的错误码
const RETRYABLE_CODES = new Set([
  'UND_ERR_SOCKET',
  'UND_ERR_CONNECT_TIMEOUT',
  'ECONNRESET',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'ERR_CONNECTION_RESET',
  'ERR_CONNECTION_REFUSED',
  'ERR_CONNECTION_TIMED_OUT',
  'ERR_TIMED_OUT',
]);

function getHeaderValue(headers: Record<string, string> | undefined, key: string): string | undefined {
  if (!headers) return undefined;
  const target = key.toLowerCase();
  const foundKey = Object.keys(headers).find(k => k.toLowerCase() === target);
  return foundKey ? headers[foundKey] : undefined;
}

function summarizeBody(body?: string): Record<string, any> {
  if (!body) {
    return {};
  }

  try {
    const parsed = JSON.parse(body);
    return {
      bodyLength: body.length,
      model: parsed?.model,
      messageCount: Array.isArray(parsed?.messages) ? parsed.messages.length : undefined,
      hasSystem: typeof parsed?.system === 'string' && parsed.system.length > 0,
    };
  } catch {
    return {
      bodyLength: body.length,
    };
  }
}

type MultipartField =
  | { kind: 'text'; name: string; value: string }
  | { kind: 'file'; name: string; filename: string; contentType?: string; base64: string; size: number };

type MultipartPayload = { fields: MultipartField[] };

function summarizeMultipart(multipart?: MultipartPayload): Record<string, any> {
  if (!multipart?.fields?.length) return {};
  let files = 0;
  let bytes = 0;
  for (const f of multipart.fields) {
    if (f.kind === 'file') {
      files += 1;
      bytes += Number(f.size || 0) || 0;
    }
  }
  return { multipartFieldCount: multipart.fields.length, multipartFileCount: files, multipartBytes: bytes };
}

function stripContentType(headers: Record<string, string>): void {
  for (const k of Object.keys(headers)) {
    if (k.toLowerCase() === 'content-type') delete headers[k];
  }
}

function stripContentLength(headers: Record<string, string>): void {
  for (const k of Object.keys(headers)) {
    if (k.toLowerCase() === 'content-length') delete headers[k];
  }
}

function escapeHeaderValue(value: string): string {
  // Keep it minimal: prevent breaking out of quotes in Content-Disposition.
  return value.replace(/"/g, '_');
}

function buildMultipartFormData(multipart?: MultipartPayload): FormData {
  const formData = new FormData();
  for (const f of multipart?.fields || []) {
    if (!f?.name) continue;
    if (f.kind === 'text') {
      formData.append(f.name, String(f.value ?? ''));
      continue;
    }
    if (f.kind === 'file') {
      const filename = escapeHeaderValue(String(f.filename || 'file'));
      const contentType = f.contentType ? String(f.contentType) : 'application/octet-stream';
      const bytes = Buffer.from(String(f.base64 ?? ''), 'base64');
      formData.append(f.name, new Blob([bytes], { type: contentType }), filename);
    }
  }
  return formData;
}

function isRetryable(err: any): boolean {
  const codes = [err?.cause?.code, err?.code, err?.errno].filter(Boolean);
  if (codes.some(code => RETRYABLE_CODES.has(code))) {
    return true;
  }
  const message = [err?.message, err?.cause?.message].filter(Boolean).join(' ');
  return /UND_ERR_CONNECT_TIMEOUT|ERR_CONNECTION_(?:TIMED_OUT|RESET|REFUSED)|timed out|ECONNRESET|ECONNREFUSED/i.test(message);
}

function getFetchTransport(): {
  transport: 'electron-net' | 'global-fetch';
  request: typeof fetch;
} {
  if (typeof electronNet?.fetch === 'function') {
    return {
      transport: 'electron-net',
      request: electronNet.fetch.bind(electronNet) as typeof fetch,
    };
  }
  return {
    transport: 'global-fetch',
    request: fetch.bind(globalThis),
  };
}

function getMultipartFetchTransport(): {
  transport: 'global-fetch';
  request: typeof fetch;
} {
  return {
    transport: 'global-fetch',
    request: fetch.bind(globalThis),
  };
}

/**
 * 用 ReadableStream reader 逐块读取响应体
 * 保持连接活跃，避免 Cloudflare 524 超时
 */
async function readBodyChunked(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) {
    return response.text();
  }

  const decoder = new TextDecoder();
  const chunks: string[] = [];

  while (true) {
    const timer = setTimeout(() => reader.cancel('chunk idle timeout'), CHUNK_IDLE_TIMEOUT_MS);
    let result: ReadableStreamReadResult<Uint8Array>;
    try {
      result = await reader.read();
    } catch (err: any) {
      clearTimeout(timer);
      if (String(err).includes('chunk idle timeout')) {
        throw new Error(`响应数据中断，${CHUNK_IDLE_TIMEOUT_MS / 1000} 秒未收到新数据`);
      }
      throw err;
    }
    clearTimeout(timer);

    if (result.done) break;
    chunks.push(decoder.decode(result.value, { stream: true }));
  }

  // flush decoder
  chunks.push(decoder.decode());
  return chunks.join('');
}

function truncateString(value: string, max = 6000): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max)}...(truncated, ${value.length} chars)`;
}

class NetController extends BaseController {
  async fetch(args: {
    url: string;
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    multipart?: MultipartPayload;
  }) {
    // SSRF 防护：校验协议 + 私有 IP 过滤
    await validateUrl(args.url);

    const traceId = getHeaderValue(args.headers, 'x-koma-trace-id');
    const traceSource = getHeaderValue(args.headers, 'x-koma-trace-source');
    const traceOperation = getHeaderValue(args.headers, 'x-koma-trace-operation');
    const traceTarget = getHeaderValue(args.headers, 'x-koma-trace-target');
    const debugBody = getHeaderValue(args.headers, 'x-koma-debug-body');
    const headers = { ...(args.headers || {}) };
    delete headers['x-koma-trace-id'];
    delete headers['x-koma-trace-source'];
    delete headers['x-koma-trace-operation'];
    delete headers['x-koma-trace-target'];
    // Debug header is for host-side logging only; never forward to upstream.
    delete headers['x-koma-debug-body'];

    const initialTransport = args.multipart
      ? getMultipartFetchTransport().transport
      : getFetchTransport().transport;
    const logCtx = {
      traceId,
      source: traceSource,
      operation: traceOperation,
      target: traceTarget,
      method: args.method || 'GET',
      url: args.url,
      transport: initialTransport,
      ...(args.multipart ? summarizeMultipart(args.multipart) : summarizeBody(args.body)),
      ...(debugBody ? { bodyPreview: truncateString(args.body || '', 12_000) } : undefined),
    };

    console.info('[NetController] IPC 网络请求开始', logCtx);

    const startedAt = Date.now();
    let lastError: any;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      if (attempt > 0) {
        const delay = attempt * 1000;
        console.info(`[NetController] 第 ${attempt} 次重试 (等待 ${delay}ms)`, { traceId });
        await new Promise(r => setTimeout(r, delay));
      }

      try {
        let reqBody: any = args.body;
        let transport: 'electron-net' | 'global-fetch';
        let request: typeof fetch;
        if (args.multipart) {
          stripContentType(headers);
          stripContentLength(headers);
          reqBody = buildMultipartFormData(args.multipart);
          ({ transport, request } = getMultipartFetchTransport());
        } else {
          ({ transport, request } = getFetchTransport());
        }
        const response = await request(args.url, {
          method: args.method || 'GET',
          headers,
          body: reqBody,
        });

        const body = await readBodyChunked(response);

        console.info('[NetController] IPC 网络请求完成', {
          traceId,
          transport,
          status: response.status,
          ok: response.ok,
          durationMs: Date.now() - startedAt,
          responseLength: body.length,
          attempts: attempt + 1,
        });

        return {
          ok: response.ok,
          status: response.status,
          statusText: response.statusText,
          body,
        };
      } catch (err: any) {
        lastError = err;
        const errMsg = err instanceof Error ? err.message : String(err);
        const causeCode = err?.cause?.code;

        console.error('[NetController] IPC 网络请求异常', {
          traceId,
          url: args.url,
          method: args.method || 'GET',
          transport: args.multipart ? getMultipartFetchTransport().transport : getFetchTransport().transport,
          durationMs: Date.now() - startedAt,
          error: errMsg,
          causeCode,
          attempt: attempt + 1,
        });

        if (!isRetryable(err) || attempt >= MAX_RETRIES) {
          break;
        }
      }
    }

    // 所有重试耗尽，返回结构化错误
    const cause = lastError?.cause;
    const errorCode = cause?.code || lastError?.code || lastError?.errno;
    const detail = errorCode
      ? `${lastError.message} (${errorCode})`
      : lastError?.message || String(lastError);
    return {
      ok: false,
      status: 502,
      statusText: 'Network Error',
      body: `网络请求失败: ${detail}`,
    };
  }
}

export = NetController;

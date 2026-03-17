import { BaseController } from './base';

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

class NetController extends BaseController {
  async fetch(args: {
    url: string;
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  }) {
    const parsed = new URL(args.url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error('Only http/https URLs are allowed');
    }

    const traceId = getHeaderValue(args.headers, 'x-koma-trace-id');
    const traceSource = getHeaderValue(args.headers, 'x-koma-trace-source');
    const traceOperation = getHeaderValue(args.headers, 'x-koma-trace-operation');
    const traceTarget = getHeaderValue(args.headers, 'x-koma-trace-target');
    const headers = { ...(args.headers || {}) };
    delete headers['x-koma-trace-id'];
    delete headers['x-koma-trace-source'];
    delete headers['x-koma-trace-operation'];
    delete headers['x-koma-trace-target'];

    console.info('[NetController] IPC 网络请求开始', {
      traceId,
      source: traceSource,
      operation: traceOperation,
      target: traceTarget,
      method: args.method || 'GET',
      url: args.url,
      ...summarizeBody(args.body),
    });

    const startedAt = Date.now();

    let response: Response;
    try {
      response = await fetch(args.url, {
        method: args.method || 'GET',
        headers,
        body: args.body,
      });
    } catch (error) {
      console.error('[NetController] IPC 网络请求异常', {
        traceId,
        url: args.url,
        method: args.method || 'GET',
        durationMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }

    const body = await response.text();

    console.info('[NetController] IPC 网络请求完成', {
      traceId,
      status: response.status,
      ok: response.ok,
      durationMs: Date.now() - startedAt,
      responseLength: body.length,
    });

    return {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      body,
    };
  }
}

export = NetController;

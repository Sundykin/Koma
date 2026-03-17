/**
 * 安全的 fetch 封装
 * Electron 环境下通过 IPC 主进程代理（绕过 CORS），浏览器环境走原生 fetch
 */
import { createLogger } from '../store/logger';

interface IpcFetchResult {
  ok: boolean;
  status: number;
  statusText: string;
  body: string;
}

const electronAPI = (window as any).electronAPI as
  | { net?: { fetch: (args: any) => Promise<IpcFetchResult> } }
  | undefined;

const logger = createLogger('SafeFetch');

function sanitizeHeaders(headers: Record<string, string>): Record<string, string> {
  const sanitized = { ...headers };
  const secretKeys = ['authorization', 'x-api-key'];
  for (const key of Object.keys(sanitized)) {
    if (secretKeys.includes(key.toLowerCase())) {
      sanitized[key] = '***';
    }
  }
  return sanitized;
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

/**
 * 与原生 fetch 签名一致的包装函数
 * 在 Electron 环境中自动通过主进程发送请求
 */
export async function safeFetch(url: string, init?: RequestInit): Promise<Response> {
  if (electronAPI?.net?.fetch) {
    const headers: Record<string, string> = {};
    if (init?.headers) {
      if (init.headers instanceof Headers) {
        init.headers.forEach((v, k) => { headers[k] = v; });
      } else if (Array.isArray(init.headers)) {
        init.headers.forEach(([k, v]) => { headers[k] = v; });
      } else {
        Object.assign(headers, init.headers);
      }
    }

    const traceId = headers['x-koma-trace-id'];
    const payloadSummary = summarizeBody(typeof init?.body === 'string' ? init.body : undefined);

    let result: IpcFetchResult;
    try {
      result = await electronAPI.net.fetch({
        url,
        method: init?.method || 'GET',
        headers,
        body: typeof init?.body === 'string' ? init.body : undefined,
      });
    } catch (error) {
      logger.error('IPC 代理网络请求失败', {
        traceId,
        url,
        method: init?.method || 'GET',
        headers: sanitizeHeaders(headers),
        ...payloadSummary,
        error: error instanceof Error ? error.message : String(error),
        transport: 'ipc',
      });
      throw error;
    }

    logger.info('通过 IPC 代理网络请求', {
      traceId,
      url,
      method: init?.method || 'GET',
      headers: sanitizeHeaders(headers),
      ...payloadSummary,
      status: result.status,
      ok: result.ok,
      transport: 'ipc',
    });

    return new Response(result.body, {
      status: result.status,
      statusText: result.statusText,
    });
  }

  const traceId = init?.headers && !(init.headers instanceof Headers) && !Array.isArray(init.headers)
    ? (init.headers as Record<string, string>)['x-koma-trace-id']
    : undefined;
  logger.info('直接发送网络请求', {
    traceId,
    url,
    method: init?.method || 'GET',
    transport: 'direct',
  });
  return fetch(url, init);
}

/**
 * 安全的 fetch 封装
 * Electron 环境下通过 IPC 主进程代理（绕过 CORS），浏览器环境走原生 fetch
 */

interface IpcFetchResult {
  ok: boolean;
  status: number;
  statusText: string;
  body: string;
}

const electronAPI = (window as any).electronAPI as
  | { net?: { fetch: (args: any) => Promise<IpcFetchResult> } }
  | undefined;

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

    const result = await electronAPI.net.fetch({
      url,
      method: init?.method || 'GET',
      headers,
      body: typeof init?.body === 'string' ? init.body : undefined,
    });

    return new Response(result.body, {
      status: result.status,
      statusText: result.statusText,
    });
  }

  return fetch(url, init);
}

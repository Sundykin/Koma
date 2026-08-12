/**
 * 远程 ComfyUI 接入：认证与隧道适配（TTI / ITV 两个 Provider 共用）
 *
 * 自建 ComfyUI 常见的两种暴露方式，本模块各解一个：
 *
 * 1. **反代加了 HTTP Basic 认证**（ngrok / Cloudflare Tunnel / nginx 都常这么配）。
 *    凭据填在渠道的 apiKey 里，格式 `用户名:密码`（同 `curl -u`），走和其它渠道
 *    完全一样的加密存储：apiKey 密文落在 settings.db，渲染进程拿不到明文，
 *    请求经主进程凭据代理时才注入 `Authorization: Basic base64(用户名:密码)`。
 *    → 见 providers/channel/auth.ts 的 'basic-authorization' 模式。
 *
 * 2. **ngrok 免费域名的浏览器拦截页**。ngrok-free 对"看起来像浏览器"的请求
 *    （带常规 User-Agent）先返回一个 HTML 警告页而不是真实响应 —— 表现为
 *    ComfyUI 接口返回一坨 HTML、JSON 解析失败，或下载下来的"视频"打不开。
 *    带上 `ngrok-skip-browser-warning` 任意值即可跳过。这个 header 对非 ngrok
 *    主机无副作用，但仍然只在识别到 ngrok 域名时加，避免给自建反代带噪声。
 */

/** ngrok 各代免费/付费域名后缀 */
const NGROK_HOST_SUFFIXES = [
  '.ngrok-free.dev',
  '.ngrok-free.app',
  '.ngrok.app',
  '.ngrok.io',
  '.ngrok.dev',
];

export const NGROK_SKIP_WARNING_HEADER = 'ngrok-skip-browser-warning';

/** URL 是否指向 ngrok 隧道；解析失败按"不是"处理（不给未知地址加 header） */
export function isNgrokTunnelUrl(url?: string): boolean {
  const value = String(url || '').trim();
  if (!value) return false;
  try {
    const host = new URL(value).host.toLowerCase();
    return NGROK_HOST_SUFFIXES.some(suffix => host.endsWith(suffix));
  } catch {
    return false;
  }
}

/** ngrok 主机需要的额外 header；非 ngrok 返回空对象 */
export function buildTunnelHeaders(url?: string): Record<string, string> {
  return isNgrokTunnelUrl(url) ? { [NGROK_SKIP_WARNING_HEADER]: 'true' } : {};
}

/**
 * 渠道模型 defaults.authMode → 归一后的认证方式。
 *
 * - 'basic'  反代做了 HTTP Basic（apiKey 填 `用户名:密码`）
 * - 'bearer' 反代认 `Authorization: Bearer <token>`
 * - 'none'   局域网直连，不带认证（默认；历史配置里 authMode 缺省就是这个语义）
 */
export type ComfyAuthMode = 'none' | 'bearer' | 'basic';

export function resolveComfyAuthMode(raw?: unknown): ComfyAuthMode {
  const value = String(raw ?? '').trim().toLowerCase();
  if (value === 'basic' || value === 'basic-auth' || value === 'basic-authorization') return 'basic';
  if (value === 'bearer' || value === 'bearer-header') return 'bearer';
  return 'none';
}

/**
 * Basic 凭据格式校验：必须是 `用户名:密码`。
 *
 * 提前拦是为了给出人话错误 —— 否则用户只会看到上游 401，
 * 而 401 在这条链路上有太多可能原因（隧道没起、密码错、拦截页）。
 * 已经自带 `Basic ` 前缀的值视为用户直接粘了整段 header，放行。
 *
 * @returns 错误信息；通过校验返回 null
 */
export function validateBasicCredential(apiKey?: string): string | null {
  const value = String(apiKey || '');
  if (!value.trim()) {
    return 'ComfyUI 渠道选择了 Basic 认证，但没填凭据。请在 apiKey 里填「用户名:密码」';
  }
  if (/^basic\s+/i.test(value)) return null;
  if (!value.includes(':')) {
    return 'Basic 认证凭据格式应为「用户名:密码」（例如 comfy:xxxxxx），当前值里没有冒号';
  }
  return null;
}

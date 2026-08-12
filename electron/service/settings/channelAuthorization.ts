/**
 * 渠道 Authorization 头的构造（主进程唯一出处）
 *
 * 两条链路都要用：
 *  - `controller/net.ts` 的凭据代理：模式由请求里的 `x-koma-channel-*` marker 显式声明
 *  - `controller/fs.ts` 的成片下载：那条链路上没有 provider，只有资产上记录的 channelId，
 *    所以模式从渠道自己的配置里查（models[].defaults.authMode）
 *
 * 明文 apiKey 只在本进程内出现，绝不回传渲染进程。
 */
import { getChannelConfig, getDecryptedApiKey } from './ChannelConfigService';

export type ChannelAuthorizationMode = 'bearer' | 'basic' | 'raw';

/**
 * `用户名:密码` → `Basic base64(用户名:密码)`。
 * 已带 `Basic ` 前缀的值原样返回（用户直接粘了整段 header 值）。
 * 显式 utf8：非 ASCII 密码不能按 latin1 处理。
 */
export function buildBasicAuthorization(credential: string): string {
  const value = String(credential || '');
  if (/^basic\s+/i.test(value)) return value;
  return `Basic ${Buffer.from(value, 'utf8').toString('base64')}`;
}

export function buildAuthorizationValue(mode: ChannelAuthorizationMode, plainKey: string): string {
  if (mode === 'basic') return buildBasicAuthorization(plainKey);
  if (mode === 'raw') return plainKey;
  return `Bearer ${plainKey}`;
}

/**
 * 从渠道配置里读出该渠道的认证方式。
 *
 * authMode 存在模型的 defaults 上（渠道可以挂多个模型，但同一个渠道的反代认证方式
 * 必然一致，所以取第一个声明了 authMode 的模型即可）。没声明就是 bearer——
 * 这是历史配置的默认语义，改默认值会影响所有已有渠道。
 */
export function resolveChannelAuthorizationMode(channelId: string): ChannelAuthorizationMode {
  try {
    const channel = getChannelConfig(channelId);
    const models = Array.isArray(channel?.models) ? channel!.models : [];
    for (const model of models) {
      const defaults = (model as { defaults?: Record<string, unknown> } | null)?.defaults;
      const raw = String(defaults?.authMode ?? '').trim().toLowerCase();
      if (raw === 'basic' || raw === 'basic-auth' || raw === 'basic-authorization') return 'basic';
      if (raw === 'raw' || raw === 'raw-authorization') return 'raw';
      if (raw === 'bearer' || raw === 'bearer-header') return 'bearer';
    }
  } catch {
    // 查不到渠道就按默认走，让上游用 401 告诉我们真实原因
  }
  return 'bearer';
}

/** 渠道 → 可直接塞进请求的 Authorization 头值；没有凭据时返回 null */
export function buildChannelAuthorizationHeader(channelId: string): string | null {
  const plainKey = getDecryptedApiKey(channelId);
  if (!plainKey) return null;
  return buildAuthorizationValue(resolveChannelAuthorizationMode(channelId), plainKey);
}

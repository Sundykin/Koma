/**
 * 渠道配置 (v2, SQLite-only)
 *
 * 所有 CRUD 通过 channelConfigService 落到主进程 {userData}/settings.db。
 * 项目定位为 Electron 桌面应用，浏览器环境直接拒绝（不再提供 localStorage 兜底）。
 *
 * 数据走向：用户新增 → 前端 UI → channelConfigService → IPC → 主进程 → SQLite
 */
import * as svc from '../../services/channelConfigService';
import { electronService } from '../../services/electronService';
import type {
  ChannelConfig,
  ChannelCapability,
  MediaCategory,
  MediaModelSelection,
} from '../../providers/channel/types';
import { getChannelCategory } from '../../providers/channel/types';

function ensureElectron(): void {
  if (!electronService.isElectron()) {
    throw new Error('channel config requires Electron runtime (SQLite)');
  }
}

// ========== CRUD ==========

export async function getChannelConfigs(): Promise<ChannelConfig[]> {
  ensureElectron();
  return svc.listChannels();
}

export async function getChannelsByCategory(category: MediaCategory): Promise<ChannelConfig[]> {
  ensureElectron();
  return svc.listChannels(category);
}

export async function getChannelsByCapability(
  capability: ChannelCapability,
): Promise<ChannelConfig[]> {
  const configs = await getChannelConfigs();
  return configs.filter((config) => {
    if (!config.enabled) return false;
    if (capability === 'image-hosting') {
      return getChannelCategory(config) === 'image-hosting';
    }
    const models = config.models || [];
    if (!models.length) return false;
    return models.some((model) => {
      if (capability === 'tti') return model.capabilities.includes('image.text-to-image');
      if (capability === 'itv') return model.capabilities.some(item => item.startsWith('video.'));
      if (capability === 'tts') return model.capabilities.includes('speech.text-to-speech');
      return false;
    });
  });
}

export async function addChannelConfig(
  config: Omit<ChannelConfig, 'id' | 'createdAt' | 'updatedAt'>,
): Promise<ChannelConfig> {
  ensureElectron();
  return svc.createChannel(config);
}

export async function updateChannelConfig(
  id: string,
  updates: Partial<Omit<ChannelConfig, 'id' | 'createdAt'>>,
): Promise<ChannelConfig | null> {
  ensureElectron();
  try {
    return await svc.updateChannel(id, updates);
  } catch (err) {
    if (String(err).includes('not found')) return null;
    throw err;
  }
}

export async function deleteChannelConfig(id: string): Promise<boolean> {
  ensureElectron();
  const ok = await svc.deleteChannel(id);
  if (ok) {
    try {
      const defaults = await svc.listMediaDefaults();
      for (const cat of Object.keys(defaults) as MediaCategory[]) {
        if (defaults[cat]?.channelId === id) {
          await svc.deleteMediaDefault(cat);
        }
      }
    } catch {
      // 软失败：主 delete 已成功，清理默认值不阻塞
    }
  }
  return ok;
}

export async function deleteChannelsByPlugin(pluginId: string): Promise<number> {
  ensureElectron();
  const list = await svc.listChannels();
  const targets = list.filter(c => c.pluginId === pluginId);
  let deleted = 0;
  for (const c of targets) {
    if (await svc.deleteChannel(c.id)) deleted++;
  }
  return deleted;
}

export async function deleteChannelByProviderType(
  providerType: string,
  pluginId: string,
): Promise<boolean> {
  ensureElectron();
  const list = await svc.listChannels();
  const target = list.find(c => c.providerType === providerType && c.pluginId === pluginId);
  if (!target) return false;
  return svc.deleteChannel(target.id);
}

// ========== Media Defaults ==========

export async function setDefaultChannelConfig(
  id: string,
  capability: ChannelCapability,
): Promise<boolean> {
  ensureElectron();
  const category = capability === 'tti' ? 'tti'
    : capability === 'itv' ? 'itv'
    : capability === 'tts' ? 'tts'
    : undefined;
  if (!category) return false;
  const target = await svc.getChannel(id);
  if (!target) return false;
  const modelId = target.defaultModelId || target.models?.[0]?.id;
  if (!modelId) return false;
  await svc.setMediaDefault(category, { channelId: id, modelId });
  return true;
}

export async function getDefaultChannelConfig(
  capability: ChannelCapability,
): Promise<ChannelConfig | null> {
  ensureElectron();
  const category = capability === 'tti' ? 'tti'
    : capability === 'itv' ? 'itv'
    : capability === 'tts' ? 'tts'
    : capability === 'image-hosting' ? 'image-hosting'
    : undefined;
  if (!category) return null;

  if (category === 'image-hosting') {
    const configs = await getChannelConfigs();
    return configs.find(c => c.enabled && getChannelCategory(c) === 'image-hosting') || null;
  }

  const sel = await svc.getMediaDefault(category);
  if (!sel) return null;
  const ch = await svc.getChannel(sel.channelId);
  return ch && getChannelCategory(ch) === category ? ch : null;
}

export async function setDefaultMediaModelSelection(
  category: MediaCategory,
  selection: MediaModelSelection,
): Promise<boolean> {
  ensureElectron();
  const ch = await svc.getChannel(selection.channelId);
  if (!ch) return false;
  const hasModel = (ch.models || []).some(m => m.id === selection.modelId);
  if (!hasModel) return false;
  await svc.setMediaDefault(category, selection);
  return true;
}

export async function getDefaultMediaModelSelection(
  category: MediaCategory,
): Promise<MediaModelSelection | null> {
  ensureElectron();
  return svc.getMediaDefault(category);
}

// ========== 清理 ==========

export async function cleanupDuplicateChannels(): Promise<number> {
  const configs = await getChannelConfigs();
  if (configs.length === 0) return 0;

  const seen = new Map<string, ChannelConfig>();
  const toRemove: string[] = [];
  const sorted = [...configs].sort((a, b) => b.updatedAt - a.updatedAt);
  for (const config of sorted) {
    const key = `${config.providerType}:${config.pluginId || 'builtin'}`;
    if (seen.has(key)) toRemove.push(config.id);
    else seen.set(key, config);
  }
  for (const id of toRemove) {
    await deleteChannelConfig(id);
  }
  return toRemove.length;
}


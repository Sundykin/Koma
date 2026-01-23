/**
 * 渠道配置 CRUD（自定义渠道 + 统一渠道）
 */
import { loadSettings, saveSettings } from './core';
import type { ChannelConfig, UnifiedChannelConfig, ChannelCapability } from '../../providers/channel/types';
import { hasChannelCapability } from '../../providers/channel/types';

// ========== 自定义渠道配置 ==========

export async function getCustomChannels(): Promise<ChannelConfig[]> {
  const settings = await loadSettings();
  return settings.customChannels || [];
}

export async function addCustomChannel(config: ChannelConfig): Promise<ChannelConfig> {
  const settings = await loadSettings();
  if (!settings.customChannels) {
    settings.customChannels = [];
  }

  if (settings.customChannels.find(c => c.id === config.id)) {
    config.id = `channel_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  }

  config.createdAt = config.createdAt || Date.now();
  config.updatedAt = Date.now();

  settings.customChannels.push(config);
  await saveSettings(settings);
  return config;
}

export async function updateCustomChannel(
  id: string,
  updates: Partial<ChannelConfig>
): Promise<ChannelConfig | null> {
  const settings = await loadSettings();
  if (!settings.customChannels) return null;

  const index = settings.customChannels.findIndex(c => c.id === id);
  if (index === -1) return null;

  settings.customChannels[index] = {
    ...settings.customChannels[index],
    ...updates,
    id,
    updatedAt: Date.now(),
  };
  await saveSettings(settings);
  return settings.customChannels[index];
}

export async function deleteCustomChannel(id: string): Promise<boolean> {
  const settings = await loadSettings();
  if (!settings.customChannels) return false;

  const index = settings.customChannels.findIndex(c => c.id === id);
  if (index === -1) return false;

  settings.customChannels.splice(index, 1);
  await saveSettings(settings);
  return true;
}

export async function testCustomChannel(config: ChannelConfig): Promise<boolean> {
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (config.auth.type === 'bearer') {
      headers['Authorization'] = `Bearer ${config.auth.keyValue}`;
    } else if (config.auth.type === 'header' && config.auth.keyName) {
      headers[config.auth.keyName] = config.auth.keyValue;
    }

    let testUrl = config.generate.url;
    if (testUrl.includes('{{baseUrl}}')) {
      testUrl = testUrl.replace('{{baseUrl}}', config.baseUrl);
    }

    if (config.auth.type === 'query' && config.auth.keyName) {
      const separator = testUrl.includes('?') ? '&' : '?';
      testUrl = `${testUrl}${separator}${config.auth.keyName}=${encodeURIComponent(config.auth.keyValue)}`;
    }

    const response = await fetch(testUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({}),
    });

    return response.status !== 401 && response.status !== 403;
  } catch (err) {
    console.error('[testCustomChannel] error:', err);
    return false;
  }
}

// ========== 统一渠道配置 ==========

export async function getUnifiedChannels(): Promise<UnifiedChannelConfig[]> {
  const settings = await loadSettings();
  return settings.unifiedChannels || [];
}

export async function getUnifiedChannelsByCapability(
  capability: ChannelCapability
): Promise<UnifiedChannelConfig[]> {
  const channels = await getUnifiedChannels();
  return channels.filter(c => c.enabled && hasChannelCapability(c, capability));
}

export async function addUnifiedChannel(
  config: Omit<UnifiedChannelConfig, 'id' | 'createdAt' | 'updatedAt'>
): Promise<UnifiedChannelConfig> {
  const settings = await loadSettings();
  if (!settings.unifiedChannels) {
    settings.unifiedChannels = [];
  }

  const now = Date.now();
  const newConfig: UnifiedChannelConfig = {
    ...config,
    id: `unified_${now}_${Math.random().toString(36).slice(2, 9)}`,
    createdAt: now,
    updatedAt: now,
  };

  settings.unifiedChannels.push(newConfig);
  await saveSettings(settings);
  return newConfig;
}

export async function updateUnifiedChannel(
  id: string,
  updates: Partial<Omit<UnifiedChannelConfig, 'id' | 'createdAt'>>
): Promise<UnifiedChannelConfig | null> {
  const settings = await loadSettings();
  if (!settings.unifiedChannels) return null;

  const index = settings.unifiedChannels.findIndex(c => c.id === id);
  if (index === -1) return null;

  settings.unifiedChannels[index] = {
    ...settings.unifiedChannels[index],
    ...updates,
    id,
    updatedAt: Date.now(),
  };
  await saveSettings(settings);
  return settings.unifiedChannels[index];
}

export async function deleteUnifiedChannel(id: string): Promise<boolean> {
  const settings = await loadSettings();
  if (!settings.unifiedChannels) return false;

  const index = settings.unifiedChannels.findIndex(c => c.id === id);
  if (index === -1) return false;

  settings.unifiedChannels.splice(index, 1);
  await saveSettings(settings);
  return true;
}

export async function testUnifiedChannel(
  config: UnifiedChannelConfig,
  capability?: ChannelCapability
): Promise<boolean> {
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (config.auth.type === 'bearer') {
      headers['Authorization'] = `Bearer ${config.auth.keyValue}`;
    } else if (config.auth.type === 'header' && config.auth.keyName) {
      headers[config.auth.keyName] = config.auth.keyValue;
    }

    let pair = config.itv || config.tti || config.characterExtract || config.remix;
    if (capability) {
      switch (capability) {
        case 'tti': pair = config.tti; break;
        case 'itv': pair = config.itv; break;
        case 'character-extract': pair = config.characterExtract; break;
        case 'remix': pair = config.remix; break;
      }
    }

    if (!pair) {
      console.warn('[testUnifiedChannel] no endpoint pair found');
      return false;
    }

    let testUrl = pair.generate.url;
    if (testUrl.includes('{{baseUrl}}')) {
      testUrl = testUrl.replace('{{baseUrl}}', config.baseUrl);
    }

    if (config.auth.type === 'query' && config.auth.keyName) {
      const separator = testUrl.includes('?') ? '&' : '?';
      testUrl = `${testUrl}${separator}${config.auth.keyName}=${encodeURIComponent(config.auth.keyValue)}`;
    }

    const response = await fetch(testUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({}),
    });

    return response.status !== 401 && response.status !== 403;
  } catch (err) {
    console.error('[testUnifiedChannel] error:', err);
    return false;
  }
}

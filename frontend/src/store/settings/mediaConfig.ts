/**
 * 媒体配置 CRUD (TTI/ITV/TTS)
 */
import { loadSettings, saveSettings, generateId } from './core';
import type { TTIModelConfig, ITVModelConfig, TTSModelConfig, ResolvedTTIConfig, ResolvedITVConfig } from '../../types';
import type { ChannelConfig } from '../../providers/channel/types';
import { getDefaultChannelConfig, getChannelConfigs } from './channelConfig';
import { hasChannelCapability } from '../../providers/channel/types';

// ========== 辅助函数：配置解析 ==========

function resolveBuiltinTTIConfig(config: TTIModelConfig): ResolvedTTIConfig {
  return { ...config, source: 'builtin' };
}

function resolveBuiltinITVConfig(config: ITVModelConfig): ResolvedITVConfig {
  return { ...config, source: 'builtin' };
}

function resolveChannelTTIConfig(channel: ChannelConfig): ResolvedTTIConfig {
  // 先展开 providerConfig，再覆盖元数据字段，确保元数据不被覆盖
  return {
    ...channel.providerConfig,
    id: channel.id,
    name: channel.name,
    provider: channel.providerType as any,
    isDefault: channel.isDefault || false,
    createdAt: channel.createdAt,
    updatedAt: channel.updatedAt,
    source: 'channel',
    channelConfig: channel,
  };
}

function resolveChannelITVConfig(channel: ChannelConfig): ResolvedITVConfig {
  // 先展开 providerConfig，再覆盖元数据字段，确保元数据不被覆盖
  return {
    ...channel.providerConfig,
    id: channel.id,
    name: channel.name,
    provider: channel.providerType as any,
    isDefault: channel.isDefault || false,
    createdAt: channel.createdAt,
    updatedAt: channel.updatedAt,
    source: 'channel',
    channelConfig: channel,
  };
}

// ========== TTI 配置 ==========

export async function addTTIConfig(
  config: Omit<TTIModelConfig, 'id' | 'createdAt' | 'updatedAt'>
): Promise<TTIModelConfig> {
  const settings = await loadSettings();
  const now = Date.now();

  const newConfig: TTIModelConfig = {
    ...config,
    id: generateId(),
    createdAt: now,
    updatedAt: now,
  };

  if (newConfig.isDefault) {
    settings.ttiConfigs = settings.ttiConfigs.map(c => ({ ...c, isDefault: false }));
  }
  if (settings.ttiConfigs.length === 0) {
    newConfig.isDefault = true;
  }

  settings.ttiConfigs.push(newConfig);
  await saveSettings(settings);
  return newConfig;
}

export async function updateTTIConfig(
  id: string,
  updates: Partial<Omit<TTIModelConfig, 'id' | 'createdAt'>>
): Promise<TTIModelConfig | null> {
  const settings = await loadSettings();
  const index = settings.ttiConfigs.findIndex(c => c.id === id);
  if (index === -1) return null;

  if (updates.isDefault) {
    settings.ttiConfigs = settings.ttiConfigs.map(c => ({ ...c, isDefault: false }));
  }

  settings.ttiConfigs[index] = { ...settings.ttiConfigs[index], ...updates, updatedAt: Date.now() };
  await saveSettings(settings);
  return settings.ttiConfigs[index];
}

export async function deleteTTIConfig(id: string): Promise<boolean> {
  const settings = await loadSettings();
  const index = settings.ttiConfigs.findIndex(c => c.id === id);
  if (index === -1) return false;

  const wasDefault = settings.ttiConfigs[index].isDefault;
  settings.ttiConfigs.splice(index, 1);
  if (wasDefault && settings.ttiConfigs.length > 0) {
    settings.ttiConfigs[0].isDefault = true;
  }

  await saveSettings(settings);
  return true;
}

export async function setDefaultTTIConfig(id: string): Promise<boolean> {
  const settings = await loadSettings();
  if (!settings.ttiConfigs.find(c => c.id === id)) return false;

  settings.ttiConfigs = settings.ttiConfigs.map(c => ({
    ...c,
    isDefault: c.id === id,
    updatedAt: c.id === id ? Date.now() : c.updatedAt,
  }));

  await saveSettings(settings);
  return true;
}

export async function getDefaultTTIConfig(): Promise<TTIModelConfig | null> {
  const settings = await loadSettings();
  return settings.ttiConfigs.find(c => c.isDefault) || settings.ttiConfigs[0] || null;
}

export async function getTTIConfigById(id: string): Promise<TTIModelConfig | null> {
  const settings = await loadSettings();
  return settings.ttiConfigs.find(c => c.id === id) || null;
}

export async function getActiveTTIConfig(projectConfigId?: string): Promise<ResolvedTTIConfig | null> {
  const settings = await loadSettings();
  const channels = settings.channelConfigs || [];
  const ttiChannels = channels.filter(c => c.enabled && hasChannelCapability(c, 'tti'));

  // 1. 指定了 ID
  if (projectConfigId) {
    // 先查内置
    const config = settings.ttiConfigs.find(c => c.id === projectConfigId);
    if (config) return resolveBuiltinTTIConfig(config);

    // 再查插件渠道（必须启用）
    const channel = ttiChannels.find(c => c.id === projectConfigId);
    if (channel) {
      return resolveChannelTTIConfig(channel);
    }
  }

  // 2. 未指定 ID，查找默认配置
  // 优先查插件渠道中明确设为默认的（isDefault === true）
  const defaultChannel = ttiChannels.find(c => c.isDefault === true);
  if (defaultChannel) {
    return resolveChannelTTIConfig(defaultChannel);
  }

  // 再查内置默认
  const builtinDefault = settings.ttiConfigs.find(c => c.isDefault) || settings.ttiConfigs[0];
  if (builtinDefault) {
    return resolveBuiltinTTIConfig(builtinDefault);
  }

  // 最后回退到第一个启用的插件渠道
  if (ttiChannels.length > 0) {
    return resolveChannelTTIConfig(ttiChannels[0]);
  }

  return null;
}

// ========== ITV 配置 ==========

export async function addITVConfig(
  config: Omit<ITVModelConfig, 'id' | 'createdAt' | 'updatedAt'>
): Promise<ITVModelConfig> {
  const settings = await loadSettings();
  const now = Date.now();

  const newConfig: ITVModelConfig = {
    ...config,
    id: generateId(),
    createdAt: now,
    updatedAt: now,
  };

  if (newConfig.isDefault) {
    settings.itvConfigs = settings.itvConfigs.map(c => ({ ...c, isDefault: false }));
  }
  if (settings.itvConfigs.length === 0) {
    newConfig.isDefault = true;
  }

  settings.itvConfigs.push(newConfig);
  await saveSettings(settings);
  return newConfig;
}

export async function updateITVConfig(
  id: string,
  updates: Partial<Omit<ITVModelConfig, 'id' | 'createdAt'>>
): Promise<ITVModelConfig | null> {
  const settings = await loadSettings();
  const index = settings.itvConfigs.findIndex(c => c.id === id);
  if (index === -1) return null;

  if (updates.isDefault) {
    settings.itvConfigs = settings.itvConfigs.map(c => ({ ...c, isDefault: false }));
  }

  settings.itvConfigs[index] = { ...settings.itvConfigs[index], ...updates, updatedAt: Date.now() };
  await saveSettings(settings);
  return settings.itvConfigs[index];
}

export async function deleteITVConfig(id: string): Promise<boolean> {
  const settings = await loadSettings();
  const index = settings.itvConfigs.findIndex(c => c.id === id);
  if (index === -1) return false;

  const wasDefault = settings.itvConfigs[index].isDefault;
  settings.itvConfigs.splice(index, 1);
  if (wasDefault && settings.itvConfigs.length > 0) {
    settings.itvConfigs[0].isDefault = true;
  }

  await saveSettings(settings);
  return true;
}

export async function setDefaultITVConfig(id: string): Promise<boolean> {
  const settings = await loadSettings();
  if (!settings.itvConfigs.find(c => c.id === id)) return false;

  settings.itvConfigs = settings.itvConfigs.map(c => ({
    ...c,
    isDefault: c.id === id,
    updatedAt: c.id === id ? Date.now() : c.updatedAt,
  }));

  await saveSettings(settings);
  return true;
}

export async function getDefaultITVConfig(): Promise<ITVModelConfig | null> {
  const settings = await loadSettings();
  return settings.itvConfigs.find(c => c.isDefault) || settings.itvConfigs[0] || null;
}

export async function getITVConfigById(id: string): Promise<ITVModelConfig | null> {
  const settings = await loadSettings();
  return settings.itvConfigs.find(c => c.id === id) || null;
}

export async function getActiveITVConfig(projectConfigId?: string): Promise<ResolvedITVConfig | null> {
  const settings = await loadSettings();
  const channels = settings.channelConfigs || [];
  const itvChannels = channels.filter(c => c.enabled && hasChannelCapability(c, 'itv'));

  // 1. 指定了 ID
  if (projectConfigId) {
    // 先查内置
    const config = settings.itvConfigs.find(c => c.id === projectConfigId);
    if (config) return resolveBuiltinITVConfig(config);

    // 再查插件渠道（必须启用）
    const channel = itvChannels.find(c => c.id === projectConfigId);
    if (channel) {
      return resolveChannelITVConfig(channel);
    }
  }

  // 2. 未指定 ID，查找默认配置
  // 优先查插件渠道中明确设为默认的（isDefault === true）
  const defaultChannel = itvChannels.find(c => c.isDefault === true);
  if (defaultChannel) {
    return resolveChannelITVConfig(defaultChannel);
  }

  // 再查内置默认
  const builtinDefault = settings.itvConfigs.find(c => c.isDefault) || settings.itvConfigs[0];
  if (builtinDefault) {
    return resolveBuiltinITVConfig(builtinDefault);
  }

  // 最后回退到第一个启用的插件渠道
  if (itvChannels.length > 0) {
    return resolveChannelITVConfig(itvChannels[0]);
  }

  return null;
}

// ========== TTS 配置 ==========

export async function addTTSConfig(
  config: Omit<TTSModelConfig, 'id' | 'createdAt' | 'updatedAt'>
): Promise<TTSModelConfig> {
  const settings = await loadSettings();
  const now = Date.now();

  const newConfig: TTSModelConfig = {
    ...config,
    id: generateId(),
    createdAt: now,
    updatedAt: now,
  };

  if (newConfig.isDefault) {
    settings.ttsConfigs = settings.ttsConfigs.map(c => ({ ...c, isDefault: false }));
  }
  if (settings.ttsConfigs.length === 0) {
    newConfig.isDefault = true;
  }

  settings.ttsConfigs.push(newConfig);
  await saveSettings(settings);
  return newConfig;
}

export async function updateTTSConfig(
  id: string,
  updates: Partial<Omit<TTSModelConfig, 'id' | 'createdAt'>>
): Promise<TTSModelConfig | null> {
  const settings = await loadSettings();
  const index = settings.ttsConfigs.findIndex(c => c.id === id);
  if (index === -1) return null;

  if (updates.isDefault) {
    settings.ttsConfigs = settings.ttsConfigs.map(c => ({ ...c, isDefault: false }));
  }

  settings.ttsConfigs[index] = { ...settings.ttsConfigs[index], ...updates, updatedAt: Date.now() };
  await saveSettings(settings);
  return settings.ttsConfigs[index];
}

export async function deleteTTSConfig(id: string): Promise<boolean> {
  const settings = await loadSettings();
  const index = settings.ttsConfigs.findIndex(c => c.id === id);
  if (index === -1) return false;

  const wasDefault = settings.ttsConfigs[index].isDefault;
  settings.ttsConfigs.splice(index, 1);
  if (wasDefault && settings.ttsConfigs.length > 0) {
    settings.ttsConfigs[0].isDefault = true;
  }

  await saveSettings(settings);
  return true;
}

export async function setDefaultTTSConfig(id: string): Promise<boolean> {
  const settings = await loadSettings();
  if (!settings.ttsConfigs.find(c => c.id === id)) return false;

  settings.ttsConfigs = settings.ttsConfigs.map(c => ({
    ...c,
    isDefault: c.id === id,
    updatedAt: c.id === id ? Date.now() : c.updatedAt,
  }));

  await saveSettings(settings);
  return true;
}

export async function getDefaultTTSConfig(): Promise<TTSModelConfig | null> {
  const settings = await loadSettings();
  return settings.ttsConfigs.find(c => c.isDefault) || settings.ttsConfigs[0] || null;
}

export async function getTTSConfigById(id: string): Promise<TTSModelConfig | null> {
  const settings = await loadSettings();
  return settings.ttsConfigs.find(c => c.id === id) || null;
}

export async function getActiveTTSConfig(projectConfigId?: string): Promise<TTSModelConfig | null> {
  if (projectConfigId) {
    const config = await getTTSConfigById(projectConfigId);
    if (config) return config;
  }
  return getDefaultTTSConfig();
}
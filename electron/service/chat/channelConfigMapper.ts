/**
 * ChannelConfig (前端富对象) ↔ ChannelConfigRow (SQLite 平坦行) 双向映射
 *
 * 旧 ChannelConfig 的富字段（models[] / providerConfig 非 baseUrl 部分 / polling 等）
 * 全部序列化进 meta_json；顶层 row 字段只保留查询/排序/默认渠道判定所需的几项。
 */

import type { ChannelConfigRow, ChannelKind } from '../storage';

export type ChannelCategory = 'llm' | 'tti' | 'itv' | 'tts';

export interface ChannelModelDefinition {
  id: string;
  label: string;
  providerModelName?: string;
  capabilities: string[];
  defaults?: Record<string, unknown>;
}

export interface ChannelConfig {
  id: string;
  name: string;
  description?: string;
  category: ChannelCategory;
  providerType: string;
  providerConfig: Record<string, unknown>;
  defaultModelId?: string;
  models: ChannelModelDefinition[];
  capabilities?: string[];
  polling?: Record<string, unknown>;
  enabled: boolean;
  isDefault?: boolean;
  source: 'builtin' | 'plugin';
  pluginId?: string;
  createdAt: number;
  updatedAt: number;
}

interface ChannelMeta {
  description?: string;
  models: ChannelModelDefinition[];
  capabilities?: string[];
  polling?: Record<string, unknown>;
  providerConfigExtras?: Record<string, unknown>;
  enabled: boolean;
  source: 'builtin' | 'plugin';
  pluginId?: string;
}

function asChannelKind(category: ChannelCategory): ChannelKind {
  return category;
}

function categoryFromKind(kind: ChannelKind): ChannelCategory {
  return kind;
}

/** 把 providerConfig 中顶层字段（baseUrl, apiKey）拆出来，剩下的存进 meta */
function splitProviderConfig(providerConfig: Record<string, unknown>): {
  baseUrl?: string;
  apiKey?: string;
  extras: Record<string, unknown>;
} {
  const { baseUrl, apiKey, ...extras } = providerConfig ?? {};
  return {
    baseUrl: typeof baseUrl === 'string' ? baseUrl : undefined,
    apiKey: typeof apiKey === 'string' ? apiKey : undefined,
    extras: extras as Record<string, unknown>,
  };
}

export function channelConfigToRow(config: ChannelConfig): ChannelConfigRow {
  const { baseUrl, apiKey, extras } = splitProviderConfig(config.providerConfig || {});

  const meta: ChannelMeta = {
    description: config.description,
    models: config.models ?? [],
    capabilities: config.capabilities,
    polling: config.polling,
    providerConfigExtras: Object.keys(extras).length > 0 ? extras : undefined,
    enabled: config.enabled,
    source: config.source,
    pluginId: config.pluginId,
  };

  return {
    id: config.id,
    kind: asChannelKind(config.category),
    name: config.name,
    provider: config.providerType,
    base_url: baseUrl,
    api_key: apiKey,
    model_name: config.defaultModelId,
    is_default: config.isDefault ? 1 : 0,
    meta_json: JSON.stringify(meta),
    created_at: config.createdAt,
    updated_at: config.updatedAt,
  };
}

export function rowToChannelConfig(row: ChannelConfigRow): ChannelConfig {
  let meta: ChannelMeta = { models: [], enabled: true, source: 'builtin' };
  if (row.meta_json) {
    try {
      meta = JSON.parse(row.meta_json) as ChannelMeta;
    } catch {
      // 损坏的 meta_json 视为默认值
    }
  }

  const providerConfig: Record<string, unknown> = {
    ...(meta.providerConfigExtras ?? {}),
  };
  if (row.base_url) providerConfig.baseUrl = row.base_url;
  if (row.api_key) providerConfig.apiKey = row.api_key;

  return {
    id: row.id,
    name: row.name,
    description: meta.description,
    category: categoryFromKind(row.kind),
    providerType: row.provider,
    providerConfig,
    defaultModelId: row.model_name ?? undefined,
    models: meta.models ?? [],
    capabilities: meta.capabilities,
    polling: meta.polling,
    enabled: meta.enabled ?? true,
    isDefault: row.is_default === 1,
    source: meta.source ?? 'builtin',
    pluginId: meta.pluginId,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

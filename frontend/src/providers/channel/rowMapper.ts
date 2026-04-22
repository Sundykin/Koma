/**
 * ChannelConfig (前端富对象) ↔ ChannelConfigRow (SQLite 平坦行) 双向映射。
 *
 * 与 `electron/service/chat/channelConfigMapper.ts` 保持协议一致；前端单独持有
 * 一份，避免把 electron 路径泄进 frontend 构建。
 *
 * 注意：`channel_configs.kind` CHECK 约束仅允许 llm/tti/itv/tts。前端的
 * `MediaCategory` 多一个 `image-hosting`，通过 `meta_json.isImageHosting` 标
 * 记并降级为 tti 存储；读回时 synthesise 回 image-hosting。
 */
import type { ChannelConfig, MediaCategory } from './types';
import type { ChannelConfigRow, ChannelKind } from '../../services/configBridge';

interface ChannelMeta {
  description?: string;
  models: ChannelConfig['models'];
  capabilities?: ChannelConfig['capabilities'];
  polling?: ChannelConfig['polling'];
  providerConfigExtras?: Record<string, unknown>;
  enabled: boolean;
  source: 'builtin' | 'plugin';
  pluginId?: string;
  isImageHosting?: boolean;
}

function categoryToKind(category: MediaCategory): ChannelKind {
  if (category === 'image-hosting') return 'tti';
  return category;
}

function kindToCategory(kind: ChannelKind, isImageHosting?: boolean): MediaCategory {
  if (isImageHosting) return 'image-hosting';
  return kind;
}

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
    isImageHosting: config.category === 'image-hosting' ? true : undefined,
  };

  return {
    id: config.id,
    kind: categoryToKind(config.category),
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
      // 损坏的 meta_json 视为默认
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
    category: kindToCategory(row.kind, meta.isImageHosting),
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

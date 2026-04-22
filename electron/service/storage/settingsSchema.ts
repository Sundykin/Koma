/**
 * Settings 全局数据库 schema（独立于项目级 koma.db）
 * 路径：{userData}/settings.db
 *
 * v1 → v2:
 *   channel_configs 扩列：source / plugin_id / default_model_id / provider_config_json
 *   目的：与前端 ChannelConfig 字段平铺对齐，减少 extras_json 黑盒
 */

export const CURRENT_SETTINGS_SCHEMA_VERSION = 2;

export const CREATE_SETTINGS_TABLES_SQL = `
CREATE TABLE IF NOT EXISTS schema_version (
  version      INTEGER PRIMARY KEY,
  applied_at   INTEGER NOT NULL,
  description  TEXT
);

-- category: 'llm' | 'tti' | 'itv' | 'tts' | 'image-hosting'
-- source:   'builtin' | 'plugin'
CREATE TABLE IF NOT EXISTS channel_configs (
  id                    TEXT PRIMARY KEY,
  category              TEXT NOT NULL,
  channel_def_id        TEXT NOT NULL,            -- = 前端 providerType
  name                  TEXT NOT NULL,
  description           TEXT,
  base_url              TEXT,
  api_key_cipher        BLOB,                     -- safeStorage 加密后的 apiKey
  provider_config_json  TEXT NOT NULL DEFAULT '{}', -- providerConfig 去掉 apiKey 后的剩余字段
  models_json           TEXT NOT NULL DEFAULT '[]',
  capabilities_json     TEXT NOT NULL DEFAULT '[]',
  polling_json          TEXT,
  extras_json           TEXT NOT NULL DEFAULT '{}',
  default_model_id      TEXT,
  source                TEXT NOT NULL DEFAULT 'builtin',
  plugin_id             TEXT,
  enabled               INTEGER NOT NULL DEFAULT 1,
  is_default            INTEGER NOT NULL DEFAULT 0,
  sort_order            INTEGER NOT NULL DEFAULT 0,
  created_at            INTEGER NOT NULL,
  updated_at            INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS media_defaults (
  category     TEXT PRIMARY KEY,
  channel_id   TEXT NOT NULL,
  model_id     TEXT,
  payload_json TEXT NOT NULL DEFAULT '{}',
  updated_at   INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS app_settings_kv (
  key        TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
`;

export const CREATE_SETTINGS_INDEXES_SQL = `
CREATE INDEX IF NOT EXISTS idx_channel_configs_category
  ON channel_configs(category, sort_order);
CREATE INDEX IF NOT EXISTS idx_channel_configs_source
  ON channel_configs(source, plugin_id);
`;

export interface SettingsMigration {
  description: string;
  sql: string;
}

/**
 * 版本迁移：每个 key = 目标版本
 * 只对已存在的 v1 库追加列；新建库已经是 v2。
 */
export const SETTINGS_MIGRATIONS: Record<number, SettingsMigration> = {
  2: {
    description: 'v2: expand channel_configs columns (source/plugin_id/default_model_id/provider_config_json/etc)',
    sql: `
      ALTER TABLE channel_configs ADD COLUMN description TEXT;
      ALTER TABLE channel_configs ADD COLUMN provider_config_json TEXT NOT NULL DEFAULT '{}';
      ALTER TABLE channel_configs ADD COLUMN capabilities_json TEXT NOT NULL DEFAULT '[]';
      ALTER TABLE channel_configs ADD COLUMN polling_json TEXT;
      ALTER TABLE channel_configs ADD COLUMN default_model_id TEXT;
      ALTER TABLE channel_configs ADD COLUMN source TEXT NOT NULL DEFAULT 'builtin';
      ALTER TABLE channel_configs ADD COLUMN plugin_id TEXT;
      ALTER TABLE channel_configs ADD COLUMN is_default INTEGER NOT NULL DEFAULT 0;
      CREATE INDEX IF NOT EXISTS idx_channel_configs_source ON channel_configs(source, plugin_id);
    `,
  },
};

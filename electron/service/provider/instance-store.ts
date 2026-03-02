/**
 * Provider 实例存储服务
 * 使用 SQLite 存储 Provider 实例配置
 */

import { safeStorage } from 'electron';
import type { ProviderInstance, ProviderKind, ConfigSchema } from '../../plugin/types';

/** 实例创建参数 */
export interface CreateInstanceParams {
  pluginId: string;
  kind: ProviderKind;
  name: string;
  config: Record<string, unknown>;
}

/** 实例更新参数 */
export interface UpdateInstanceParams {
  name?: string;
  config?: Record<string, unknown>;
  enabled?: boolean;
}

/**
 * Provider 实例存储
 */
class InstanceStore {
  private db: any = null;
  private initialized = false;

  /** 初始化数据库 */
  async init(db: any): Promise<void> {
    if (this.initialized) return;

    this.db = db;

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS provider_instances (
        id TEXT PRIMARY KEY,
        plugin_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        name TEXT NOT NULL,
        config TEXT NOT NULL,
        enabled INTEGER DEFAULT 1,
        is_default INTEGER DEFAULT 0,
        created_at INTEGER,
        updated_at INTEGER
      );

      CREATE INDEX IF NOT EXISTS idx_instances_kind
        ON provider_instances(kind);
      CREATE INDEX IF NOT EXISTS idx_instances_plugin
        ON provider_instances(plugin_id);
    `);

    this.initialized = true;
  }

  /** 生成 UUID */
  private generateId(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  /** 加密敏感字段 */
  private encryptSecrets(
    config: Record<string, unknown>,
    schema?: ConfigSchema
  ): Record<string, unknown> {
    if (!schema || !safeStorage.isEncryptionAvailable()) {
      return config;
    }

    const result = { ...config };
    for (const [key, prop] of Object.entries(schema.properties)) {
      if (prop.secret && result[key] && typeof result[key] === 'string') {
        const encrypted = safeStorage.encryptString(result[key] as string);
        result[key] = `encrypted:${encrypted.toString('base64')}`;
      }
    }
    return result;
  }

  /** 解密敏感字段 */
  private decryptSecrets(
    config: Record<string, unknown>,
    schema?: ConfigSchema
  ): Record<string, unknown> {
    if (!schema || !safeStorage.isEncryptionAvailable()) {
      return config;
    }

    const result = { ...config };
    for (const [key, prop] of Object.entries(schema.properties)) {
      if (prop.secret && result[key] && typeof result[key] === 'string') {
        const value = result[key] as string;
        if (value.startsWith('encrypted:')) {
          const encrypted = Buffer.from(value.slice(10), 'base64');
          result[key] = safeStorage.decryptString(encrypted);
        }
      }
    }
    return result;
  }

  /** 行转实例 */
  private rowToInstance(row: any): ProviderInstance {
    return {
      id: row.id,
      pluginId: row.plugin_id,
      kind: row.kind as ProviderKind,
      name: row.name,
      config: JSON.parse(row.config),
      enabled: row.enabled === 1,
      isDefault: row.is_default === 1,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  /** 创建实例 */
  create(params: CreateInstanceParams, schema?: ConfigSchema): ProviderInstance {
    const now = Date.now();
    const id = this.generateId();
    const encryptedConfig = this.encryptSecrets(params.config, schema);

    this.db
      .prepare(
        `INSERT INTO provider_instances
         (id, plugin_id, kind, name, config, enabled, is_default, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 1, 0, ?, ?)`
      )
      .run(id, params.pluginId, params.kind, params.name, JSON.stringify(encryptedConfig), now, now);

    return {
      id,
      pluginId: params.pluginId,
      kind: params.kind,
      name: params.name,
      config: params.config,
      enabled: true,
      isDefault: false,
      createdAt: now,
      updatedAt: now,
    };
  }

  /** 获取实例 */
  get(id: string, schema?: ConfigSchema): ProviderInstance | null {
    const row = this.db.prepare('SELECT * FROM provider_instances WHERE id = ?').get(id);
    if (!row) return null;

    const instance = this.rowToInstance(row);
    instance.config = this.decryptSecrets(instance.config, schema);
    return instance;
  }

  /** 按类型列出实例 */
  listByKind(kind: ProviderKind, schema?: ConfigSchema): ProviderInstance[] {
    const rows = this.db
      .prepare('SELECT * FROM provider_instances WHERE kind = ? ORDER BY created_at ASC')
      .all(kind);

    return rows.map((row: any) => {
      const instance = this.rowToInstance(row);
      instance.config = this.decryptSecrets(instance.config, schema);
      return instance;
    });
  }

  /** 按插件列出实例 */
  listByPlugin(pluginId: string, schema?: ConfigSchema): ProviderInstance[] {
    const rows = this.db
      .prepare('SELECT * FROM provider_instances WHERE plugin_id = ? ORDER BY created_at ASC')
      .all(pluginId);

    return rows.map((row: any) => {
      const instance = this.rowToInstance(row);
      instance.config = this.decryptSecrets(instance.config, schema);
      return instance;
    });
  }

  /** 更新实例 */
  update(id: string, params: UpdateInstanceParams, schema?: ConfigSchema): boolean {
    const updates: string[] = [];
    const values: unknown[] = [];

    if (params.name !== undefined) {
      updates.push('name = ?');
      values.push(params.name);
    }
    if (params.config !== undefined) {
      updates.push('config = ?');
      const encryptedConfig = this.encryptSecrets(params.config, schema);
      values.push(JSON.stringify(encryptedConfig));
    }
    if (params.enabled !== undefined) {
      updates.push('enabled = ?');
      values.push(params.enabled ? 1 : 0);
    }

    if (updates.length === 0) return false;

    updates.push('updated_at = ?');
    values.push(Date.now());
    values.push(id);

    const result = this.db
      .prepare(`UPDATE provider_instances SET ${updates.join(', ')} WHERE id = ?`)
      .run(...values);

    return result.changes > 0;
  }

  /** 删除实例 */
  delete(id: string): boolean {
    const result = this.db.prepare('DELETE FROM provider_instances WHERE id = ?').run(id);
    return result.changes > 0;
  }

  /** 设置默认实例 */
  setDefault(id: string, kind: ProviderKind): boolean {
    this.db.prepare('UPDATE provider_instances SET is_default = 0 WHERE kind = ?').run(kind);

    const result = this.db
      .prepare('UPDATE provider_instances SET is_default = 1, updated_at = ? WHERE id = ?')
      .run(Date.now(), id);

    return result.changes > 0;
  }

  /** 获取默认实例 */
  getDefault(kind: ProviderKind, schema?: ConfigSchema): ProviderInstance | null {
    const row = this.db
      .prepare('SELECT * FROM provider_instances WHERE kind = ? AND is_default = 1')
      .get(kind);

    if (!row) {
      const firstEnabled = this.db
        .prepare('SELECT * FROM provider_instances WHERE kind = ? AND enabled = 1 ORDER BY created_at ASC LIMIT 1')
        .get(kind);
      if (!firstEnabled) return null;
      const instance = this.rowToInstance(firstEnabled);
      instance.config = this.decryptSecrets(instance.config, schema);
      return instance;
    }

    const instance = this.rowToInstance(row);
    instance.config = this.decryptSecrets(instance.config, schema);
    return instance;
  }

  /** 检查实例是否存在 */
  exists(id: string): boolean {
    const row = this.db.prepare('SELECT id FROM provider_instances WHERE id = ?').get(id);
    return !!row;
  }

  /** 按插件删除所有实例 */
  deleteByPlugin(pluginId: string): number {
    const result = this.db
      .prepare('DELETE FROM provider_instances WHERE plugin_id = ?')
      .run(pluginId);
    return result.changes;
  }

  /** 统计实例数量 */
  count(kind?: ProviderKind): number {
    if (kind) {
      const row = this.db
        .prepare('SELECT COUNT(*) as count FROM provider_instances WHERE kind = ?')
        .get(kind);
      return row.count;
    }
    const row = this.db.prepare('SELECT COUNT(*) as count FROM provider_instances').get();
    return row.count;
  }
}

export const instanceStore = new InstanceStore();

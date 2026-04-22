import type Database from 'better-sqlite3';
import type { ChannelConfigRow, ChannelKind, IChannelConfigRepository } from './interfaces';
import { encryptField, decryptField, isEncrypted } from '../fieldCrypto';

/**
 * 渠道配置 Repository。
 * - api_key 列进出库时做字段级加密；业务层看到的 row 始终是明文。
 * - setDefault 在事务中完成"同 kind 清零 + 目标置一"，保证唯一性。
 */
export class SqliteChannelConfigRepository implements IChannelConfigRepository {
  constructor(
    private db: Database.Database,
    private onDecryptError?: (err: unknown, id: string) => void,
  ) {}

  private decryptRow(row: ChannelConfigRow): ChannelConfigRow {
    if (!row.api_key) return row;
    const plain = decryptField(row.api_key, (err) => this.onDecryptError?.(err, row.id));
    return { ...row, api_key: plain };
  }

  list(kind: ChannelKind): ChannelConfigRow[] {
    const rows = this.db.prepare(
      'SELECT * FROM channel_configs WHERE kind = ? ORDER BY is_default DESC, updated_at DESC'
    ).all(kind) as ChannelConfigRow[];
    return rows.map((r) => this.decryptRow(r));
  }

  listAll(): ChannelConfigRow[] {
    const rows = this.db.prepare(
      'SELECT * FROM channel_configs ORDER BY kind, is_default DESC, updated_at DESC'
    ).all() as ChannelConfigRow[];
    return rows.map((r) => this.decryptRow(r));
  }

  getById(id: string): ChannelConfigRow | undefined {
    const row = this.db.prepare('SELECT * FROM channel_configs WHERE id = ?').get(id) as ChannelConfigRow | undefined;
    return row ? this.decryptRow(row) : undefined;
  }

  getDefault(kind: ChannelKind): ChannelConfigRow | undefined {
    const row = this.db.prepare(
      'SELECT * FROM channel_configs WHERE kind = ? AND is_default = 1 LIMIT 1'
    ).get(kind) as ChannelConfigRow | undefined;
    return row ? this.decryptRow(row) : undefined;
  }

  upsert(row: ChannelConfigRow): void {
    const apiKey = row.api_key && !isEncrypted(row.api_key)
      ? encryptField(row.api_key)
      : (row.api_key ?? '');

    this.db.prepare(`
      INSERT INTO channel_configs
        (id, kind, name, provider, base_url, api_key, model_name, is_default, meta_json, created_at, updated_at)
      VALUES
        (@id, @kind, @name, @provider, @base_url, @api_key, @model_name, @is_default, @meta_json, @created_at, @updated_at)
      ON CONFLICT(id) DO UPDATE SET
        kind = excluded.kind,
        name = excluded.name,
        provider = excluded.provider,
        base_url = excluded.base_url,
        api_key = excluded.api_key,
        model_name = excluded.model_name,
        is_default = excluded.is_default,
        meta_json = excluded.meta_json,
        updated_at = excluded.updated_at
    `).run({
      id: row.id,
      kind: row.kind,
      name: row.name,
      provider: row.provider,
      base_url: row.base_url ?? null,
      api_key: apiKey || null,
      model_name: row.model_name ?? null,
      is_default: row.is_default ?? 0,
      meta_json: row.meta_json ?? null,
      created_at: row.created_at,
      updated_at: row.updated_at,
    });
  }

  delete(id: string): void {
    this.db.prepare('DELETE FROM channel_configs WHERE id = ?').run(id);
  }

  setDefault(kind: ChannelKind, id: string): void {
    const tx = this.db.transaction(() => {
      this.db.prepare('UPDATE channel_configs SET is_default = 0, updated_at = ? WHERE kind = ?')
        .run(Date.now(), kind);
      this.db.prepare('UPDATE channel_configs SET is_default = 1, updated_at = ? WHERE id = ? AND kind = ?')
        .run(Date.now(), id, kind);
    });
    tx();
  }
}

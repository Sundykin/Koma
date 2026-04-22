import type Database from 'better-sqlite3';
import type { IKvConfigRepository, KvConfigRow } from './interfaces';

export class SqliteKvConfigRepository implements IKvConfigRepository {
  constructor(private db: Database.Database) {}

  get<T = unknown>(namespace: string, key: string): T | undefined {
    const row = this.db.prepare(
      'SELECT value_json FROM kv_configs WHERE namespace = ? AND key = ?'
    ).get(namespace, key) as Pick<KvConfigRow, 'value_json'> | undefined;
    if (!row) return undefined;
    try {
      return JSON.parse(row.value_json) as T;
    } catch {
      return undefined;
    }
  }

  listNamespace<T = unknown>(namespace: string): Array<{ key: string; value: T }> {
    const rows = this.db.prepare(
      'SELECT key, value_json FROM kv_configs WHERE namespace = ? ORDER BY key'
    ).all(namespace) as Array<{ key: string; value_json: string }>;
    const result: Array<{ key: string; value: T }> = [];
    for (const r of rows) {
      try {
        result.push({ key: r.key, value: JSON.parse(r.value_json) as T });
      } catch {
        // 跳过损坏的 json
      }
    }
    return result;
  }

  set<T = unknown>(namespace: string, key: string, value: T): void {
    const payload = JSON.stringify(value);
    this.db.prepare(`
      INSERT INTO kv_configs (namespace, key, value_json, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(namespace, key) DO UPDATE SET
        value_json = excluded.value_json,
        updated_at = excluded.updated_at
    `).run(namespace, key, payload, Date.now());
  }

  delete(namespace: string, key: string): void {
    this.db.prepare('DELETE FROM kv_configs WHERE namespace = ? AND key = ?').run(namespace, key);
  }
}

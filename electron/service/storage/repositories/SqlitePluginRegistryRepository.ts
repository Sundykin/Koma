import type Database from 'better-sqlite3';
import type { IPluginRegistryRepository, PluginRegistryRow } from './interfaces';

export class SqlitePluginRegistryRepository implements IPluginRegistryRepository {
  constructor(private db: Database.Database) {}

  list(): PluginRegistryRow[] {
    return this.db.prepare(
      'SELECT * FROM plugin_registry ORDER BY updated_at DESC'
    ).all() as PluginRegistryRow[];
  }

  getById(id: string): PluginRegistryRow | undefined {
    return this.db.prepare('SELECT * FROM plugin_registry WHERE id = ?').get(id) as PluginRegistryRow | undefined;
  }

  upsert(row: PluginRegistryRow): void {
    this.db.prepare(`
      INSERT INTO plugin_registry
        (id, name, version, source, source_ref, enabled, manifest_json, permissions_json, installed_at, updated_at)
      VALUES
        (@id, @name, @version, @source, @source_ref, @enabled, @manifest_json, @permissions_json, @installed_at, @updated_at)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        version = excluded.version,
        source = excluded.source,
        source_ref = excluded.source_ref,
        enabled = excluded.enabled,
        manifest_json = excluded.manifest_json,
        permissions_json = excluded.permissions_json,
        updated_at = excluded.updated_at
    `).run({
      id: row.id,
      name: row.name,
      version: row.version,
      source: row.source,
      source_ref: row.source_ref ?? null,
      enabled: row.enabled ?? 1,
      manifest_json: row.manifest_json,
      permissions_json: row.permissions_json ?? null,
      installed_at: row.installed_at,
      updated_at: row.updated_at,
    });
  }

  setEnabled(id: string, enabled: boolean): void {
    this.db.prepare(
      'UPDATE plugin_registry SET enabled = ?, updated_at = ? WHERE id = ?'
    ).run(enabled ? 1 : 0, Date.now(), id);
  }

  delete(id: string): void {
    this.db.prepare('DELETE FROM plugin_registry WHERE id = ?').run(id);
  }
}

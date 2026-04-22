import type Database from 'better-sqlite3';
import type { IVisualStylePresetRepository, VisualStylePresetRow } from './interfaces';

export class SqliteVisualStylePresetRepository implements IVisualStylePresetRepository {
  constructor(private db: Database.Database) {}

  list(): VisualStylePresetRow[] {
    return this.db.prepare(
      'SELECT * FROM visual_style_presets ORDER BY is_builtin DESC, sort_order ASC, updated_at DESC'
    ).all() as VisualStylePresetRow[];
  }

  getById(id: string): VisualStylePresetRow | undefined {
    return this.db.prepare('SELECT * FROM visual_style_presets WHERE id = ?').get(id) as VisualStylePresetRow | undefined;
  }

  upsert(row: VisualStylePresetRow): void {
    const existing = this.db.prepare('SELECT is_builtin FROM visual_style_presets WHERE id = ?').get(row.id) as { is_builtin: number } | undefined;
    const isBuiltin = existing ? existing.is_builtin : (row.is_builtin ?? 0);

    this.db.prepare(`
      INSERT INTO visual_style_presets
        (id, name, description, tti_prefix, llm_suffix, thumbnail_path, is_builtin, sort_order, created_at, updated_at)
      VALUES
        (@id, @name, @description, @tti_prefix, @llm_suffix, @thumbnail_path, @is_builtin, @sort_order, @created_at, @updated_at)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        description = excluded.description,
        tti_prefix = excluded.tti_prefix,
        llm_suffix = excluded.llm_suffix,
        thumbnail_path = excluded.thumbnail_path,
        sort_order = excluded.sort_order,
        updated_at = excluded.updated_at
    `).run({
      id: row.id,
      name: row.name,
      description: row.description ?? null,
      tti_prefix: row.tti_prefix ?? null,
      llm_suffix: row.llm_suffix ?? null,
      thumbnail_path: row.thumbnail_path ?? null,
      is_builtin: isBuiltin,
      sort_order: row.sort_order ?? 0,
      created_at: row.created_at,
      updated_at: row.updated_at,
    });
  }

  delete(id: string): boolean {
    const row = this.db.prepare('SELECT is_builtin FROM visual_style_presets WHERE id = ?').get(id) as { is_builtin: number } | undefined;
    if (!row) return false;
    if (row.is_builtin === 1) return false;
    this.db.prepare('DELETE FROM visual_style_presets WHERE id = ?').run(id);
    return true;
  }
}

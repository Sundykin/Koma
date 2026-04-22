import type Database from 'better-sqlite3';
import type { IPromptTemplateRepository, PromptTemplateRow } from './interfaces';
import { BUILTIN_PROMPT_TEMPLATES } from '../configSeed';

export class SqlitePromptTemplateRepository implements IPromptTemplateRepository {
  constructor(private db: Database.Database) {}

  list(): PromptTemplateRow[] {
    return this.db.prepare(
      'SELECT * FROM prompt_templates ORDER BY is_builtin DESC, type, updated_at DESC'
    ).all() as PromptTemplateRow[];
  }

  listByType(type: string): PromptTemplateRow[] {
    return this.db.prepare(
      'SELECT * FROM prompt_templates WHERE type = ? ORDER BY is_builtin DESC, updated_at DESC'
    ).all(type) as PromptTemplateRow[];
  }

  getById(id: string): PromptTemplateRow | undefined {
    return this.db.prepare('SELECT * FROM prompt_templates WHERE id = ?').get(id) as PromptTemplateRow | undefined;
  }

  upsert(row: PromptTemplateRow): void {
    const existing = this.db.prepare('SELECT is_builtin FROM prompt_templates WHERE id = ?').get(row.id) as { is_builtin: number } | undefined;
    const isBuiltin = existing ? existing.is_builtin : (row.is_builtin ?? 0);
    // 若是已存在的内置模板被编辑，自动打 user_modified_at
    const userModifiedAt = isBuiltin && existing
      ? (row.user_modified_at ?? Date.now())
      : (row.user_modified_at ?? null);

    this.db.prepare(`
      INSERT INTO prompt_templates
        (id, type, name, description, template, variables_json, is_builtin, user_modified_at, created_at, updated_at)
      VALUES
        (@id, @type, @name, @description, @template, @variables_json, @is_builtin, @user_modified_at, @created_at, @updated_at)
      ON CONFLICT(id) DO UPDATE SET
        type = excluded.type,
        name = excluded.name,
        description = excluded.description,
        template = excluded.template,
        variables_json = excluded.variables_json,
        user_modified_at = excluded.user_modified_at,
        updated_at = excluded.updated_at
    `).run({
      id: row.id,
      type: row.type,
      name: row.name,
      description: row.description ?? null,
      template: row.template,
      variables_json: row.variables_json ?? null,
      is_builtin: isBuiltin,
      user_modified_at: userModifiedAt,
      created_at: row.created_at,
      updated_at: row.updated_at,
    });
  }

  reset(id: string): boolean {
    const row = this.db.prepare('SELECT is_builtin FROM prompt_templates WHERE id = ?').get(id) as { is_builtin: number } | undefined;
    if (!row || row.is_builtin !== 1) return false;

    const builtin = BUILTIN_PROMPT_TEMPLATES.find((t) => t.id === id);
    if (!builtin) return false;

    this.db.prepare(`
      UPDATE prompt_templates SET
        type = ?,
        name = ?,
        description = ?,
        template = ?,
        variables_json = ?,
        user_modified_at = NULL,
        updated_at = ?
      WHERE id = ?
    `).run(
      builtin.type,
      builtin.name,
      builtin.description ?? null,
      builtin.template,
      JSON.stringify(builtin.variables ?? []),
      Date.now(),
      id,
    );
    return true;
  }

  delete(id: string): void {
    // 仅允许删除自定义模板；内置模板不物理删除
    const row = this.db.prepare('SELECT is_builtin FROM prompt_templates WHERE id = ?').get(id) as { is_builtin: number } | undefined;
    if (!row) return;
    if (row.is_builtin === 1) {
      throw new Error(`Cannot delete builtin template: ${id}`);
    }
    this.db.prepare('DELETE FROM prompt_templates WHERE id = ?').run(id);
  }
}

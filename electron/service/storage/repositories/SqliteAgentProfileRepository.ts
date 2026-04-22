import type Database from 'better-sqlite3';
import type { AgentProfileRow, IAgentProfileRepository } from './interfaces';

export class SqliteAgentProfileRepository implements IAgentProfileRepository {
  constructor(private db: Database.Database) {}

  list(): AgentProfileRow[] {
    return this.db.prepare(
      'SELECT * FROM agent_profiles ORDER BY is_builtin DESC, updated_at DESC'
    ).all() as AgentProfileRow[];
  }

  getById(id: string): AgentProfileRow | undefined {
    return this.db.prepare('SELECT * FROM agent_profiles WHERE id = ?').get(id) as AgentProfileRow | undefined;
  }

  upsert(row: AgentProfileRow): void {
    const existing = this.db.prepare('SELECT is_builtin FROM agent_profiles WHERE id = ?').get(row.id) as { is_builtin: number } | undefined;
    const isBuiltin = existing ? existing.is_builtin : (row.is_builtin ?? 0);

    this.db.prepare(`
      INSERT INTO agent_profiles
        (id, name, description, system_prompt, tools_json, channel_config_id, is_builtin, created_at, updated_at)
      VALUES
        (@id, @name, @description, @system_prompt, @tools_json, @channel_config_id, @is_builtin, @created_at, @updated_at)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        description = excluded.description,
        system_prompt = excluded.system_prompt,
        tools_json = excluded.tools_json,
        channel_config_id = excluded.channel_config_id,
        updated_at = excluded.updated_at
    `).run({
      id: row.id,
      name: row.name,
      description: row.description ?? null,
      system_prompt: row.system_prompt ?? null,
      tools_json: row.tools_json ?? null,
      channel_config_id: row.channel_config_id ?? null,
      is_builtin: isBuiltin,
      created_at: row.created_at,
      updated_at: row.updated_at,
    });
  }

  delete(id: string): void {
    const row = this.db.prepare('SELECT is_builtin FROM agent_profiles WHERE id = ?').get(id) as { is_builtin: number } | undefined;
    if (!row) return;
    if (row.is_builtin === 1) {
      throw new Error(`Cannot delete builtin agent profile: ${id}`);
    }
    this.db.prepare('DELETE FROM agent_profiles WHERE id = ?').run(id);
  }
}

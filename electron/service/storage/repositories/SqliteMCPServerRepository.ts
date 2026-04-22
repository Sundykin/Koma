import type Database from 'better-sqlite3';
import type { IMCPServerRepository, MCPServerRow } from './interfaces';
import { encryptField, decryptField, isEncrypted } from '../fieldCrypto';

export class SqliteMCPServerRepository implements IMCPServerRepository {
  constructor(
    private db: Database.Database,
    private onDecryptError?: (err: unknown, id: string) => void,
  ) {}

  private decryptRow(row: MCPServerRow): MCPServerRow {
    if (!row.auth_token) return row;
    const plain = decryptField(row.auth_token, (err) => this.onDecryptError?.(err, row.id));
    return { ...row, auth_token: plain };
  }

  list(): MCPServerRow[] {
    const rows = this.db.prepare(
      'SELECT * FROM mcp_servers ORDER BY updated_at DESC'
    ).all() as MCPServerRow[];
    return rows.map((r) => this.decryptRow(r));
  }

  getById(id: string): MCPServerRow | undefined {
    const row = this.db.prepare('SELECT * FROM mcp_servers WHERE id = ?').get(id) as MCPServerRow | undefined;
    return row ? this.decryptRow(row) : undefined;
  }

  upsert(row: MCPServerRow): void {
    const authToken = row.auth_token && !isEncrypted(row.auth_token)
      ? encryptField(row.auth_token)
      : (row.auth_token ?? '');

    this.db.prepare(`
      INSERT INTO mcp_servers
        (id, name, transport, command, args_json, env_json, url, auth_token, enabled, created_at, updated_at)
      VALUES
        (@id, @name, @transport, @command, @args_json, @env_json, @url, @auth_token, @enabled, @created_at, @updated_at)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        transport = excluded.transport,
        command = excluded.command,
        args_json = excluded.args_json,
        env_json = excluded.env_json,
        url = excluded.url,
        auth_token = excluded.auth_token,
        enabled = excluded.enabled,
        updated_at = excluded.updated_at
    `).run({
      id: row.id,
      name: row.name,
      transport: row.transport,
      command: row.command ?? null,
      args_json: row.args_json ?? null,
      env_json: row.env_json ?? null,
      url: row.url ?? null,
      auth_token: authToken || null,
      enabled: row.enabled ?? 1,
      created_at: row.created_at,
      updated_at: row.updated_at,
    });
  }

  delete(id: string): void {
    this.db.prepare('DELETE FROM mcp_servers WHERE id = ?').run(id);
  }
}

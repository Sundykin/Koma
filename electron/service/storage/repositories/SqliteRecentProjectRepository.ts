import type Database from 'better-sqlite3';
import type { IRecentProjectRepository, RecentProjectRow } from './interfaces';

export class SqliteRecentProjectRepository implements IRecentProjectRepository {
  constructor(private db: Database.Database) {}

  list(limit?: number): RecentProjectRow[] {
    if (typeof limit === 'number' && limit > 0) {
      return this.db.prepare(
        'SELECT * FROM recent_projects ORDER BY pinned DESC, last_opened_at DESC LIMIT ?'
      ).all(limit) as RecentProjectRow[];
    }
    return this.db.prepare(
      'SELECT * FROM recent_projects ORDER BY pinned DESC, last_opened_at DESC'
    ).all() as RecentProjectRow[];
  }

  touch(projectId: string): void {
    const now = Date.now();
    this.db.prepare(`
      INSERT INTO recent_projects (project_id, last_opened_at, pinned)
      VALUES (?, ?, 0)
      ON CONFLICT(project_id) DO UPDATE SET last_opened_at = excluded.last_opened_at
    `).run(projectId, now);
  }

  remove(projectId: string): void {
    this.db.prepare('DELETE FROM recent_projects WHERE project_id = ?').run(projectId);
  }

  setPinned(projectId: string, pinned: boolean): void {
    this.db.prepare(
      'UPDATE recent_projects SET pinned = ? WHERE project_id = ?'
    ).run(pinned ? 1 : 0, projectId);
  }
}

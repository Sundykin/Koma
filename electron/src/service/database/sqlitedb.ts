/**
 * SQLite 数据存储服务
 * 提供 Provider 实例和项目数据的 SQLite 持久化
 */

import { BasedbService } from './basedb';

class SqlitedbService extends BasedbService {
  constructor() {
    super({ dbname: 'koma.db' });
  }

  /** 初始化所有表 */
  init(): void {
    this._init();

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
  }

  /** 获取数据目录 */
  async getDataDir(): Promise<string> {
    return this.getDbDir();
  }

  /** 设置自定义数据目录 */
  async setCustomDataDir(dir: string): Promise<void> {
    if (!dir || dir.length === 0) return;
    this.changeDataDir(dir);
    this.init();
  }
}

SqlitedbService.toString = () => '[class SqlitedbService]';
const sqlitedbService = new SqlitedbService();

export { SqlitedbService, sqlitedbService };

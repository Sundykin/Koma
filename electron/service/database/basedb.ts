/**
 * SQLite 数据库基类
 * 基于 better-sqlite3 的数据库服务基类
 */

import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';
import { app } from 'electron';

class BasedbService {
  protected dbname: string;
  protected db!: Database.Database;
  protected dbDir: string;

  constructor(options: { dbname: string }) {
    this.dbname = options.dbname;
    this.dbDir = path.join(app.getPath('userData'), 'db');
  }

  /** 初始化数据库连接 */
  protected _init(): void {
    if (!fs.existsSync(this.dbDir)) {
      fs.mkdirSync(this.dbDir, { recursive: true });
    }

    const dbFile = path.join(this.dbDir, this.dbname);
    this.db = new Database(dbFile, {
      timeout: 6000,
    });

    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
  }

  /** 获取数据库实例 */
  getDb(): Database.Database {
    return this.db;
  }

  /** 获取数据库目录 */
  getDbDir(): string {
    return this.dbDir;
  }

  /** 切换数据目录 */
  changeDataDir(dir: string): void {
    if (this.db) {
      this.db.close();
    }
    this.dbDir = dir;
    this._init();
  }

  /** 关闭数据库 */
  close(): void {
    if (this.db) {
      this.db.close();
    }
  }
}

BasedbService.toString = () => '[class BasedbService]';

export { BasedbService };

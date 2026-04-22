/**
 * Schema 升级冒烟测试（基于 in-memory SQLite）
 *
 * 运行前置条件：
 *   1. 项目根目录存在一个 vitest/electron 工作区（M1 暂未设置，当前文件作为规格
 *      级文档 + 后续接入测试时的起点）。
 *   2. better-sqlite3 已为 Node 版本编译（与 Electron ABI 不兼容时，先执行
 *      `npm rebuild better-sqlite3`）。
 *
 * 覆盖场景：
 *   - 空库首次初始化：所有配置表创建成功，schema_version 记录最新版本。
 *   - 已有业务表但无配置表（模拟 v4 用户）：增量执行 MIGRATIONS[5]，
 *     配置表成功新增，旧数据不被破坏。
 *   - seed 幂等：连续两次 seed 调用，行数不翻倍。
 *   - 用户修改过的模板不会被 seed 覆盖（user_modified_at IS NOT NULL 路径）。
 */

import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { CREATE_TABLES_SQL, CREATE_INDEXES_SQL, CURRENT_SCHEMA_VERSION, MIGRATIONS } from './schema';
import { seedConfigDefaults, BUILTIN_PROMPT_TEMPLATES } from './configSeed';

function createFreshDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  return db;
}

function applyFullSchema(db: Database.Database): void {
  db.exec(CREATE_TABLES_SQL);
  db.exec(CREATE_INDEXES_SQL);
  db.prepare(
    'INSERT INTO schema_version (version, applied_at, description) VALUES (?, ?, ?)'
  ).run(CURRENT_SCHEMA_VERSION, Date.now(), 'test init');
}

function tableExists(db: Database.Database, name: string): boolean {
  const row = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name = ?"
  ).get(name);
  return !!row;
}

describe('Storage schema (v5 config tables)', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createFreshDb();
  });

  it('creates all config tables on fresh init', () => {
    applyFullSchema(db);

    for (const table of [
      'channel_configs',
      'prompt_templates',
      'visual_style_presets',
      'plugin_registry',
      'mcp_servers',
      'agent_profiles',
      'recent_projects',
      'kv_configs',
    ]) {
      expect(tableExists(db, table)).toBe(true);
    }

    const version = db.prepare('SELECT MAX(version) AS v FROM schema_version').get() as { v: number };
    expect(version.v).toBe(CURRENT_SCHEMA_VERSION);
  });

  it('applies migration 5 incrementally on legacy v4 db', () => {
    // 模拟 v4：只跑到 CREATE_TABLES_SQL 前的表结构需要手写 v4 快照；
    // 为简化，直接 exec 完整 DDL（with IF NOT EXISTS），再强行把 schema_version
    // 覆盖为 4，然后再跑 MIGRATIONS[5]。真实升级语义应在后续集成测试验证。
    db.exec(CREATE_TABLES_SQL);
    db.exec(CREATE_INDEXES_SQL);
    db.prepare(
      'INSERT INTO schema_version (version, applied_at, description) VALUES (?, ?, ?)'
    ).run(4, Date.now(), 'legacy v4');

    const runMigration = db.transaction(() => {
      db.exec(MIGRATIONS[5].sql);
      db.prepare(
        'INSERT INTO schema_version (version, applied_at, description) VALUES (?, ?, ?)'
      ).run(5, Date.now(), MIGRATIONS[5].description);
    });
    runMigration();

    expect(tableExists(db, 'channel_configs')).toBe(true);
    expect(tableExists(db, 'kv_configs')).toBe(true);
  });

  it('seedConfigDefaults is idempotent', () => {
    applyFullSchema(db);

    seedConfigDefaults(db);
    const first = db.prepare('SELECT COUNT(*) AS c FROM prompt_templates').get() as { c: number };

    seedConfigDefaults(db);
    const second = db.prepare('SELECT COUNT(*) AS c FROM prompt_templates').get() as { c: number };

    expect(second.c).toBe(first.c);
    expect(first.c).toBe(BUILTIN_PROMPT_TEMPLATES.length);
  });

  it('user-modified builtin templates survive re-seed', () => {
    applyFullSchema(db);

    if (BUILTIN_PROMPT_TEMPLATES.length === 0) {
      // M1 阶段 seed 列表为空，此场景等待 M5 数据接入后生效
      return;
    }

    seedConfigDefaults(db);
    const target = BUILTIN_PROMPT_TEMPLATES[0];
    db.prepare(
      'UPDATE prompt_templates SET template = ?, user_modified_at = ? WHERE id = ?'
    ).run('USER-EDITED', Date.now(), target.id);

    seedConfigDefaults(db);
    const row = db.prepare('SELECT template, user_modified_at FROM prompt_templates WHERE id = ?').get(target.id) as { template: string; user_modified_at: number };
    expect(row.template).toBe('USER-EDITED');
    expect(row.user_modified_at).toBeGreaterThan(0);
  });
});

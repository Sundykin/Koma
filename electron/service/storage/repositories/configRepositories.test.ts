/**
 * 配置域 Repository 单元测试（in-memory SQLite）
 *
 * 运行前置条件：vitest 运行器 + better-sqlite3 已为 Node 版本编译。
 * （当前 electron 工作区未接入 vitest；文件作为测试规格 + 接入测试时起点。）
 *
 * 测试注意：
 *   - SqliteChannelConfigRepository / SqliteMCPServerRepository 依赖 fieldCrypto，
 *     fieldCrypto 依赖 `electron.app.getPath`，vitest 下需 mock。
 *   - 其余 repo 不依赖 electron，可直接跑。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { CREATE_TABLES_SQL, CREATE_INDEXES_SQL } from '../schema';
import { SqliteChannelConfigRepository } from './SqliteChannelConfigRepository';
import { SqlitePromptTemplateRepository } from './SqlitePromptTemplateRepository';
import { SqliteVisualStylePresetRepository } from './SqliteVisualStylePresetRepository';
import { SqlitePluginRegistryRepository } from './SqlitePluginRegistryRepository';
import { SqliteMCPServerRepository } from './SqliteMCPServerRepository';
import { SqliteAgentProfileRepository } from './SqliteAgentProfileRepository';
import { SqliteRecentProjectRepository } from './SqliteRecentProjectRepository';
import { SqliteKvConfigRepository } from './SqliteKvConfigRepository';

vi.mock('electron', () => ({
  app: { getPath: () => '/tmp/koma-test-userdata' },
}));

function createDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec(CREATE_TABLES_SQL);
  db.exec(CREATE_INDEXES_SQL);
  return db;
}

describe('SqliteChannelConfigRepository', () => {
  let db: Database.Database;
  let repo: SqliteChannelConfigRepository;

  beforeEach(() => {
    db = createDb();
    repo = new SqliteChannelConfigRepository(db);
  });

  it('upsert + getById round-trips api_key as plaintext', () => {
    const now = Date.now();
    repo.upsert({
      id: 'ch1', kind: 'llm', name: 'DeepSeek', provider: 'openai-compatible',
      base_url: 'https://api.deepseek.com/v1', api_key: 'sk-secret',
      model_name: 'deepseek-chat', is_default: 0,
      created_at: now, updated_at: now,
    });

    const got = repo.getById('ch1');
    expect(got?.api_key).toBe('sk-secret');

    // 数据库原始行应已加密
    const raw = db.prepare('SELECT api_key FROM channel_configs WHERE id = ?').get('ch1') as { api_key: string };
    expect(raw.api_key.startsWith('encrypted:')).toBe(true);
  });

  it('setDefault zeros other rows in same kind', () => {
    const now = Date.now();
    for (const id of ['a', 'b', 'c']) {
      repo.upsert({
        id, kind: 'llm', name: id, provider: 'p', api_key: 'k',
        is_default: 0, created_at: now, updated_at: now,
      });
    }
    repo.setDefault('llm', 'b');
    const list = repo.list('llm');
    const defaults = list.filter((r) => r.is_default === 1).map((r) => r.id);
    expect(defaults).toEqual(['b']);
  });
});

describe('SqlitePromptTemplateRepository', () => {
  let db: Database.Database;
  let repo: SqlitePromptTemplateRepository;

  beforeEach(() => {
    db = createDb();
    repo = new SqlitePromptTemplateRepository(db);
  });

  it('upsert custom template, retrieve by type', () => {
    const now = Date.now();
    repo.upsert({
      id: 't1', type: 'tti_shot_image', name: 'Custom Shot', template: '...', is_builtin: 0,
      created_at: now, updated_at: now,
    });
    const list = repo.listByType('tti_shot_image');
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe('t1');
  });

  it('delete throws for builtin', () => {
    const now = Date.now();
    db.prepare(`INSERT INTO prompt_templates (id, type, name, template, is_builtin, created_at, updated_at)
                VALUES ('b1', 'x', 'n', 't', 1, ?, ?)`).run(now, now);
    expect(() => repo.delete('b1')).toThrow();
  });
});

describe('SqliteVisualStylePresetRepository', () => {
  let db: Database.Database;
  let repo: SqliteVisualStylePresetRepository;

  beforeEach(() => {
    db = createDb();
    repo = new SqliteVisualStylePresetRepository(db);
  });

  it('refuses to delete builtin presets', () => {
    const now = Date.now();
    db.prepare(`INSERT INTO visual_style_presets (id, name, is_builtin, sort_order, created_at, updated_at)
                VALUES ('b1', 'Anime', 1, 0, ?, ?)`).run(now, now);
    expect(repo.delete('b1')).toBe(false);
    expect(repo.getById('b1')).toBeDefined();
  });
});

describe('SqlitePluginRegistryRepository', () => {
  let db: Database.Database;
  let repo: SqlitePluginRegistryRepository;

  beforeEach(() => {
    db = createDb();
    repo = new SqlitePluginRegistryRepository(db);
  });

  it('setEnabled toggles', () => {
    const now = Date.now();
    repo.upsert({
      id: 'p1', name: 'n', version: '1.0.0', source: 'local', enabled: 1,
      manifest_json: '{}', installed_at: now, updated_at: now,
    });
    repo.setEnabled('p1', false);
    expect(repo.getById('p1')?.enabled).toBe(0);
    repo.setEnabled('p1', true);
    expect(repo.getById('p1')?.enabled).toBe(1);
  });
});

describe('SqliteMCPServerRepository', () => {
  let db: Database.Database;
  let repo: SqliteMCPServerRepository;

  beforeEach(() => {
    db = createDb();
    repo = new SqliteMCPServerRepository(db);
  });

  it('encrypts auth_token in db, returns plaintext from repo', () => {
    const now = Date.now();
    repo.upsert({
      id: 's1', name: 'n', transport: 'stdio', auth_token: 'tok', enabled: 1,
      created_at: now, updated_at: now,
    });
    expect(repo.getById('s1')?.auth_token).toBe('tok');
    const raw = db.prepare('SELECT auth_token FROM mcp_servers WHERE id = ?').get('s1') as { auth_token: string };
    expect(raw.auth_token.startsWith('encrypted:')).toBe(true);
  });
});

describe('SqliteAgentProfileRepository', () => {
  let db: Database.Database;
  let repo: SqliteAgentProfileRepository;

  beforeEach(() => {
    db = createDb();
    repo = new SqliteAgentProfileRepository(db);
  });

  it('upsert + list', () => {
    const now = Date.now();
    repo.upsert({
      id: 'a1', name: 'Agent A', is_builtin: 0, created_at: now, updated_at: now,
    });
    expect(repo.list()).toHaveLength(1);
  });
});

describe('SqliteRecentProjectRepository', () => {
  let db: Database.Database;
  let repo: SqliteRecentProjectRepository;

  beforeEach(() => {
    db = createDb();
    // 需要 projects 外键
    const now = Date.now();
    db.prepare(`INSERT INTO projects (id, title, genre, mode, created_at, updated_at)
                VALUES ('proj1', 't', 'g', 'drama', ?, ?)`).run(now, now);
    repo = new SqliteRecentProjectRepository(db);
  });

  it('touch updates last_opened_at', () => {
    repo.touch('proj1');
    const first = repo.list()[0];
    expect(first.project_id).toBe('proj1');
  });

  it('cascades on project delete', () => {
    repo.touch('proj1');
    db.prepare('DELETE FROM projects WHERE id = ?').run('proj1');
    expect(repo.list()).toHaveLength(0);
  });
});

describe('SqliteKvConfigRepository', () => {
  let db: Database.Database;
  let repo: SqliteKvConfigRepository;

  beforeEach(() => {
    db = createDb();
    repo = new SqliteKvConfigRepository(db);
  });

  it('round-trips JSON value', () => {
    repo.set('storage', 'rootPath', '/Users/x/.koma');
    expect(repo.get<string>('storage', 'rootPath')).toBe('/Users/x/.koma');

    repo.set('media.defaults', 'itv.duration', 5);
    expect(repo.get<number>('media.defaults', 'itv.duration')).toBe(5);
  });

  it('listNamespace filters by namespace', () => {
    repo.set('a', 'k1', 1);
    repo.set('a', 'k2', 2);
    repo.set('b', 'k1', 3);
    const a = repo.listNamespace<number>('a');
    expect(a).toHaveLength(2);
    expect(a.map((r) => r.key).sort()).toEqual(['k1', 'k2']);
  });
});

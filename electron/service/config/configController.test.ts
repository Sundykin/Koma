/**
 * ConfigController 最小集成测试
 *
 * 目的：验证 controller → ConfigService → Repository 链路无语法/类型问题，
 *      每个域有 list 路径可回，bootstrap 返回完整快照结构。
 *
 * 运行前置条件：vitest 运行器 + better-sqlite3 已为 Node 版本编译。
 * 当前 electron 工作区未接入 vitest 运行器；此文件作为接入后的入口测试。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { CREATE_TABLES_SQL, CREATE_INDEXES_SQL } from '../storage/schema';

vi.mock('electron', () => ({
  app: { getPath: () => '/tmp/koma-test-userdata' },
  BrowserWindow: { getAllWindows: () => [] },
}));

vi.mock('ee-core/log', () => ({
  logger: {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
  },
}));

describe('ConfigController <-> ConfigService smoke', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    db.exec(CREATE_TABLES_SQL);
    db.exec(CREATE_INDEXES_SQL);

    // 模拟 baseDB.getDb 行为
    vi.doMock('../storage', async () => {
      const actual = await vi.importActual<typeof import('../storage')>('../storage');
      return {
        ...actual,
        baseDB: {
          getDb: () => db,
          transaction: <T>(fn: () => T) => db.transaction(fn)(),
          init: () => {},
          close: () => {},
        },
      };
    });

    vi.doMock('../index', async () => {
      const { configService, ConfigService } = await import('.');
      configService.init();
      return {
        ensureServicesReady: async () => {},
        services: { config: configService },
        ConfigService,
        configService,
      };
    });
  });

  it('bootstrap returns empty snapshot with all domain keys', async () => {
    const Controller = (await import('../../controller/config')).default as unknown as new () => {
      bootstrap(): Promise<unknown>;
    };
    const controller = new Controller();
    const snap = await controller.bootstrap() as Record<string, unknown>;

    expect(snap).toHaveProperty('channels');
    expect(snap).toHaveProperty('prompts');
    expect(snap).toHaveProperty('styles');
    expect(snap).toHaveProperty('plugins');
    expect(snap).toHaveProperty('mcp');
    expect(snap).toHaveProperty('agents');
    expect(snap).toHaveProperty('recent');
    expect(snap).toHaveProperty('kv');
  });

  it('channel upsert + list round-trips via controller', async () => {
    const Controller = (await import('../../controller/config')).default as unknown as new () => {
      channelUpsert(args: { row: any }): Promise<{ id: string }>;
      channelList(args: { kind: 'llm' | 'tti' | 'itv' | 'tts' }): Promise<any[]>;
    };
    const controller = new Controller();
    const now = Date.now();
    await controller.channelUpsert({
      row: {
        id: 'c1', kind: 'llm', name: 'Test', provider: 'openai', api_key: 'sk', is_default: 0,
        created_at: now, updated_at: now,
      },
    });
    const list = await controller.channelList({ kind: 'llm' });
    expect(list).toHaveLength(1);
    expect(list[0].api_key).toBe('sk');
  });
});

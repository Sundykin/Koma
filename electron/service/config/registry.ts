/**
 * 配置注册中心
 * 管理所有配置模块的生命周期
 */
import type {
  ConfigModule,
  ConfigRecord,
  ConfigSummary,
  IConfigStore,
  ModuleId,
} from './types';
import { JsonStore } from './stores/jsonStore';
import { migrationManager } from './migrations/migrationManager';

export class ConfigRegistry {
  private modules: Map<ModuleId, ConfigModule<any>> = new Map();
  private jsonStore: JsonStore | null = null;
  private initialized = false;

  async init(dataDir: string): Promise<void> {
    this.jsonStore = new JsonStore(dataDir);
    await this.jsonStore.healthcheck();
    this.initialized = true;
    console.log('[ConfigRegistry] Initialized:', dataDir);
  }

  private getStore(): IConfigStore {
    if (!this.initialized || !this.jsonStore) {
      throw new Error('ConfigRegistry not initialized');
    }
    return this.jsonStore;
  }

  /** 注册配置模块 */
  register<T>(module: ConfigModule<T>): void {
    if (this.modules.has(module.id)) {
      console.warn(`[ConfigRegistry] Module ${module.id} already registered`);
      return;
    }
    this.modules.set(module.id, module);
    console.log(`[ConfigRegistry] Registered: ${module.id} v${module.version}`);
  }

  /** 获取配置 */
  async get<T>(moduleId: ModuleId): Promise<T> {
    const module = this.modules.get(moduleId) as ConfigModule<T> | undefined;
    if (!module) throw new Error(`Module ${moduleId} not registered`);

    const store = this.getStore();
    let record = await store.load<T>(moduleId);

    if (!record) {
      record = {
        moduleId,
        version: module.version,
        payload: module.defaults,
        updatedAt: new Date().toISOString(),
      };
      await store.save(record);
    } else if (migrationManager.needsMigration(module, record)) {
      record = await migrationManager.migrate(module, record);
      await store.save(record);
    }

    return record.payload;
  }

  /** 设置配置 */
  async set<T>(moduleId: ModuleId, payload: Partial<T>): Promise<T> {
    const module = this.modules.get(moduleId) as ConfigModule<T> | undefined;
    if (!module) throw new Error(`Module ${moduleId} not registered`);

    const current = await this.get<T>(moduleId);
    const merged = { ...current, ...payload };
    const validated = module.schema.parse(merged) as T;

    const store = this.getStore();
    const record: ConfigRecord<T> = {
      moduleId,
      version: module.version,
      payload: validated,
      updatedAt: new Date().toISOString(),
    };
    await store.save(record);

    if (module.onChange) {
      module.onChange(validated, current);
    }

    return validated;
  }

  /** 重置配置 */
  async reset(moduleId: ModuleId): Promise<void> {
    const module = this.modules.get(moduleId);
    if (!module) throw new Error(`Module ${moduleId} not registered`);

    const store = this.getStore();
    await store.save({
      moduleId,
      version: module.version,
      payload: module.defaults,
      updatedAt: new Date().toISOString(),
    });
  }

  /** 列出所有配置 */
  async list(): Promise<ConfigSummary[]> {
    return this.jsonStore ? this.jsonStore.list() : [];
  }

  /** 获取已注册模块 ID */
  getRegisteredModules(): ModuleId[] {
    return Array.from(this.modules.keys());
  }

  /** 获取模块定义 */
  getModule<T>(moduleId: ModuleId): ConfigModule<T> | undefined {
    return this.modules.get(moduleId) as ConfigModule<T> | undefined;
  }
}

export const configRegistry = new ConfigRegistry();

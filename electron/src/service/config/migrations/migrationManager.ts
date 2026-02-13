/**
 * 版本迁移管理器
 */
import type { ConfigModule, ConfigRecord, MigrationStep } from '../types';

class MigrationManager {
  /** 检查是否需要迁移 */
  needsMigration<T>(module: ConfigModule<T>, record: ConfigRecord<T>): boolean {
    return record.version < module.version;
  }

  /** 执行迁移 */
  async migrate<T>(module: ConfigModule<T>, record: ConfigRecord<T>): Promise<ConfigRecord<T>> {
    if (!module.migrations?.length) {
      // 无迁移步骤，直接更新版本号并用 schema 验证
      return {
        ...record,
        version: module.version,
        payload: module.schema.parse(record.payload) as T,
        updatedAt: new Date().toISOString(),
      };
    }

    let payload = record.payload;
    let currentVersion = record.version;

    // 按版本顺序执行迁移
    const sorted = [...module.migrations].sort((a, b) => a.from - b.from);
    for (const step of sorted) {
      if (step.from === currentVersion) {
        payload = step.migrate(payload);
        currentVersion = step.to;
      }
    }

    return {
      moduleId: record.moduleId,
      version: module.version,
      payload: module.schema.parse(payload) as T,
      updatedAt: new Date().toISOString(),
    };
  }
}

export const migrationManager = new MigrationManager();

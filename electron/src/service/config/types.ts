/**
 * 配置管理系统类型定义
 */
import { z } from 'zod';

export type ModuleId = string;

/** 配置记录 */
export interface ConfigRecord<T> {
  moduleId: ModuleId;
  version: number;
  payload: T;
  updatedAt: string;
}

/** 配置摘要 */
export interface ConfigSummary {
  moduleId: ModuleId;
  version: number;
  updatedAt: string;
}

/** 持久化存储抽象接口 */
export interface IConfigStore {
  load<T>(moduleId: ModuleId): Promise<ConfigRecord<T> | null>;
  save<T>(record: ConfigRecord<T>): Promise<void>;
  delete(moduleId: ModuleId): Promise<void>;
  list(): Promise<ConfigSummary[]>;
  healthcheck(): Promise<void>;
}

/** 迁移步骤 */
export interface MigrationStep<T> {
  from: number;
  to: number;
  migrate: (input: T) => T;
}

/** 配置模块定义 */
export interface ConfigModule<T> {
  id: ModuleId;
  version: number;
  schema: z.ZodType<T>;
  defaults: T;
  store: 'json';
  migrations?: MigrationStep<T>[];
  onChange?: (next: T, prev: T | null) => void;
}

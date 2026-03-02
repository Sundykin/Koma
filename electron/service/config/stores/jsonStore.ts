/**
 * JSON 文件存储引擎
 * 每个模块一个 JSON 文件，存储在 dataDir 下
 */
import * as fs from 'fs/promises';
import * as path from 'path';
import type { ConfigRecord, ConfigSummary, IConfigStore, ModuleId } from '../types';

export class JsonStore implements IConfigStore {
  private dataDir: string;

  constructor(dataDir: string) {
    this.dataDir = dataDir;
  }

  private getFilePath(moduleId: ModuleId): string {
    return path.join(this.dataDir, `${moduleId}.json`);
  }

  async load<T>(moduleId: ModuleId): Promise<ConfigRecord<T> | null> {
    try {
      const content = await fs.readFile(this.getFilePath(moduleId), 'utf-8');
      return JSON.parse(content) as ConfigRecord<T>;
    } catch {
      return null;
    }
  }

  async save<T>(record: ConfigRecord<T>): Promise<void> {
    await fs.mkdir(this.dataDir, { recursive: true });
    await fs.writeFile(
      this.getFilePath(record.moduleId),
      JSON.stringify(record, null, 2),
      'utf-8'
    );
  }

  async delete(moduleId: ModuleId): Promise<void> {
    try {
      await fs.unlink(this.getFilePath(moduleId));
    } catch {
      // 文件不存在忽略
    }
  }

  async list(): Promise<ConfigSummary[]> {
    const summaries: ConfigSummary[] = [];
    try {
      const files = await fs.readdir(this.dataDir);
      for (const file of files) {
        if (!file.endsWith('.json')) continue;
        try {
          const content = await fs.readFile(path.join(this.dataDir, file), 'utf-8');
          const record = JSON.parse(content);
          summaries.push({
            moduleId: record.moduleId,
            version: record.version,
            updatedAt: record.updatedAt,
          });
        } catch {
          // 跳过无效文件
        }
      }
    } catch {
      // 目录不存在
    }
    return summaries;
  }

  async healthcheck(): Promise<void> {
    await fs.mkdir(this.dataDir, { recursive: true });
  }
}

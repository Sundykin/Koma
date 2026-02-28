/**
 * 配置管理 Controller
 * 提供统一的配置 CRUD IPC 接口
 */
import * as fs from 'fs/promises';
import * as path from 'path';
import { configRegistry } from '../service/config';

export interface ConfigExportEnvelope<T = unknown> {
  moduleId: string;
  payload: T;
  version: number;
  exportedAt: string;
}

export const configController = {
  /** 获取配置 */
  async get(args: { moduleId: string }) {
    const payload = await configRegistry.get(args.moduleId);
    const module = configRegistry.getModule(args.moduleId);
    return {
      moduleId: args.moduleId,
      payload,
      version: module?.version ?? 0,
    };
  },

  /** 设置配置 */
  async set(args: { moduleId: string; payload: any }) {
    const result = await configRegistry.set(args.moduleId, args.payload);
    const module = configRegistry.getModule(args.moduleId);
    return {
      moduleId: args.moduleId,
      payload: result,
      version: module?.version ?? 0,
    };
  },

  /** 重置配置 */
  async reset(args: { moduleId: string }) {
    await configRegistry.reset(args.moduleId);
    return { ok: true };
  },

  /** 列出所有配置 */
  async list() {
    return configRegistry.list();
  },

  /** 导出配置（可选写入文件） */
  async export(args: { moduleId: string; filePath?: string }) {
    const payload = await configRegistry.get(args.moduleId);
    const module = configRegistry.getModule(args.moduleId);
    const data: ConfigExportEnvelope = {
      moduleId: args.moduleId,
      payload,
      version: module?.version ?? 0,
      exportedAt: new Date().toISOString(),
    };

    if (args.filePath) {
      await fs.mkdir(path.dirname(args.filePath), { recursive: true });
      await fs.writeFile(args.filePath, JSON.stringify(data, null, 2), 'utf-8');
    }

    return data;
  },

  /** 导入配置（支持直接 payload 或文件路径） */
  async import(args: { moduleId: string; payload?: unknown; filePath?: string }) {
    let inputPayload = args.payload;

    if (!inputPayload && args.filePath) {
      const content = await fs.readFile(args.filePath, 'utf-8');
      const parsed = JSON.parse(content) as Record<string, unknown>;
      inputPayload = (parsed?.payload ?? parsed) as unknown;
    }

    if (!inputPayload) {
      throw new Error('Import payload is required');
    }

    const payload = await configRegistry.set(args.moduleId, inputPayload as any);
    const module = configRegistry.getModule(args.moduleId);
    return {
      moduleId: args.moduleId,
      payload,
      version: module?.version ?? 0,
    };
  },
};


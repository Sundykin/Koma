/**
 * 配置管理 Controller
 * 提供统一的配置 CRUD IPC 接口
 */
import { configRegistry } from '../service/config';

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
};

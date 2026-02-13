/**
 * 配置桥接层
 * 前端通过此模块统一访问后端 ConfigRegistry
 * 替代前端直接读写 localStorage / JSON 文件的方式
 */

interface ConfigResult<T = any> {
  moduleId: string;
  payload: T;
  version: number;
}

function getAPI(): any {
  if (typeof window !== 'undefined' && (window as any).electronAPI?.config) {
    return (window as any).electronAPI.config;
  }
  return null;
}

/** 获取指定模块的配置 */
export async function configGet<T = any>(moduleId: string): Promise<T | null> {
  const api = getAPI();
  if (!api) return null;
  try {
    const result: ConfigResult<T> = await api.get(moduleId);
    return result.payload;
  } catch {
    return null;
  }
}

/** 设置指定模块的配置 */
export async function configSet<T = any>(
  moduleId: string,
  payload: T
): Promise<T | null> {
  const api = getAPI();
  if (!api) return null;
  try {
    const result: ConfigResult<T> = await api.set(moduleId, payload);
    return result.payload;
  } catch {
    return null;
  }
}

/** 重置指定模块为默认值 */
export async function configReset(moduleId: string): Promise<boolean> {
  const api = getAPI();
  if (!api) return false;
  try {
    await api.reset(moduleId);
    return true;
  } catch {
    return false;
  }
}

/** 列出所有已注册模块的配置摘要 */
export async function configList(): Promise<Record<string, any>> {
  const api = getAPI();
  if (!api) return {};
  try {
    return await api.list();
  } catch {
    return {};
  }
}

export const configBridge = {
  get: configGet,
  set: configSet,
  reset: configReset,
  list: configList,
};

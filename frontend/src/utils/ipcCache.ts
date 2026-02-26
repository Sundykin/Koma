/**
 * IPC 调用缓存与请求去重
 * - 只读调用缓存（TTL 5s）
 * - 相同路径的并发读取合并为一次
 */

interface CacheEntry {
  value: any;
  expireAt: number;
}

// 只读调用缓存
const cache = new Map<string, CacheEntry>();
const DEFAULT_TTL = 5000; // 5s

// 进行中的请求（用于去重）
const inflight = new Map<string, Promise<any>>();

// 可缓存的只读 IPC 通道
const CACHEABLE_CHANNELS = new Set([
  'config:get',
  'config:list',
  'plugin:list',
  'plugin:listActive',
  'plugin:listMCPTools',
  'plugin:listAgents',
  'app:getPath',
  'app:getVersion',
]);

function makeCacheKey(channel: string, args?: any): string {
  return `${channel}::${args ? JSON.stringify(args) : ''}`;
}

/**
 * 带缓存和去重的 IPC invoke 包装
 */
export function createCachedInvoke(
  rawInvoke: (channel: string, ...args: any[]) => Promise<any>
) {
  return async function cachedInvoke(channel: string, ...args: any[]): Promise<any> {
    // 非可缓存通道直接透传
    if (!CACHEABLE_CHANNELS.has(channel)) {
      return rawInvoke(channel, ...args);
    }

    const key = makeCacheKey(channel, args[0]);

    // 检查缓存
    const cached = cache.get(key);
    if (cached && cached.expireAt > Date.now()) {
      return cached.value;
    }

    // 检查是否有进行中的相同请求（去重）
    if (inflight.has(key)) {
      return inflight.get(key)!;
    }

    // 发起新请求
    const promise = rawInvoke(channel, ...args).then(result => {
      // 写入缓存
      cache.set(key, { value: result, expireAt: Date.now() + DEFAULT_TTL });
      inflight.delete(key);
      return result;
    }).catch(err => {
      inflight.delete(key);
      throw err;
    });

    inflight.set(key, promise);
    return promise;
  };
}

/**
 * 文件读取去重：相同路径的并发 readFile 合并为一次
 */
const fileReadInflight = new Map<string, Promise<any>>();

export function createDedupedFileRead(
  rawReadFile: (path: string) => Promise<any>
) {
  return async function dedupedReadFile(path: string): Promise<any> {
    if (fileReadInflight.has(path)) {
      return fileReadInflight.get(path)!;
    }

    const promise = rawReadFile(path).finally(() => {
      fileReadInflight.delete(path);
    });

    fileReadInflight.set(path, promise);
    return promise;
  };
}

/**
 * 清除所有缓存（配置变更时调用）
 */
export function clearIpcCache(): void {
  cache.clear();
}

/**
 * 使指定通道的缓存失效
 */
export function invalidateChannel(channel: string): void {
  for (const key of cache.keys()) {
    if (key.startsWith(`${channel}::`)) {
      cache.delete(key);
    }
  }
}

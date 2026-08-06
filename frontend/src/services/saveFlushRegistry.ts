/**
 * 保存冲刷注册表：窗口关闭/跳转前把所有防抖中的保存立即落盘。
 *
 * 背景：各处编辑器的保存都是防抖的（剧本 2s、剪辑时间线 1s、分镜队列），
 * 在防抖窗口内关闭窗口会丢失最后几秒的编辑。成熟剪辑/文档软件（Premiere、
 * 飞书）在 unload 时都会做 final flush —— 本模块提供统一的注册与触发点。
 *
 * 用法：拥有 flush 能力的保存方在挂载时 registerSaveFlush(flush)，
 * App 启动时 armUnloadFlush() 一次即可。
 */

type SaveFlush = () => Promise<unknown> | unknown;

const saveFlushes = new Set<SaveFlush>();

/** 注册一个保存冲刷函数，返回注销函数（组件卸载时调用） */
export function registerSaveFlush(flush: SaveFlush): () => void {
  saveFlushes.add(flush);
  return () => {
    saveFlushes.delete(flush);
  };
}

/** 立即执行所有已注册的冲刷；单个失败不影响其他（allSettled） */
export async function flushAllPendingSaves(): Promise<void> {
  await Promise.allSettled(
    Array.from(saveFlushes, flush => Promise.resolve().then(() => flush())),
  );
}

let unloadArmed = false;

/**
 * 挂接窗口卸载冲刷（幂等）。beforeunload + pagehide 双挂：
 * Electron 关窗场景 pagehide 更可靠，浏览器刷新走 beforeunload。
 * flush 是 fire-and-forget —— unload 阶段无法可靠等待异步完成，
 * 但 SQLite IPC 写入很快，绝大多数情况下能在进程退出前落盘。
 */
export function armUnloadFlush(): void {
  if (unloadArmed || typeof window === 'undefined') return;
  unloadArmed = true;
  const flush = () => {
    void flushAllPendingSaves();
  };
  window.addEventListener('beforeunload', flush);
  window.addEventListener('pagehide', flush);
}

/** 测试用：重置挂载状态 */
export function resetUnloadFlushForTest(): void {
  unloadArmed = false;
  saveFlushes.clear();
}

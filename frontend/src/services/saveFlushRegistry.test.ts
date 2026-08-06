import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  armUnloadFlush,
  flushAllPendingSaves,
  registerSaveFlush,
  resetUnloadFlushForTest,
} from './saveFlushRegistry';

describe('saveFlushRegistry', () => {
  beforeEach(() => {
    resetUnloadFlushForTest();
  });

  it('flushAllPendingSaves 执行所有已注册冲刷', async () => {
    const a = vi.fn();
    const b = vi.fn();
    registerSaveFlush(a);
    registerSaveFlush(b);
    await flushAllPendingSaves();
    expect(a).toHaveBeenCalledOnce();
    expect(b).toHaveBeenCalledOnce();
  });

  it('注销后不再执行', async () => {
    const a = vi.fn();
    const unregister = registerSaveFlush(a);
    unregister();
    await flushAllPendingSaves();
    expect(a).not.toHaveBeenCalled();
  });

  it('单个冲刷失败不影响其他（allSettled）', async () => {
    const bad = vi.fn().mockRejectedValue(new Error('save failed'));
    const good = vi.fn();
    registerSaveFlush(bad);
    registerSaveFlush(good);
    await expect(flushAllPendingSaves()).resolves.toBeUndefined();
    expect(good).toHaveBeenCalledOnce();
  });

  it('同步冲刷函数也能工作', async () => {
    const sync = vi.fn();
    registerSaveFlush(sync);
    await flushAllPendingSaves();
    expect(sync).toHaveBeenCalledOnce();
  });

  it('armUnloadFlush 幂等且触发 beforeunload/pagehide 冲刷', async () => {
    const flush = vi.fn();
    registerSaveFlush(flush);
    armUnloadFlush();
    armUnloadFlush(); // 第二次不应重复挂监听
    window.dispatchEvent(new Event('beforeunload'));
    window.dispatchEvent(new Event('pagehide'));
    // fire-and-forget：等一个微任务让 flush 跑完
    await new Promise(resolve => setTimeout(resolve, 0));
    // 两个事件各触发一次（若重复挂监听会变 4 次）
    expect(flush).toHaveBeenCalledTimes(2);
  });
});

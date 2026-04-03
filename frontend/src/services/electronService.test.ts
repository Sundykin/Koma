import { afterEach, describe, expect, it } from 'vitest';
import { windowIsMaximized } from './electronService';

describe('electronService window state', () => {
  afterEach(() => {
    delete (window as typeof window & { electronAPI?: unknown }).electronAPI;
  });

  it('兼容主进程返回对象形式的窗口状态', async () => {
    (window as typeof window & { electronAPI?: unknown }).electronAPI = {
      window: {
        isMaximized: async () => ({ isMaximized: true }),
      },
    };

    await expect(windowIsMaximized()).resolves.toBe(true);
  });

  it('在非 Electron 环境下返回 false', async () => {
    await expect(windowIsMaximized()).resolves.toBe(false);
  });
});

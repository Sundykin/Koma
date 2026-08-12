/**
 * 番茄达人中心 IPC handlers — 注册 fanqie:* 系列 IPC
 *
 * 命名空间：fanqie
 *   fanqie:getAuthStatus    ()                                    => FanqieAuthStatus
 *   fanqie:openLogin        ()                                    => FanqieAuthStatus(登录成功后)
 *   fanqie:logout           ()                                    => boolean
 *   fanqie:searchBook       (args: { keyword })                   => FanqieBook[]
 *   fanqie:listRankBooks    (args: { pageIndex?, pageSize?,
 *                                    rankOverrides?, refresh? })  => FanqieRankResult
 *   fanqie:listChapters     (args: { bookId })                    => FanqieChapterListResult
 *   fanqie:downloadChapters (args: { downloadId, bookId, items }) => { chapters, failed }
 *
 * 事件（renderer 监听）：
 *   fanqie:auth-changed       { loggedIn: boolean }
 *   fanqie:download-progress  FanqieDownloadProgress
 */
import { ipcMain, webContents } from 'electron';
import { logger } from 'ee-core/log';
import {
  fanqieKolService,
  type FanqieDownloadProgress,
} from './FanqieKolService';

function ok<T>(data: T) {
  return { ok: true as const, data };
}

function fail(code: string, message: string) {
  return { ok: false as const, code, message };
}

function broadcast(channel: string, payload: Record<string, unknown>): void {
  try {
    for (const wc of webContents.getAllWebContents()) {
      wc.send(channel, payload);
    }
  } catch (err) {
    logger.error('[fanqie-ipc] broadcast failed:', channel, err);
  }
}

let registered = false;

export function registerFanqieIpc(): void {
  if (registered) {
    logger.warn('[fanqie-ipc] already registered, skip');
    return;
  }
  registered = true;

  ipcMain.handle('fanqie:getAuthStatus', async () => {
    try {
      return ok(await fanqieKolService.getAuthStatus());
    } catch (err: any) {
      return fail('AUTH_STATUS_FAILED', err?.message || String(err));
    }
  });

  ipcMain.handle('fanqie:openLogin', async () => {
    try {
      // showLoginWindow 是事件型的：登录成功 → 广播 auth-changed → 隐藏窗口。
      // 这里先返回「窗口已打开」，前端靠事件或轮询 getAuthStatus 感知结果。
      await fanqieKolService.showLoginWindow(() => {
        broadcast('fanqie:auth-changed', { loggedIn: true });
      });
      return ok({ opened: true });
    } catch (err: any) {
      return fail('LOGIN_OPEN_FAILED', err?.message || String(err));
    }
  });

  ipcMain.handle('fanqie:logout', async () => {
    try {
      await fanqieKolService.logout();
      broadcast('fanqie:auth-changed', { loggedIn: false });
      return ok(true);
    } catch (err: any) {
      return fail('LOGOUT_FAILED', err?.message || String(err));
    }
  });

  ipcMain.handle('fanqie:searchBook', async (_event, args: { keyword: string }) => {
    try {
      if (!args?.keyword?.trim()) return fail('BAD_ARGS', 'keyword 不能为空');
      return ok(await fanqieKolService.searchBook(args.keyword.trim()));
    } catch (err: any) {
      return fail('SEARCH_FAILED', err?.message || String(err));
    }
  });

  ipcMain.handle(
    'fanqie:listRankBooks',
    async (
      _event,
      args: {
        pageIndex?: number;
        pageSize?: number;
        rankOverrides?: Record<string, string>;
        refresh?: boolean;
      } = {},
    ) => {
      try {
        return ok(await fanqieKolService.listRankBooks(args || {}));
      } catch (err: any) {
        return fail('RANK_LIST_FAILED', err?.message || String(err));
      }
    },
  );

  ipcMain.handle('fanqie:listChapters', async (_event, args: { bookId: string }) => {
    try {
      if (!args?.bookId?.trim()) return fail('BAD_ARGS', 'bookId 不能为空');
      return ok(await fanqieKolService.listChapters(args.bookId.trim()));
    } catch (err: any) {
      return fail('LIST_CHAPTERS_FAILED', err?.message || String(err));
    }
  });

  ipcMain.handle(
    'fanqie:downloadChapters',
    async (
      _event,
      args: {
        downloadId: string;
        bookId: string;
        items: Array<{ itemId: string; index: number; chapterName: string }>;
      },
    ) => {
      try {
        if (!args?.bookId || !Array.isArray(args.items) || args.items.length === 0) {
          return fail('BAD_ARGS', 'bookId / items 不能为空');
        }
        const downloadId = args.downloadId || `fq-${Date.now()}`;
        const result = await fanqieKolService.downloadChapters(
          args.bookId,
          args.items,
          downloadId,
          (progress: FanqieDownloadProgress) => {
            broadcast('fanqie:download-progress', progress as unknown as Record<string, unknown>);
          },
        );
        return ok(result);
      } catch (err: any) {
        return fail('DOWNLOAD_FAILED', err?.message || String(err));
      }
    },
  );

  logger.info('[fanqie-ipc] registered');
}

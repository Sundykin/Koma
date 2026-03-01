import { randomUUID } from 'crypto';
import type { BrowserWindow } from 'electron';
import { logger } from 'ee-core/log';
import PQueue from 'p-queue';
import type {
  RendererDelegatePayload,
  RendererDelegateRequest,
  RendererDelegateResult,
  ShotRenderPhase,
} from '../types';

interface PendingDelegate {
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
  timeout: NodeJS.Timeout;
}

export class RendererDelegate {
  private mainWindow: BrowserWindow | null = null;
  private readonly pending = new Map<string, PendingDelegate>();
  private readonly dispatchQueue = new PQueue({ concurrency: 12 });

  setWindow(win: BrowserWindow): void {
    this.mainWindow = win;
  }

  async execute(
    phase: ShotRenderPhase,
    taskId: string,
    payload: RendererDelegatePayload,
    timeoutMs = 5 * 60 * 1000
  ): Promise<unknown> {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) {
      throw new Error('主窗口未就绪，无法委托渲染任务');
    }

    return this.dispatchQueue.add(async () => {
      const delegateId = randomUUID();
      const request: RendererDelegateRequest = {
        delegateId,
        taskId,
        phase,
        payload,
      };

      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          this.pending.delete(delegateId);
          reject(new Error(`渲染委托超时: ${phase}`));
        }, timeoutMs);

        this.pending.set(delegateId, { resolve, reject, timeout });

        try {
          this.mainWindow?.webContents.send('task:delegate', request);
        } catch (error) {
          clearTimeout(timeout);
          this.pending.delete(delegateId);
          reject(error);
        }
      });
    }) as Promise<unknown>;
  }

  handleResult(result: RendererDelegateResult): boolean {
    const pending = this.pending.get(result.delegateId);
    if (!pending) return false;

    clearTimeout(pending.timeout);
    this.pending.delete(result.delegateId);

    if (result.error) {
      pending.reject(new Error(result.error));
      return true;
    }

    pending.resolve(result.result);
    return true;
  }

  rejectAll(reason: string): void {
    for (const [delegateId, pending] of this.pending.entries()) {
      clearTimeout(pending.timeout);
      pending.reject(new Error(reason));
      this.pending.delete(delegateId);
    }
    logger.warn(`[RendererDelegate] rejected all pending delegates: ${reason}`);
  }
}

export const rendererDelegate = new RendererDelegate();

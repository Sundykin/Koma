import { Worker } from 'worker_threads';
import type {
  PluginHostRpcRequest,
  PluginHostRpcResponse,
  PluginWorkerIncomingMessage,
  PluginWorkerOutgoingMessage,
} from '../types';

interface WorkerHostOptions {
  entryFile: string;
  onHostRequest: (request: PluginHostRpcRequest) => Promise<PluginHostRpcResponse>;
  onRuntimeError?: (error: Error) => void;
}

const DEFAULT_TIMEOUT_MS = 30_000;

export class PluginWorkerHost {
  private worker: Worker;
  private activatePending = new Map<string, { resolve: () => void; reject: (error: Error) => void; timer?: NodeJS.Timeout }>();
  private deactivatePending = new Map<string, { resolve: () => void; reject: (error: Error) => void; timer?: NodeJS.Timeout }>();

  constructor(private readonly options: WorkerHostOptions) {
    this.worker = new Worker(options.entryFile);
    this.worker.on('message', this.handleMessage);
    this.worker.on('error', this.handleError);
    this.worker.on('exit', this.handleExit);
  }

  private handleMessage = async (message: PluginWorkerOutgoingMessage) => {
    if (!message || typeof message !== 'object') return;

    if (message.type === 'host:request') {
      const response = await this.options.onHostRequest(message.payload);
      this.worker.postMessage({ type: 'host:response', payload: response } satisfies PluginWorkerIncomingMessage);
      return;
    }

    if (message.type === 'activate:result') {
      const pending = this.activatePending.get(message.requestId);
      if (!pending) return;
      this.activatePending.delete(message.requestId);
      if (pending.timer) clearTimeout(pending.timer);

      if (message.success) {
        pending.resolve();
      } else {
        pending.reject(new Error(message.error || 'Worker activate failed'));
      }
      return;
    }

    if (message.type === 'deactivate:result') {
      const pending = this.deactivatePending.get(message.requestId);
      if (!pending) return;
      this.deactivatePending.delete(message.requestId);
      if (pending.timer) clearTimeout(pending.timer);

      if (message.success) {
        pending.resolve();
      } else {
        pending.reject(new Error(message.error || 'Worker deactivate failed'));
      }
      return;
    }

    if (message.type === 'error') {
      this.options.onRuntimeError?.(new Error(message.message));
      return;
    }

    if (message.type === 'log') {
      const prefix = '[PluginWorker]';
      if (message.level === 'debug') console.debug(prefix, ...message.args);
      else if (message.level === 'info') console.info(prefix, ...message.args);
      else if (message.level === 'warn') console.warn(prefix, ...message.args);
      else console.error(prefix, ...message.args);
    }
  };

  private handleError = (error: Error) => {
    this.options.onRuntimeError?.(error);
    this.failAllPending(error);
  };

  private handleExit = (code: number) => {
    if (code !== 0) {
      const err = new Error(`Plugin worker exited with code ${code}`);
      this.options.onRuntimeError?.(err);
      this.failAllPending(err);
    }
  };

  private failAllPending(error: Error): void {
    for (const [requestId, pending] of this.activatePending.entries()) {
      if (pending.timer) clearTimeout(pending.timer);
      pending.reject(error);
      this.activatePending.delete(requestId);
    }

    for (const [requestId, pending] of this.deactivatePending.entries()) {
      if (pending.timer) clearTimeout(pending.timer);
      pending.reject(error);
      this.deactivatePending.delete(requestId);
    }
  }

  private callLifecycleAction<T extends 'activate' | 'deactivate'>(
    action: T,
    payload: Omit<Extract<PluginWorkerIncomingMessage, { type: T }>, 'type' | 'requestId'>
  ): Promise<void> {
    const requestId = `${action}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

    return new Promise<void>((resolve, reject) => {
      const pendingMap = action === 'activate' ? this.activatePending : this.deactivatePending;
      const timer = setTimeout(() => {
        pendingMap.delete(requestId);
        reject(new Error(`Plugin worker ${action} timeout`));
      }, DEFAULT_TIMEOUT_MS);

      pendingMap.set(requestId, {
        resolve,
        reject,
        timer,
      });

      this.worker.postMessage({
        type: action,
        requestId,
        ...(payload as any),
      } as PluginWorkerIncomingMessage);
    });
  }

  async activate(payload: {
    pluginId: string;
    modulePath: string;
    pluginDir: string;
    dataDir: string;
    appVersion: string;
    manifest: any;
  }): Promise<void> {
    return this.callLifecycleAction('activate', payload as any);
  }

  async deactivate(pluginId: string): Promise<void> {
    return this.callLifecycleAction('deactivate', { pluginId } as any);
  }

  async dispose(reason = 'runtime dispose'): Promise<void> {
    this.worker.postMessage({ type: 'dispose', reason } satisfies PluginWorkerIncomingMessage);
    await this.worker.terminate();
  }
}

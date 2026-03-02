/**
 * 工作流 Controller
 * 提供工作流管理的 IPC 接口 + 前端委托执行
 */
import { workflowOrchestrator, registerBuiltinHandlers } from '../service/workflow';
import type { WorkflowDefinition } from '../service/workflow';
import type { BrowserWindow, IpcMainInvokeEvent } from 'electron';

let mainWindow: BrowserWindow | null = null;

const delegateResolvers = new Map<string, {
  resolve: (result: any) => void;
  reject: (error: Error) => void;
}>();

function createDelegateHandler(handlerName: string) {
  return async (
    params: Record<string, unknown>,
    context: Record<string, unknown>,
    onProgress: (progress: number, step?: string) => void
  ): Promise<unknown> => {
    if (!mainWindow) throw new Error('主窗口未就绪');

    const delegateId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    mainWindow.webContents.send('workflow:delegate', {
      delegateId,
      handler: handlerName,
      params,
      context: filterContext(context),
    });

    return new Promise((resolve, reject) => {
      delegateResolvers.set(delegateId, { resolve, reject });
      setTimeout(() => {
        if (delegateResolvers.has(delegateId)) {
          delegateResolvers.delete(delegateId);
          reject(new Error(`委托执行超时: ${handlerName}`));
        }
      }, 5 * 60 * 1000);
    });
  };
}

function filterContext(ctx: Record<string, unknown>): Record<string, unknown> {
  const safe: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(ctx)) {
    if (k.startsWith('_')) continue;
    try {
      JSON.stringify(v);
      safe[k] = v;
    } catch { /* skip non-serializable */ }
  }
  return safe;
}

class WorkflowController {
  setWindow(win: BrowserWindow) {
    mainWindow = win;

    registerBuiltinHandlers(
      (name, handler) => workflowOrchestrator.registerHandler(name, handler)
    );

    const delegateHandlers = [
      'script-analysis', 'shot-breakdown',
      'scene-assets', 'character-assets', 'shot-render',
    ];
    for (const name of delegateHandlers) {
      workflowOrchestrator.registerHandler(name, createDelegateHandler(name));
    }

    const events = [
      'run:start', 'run:end', 'run:paused', 'run:resumed', 'run:cancelled',
      'node:start', 'node:progress', 'node:complete', 'node:error',
      'node:approval-required',
    ];
    for (const event of events) {
      workflowOrchestrator.on(event, (data) => {
        mainWindow?.webContents.send(`workflow:${event}`, data);
      });
    }
  }

  async delegateResult(args: { delegateId: string; result?: unknown; error?: string }, _event?: IpcMainInvokeEvent) {
    const { delegateId, result, error } = args;
    const resolver = delegateResolvers.get(delegateId);
    if (!resolver) {
      return { ok: false, reason: 'delegate_not_found' };
    }

    delegateResolvers.delete(delegateId);
    if (error) {
      resolver.reject(new Error(error));
    } else {
      resolver.resolve(result);
    }

    return { ok: true };
  }

  async start(args: { definition: WorkflowDefinition; context?: Record<string, unknown> }) {
    const runId = await workflowOrchestrator.startRun(args.definition, args.context);
    return { runId };
  }

  async pause(args: { runId: string }) {
    workflowOrchestrator.pause(args.runId);
    return { ok: true };
  }

  async resume(args: { runId: string }) {
    workflowOrchestrator.resume(args.runId);
    return { ok: true };
  }

  async cancel(args: { runId: string }) {
    workflowOrchestrator.cancel(args.runId);
    return { ok: true };
  }

  async approve(args: { runId: string; nodeId: string }) {
    workflowOrchestrator.approve(args.runId, args.nodeId);
    return { ok: true };
  }

  async getRun(args: { runId: string }) {
    const run = workflowOrchestrator.getRun(args.runId);
    if (!run) return null;
    return {
      ...run,
      nodes: Object.fromEntries(run.nodes),
    };
  }

  async listRuns() {
    return workflowOrchestrator.listRuns().map(run => ({
      ...run,
      nodes: Object.fromEntries(run.nodes),
    }));
  }
}

WorkflowController.toString = () => '[class WorkflowController]';

export default WorkflowController;

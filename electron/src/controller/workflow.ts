/**
 * 工作流 Controller
 * 提供工作流管理的 IPC 接口 + 前端委托执行
 */
import { workflowOrchestrator, registerBuiltinHandlers } from '../service/workflow';
import type { WorkflowDefinition } from '../service/workflow';
import type { BrowserWindow, IpcMainInvokeEvent } from 'electron';

let mainWindow: BrowserWindow | null = null;

// 等待前端执行结果的 Promise 解析器
const delegateResolvers = new Map<string, {
  resolve: (result: any) => void;
  reject: (error: Error) => void;
}>();

/** 创建委托处理器：后端发 IPC 给前端执行 */
function createDelegateHandler(handlerName: string) {
  return async (
    params: Record<string, unknown>,
    context: Record<string, unknown>,
    onProgress: (progress: number, step?: string) => void
  ): Promise<unknown> => {
    if (!mainWindow) throw new Error('主窗口未就绪');

    const delegateId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    // 发送给前端执行
    mainWindow.webContents.send('workflow:delegate', {
      delegateId,
      handler: handlerName,
      params,
      context: filterContext(context),
    });

    // 等待前端回传结果
    return new Promise((resolve, reject) => {
      delegateResolvers.set(delegateId, { resolve, reject });
      // 超时 5 分钟
      setTimeout(() => {
        if (delegateResolvers.has(delegateId)) {
          delegateResolvers.delete(delegateId);
          reject(new Error(`委托执行超时: ${handlerName}`));
        }
      }, 5 * 60 * 1000);
    });
  };
}

// 过滤 context 中不可序列化的内容
function filterContext(ctx: Record<string, unknown>): Record<string, unknown> {
  const safe: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(ctx)) {
    if (k.startsWith('_')) continue; // 跳过内部字段
    try {
      JSON.stringify(v);
      safe[k] = v;
    } catch { /* 不可序列化，跳过 */ }
  }
  return safe;
}

export const workflowController = {
  /** 设置主窗口引用 + 注册处理器 + 监听委托结果 */
  setWindow(win: BrowserWindow) {
    mainWindow = win;

    // 注册内置处理器
    registerBuiltinHandlers(
      (name, handler) => workflowOrchestrator.registerHandler(name, handler)
    );

    // 注册委托处理器（前端执行）
    const delegateHandlers = [
      'script-analysis', 'shot-breakdown',
      'scene-assets', 'character-assets', 'shot-render',
    ];
    for (const name of delegateHandlers) {
      workflowOrchestrator.registerHandler(name, createDelegateHandler(name));
    }


    // 转发编排器事件到前端
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
  },

  /** 回传前端委托执行结果 */
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
  },

  async start(args: { definition: WorkflowDefinition; context?: Record<string, unknown> }) {
    const runId = await workflowOrchestrator.startRun(args.definition, args.context);
    return { runId };
  },

  /** 暂停 */
  async pause(args: { runId: string }) {
    workflowOrchestrator.pause(args.runId);
    return { ok: true };
  },

  /** 恢复 */
  async resume(args: { runId: string }) {
    workflowOrchestrator.resume(args.runId);
    return { ok: true };
  },

  /** 取消 */
  async cancel(args: { runId: string }) {
    workflowOrchestrator.cancel(args.runId);
    return { ok: true };
  },

  /** 批准 HITL 门控 */
  async approve(args: { runId: string; nodeId: string }) {
    workflowOrchestrator.approve(args.runId, args.nodeId);
    return { ok: true };
  },

  /** 获取运行状态 */
  async getRun(args: { runId: string }) {
    const run = workflowOrchestrator.getRun(args.runId);
    if (!run) return null;
    return {
      ...run,
      nodes: Object.fromEntries(run.nodes),
    };
  },

  /** 列出所有运行 */
  async listRuns() {
    return workflowOrchestrator.listRuns().map(run => ({
      ...run,
      nodes: Object.fromEntries(run.nodes),
    }));
  },
};

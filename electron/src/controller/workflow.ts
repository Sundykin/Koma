/**
 * 工作流 Controller
 * 提供工作流管理的 IPC 接口
 */
import { workflowOrchestrator } from '../service/workflow';
import type { WorkflowDefinition } from '../service/workflow';
import type { BrowserWindow } from 'electron';

let mainWindow: BrowserWindow | null = null;

export const workflowController = {
  /** 设置主窗口引用（用于发送事件） */
  setWindow(win: BrowserWindow) {
    mainWindow = win;

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

  /** 启动工作流 */
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

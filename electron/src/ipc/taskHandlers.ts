import { ipcMain } from 'electron';
import type {
  QueueTaskStatus,
  RendererDelegateProgress,
  RendererDelegateResult,
  ShotRenderTaskPayload,
} from '../queue/types';
import { shotRenderTaskQueue } from '../queue/taskQueue';

let registered = false;

const ALLOWED_STATUS = new Set<QueueTaskStatus>([
  'queued',
  'processing',
  'completed',
  'failed',
]);

function asRequiredString(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${name} is required`);
  }
  return value;
}

export function registerTaskHandlers(): void {
  if (registered) return;
  registered = true;

  ipcMain.handle('task:submit', async (_event, args: ShotRenderTaskPayload) => {
    if (!args || typeof args !== 'object') {
      throw new Error('task payload is required');
    }
    if (typeof args.projectId !== 'string' || !args.projectId.trim()) {
      throw new Error('projectId is required');
    }
    if (!args.shot || typeof args.shot !== 'object') {
      throw new Error('shot payload is required');
    }
    return shotRenderTaskQueue.submitShotRender(args);
  });

  ipcMain.handle('task:get', async (_event, args: { taskId: string }) => {
    const taskId = asRequiredString(args?.taskId, 'taskId');
    return shotRenderTaskQueue.getTask(taskId);
  });

  ipcMain.handle('task:list', async (_event, args: { projectId?: string; status?: QueueTaskStatus }) => {
    const projectId = typeof args?.projectId === 'string' && args.projectId.trim().length > 0
      ? args.projectId.trim()
      : undefined;
    const status = args?.status;
    if (status && !ALLOWED_STATUS.has(status)) {
      throw new Error(`invalid status: ${status}`);
    }
    return shotRenderTaskQueue.listTasks(projectId, status);
  });

  ipcMain.handle('task:cancel', async (_event, args: { taskId: string }) => {
    const taskId = asRequiredString(args?.taskId, 'taskId');
    return shotRenderTaskQueue.cancelTask(taskId);
  });

  ipcMain.handle('task:retry', async (_event, args: { taskId: string }) => {
    const taskId = asRequiredString(args?.taskId, 'taskId');
    return shotRenderTaskQueue.retryTask(taskId);
  });

  ipcMain.handle('task:progress', async (_event, args: RendererDelegateProgress) => {
    if (!args || typeof args !== 'object') {
      throw new Error('progress payload is required');
    }

    const update: RendererDelegateProgress = {
      taskId: asRequiredString(args.taskId, 'taskId'),
      progress: Number(args.progress || 0),
      phase: args.phase,
      message: args.message,
    };

    return shotRenderTaskQueue.reportProgress(update);
  });

  ipcMain.handle('task:delegateResult', async (_event, args: RendererDelegateResult) => {
    if (!args || typeof args !== 'object') {
      throw new Error('delegate result payload is required');
    }

    const payload: RendererDelegateResult = {
      delegateId: asRequiredString(args.delegateId, 'delegateId'),
      result: args.result,
      error: args.error,
    };

    return shotRenderTaskQueue.handleDelegateResult(payload);
  });
}

/**
 * 异步任务队列存储
 * 薄适配层：委托给 TaskManager 统一管理，避免双写 tasks.json
 *
 * @deprecated 新代码请直接使用 TaskManager
 */
import { TaskManager as TM, type Task } from '../services/TaskManager';
import type { AsyncTask, AsyncTaskStatus, AsyncTaskType } from '../types';

// Task → AsyncTask 适配
function toAsyncTask(task: Task): AsyncTask {
  return {
    id: task.id,
    projectId: task.projectId,
    type: (task.type as string) as AsyncTask['type'],
    targetType: task.targetType as AsyncTask['targetType'],
    targetId: task.targetId,
    targetName: task.targetName,
    remoteTaskId: task.remoteTaskId || '',
    status: task.status as AsyncTask['status'],
    progress: task.progress,
    resultUrl: task.resultUrl,
    localPath: task.localPath,
    error: task.error,
    retryCount: task.retryCount || 0,
    maxRetries: task.maxRetries || 3,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
  };
}

export async function createTask(
  projectId: string,
  task: Omit<AsyncTask, 'id' | 'createdAt' | 'updatedAt' | 'retryCount'>
): Promise<AsyncTask> {
  const created = TM.createTask({
    projectId,
    type: task.type as any,
    targetType: task.targetType as any,
    targetId: task.targetId,
    targetName: task.targetName,
    maxRetries: task.maxRetries,
  });
  // 同步额外字段
  if (task.remoteTaskId) {
    TM.updateTask(created.id, { remoteTaskId: task.remoteTaskId });
  }
  return toAsyncTask(TM.getTask(created.id)!);
}

export async function updateTask(
  projectId: string,
  taskId: string,
  updates: Partial<AsyncTask>
): Promise<AsyncTask | null> {
  const result = TM.updateTask(taskId, updates as any);
  return result ? toAsyncTask(result) : null;
}

export async function getTask(
  projectId: string,
  taskId: string
): Promise<AsyncTask | null> {
  const task = TM.getTask(taskId);
  return task ? toAsyncTask(task) : null;
}

export async function listTasks(
  projectId: string,
  filter?: { status?: AsyncTaskStatus | AsyncTaskStatus[]; type?: AsyncTaskType }
): Promise<AsyncTask[]> {
  let tasks = TM.getProjectTasks(projectId);
  if (filter?.status) {
    const statuses = Array.isArray(filter.status) ? filter.status : [filter.status];
    tasks = tasks.filter(t => statuses.includes(t.status as any));
  }
  if (filter?.type) {
    tasks = tasks.filter(t => (t.type as string) === filter.type);
  }
  return tasks.map(toAsyncTask);
}

export async function deleteTask(projectId: string, taskId: string): Promise<boolean> {
  return TM.deleteTask(taskId);
}

export async function clearCompletedTasks(projectId: string, olderThanDays: number = 7): Promise<number> {
  return TM.clearCompletedTasks(projectId, olderThanDays);
}

export async function getPendingTasks(projectId: string): Promise<AsyncTask[]> {
  return TM.getPendingTasks(projectId).map(toAsyncTask);
}

export async function getFailedTasks(projectId: string): Promise<AsyncTask[]> {
  return TM.getFailedTasks(projectId).map(toAsyncTask);
}

export async function markTaskProcessing(
  projectId: string, taskId: string, remoteTaskId?: string
): Promise<AsyncTask | null> {
  const result = TM.markProcessing(taskId, remoteTaskId);
  return result ? toAsyncTask(result) : null;
}

export async function markTaskCompleted(
  projectId: string, taskId: string, resultUrl: string, localPath?: string
): Promise<AsyncTask | null> {
  const result = TM.markCompleted(taskId, resultUrl, localPath);
  return result ? toAsyncTask(result) : null;
}

export async function markTaskFailed(
  projectId: string, taskId: string, error: string
): Promise<AsyncTask | null> {
  const result = TM.markFailed(taskId, error);
  return result ? toAsyncTask(result) : null;
}

export async function retryTask(
  projectId: string, taskId: string
): Promise<AsyncTask | null> {
  const result = TM.retryTask(taskId);
  return result ? toAsyncTask(result) : null;
}

export async function updateTaskProgress(
  projectId: string, taskId: string, progress: number
): Promise<AsyncTask | null> {
  const result = TM.updateProgress(taskId, progress);
  return result ? toAsyncTask(result) : null;
}

export interface TaskStats {
  total: number;
  pending: number;
  processing: number;
  completed: number;
  failed: number;
}

export async function getTaskStats(projectId: string): Promise<TaskStats> {
  return TM.getTaskStats(projectId);
}

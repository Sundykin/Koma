/**
 * 异步任务队列存储
 * 管理 TTI/ITV/TTS 等远程API任务的持久化和状态追踪
 */
import { v4 as uuidv4 } from 'uuid';
import { electronService } from '../services/electronService';
import { getStorageConfig, initStorageConfig } from './storageConfig';
import type { AsyncTask, AsyncTaskStatus, AsyncTaskType } from '../types';
import { createLogger } from './logger';

const logger = createLogger('TaskQueue');

// 获取项目路径
async function getProjectPath(projectId: string): Promise<string> {
  const config = getStorageConfig() || (await initStorageConfig());
  return `${config.rootPath}/projects/${projectId}`;
}

// 获取任务文件路径
async function getTasksFilePath(projectId: string): Promise<string> {
  const projectPath = await getProjectPath(projectId);
  return `${projectPath}/tasks.json`;
}

// 任务存储结构
interface TasksFile {
  tasks: AsyncTask[];
  version: number;
}

// ========== 任务 CRUD ==========

/**
 * 创建新任务
 */
export async function createTask(
  projectId: string,
  task: Omit<AsyncTask, 'id' | 'createdAt' | 'updatedAt' | 'retryCount'>
): Promise<AsyncTask> {
  if (!electronService.isElectron()) {
    throw new Error('仅支持 Electron 环境');
  }

  const now = Date.now();
  const newTask: AsyncTask = {
    ...task,
    id: uuidv4(),
    retryCount: 0,
    createdAt: now,
    updatedAt: now,
  };

  const tasks = await loadAllTasks(projectId);
  tasks.push(newTask);
  await saveTasks(projectId, tasks);

  logger.info(`创建任务: ${newTask.id}`, { type: task.type, targetType: task.targetType });
  return newTask;
}

/**
 * 更新任务状态
 */
export async function updateTask(
  projectId: string,
  taskId: string,
  updates: Partial<AsyncTask>
): Promise<AsyncTask | null> {
  if (!electronService.isElectron()) return null;

  const tasks = await loadAllTasks(projectId);
  const index = tasks.findIndex(t => t.id === taskId);
  if (index === -1) return null;

  const updatedTask: AsyncTask = {
    ...tasks[index],
    ...updates,
    updatedAt: Date.now(),
  };
  tasks[index] = updatedTask;

  await saveTasks(projectId, tasks);
  logger.info(`更新任务: ${taskId}`, { status: updates.status, progress: updates.progress });
  return updatedTask;
}

/**
 * 获取单个任务
 */
export async function getTask(
  projectId: string,
  taskId: string
): Promise<AsyncTask | null> {
  if (!electronService.isElectron()) return null;

  const tasks = await loadAllTasks(projectId);
  return tasks.find(t => t.id === taskId) || null;
}

/**
 * 列出任务（可按状态过滤）
 */
export async function listTasks(
  projectId: string,
  filter?: { status?: AsyncTaskStatus | AsyncTaskStatus[]; type?: AsyncTaskType }
): Promise<AsyncTask[]> {
  if (!electronService.isElectron()) return [];

  let tasks = await loadAllTasks(projectId);

  if (filter?.status) {
    const statuses = Array.isArray(filter.status) ? filter.status : [filter.status];
    tasks = tasks.filter(t => statuses.includes(t.status));
  }

  if (filter?.type) {
    tasks = tasks.filter(t => t.type === filter.type);
  }

  return tasks.sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * 删除任务
 */
export async function deleteTask(
  projectId: string,
  taskId: string
): Promise<boolean> {
  if (!electronService.isElectron()) return false;

  const tasks = await loadAllTasks(projectId);
  const index = tasks.findIndex(t => t.id === taskId);
  if (index === -1) return false;

  tasks.splice(index, 1);
  await saveTasks(projectId, tasks);

  logger.info(`删除任务: ${taskId}`);
  return true;
}

/**
 * 删除已完成的任务（清理）
 */
export async function clearCompletedTasks(
  projectId: string,
  olderThanDays: number = 7
): Promise<number> {
  if (!electronService.isElectron()) return 0;

  const tasks = await loadAllTasks(projectId);
  const cutoffTime = Date.now() - olderThanDays * 24 * 60 * 60 * 1000;

  const remaining = tasks.filter(t => {
    if (t.status === 'completed' || t.status === 'failed') {
      return t.updatedAt > cutoffTime;
    }
    return true;
  });

  const deletedCount = tasks.length - remaining.length;
  if (deletedCount > 0) {
    await saveTasks(projectId, remaining);
    logger.info(`清理已完成任务: ${deletedCount} 个`);
  }

  return deletedCount;
}

/**
 * 获取未完成的任务（用于恢复）
 */
export async function getPendingTasks(projectId: string): Promise<AsyncTask[]> {
  return listTasks(projectId, { status: ['pending', 'processing'] });
}

/**
 * 获取失败的任务（用于重试）
 */
export async function getFailedTasks(projectId: string): Promise<AsyncTask[]> {
  return listTasks(projectId, { status: 'failed' });
}

/**
 * 标记任务为处理中
 */
export async function markTaskProcessing(
  projectId: string,
  taskId: string,
  remoteTaskId?: string
): Promise<AsyncTask | null> {
  return updateTask(projectId, taskId, {
    status: 'processing',
    remoteTaskId: remoteTaskId,
  });
}

/**
 * 标记任务完成
 */
export async function markTaskCompleted(
  projectId: string,
  taskId: string,
  resultAsset?: AsyncTask['resultAsset']
): Promise<AsyncTask | null> {
  return updateTask(projectId, taskId, {
    status: 'completed',
    progress: 100,
    resultAsset,
  });
}

/**
 * 标记任务失败
 */
export async function markTaskFailed(
  projectId: string,
  taskId: string,
  error: string
): Promise<AsyncTask | null> {
  const task = await getTask(projectId, taskId);
  if (!task) return null;

  return updateTask(projectId, taskId, {
    status: 'failed',
    error,
    retryCount: task.retryCount + 1,
  });
}

/**
 * 重试失败的任务
 */
export async function retryTask(
  projectId: string,
  taskId: string
): Promise<AsyncTask | null> {
  const task = await getTask(projectId, taskId);
  if (!task) return null;

  if (task.retryCount >= task.maxRetries) {
    logger.warn(`任务 ${taskId} 已达最大重试次数`);
    return null;
  }

  return updateTask(projectId, taskId, {
    status: 'pending',
    error: undefined,
    progress: 0,
  });
}

/**
 * 更新任务进度
 */
export async function updateTaskProgress(
  projectId: string,
  taskId: string,
  progress: number
): Promise<AsyncTask | null> {
  return updateTask(projectId, taskId, { progress });
}

// ========== 内部函数 ==========

async function loadAllTasks(projectId: string): Promise<AsyncTask[]> {
  try {
    const filePath = await getTasksFilePath(projectId);
    const exists = await electronService.fs.exists(filePath);
    if (!exists) return [];

    const data = await electronService.fs.readFile(filePath);
    const parsed: TasksFile = JSON.parse(data);
    return parsed.tasks || [];
  } catch {
    return [];
  }
}

async function saveTasks(projectId: string, tasks: AsyncTask[]): Promise<void> {
  const filePath = await getTasksFilePath(projectId);
  const data: TasksFile = {
    tasks,
    version: 1,
  };
  await electronService.fs.writeFile(filePath, JSON.stringify(data, null, 2));
}

// ========== 任务统计 ==========

export interface TaskStats {
  total: number;
  pending: number;
  processing: number;
  completed: number;
  failed: number;
}

export async function getTaskStats(projectId: string): Promise<TaskStats> {
  const tasks = await loadAllTasks(projectId);
  return {
    total: tasks.length,
    pending: tasks.filter(t => t.status === 'pending').length,
    processing: tasks.filter(t => t.status === 'processing').length,
    completed: tasks.filter(t => t.status === 'completed').length,
    failed: tasks.filter(t => t.status === 'failed').length,
  };
}

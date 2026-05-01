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

/**
 * 任务文件 schema 版本。
 * 升级时必须同步：
 *   1) 提升此常量
 *   2) 在 loadAllTasks 中加 v(N-1) → v(N) 迁移
 * 当前未上线，无 v0 数据，仅校验 version 合法性。
 */
const CURRENT_TASKS_FILE_VERSION = 1;

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
 *
 * 写盘策略：
 * - 状态变更（updates.status 提供）→ 立即写盘（保证恢复时能看到最新最终态）
 * - 仅进度变更 → 节流写盘（合并 200ms 内多次进度更新）
 *
 * 内存缓存是权威：scheduleFlush 把 tasks 数组放进 memoryTasks，
 * 后续 loadAllTasks 直接读内存，避免 IPC 读盘风暴。
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

  // 状态变更（创建后第一次进 processing/completed/failed）必须立即落盘；
  // 仅 progress 跳动则合并写盘
  const hasStatusChange = 'status' in updates && updates.status !== undefined;
  if (hasStatusChange) {
    await saveTasks(projectId, tasks);
  } else {
    scheduleFlush(projectId, tasks);
  }
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

// 内存权威缓存：高频 progress 更新只命中内存，写盘按 projectId 节流
// 解决：抽卡 9 张并发时，每张图 polling 进度都 read+write 整个 tasks.json，
// 200+ 次主进程 IPC 抢主线程，导致 renderer 卡死（生成实际成功）
const memoryTasks = new Map<string, AsyncTask[]>();
const flushTimers = new Map<string, ReturnType<typeof setTimeout>>();
const FLUSH_DEBOUNCE_MS = 200;

/**
 * 仅用于单元测试：清空内存缓存与挂起的 flush，确保测试间互不干扰。
 * 生产代码不要调用。
 */
export function __resetTaskQueueCacheForTesting(): void {
  for (const timer of flushTimers.values()) clearTimeout(timer);
  flushTimers.clear();
  memoryTasks.clear();
}

async function loadAllTasks(projectId: string): Promise<AsyncTask[]> {
  // 内存优先：本会话内已经读过/写过的项目直接返回，避免每次 IPC 读盘
  if (memoryTasks.has(projectId)) {
    return memoryTasks.get(projectId)!;
  }
  try {
    const filePath = await getTasksFilePath(projectId);
    const exists = await electronService.fs.exists(filePath);
    if (!exists) {
      memoryTasks.set(projectId, []);
      return [];
    }

    const data = await electronService.fs.readFile(filePath);
    const parsed: TasksFile = JSON.parse(data);

    const fileVersion = typeof parsed.version === 'number' ? parsed.version : 0;
    if (fileVersion > CURRENT_TASKS_FILE_VERSION) {
      // 比当前 runtime 新的版本：拒绝静默兼容（避免未来 schema 变化破坏数据）
      logger.warn('tasks.json 版本高于当前 runtime，跳过加载', {
        projectId,
        fileVersion,
        runtime: CURRENT_TASKS_FILE_VERSION,
      });
      memoryTasks.set(projectId, []);
      return [];
    }
    // fileVersion < current：本应在此调用 v(N-1) → v(N) 迁移；当前未上线无 v0 数据。

    const tasks = parsed.tasks || [];
    memoryTasks.set(projectId, tasks);
    return tasks;
  } catch (err) {
    logger.warn('加载任务文件失败', { projectId, error: (err as Error)?.message });
    memoryTasks.set(projectId, []);
    return [];
  }
}

async function flushTasks(projectId: string, tasks: AsyncTask[]): Promise<void> {
  const filePath = await getTasksFilePath(projectId);
  const data: TasksFile = {
    tasks,
    version: CURRENT_TASKS_FILE_VERSION,
  };
  await electronService.fs.writeFile(filePath, JSON.stringify(data, null, 2));
}

/**
 * 节流写盘：内存立即落地，文件 IO 合并 200ms 内的多次写。
 * 用于 progress 等高频路径。
 */
function scheduleFlush(projectId: string, tasks: AsyncTask[]): void {
  memoryTasks.set(projectId, tasks);
  const existing = flushTimers.get(projectId);
  if (existing) clearTimeout(existing);
  flushTimers.set(projectId, setTimeout(async () => {
    flushTimers.delete(projectId);
    const latest = memoryTasks.get(projectId) || [];
    try {
      await flushTasks(projectId, latest);
    } catch (err) {
      logger.warn('节流写盘失败', { projectId, error: (err as Error)?.message });
    }
  }, FLUSH_DEBOUNCE_MS));
}

/**
 * 强制立即写盘 + 取消挂起的节流。
 * 用于结构变更（创建/删除/清空）和最终态（completed/failed），保证落地不丢。
 */
async function saveTasks(projectId: string, tasks: AsyncTask[]): Promise<void> {
  memoryTasks.set(projectId, tasks);
  const pending = flushTimers.get(projectId);
  if (pending) {
    clearTimeout(pending);
    flushTimers.delete(projectId);
  }
  await flushTasks(projectId, tasks);
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

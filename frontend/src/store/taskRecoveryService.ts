/**
 * 任务恢复服务
 * 在项目打开时恢复未完成的异步任务
 */
import type { AsyncTask, ProgressInfo } from '../types';
import {
  getPendingTasks,
  updateTask,
  markTaskCompleted,
  markTaskFailed,
  updateTaskProgress,
} from './taskQueueStore';
import { downloadRemoteAsset } from './assetDownloadService';
import { getStorageConfig, initStorageConfig } from './storageConfig';
import { createLogger } from './logger';

const logger = createLogger('TaskRecovery');

// 任务恢复配置
const POLL_INTERVAL = 3000; // 轮询间隔 3 秒
const MAX_POLL_ATTEMPTS = 200; // 最大轮询次数（约10分钟）

// Provider 进度检查函数类型
type ProgressChecker = (taskId: string) => Promise<ProgressInfo>;

// 任务完成回调
export type TaskCompletedCallback = (task: AsyncTask, localPath: string) => Promise<void>;
export type TaskFailedCallback = (task: AsyncTask, error: string) => void;
export type TaskProgressCallback = (task: AsyncTask, progress: number, step?: string) => void;

interface RecoveryCallbacks {
  onTaskCompleted?: TaskCompletedCallback;
  onTaskFailed?: TaskFailedCallback;
  onTaskProgress?: TaskProgressCallback;
}

// Provider 注册表
const progressCheckers: Record<string, ProgressChecker> = {};

/**
 * 注册 Provider 的进度检查函数
 */
export function registerProgressChecker(
  providerType: string,
  checker: ProgressChecker
): void {
  progressCheckers[providerType] = checker;
}

/**
 * 获取项目路径
 */
async function getProjectPath(projectId: string): Promise<string> {
  const config = getStorageConfig() || (await initStorageConfig());
  return `${config.rootPath}/projects/${projectId}`;
}

/**
 * 恢复项目的未完成任务
 */
export async function recoverPendingTasks(
  projectId: string,
  callbacks?: RecoveryCallbacks
): Promise<{ recovered: number; failed: number }> {
  const pendingTasks = await getPendingTasks(projectId);

  if (pendingTasks.length === 0) {
    logger.info('没有需要恢复的任务');
    return { recovered: 0, failed: 0 };
  }

  logger.info(`发现 ${pendingTasks.length} 个未完成任务，开始恢复`);

  let recovered = 0;
  let failed = 0;

  // 并行恢复所有任务
  const results = await Promise.allSettled(
    pendingTasks.map(task => recoverTask(projectId, task, callbacks))
  );

  for (const result of results) {
    if (result.status === 'fulfilled' && result.value) {
      recovered++;
    } else {
      failed++;
    }
  }

  logger.info(`任务恢复完成: ${recovered} 成功, ${failed} 失败`);
  return { recovered, failed };
}

/**
 * 恢复单个任务
 */
async function recoverTask(
  projectId: string,
  task: AsyncTask,
  callbacks?: RecoveryCallbacks
): Promise<boolean> {
  const checker = progressCheckers[task.type];
  if (!checker) {
    logger.warn(`未注册的任务类型: ${task.type}`);
    return false;
  }

  if (!task.remoteTaskId) {
    logger.warn(`任务 ${task.id} 没有远程任务ID`);
    return false;
  }

  try {
    // 轮询检查任务状态
    let attempts = 0;
    while (attempts < MAX_POLL_ATTEMPTS) {
      const progress = await checker(task.remoteTaskId);

      if (progress.status === 'completed' && progress.resultUrl) {
        // 任务完成，下载资产
        return await processCompletedTask(projectId, task, progress.resultUrl, callbacks);
      }

      if (progress.status === 'failed') {
        // 任务失败
        await handleFailedTask(projectId, task, progress.error || '未知错误', callbacks);
        return false;
      }

      // 更新进度
      await updateTaskProgress(projectId, task.id, progress.progress);
      callbacks?.onTaskProgress?.(task, progress.progress);

      // 等待下次轮询
      await sleep(POLL_INTERVAL);
      attempts++;
    }

    // 超时
    await handleFailedTask(projectId, task, '任务超时', callbacks);
    return false;
  } catch (err: any) {
    logger.error(`恢复任务 ${task.id} 失败`, { error: err.message });
    await handleFailedTask(projectId, task, err.message, callbacks);
    return false;
  }
}

/**
 * 处理完成的任务
 */
async function processCompletedTask(
  projectId: string,
  task: AsyncTask,
  resultUrl: string,
  callbacks?: RecoveryCallbacks
): Promise<boolean> {
  try {
    // 下载资产到本地
    const projectPath = await getProjectPath(projectId);
    const localPath = getLocalPath(projectPath, task);

    const downloadResult = await downloadRemoteAsset(resultUrl, localPath);
    if (!downloadResult.success) {
      throw new Error(downloadResult.error || '下载失败');
    }

    // 更新任务状态
    await markTaskCompleted(projectId, task.id, resultUrl, downloadResult.localPath);

    // 回调通知 - 附加 resultUrl 到 task 对象
    if (callbacks?.onTaskCompleted && downloadResult.localPath) {
      const taskWithUrl = { ...task, resultUrl };
      await callbacks.onTaskCompleted(taskWithUrl, downloadResult.localPath);
    }

    logger.info(`任务 ${task.id} 完成并下载到 ${downloadResult.localPath}`);
    return true;
  } catch (err: any) {
    logger.error(`处理完成任务失败: ${task.id}`, { error: err.message });
    await handleFailedTask(projectId, task, err.message, callbacks);
    return false;
  }
}

/**
 * 处理失败的任务
 */
async function handleFailedTask(
  projectId: string,
  task: AsyncTask,
  error: string,
  callbacks?: RecoveryCallbacks
): Promise<void> {
  await markTaskFailed(projectId, task.id, error);
  callbacks?.onTaskFailed?.(task, error);
  logger.warn(`任务 ${task.id} 失败: ${error}`);
}

/**
 * 根据任务类型生成本地存储路径
 */
function getLocalPath(projectPath: string, task: AsyncTask): string {
  const ext = task.type === 'itv' ? 'mp4' : 'png';
  const timestamp = Date.now();

  switch (task.targetType) {
    case 'character':
      if (task.type === 'itv') {
        return `${projectPath}/assets/characters/${task.targetId}/preview_${timestamp}.mp4`;
      }
      return `${projectPath}/assets/characters/${task.targetId}/image_${timestamp}.png`;
    case 'scene':
      return `${projectPath}/assets/scenes/${task.targetId}/preview_${timestamp}.png`;
    case 'prop':
      return `${projectPath}/assets/props/${task.targetId}/reference_${timestamp}.png`;
    case 'shot':
      return `${projectPath}/shots/${task.targetId}/generated_${timestamp}.${ext}`;
    default:
      return `${projectPath}/temp/task_${task.id}.${ext}`;
  }
}

/**
 * 启动任务轮询（用于新创建的任务）
 */
export async function pollTaskUntilComplete(
  projectId: string,
  task: AsyncTask,
  checker: ProgressChecker,
  callbacks?: RecoveryCallbacks
): Promise<boolean> {
  if (!task.remoteTaskId) {
    logger.warn(`任务 ${task.id} 没有远程任务ID`);
    return false;
  }

  let attempts = 0;
  while (attempts < MAX_POLL_ATTEMPTS) {
    try {
      const progress = await checker(task.remoteTaskId);

      if (progress.status === 'completed' && progress.resultUrl) {
        return await processCompletedTask(projectId, task, progress.resultUrl, callbacks);
      }

      if (progress.status === 'failed') {
        await handleFailedTask(projectId, task, progress.error || '生成失败', callbacks);
        return false;
      }

      // 更新进度
      await updateTaskProgress(projectId, task.id, progress.progress);
      callbacks?.onTaskProgress?.(task, progress.progress, `处理中 ${progress.progress}%`);

      await sleep(POLL_INTERVAL);
      attempts++;
    } catch (err: any) {
      logger.error(`轮询任务 ${task.id} 失败`, { error: err.message });
      await handleFailedTask(projectId, task, err.message, callbacks);
      return false;
    }
  }

  await handleFailedTask(projectId, task, '任务超时', callbacks);
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

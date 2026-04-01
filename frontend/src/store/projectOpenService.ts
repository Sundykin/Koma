/**
 * 项目打开服务
 * 处理项目打开时的初始化和任务恢复
 */
import { recoverPendingTasks } from './taskRecoveryService';
import { initSaveHooks, setGetCurrentProjectId } from './autoSaveService';
import { loadProject } from './projectStore';
import { createLogger } from './logger';
import { serializeMediaSelection } from '../providers/channel/resolver';

const logger = createLogger('ProjectOpen');

// 任务恢复结果监听器
type RecoveryListener = (result: { recovered: number; failed: number }) => void;
const recoveryListeners: Set<RecoveryListener> = new Set();

export function onTaskRecovery(listener: RecoveryListener): () => void {
  recoveryListeners.add(listener);
  return () => recoveryListeners.delete(listener);
}

// 当前项目 ID
let currentProjectId: string | null = null;

export function getCurrentProject(): string | null {
  return currentProjectId;
}

export function setCurrentProject(projectId: string | null): void {
  currentProjectId = projectId;
}

/**
 * 初始化项目打开服务
 */
export async function initProjectOpenService(): Promise<void> {
  // 设置自动保存的当前项目 ID 获取函数
  setGetCurrentProjectId(() => currentProjectId);

  // 初始化保存钩子
  initSaveHooks();

  logger.info('项目打开服务初始化完成');
}

/**
 * 项目打开钩子
 * 在项目加载后调用
 */
export async function onProjectOpen(projectId: string): Promise<void> {
  logger.info(`项目打开: ${projectId}`);
  setCurrentProject(projectId);

  // 恢复未完成的任务
  try {
    const project = await loadProject(projectId).catch(() => null);

    const result = await recoverPendingTasks(projectId, {
      selections: {
        ttiSelection: serializeMediaSelection(project?.mediaSelections?.tti),
        itvSelection: serializeMediaSelection(project?.mediaSelections?.itv),
        ttsSelection: serializeMediaSelection(project?.mediaSelections?.tts),
      },
      callbacks: {
        onTaskProgress: (task, progress) => {
          logger.info(`任务 ${task.targetName} 进度: ${progress}%`);
        },
        onTaskCompleted: async (_task, asset) => {
          logger.info(`任务完成: ${asset.localPath || asset.remoteUrl || ''}`);
        },
        onTaskFailed: (task, error) => {
          logger.warn(`任务 ${task.targetName} 失败: ${error}`);
        },
      },
    });

    // 通知监听器
    recoveryListeners.forEach(listener => listener(result));

    if (result.recovered > 0 || result.failed > 0) {
      logger.info(`任务恢复完成: ${result.recovered} 成功, ${result.failed} 失败`);
    }
  } catch (err: any) {
    logger.error('任务恢复失败', { error: err.message });
  }
}

/**
 * 项目关闭钩子
 */
export function onProjectClose(): void {
  const projectId = currentProjectId;
  if (projectId) {
    logger.info(`项目关闭: ${projectId}`);
  }
  setCurrentProject(null);
}

export default {
  initProjectOpenService,
  onProjectOpen,
  onProjectClose,
  getCurrentProject,
  setCurrentProject,
  onTaskRecovery,
};

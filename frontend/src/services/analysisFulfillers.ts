/**
 * Renderer-side fulfillers for main-side analysis:* 父任务 handler。
 *
 * 用途：main 进程注册的 'analysis:shot' / 'analysis:script' handler 通过
 * delegateToRenderer 把执行交回这里。fulfiller 直接复用现有 ShotAnalysisService /
 * ScriptAnalysisService（不重写 LLM closures），共享同一 parentTaskId
 * 让 service 内部的 TaskManager.updateTask 写到主进程已创建的那条记录上。
 *
 * 这样得到：
 *  - 主进程父任务限流（concurrency=1）+ 取消 AbortController
 *  - service 仍然按原代码走 stage / chunk 推进 + 写 result.stageStates 进度细节
 */
import { registerDelegate } from './tasksDelegate';
import { TaskManager } from './TaskManager';
import type { Task } from './TaskManager';
import type { PresetAssets } from './ShotAnalysisService';
import type { StyleSnapshotLike } from '../utils/promptNormalize';
import { createLogger } from '../store/logger';

const logger = createLogger('AnalysisFulfillers');

interface ShotAnalysisInput {
  parentTaskId: string;
  projectId: string;
  episodeId: string;
  episodeName: string;
  script: string;
  llmSelection?: string;
  presetAssets?: PresetAssets;
  styleSnapshot?: StyleSnapshotLike;
}

interface ScriptAnalysisInput {
  parentTaskId: string;
  projectId: string;
  episodeId: string;
  episodeName: string;
  script: string;
  llmSelection?: string;
  styleSnapshot?: StyleSnapshotLike;
}

interface AnalysisResult {
  ok: true;
  shotsCount?: number;
  charactersCount?: number;
  scenesCount?: number;
  propsCount?: number;
}

/** 等 TaskManager 中的某条任务进入终态 —— 用于 fulfiller 等待 service 完成 */
async function waitForLocalTaskTerminal(taskId: string): Promise<Task> {
  return new Promise<Task>((resolve, reject) => {
    const check = () => {
      const t = TaskManager.getTask(taskId);
      if (!t) {
        reject(new Error(`task ${taskId} 不存在`));
        return true;
      }
      if (t.status === 'completed') {
        resolve(t);
        return true;
      }
      if (t.status === 'failed' || t.status === 'cancelled') {
        reject(new Error(t.error || t.status));
        return true;
      }
      return false;
    };
    if (check()) return;
    const unsub = TaskManager.addListener((task) => {
      if (task.id !== taskId) return;
      if (check()) unsub();
    });
  });
}

let registered = false;

export function registerAnalysisFulfillers(): void {
  if (registered) return;
  registered = true;

  registerDelegate<ShotAnalysisInput, AnalysisResult>('analysis:shot:run', async (args) => {
    const { createCreationContext } = await import('./CreationContext');
    const { ShotAnalysisService } = await import('./ShotAnalysisService');
    const ctx = await createCreationContext(args.projectId, args.episodeId, {
      llmConfigId: args.llmSelection,
      styleSnapshot: args.styleSnapshot,
    });
    const service = new ShotAnalysisService(ctx);
    // 关键：用 main 已经创建的 parentTaskId，不让 service 自己 createTask
    service.setPresetAssets(args.presetAssets);
    // service.runShotAnalysis 内部按 parentTaskId 走 TaskManager.updateTask 推进进度
    // 抛错会写 status:failed；正常完成写 status:completed + result
    void service.runShotAnalysis(args.parentTaskId, args.episodeId, args.script);
    const final = await waitForLocalTaskTerminal(args.parentTaskId);
    const result = (final.result || {}) as { shotsCount?: number };
    return { ok: true, shotsCount: result.shotsCount };
  });

  registerDelegate<ScriptAnalysisInput, AnalysisResult>('analysis:script:run', async (args) => {
    const { BackgroundAnalysisService } = await import('./ScriptAnalysisService');
    const service = new BackgroundAnalysisService(args.projectId);
    // BackgroundAnalysisService.runAnalysis 内部使用 this.task，所以先绑定外部 taskId
    service.bindTask(args.parentTaskId);
    void service.runAnalysis(
      args.episodeId,
      args.episodeName,
      args.script,
      args.llmSelection,
      args.styleSnapshot,
    );
    const final = await waitForLocalTaskTerminal(args.parentTaskId);
    const result = (final.result || {}) as {
      charactersCount?: number;
      scenesCount?: number;
      propsCount?: number;
    };
    logger.info('analysis:script:run done', { taskId: args.parentTaskId, result });
    return {
      ok: true,
      charactersCount: result.charactersCount,
      scenesCount: result.scenesCount,
      propsCount: result.propsCount,
    };
  });
}

/**
 * analysisTaskClient —— opt-in 入口，让分析（剧本/分镜）走 main-side 父任务。
 *
 * 收益：
 *  - 主进程 concurrency=1 限流（防止双击触发）
 *  - 主进程 AbortController 取消信号
 *  - 多窗口共享父任务状态
 *
 * 不替代 services/ScriptAnalysisService.startBackgroundAnalysis 和
 * services/ShotAnalysisService.startShotAnalysis：它们仍可工作，新代码
 * 想要主进程父任务保护时改调本文件即可。
 */
import { submitTask, type TaskRecord } from './tasksIPC';
import type { PresetAssets } from './ShotAnalysisService';
import type { StyleSnapshotLike } from '../utils/promptNormalize';

export interface SubmitShotAnalysisInput {
  projectId: string;
  episodeId: string;
  episodeName: string;
  script: string;
  llmSelection?: string;
  presetAssets?: PresetAssets;
  styleSnapshot?: StyleSnapshotLike;
}

export interface SubmitScriptAnalysisInput {
  projectId: string;
  episodeId: string;
  episodeName: string;
  script: string;
  llmSelection?: string;
  styleSnapshot?: StyleSnapshotLike;
}

/** 提交分镜分析父任务（main-side，concurrency=1） */
export async function submitShotAnalysisTask(input: SubmitShotAnalysisInput): Promise<TaskRecord> {
  return submitTask({
    type: 'analysis:shot',
    scope: `project:${input.projectId}`,
    targetKind: 'episode',
    targetId: input.episodeId,
    input,
    initialPayload: {
      targetName: input.episodeName,
      category: 'analysis',
      subType: 'shot-analysis',
    },
  });
}

/** 提交剧本分析父任务 */
export async function submitScriptAnalysisTask(input: SubmitScriptAnalysisInput): Promise<TaskRecord> {
  return submitTask({
    type: 'analysis:script',
    scope: `project:${input.projectId}`,
    targetKind: 'episode',
    targetId: input.episodeId,
    input,
    initialPayload: {
      targetName: input.episodeName,
      category: 'script',
      subType: 'script-analysis',
    },
  });
}

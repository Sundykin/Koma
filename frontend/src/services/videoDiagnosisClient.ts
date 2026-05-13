/**
 * videoDiagnosisClient — R4 二创：提交 video-diagnosis 父任务
 *
 * scope='recreation:<videoId>'，按 video dedup。
 */
import { listTaskRecords, submitTask, type TaskRecord } from './tasksIPC';

export interface RecreationAiSelections {
  channelKey: string;
  models: {
    vlm?: string;
    llm?: string;
  };
}

export interface SubmitVideoDiagnosisInput {
  videoId: string;
  videoLabel?: string;
  channelKey: string;
  models: RecreationAiSelections['models'];
}

export interface SubmitVideoDiagnosisResult {
  task: TaskRecord;
  deduped: boolean;
}

const ACTIVE_STATUSES = ['pending', 'running', 'processing'] as const;

async function findActive(videoId: string): Promise<TaskRecord | null> {
  const records = await listTaskRecords({
    scope: `recreation:${videoId}`,
    type: 'video-diagnosis',
    targetKind: 'recreation-video',
    targetId: videoId,
    status: ACTIVE_STATUSES as unknown as string[],
  });
  return records[0] ?? null;
}

export async function submitVideoDiagnosisTask(
  input: SubmitVideoDiagnosisInput,
): Promise<SubmitVideoDiagnosisResult> {
  const existing = await findActive(input.videoId);
  if (existing) return { task: existing, deduped: true };

  const task = await submitTask({
    type: 'video-diagnosis',
    scope: `recreation:${input.videoId}`,
    targetKind: 'recreation-video',
    targetId: input.videoId,
    input: {
      videoId: input.videoId,
      channelKey: input.channelKey,
      models: input.models,
    },
    initialPayload: {
      targetName: input.videoLabel ?? input.videoId,
      category: 'recreation',
      subType: 'video-diagnosis',
    },
  });
  return { task, deduped: false };
}

/**
 * recreationModifyClient — R4 二创：提交修改单子项的 task。
 *
 * 一个修改单 item 对应一个 type=recreation-modify 父任务，
 * scope='recreation:<videoId>'，targetKind='recreation-modify-item'，targetId=<itemId>。
 *
 * 同 item 重复提交 → dedup 到现有活跃任务。
 */
import { listTaskRecords, submitTask, type TaskRecord } from './tasksIPC';

export interface SubmitModifyInput {
  videoId: string;
  videoLabel?: string;
  planId: string;
  channelKey?: string;
  item: {
    itemId: string;
    kind: string;
    scopeText: string;
    shotCount: number;
    params: Record<string, unknown>;
  };
}

export interface SubmitModifyResult {
  task: TaskRecord;
  deduped: boolean;
}

const ACTIVE_STATUSES = ['pending', 'running', 'processing'] as const;

async function findActive(videoId: string, itemId: string): Promise<TaskRecord | null> {
  const records = await listTaskRecords({
    scope: `recreation:${videoId}`,
    type: 'recreation-modify',
    targetKind: 'recreation-modify-item',
    targetId: itemId,
    status: ACTIVE_STATUSES as unknown as string[],
  });
  return records[0] ?? null;
}

export async function submitRecreationModifyTask(
  input: SubmitModifyInput,
): Promise<SubmitModifyResult> {
  const existing = await findActive(input.videoId, input.item.itemId);
  if (existing) return { task: existing, deduped: true };

  const task = await submitTask({
    type: 'recreation-modify',
    scope: `recreation:${input.videoId}`,
    targetKind: 'recreation-modify-item',
    targetId: input.item.itemId,
    input: {
      videoId: input.videoId,
      planId: input.planId,
      channelKey: input.channelKey,
      item: {
        itemId: input.item.itemId,
        kind: input.item.kind,
        params: input.item.params,
      },
    },
    initialPayload: {
      targetName: `${input.videoLabel ?? input.videoId} · ${input.item.kind}`,
      category: 'recreation',
      subType: input.item.kind,
    },
  });
  return { task, deduped: false };
}

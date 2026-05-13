/**
 * recreation-modify —— R4 二创：修改单某一项（face_swap / wardrobe / aspect_ratio / ...）的执行。
 *
 * 输入：{ videoId, planId, item: ModificationItem }
 * 输出：交给 renderer 的 RecreationModifyService（fulfiller 'recreation-modify:run'）执行；
 *       renderer 负责按 kind 分发到对应 executor（部分 executor 通过 IPC 回到 main 跑 ffmpeg）。
 *
 * 任务 scope：'recreation:<videoId>'（与诊断 task 共享 scope，但 type/targetId 不同所以不冲突）
 */
import { taskRunner } from '../TaskRunner';
import { delegateToRenderer } from '../delegate';

interface ModificationItemInput {
  itemId: string;
  kind: string;
  scopeText: string;
  shotCount: number;
  params: Record<string, unknown>;
  estUnits: number;
  estDurationSec: number;
  feasibilityScore: number;
}

interface RecreationModifyInput {
  videoId: string;
  planId: string;
  item: ModificationItemInput;
  /** 当前激活的 AI channel + 模型（VLM/LLM/TTI/TTS 走同一个 channelKey，下游按 kind 选用） */
  channelKey?: string;
}

interface RecreationModifyResult {
  ok: true;
  derivedVideoId: string;
  derivedKind: string;
}

const MODIFY_TIMEOUT_MS = 60 * 60 * 1_000;

let registered = false;

export function registerRecreationModifyHandler(): void {
  if (registered) return;
  registered = true;

  taskRunner.registerHandler({
    type: 'recreation-modify',
    concurrency: 1,
    recoverable: false,
    async run(ctx) {
      const result = await delegateToRenderer<RecreationModifyResult>({
        type: 'recreation-modify:run',
        args: { ...(ctx.input as RecreationModifyInput), parentTaskId: ctx.taskId },
        signal: ctx.signal,
        timeoutMs: MODIFY_TIMEOUT_MS,
      });
      return result;
    },
  });
}

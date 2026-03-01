import type { ShotRenderPhase, ShotRenderTaskPayload, ShotRenderTaskResult } from '../types';
import type { RendererDelegate } from './rendererDelegate';

export const TASK_CANCELLED_ERROR = 'TASK_CANCELLED';

export interface ShotRenderHandlerOptions {
  taskId: string;
  payload: ShotRenderTaskPayload;
  delegate: RendererDelegate;
  onProgress: (progress: number, phase: ShotRenderPhase, message: string) => void | Promise<void>;
  isCancelled?: () => boolean;
}

function ensureNotCancelled(isCancelled?: () => boolean): void {
  if (isCancelled?.()) {
    throw new Error(TASK_CANCELLED_ERROR);
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

export async function runShotRenderTask(options: ShotRenderHandlerOptions): Promise<ShotRenderTaskResult> {
  const { taskId, payload, delegate, onProgress, isCancelled } = options;

  ensureNotCancelled(isCancelled);
  await onProgress(5, 'prepareShotRenderStage', '准备分镜渲染');

  const prepareResultRaw = await delegate.execute('prepareShotRenderStage', taskId, {
    params: payload,
  });
  const prepareResult = asRecord(prepareResultRaw);

  ensureNotCancelled(isCancelled);
  await onProgress(35, 'prepareShotRenderStage', 'TTS 生成完成');

  const executeResultRaw = await delegate.execute('executeShotRenderStage', taskId, {
    params: payload,
    prepare: prepareResult,
  });
  const executeResult = asRecord(executeResultRaw);

  ensureNotCancelled(isCancelled);
  await onProgress(80, 'executeShotRenderStage', 'ITV 生成完成');

  const persistResultRaw = await delegate.execute('persistShotRenderStage', taskId, {
    params: payload,
    prepare: prepareResult,
    execute: executeResult,
  });
  const persistResult = asRecord(persistResultRaw);

  ensureNotCancelled(isCancelled);
  await onProgress(100, 'persistShotRenderStage', '版本保存完成');

  const output: Record<string, unknown> = {};
  if ('videoPath' in persistResult) {
    output.videoPath = persistResult.videoPath;
  }
  if ('audioPath' in persistResult) {
    output.audioPath = persistResult.audioPath;
  }

  return {
    prepare: prepareResult,
    execute: executeResult,
    persist: persistResult,
    version: asRecord(persistResult.version),
    output,
  };
}

import type { AppSettings, MediaAssetSource, ProviderAssetInput } from '../../../../../types';
import { DEFAULT_POLLING_CONFIG } from '../../../../../providers/polling';
import type { ITVTaskSnapshotContext } from '../../../../../providers/itv/types';
import { resolveProviderAssetInput } from '../../../../../services/mediaAssetResolver';
import { createLogger } from '../../../../../store/logger';
import { loadSettings } from '../../../../../store/settings/core';
import { delay, throwIfExecutionAborted } from '../linghuiExecutionShared';

const pollingLogger = createLogger('LinghuiVideoExecution');

export type AsyncTaskSnapshot<T> = {
  state: string;
  progress?: number;
  output?: T;
  error?: string;
};

export type AsyncTaskSnapshotGetter<T> = (taskId: string) => Promise<AsyncTaskSnapshot<T>>;

export interface AsyncPollingLogContext {
  traceId?: string;
  provider?: string;
  capability?: string;
  mediaKind: 'image' | 'video' | 'audio';
}

export async function resolveExecutionSettings(settingsSnapshot?: AppSettings): Promise<AppSettings> {
  return settingsSnapshot ?? await loadSettings();
}

export function getExecutionErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return String(error);
}

export async function ensureProviderAssetInputs(
  sources: Array<MediaAssetSource | ProviderAssetInput>,
): Promise<ProviderAssetInput[]> {
  const resolved = await Promise.all(
    sources.map(async source => {
      if (source && typeof source === 'object' && 'transport' in source && 'value' in source) {
        return source as ProviderAssetInput;
      }
      return resolveProviderAssetInput(source as MediaAssetSource);
    }),
  );

  return resolved.filter(Boolean) as ProviderAssetInput[];
}

export function createTaskSnapshotGetter<T>(
  provider: { getTaskSnapshot?: (taskId: string, context?: ITVTaskSnapshotContext) => Promise<AsyncTaskSnapshot<T>> },
  context?: ITVTaskSnapshotContext,
): AsyncTaskSnapshotGetter<T> | undefined {
  if (!provider.getTaskSnapshot) {
    return undefined;
  }
  return async (taskId: string) => provider.getTaskSnapshot!(taskId, context);
}

export async function resolveAsyncProviderResult<T>(
  taskId: string,
  getTaskSnapshot: AsyncTaskSnapshotGetter<T> | undefined,
  onProgress?: (progress: number, message?: string) => void,
  signal?: AbortSignal,
  logContext?: AsyncPollingLogContext,
): Promise<T> {
  if (!getTaskSnapshot) {
    throw new Error('当前 Provider 不支持任务状态查询');
  }

  const startedAt = Date.now();
  let pollCount = 0;
  pollingLogger.info('灵绘异步任务开始轮询', {
    taskId,
    ...logContext,
  });
  await delay(DEFAULT_POLLING_CONFIG.initialDelay ?? 0, signal);

  while (Date.now() - startedAt < DEFAULT_POLLING_CONFIG.maxDuration) {
    throwIfExecutionAborted(signal);
    pollCount += 1;

    let snapshot: AsyncTaskSnapshot<T>;
    try {
      snapshot = await getTaskSnapshot(taskId);
    } catch (error) {
      pollingLogger.error('灵绘异步任务轮询异常', {
        taskId,
        pollCount,
        ...logContext,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }

    pollingLogger.info('灵绘异步任务轮询快照', {
      taskId,
      pollCount,
      ...logContext,
      state: snapshot.state,
      progress: snapshot.progress,
      hasOutput: Boolean(snapshot.output),
      error: snapshot.error,
    });

    if (snapshot.state === 'running' || snapshot.state === 'queued') {
      throwIfExecutionAborted(signal);
      onProgress?.(snapshot.progress ?? 0, '生成中');
      await delay(DEFAULT_POLLING_CONFIG.interval, signal);
      continue;
    }

    if (snapshot.state === 'failed') {
      pollingLogger.error('灵绘异步任务轮询判定失败', {
        taskId,
        pollCount,
        ...logContext,
        error: snapshot.error || '生成失败',
      });
      throw new Error(snapshot.error || '生成失败');
    }

    if (snapshot.state === 'succeeded' && snapshot.output) {
      throwIfExecutionAborted(signal);
      pollingLogger.info('灵绘异步任务轮询完成', {
        taskId,
        pollCount,
        ...logContext,
      });
      onProgress?.(100, '生成完成');
      return snapshot.output;
    }

    await delay(DEFAULT_POLLING_CONFIG.interval, signal);
  }

  pollingLogger.error('灵绘异步任务轮询超时', {
    taskId,
    pollCount,
    ...logContext,
    maxDuration: DEFAULT_POLLING_CONFIG.maxDuration,
  });
  throw new Error('任务轮询超时');
}

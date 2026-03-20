import type {
  AsyncTask,
  AsyncTaskTargetType,
  AsyncTaskType,
  ITVRequest,
  MediaAssetSource,
  MediaKind,
  MediaOwnerRef,
  ProviderAssetInput,
  ProviderTaskSnapshot,
  StoredMediaAsset,
  TTIRequest,
  TTSRequest,
} from '../types';
import { createLogger } from '../store/logger';
import {
  createTask,
  markTaskCompleted,
  markTaskFailed,
  updateTask,
  updateTaskProgress,
} from '../store/taskQueueStore';
import { resolveProviderAssetInput, resolveProviderAssetInputs } from './mediaAssetResolver';
import { persistMediaAsset } from './mediaPersistenceService';
import { bindOwnerRefMedia } from './mediaTaskBindingService';
import { getProjectITVProvider, getProjectTTIProvider, getProjectTTSProvider } from '../providers';

const logger = createLogger('MediaGeneration');

function inferTaskType(kind: MediaKind): AsyncTaskType {
  if (kind === 'video') return 'itv';
  if (kind === 'audio') return 'tts';
  return 'tti';
}

function inferTargetType(ownerRef: MediaOwnerRef): AsyncTaskTargetType {
  switch (ownerRef.ownerType) {
    case 'character':
      return 'character';
    case 'scene':
      return 'scene';
    case 'prop':
      return 'prop';
    case 'shot':
    case 'shot-version':
      return 'shot';
    default:
      return 'shot';
  }
}

async function ensureProviderAssetInput(
  source: MediaAssetSource | ProviderAssetInput | undefined
): Promise<ProviderAssetInput | undefined> {
  if (!source) return undefined;
  if (typeof source === 'object' && 'transport' in source && 'value' in source) {
    return source as ProviderAssetInput;
  }
  return resolveProviderAssetInput(source as MediaAssetSource);
}

async function ensureProviderAssetInputs(
  sources: Array<MediaAssetSource | ProviderAssetInput | undefined>
): Promise<ProviderAssetInput[]> {
  const resolved = await Promise.all(sources.map(ensureProviderAssetInput));
  return resolved.filter(Boolean) as ProviderAssetInput[];
}

function mapSnapshotToTaskStatus(
  snapshot: ProviderTaskSnapshot<any>
): { status: AsyncTask['status']; progress: number } {
  if (snapshot.state === 'queued') return { status: 'pending', progress: snapshot.progress ?? 0 };
  if (snapshot.state === 'running') return { status: 'processing', progress: snapshot.progress ?? 0 };
  if (snapshot.state === 'succeeded') return { status: 'completed', progress: 100 };
  return { status: 'failed', progress: snapshot.progress ?? 0 };
}

function mergeMediaMetadata(
  base: StoredMediaAsset,
  patch: Partial<StoredMediaAsset>
): StoredMediaAsset {
  return {
    ...base,
    ...patch,
    metadata: {
      ...(base.metadata || {}),
      ...(patch.metadata || {}),
    },
  };
}

function durationSecToMs(value?: number): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  return Math.round(value * 1000);
}

function getOptionNumber(
  options: Record<string, unknown> | undefined,
  key: string
): number | undefined {
  const value = options?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

export class MediaGenerationService {
  async generateImage(params: {
    projectId: string;
    ownerRef: MediaOwnerRef;
    request: TTIRequest<MediaAssetSource | ProviderAssetInput>;
    ttiConfigId?: string;
    taskName?: string;
  }): Promise<StoredMediaAsset> {
    const { projectId, ownerRef, request, ttiConfigId, taskName } = params;
    const provider = await getProjectTTIProvider(ttiConfigId);
    if (!provider) throw new Error('未配置 TTI 服务');

    const references = await ensureProviderAssetInputs(request.references || []);
    const started = await provider.start({
      prompt: request.prompt,
      references,
      options: request.options,
    });

    const kind: MediaKind = 'image';
    const options = request.options as Record<string, unknown> | undefined;
    const optionWidth = getOptionNumber(options, 'width');
    const optionHeight = getOptionNumber(options, 'height');
    const optionSeed = getOptionNumber(options, 'seed');

    if (started.mode === 'immediate') {
      const output = started.output;
      const source = output.url || output.path;
      const persisted = await persistMediaAsset({
        projectId,
        kind,
        source,
        ownerRef,
        provider: provider.config?.provider,
        metadata: {
          prompt: request.prompt,
          ...(optionWidth ? { width: optionWidth } : undefined),
          ...(optionHeight ? { height: optionHeight } : undefined),
          ...(optionSeed !== undefined ? { seed: optionSeed } : undefined),
        },
      });

      const finalAsset = mergeMediaMetadata(persisted, {
        provider: provider.config?.provider,
        width: optionWidth ?? output.width ?? persisted.width,
        height: optionHeight ?? output.height ?? persisted.height,
      });

      await bindOwnerRefMedia(projectId, ownerRef, finalAsset);
      return finalAsset;
    }

    const task = await this.createMediaTask(projectId, {
      kind,
      ownerRef,
      remoteTaskId: started.taskId,
      taskName: taskName || '图片生成',
    });

    return this.pollAndFinalizeTask({
      projectId,
      kind,
      task,
      getSnapshot: async (remoteTaskId) => {
        if (!provider.getTaskSnapshot) {
          throw new Error('TTI Provider 不支持任务查询');
        }
        return provider.getTaskSnapshot(remoteTaskId);
      },
      extractSource: (output: any) => output?.url || output?.path,
      enrichAsset: (asset) => mergeMediaMetadata(asset, {
        provider: provider.config?.provider,
        providerTaskId: started.taskId,
        width: optionWidth ?? asset.width,
        height: optionHeight ?? asset.height,
        metadata: {
          prompt: request.prompt,
          ...(optionSeed !== undefined ? { seed: optionSeed } : undefined),
        },
      }),
      providerTaskId: started.taskId,
    });
  }

  async generateVideo(params: {
    projectId: string;
    ownerRef: MediaOwnerRef;
    request: ITVRequest<MediaAssetSource | ProviderAssetInput>;
    itvConfigId?: string;
    taskName?: string;
  }): Promise<StoredMediaAsset> {
    const { projectId, ownerRef, request, itvConfigId, taskName } = params;
    const provider = await getProjectITVProvider(itvConfigId);
    if (!provider) throw new Error('未配置 ITV 服务');

    const primaryImage = await ensureProviderAssetInput(request.primaryImage as any);
    if (!primaryImage) throw new Error('缺少 primaryImage');
    const additionalReferences = await ensureProviderAssetInputs((request.additionalReferences || []) as any);

    const started = await provider.start({
      prompt: request.prompt,
      primaryImage,
      additionalReferences,
      options: request.options,
    } as any);

    const kind: MediaKind = 'video';
    const options = request.options as Record<string, unknown> | undefined;
    const optionDuration = getOptionNumber(options, 'duration');

    if (started.mode === 'immediate') {
      const output = started.output;
      const source = (output as any).source;
      const persisted = await persistMediaAsset({
        projectId,
        kind,
        source,
        ownerRef,
        provider: provider.config?.provider,
        providerTaskId: (output as any).taskId,
        metadata: {
          prompt: request.prompt,
          ...(optionDuration ? { durationSec: optionDuration } : undefined),
        },
      });
      const finalAsset = mergeMediaMetadata(persisted, {
        provider: provider.config?.provider,
        durationMs: durationSecToMs(optionDuration) ?? persisted.durationMs,
        metadata: { prompt: request.prompt },
      });
      await bindOwnerRefMedia(projectId, ownerRef, finalAsset);
      return finalAsset;
    }

    const task = await this.createMediaTask(projectId, {
      kind,
      ownerRef,
      remoteTaskId: started.taskId,
      taskName: taskName || '视频生成',
    });

    return this.pollAndFinalizeTask({
      projectId,
      kind,
      task,
      getSnapshot: async (remoteTaskId) => {
        if (!provider.getTaskSnapshot) {
          throw new Error('ITV Provider 不支持任务查询');
        }
        return provider.getTaskSnapshot(remoteTaskId);
      },
      extractSource: (output: any) => output?.source,
      enrichAsset: (asset) => mergeMediaMetadata(asset, {
        provider: provider.config?.provider,
        providerTaskId: started.taskId,
        durationMs: durationSecToMs(optionDuration) ?? asset.durationMs,
        metadata: { prompt: request.prompt },
      }),
      providerTaskId: started.taskId,
    });
  }

  async generateAudio(params: {
    projectId: string;
    ownerRef: MediaOwnerRef;
    request: TTSRequest;
    ttsConfigId?: string;
    taskName?: string;
  }): Promise<StoredMediaAsset> {
    const { projectId, ownerRef, request, ttsConfigId, taskName } = params;
    const provider = await getProjectTTSProvider(ttsConfigId);
    if (!provider) throw new Error('未配置 TTS 服务');

    const started = await provider.start(request as any);
    const kind: MediaKind = 'audio';

    if (started.mode === 'immediate') {
      const output = started.output;
      const persisted = await persistMediaAsset({
        projectId,
        kind,
        source: output.path,
        ownerRef,
        provider: provider.config?.provider,
        metadata: { voiceId: request.voiceId },
      });

      const finalAsset = mergeMediaMetadata(persisted, {
        provider: provider.config?.provider,
        durationMs: durationSecToMs(output.duration) ?? persisted.durationMs,
        mimeType: output.format === 'wav' ? 'audio/wav' : 'audio/mpeg',
      });

      await bindOwnerRefMedia(projectId, ownerRef, finalAsset);
      return finalAsset;
    }

    const task = await this.createMediaTask(projectId, {
      kind,
      ownerRef,
      remoteTaskId: started.taskId,
      taskName: taskName || '语音合成',
    });

    return this.pollAndFinalizeTask({
      projectId,
      kind,
      task,
      getSnapshot: async (remoteTaskId) => {
        if (!provider.getTaskSnapshot) {
          throw new Error('TTS Provider 不支持任务查询');
        }
        return provider.getTaskSnapshot(remoteTaskId);
      },
      extractSource: (output: any) => output?.path,
      enrichAsset: (asset) => mergeMediaMetadata(asset, {
        provider: provider.config?.provider,
        providerTaskId: started.taskId,
        metadata: { voiceId: request.voiceId },
      }),
      providerTaskId: started.taskId,
    });
  }

  async recoverTask(params: {
    projectId: string;
    task: AsyncTask;
    ttiConfigId?: string;
    itvConfigId?: string;
    ttsConfigId?: string;
    onProgress?: (task: AsyncTask, progress: number) => void;
  }): Promise<StoredMediaAsset | null> {
    const { projectId, task, ttiConfigId, itvConfigId, ttsConfigId, onProgress } = params;
    if (!task.remoteTaskId) return null;
    const kind: MediaKind = task.type === 'itv' ? 'video' : task.type === 'tts' ? 'audio' : 'image';

    const getSnapshot = async (remoteTaskId: string): Promise<ProviderTaskSnapshot<any>> => {
      if (task.type === 'tti') {
        const provider = await getProjectTTIProvider(ttiConfigId);
        if (!provider?.getTaskSnapshot) throw new Error('TTI Provider 不可用');
        return provider.getTaskSnapshot(remoteTaskId);
      }
      if (task.type === 'itv') {
        const provider = await getProjectITVProvider(itvConfigId);
        if (!provider?.getTaskSnapshot) throw new Error('ITV Provider 不可用');
        return provider.getTaskSnapshot(remoteTaskId);
      }
      const provider = await getProjectTTSProvider(ttsConfigId);
      if (!provider?.getTaskSnapshot) throw new Error('TTS Provider 不可用');
      return provider.getTaskSnapshot(remoteTaskId);
    };

    return this.pollAndFinalizeTask({
      projectId,
      kind,
      task,
      getSnapshot,
      extractSource: (output: any) => {
        if (kind === 'video') return output?.source;
        if (kind === 'audio') return output?.path;
        return output?.url || output?.path;
      },
      enrichAsset: (asset) => mergeMediaMetadata(asset, {
        providerTaskId: task.remoteTaskId,
      }),
      providerTaskId: task.remoteTaskId,
      onProgress,
    });
  }

  private async createMediaTask(
    projectId: string,
    params: {
      kind: MediaKind;
      ownerRef: MediaOwnerRef;
      remoteTaskId: string;
      taskName: string;
    }
  ): Promise<AsyncTask> {
    const { kind, ownerRef, remoteTaskId, taskName } = params;
    const taskType = inferTaskType(kind);
    const targetType = inferTargetType(ownerRef);
    const targetId = ownerRef.ownerId;

    const task = await createTask(projectId, {
      projectId,
      type: taskType,
      targetType,
      targetId,
      targetName: taskName,
      remoteTaskId,
      ownerRef,
      status: 'processing',
      progress: 0,
      maxRetries: 3,
    });

    logger.info(`创建媒体任务: ${task.id}`, { kind, taskType, remoteTaskId });
    return task;
  }

  private async pollAndFinalizeTask(params: {
    projectId: string;
    kind: MediaKind;
    task: AsyncTask;
    getSnapshot: (remoteTaskId: string) => Promise<ProviderTaskSnapshot<any>>;
    extractSource: (output: any) => string | undefined;
    enrichAsset: (asset: StoredMediaAsset) => StoredMediaAsset;
    providerTaskId?: string;
    onProgress?: (task: AsyncTask, progress: number) => void;
  }): Promise<StoredMediaAsset> {
    const { projectId, kind, task, getSnapshot, extractSource, enrichAsset, providerTaskId, onProgress } = params;

    const pollIntervalMs = 3000;
    const maxPollMs = 10 * 60 * 1000;
    const startTime = Date.now();

    while (Date.now() - startTime < maxPollMs) {
      const snapshot = await getSnapshot(task.remoteTaskId);
      const mapped = mapSnapshotToTaskStatus(snapshot);

      if (mapped.status === 'processing' || mapped.status === 'pending') {
        if (typeof mapped.progress === 'number') {
          await updateTaskProgress(projectId, task.id, mapped.progress);
          onProgress?.(task, mapped.progress);
        }
      }

      if (snapshot.state === 'failed') {
        const error = snapshot.error || '生成失败';
        await markTaskFailed(projectId, task.id, error);
        throw new Error(error);
      }

      if (snapshot.state === 'succeeded') {
        const source = snapshot.output ? extractSource(snapshot.output) : undefined;
        if (!source) {
          const error = '任务完成但未返回结果地址';
          await markTaskFailed(projectId, task.id, error);
          throw new Error(error);
        }

        const persisted = await persistMediaAsset({
          projectId,
          kind,
          source,
          ownerRef: task.ownerRef,
          providerTaskId: providerTaskId || task.remoteTaskId,
        });

        const finalAsset = enrichAsset(persisted);
        await markTaskCompleted(projectId, task.id, finalAsset);

        if (task.ownerRef) {
          await bindOwnerRefMedia(projectId, task.ownerRef, finalAsset);
        }

        return finalAsset;
      }

      await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
    }

    const error = '任务超时';
    await markTaskFailed(projectId, task.id, error);
    throw new Error(error);
  }
}

export const mediaGenerationService = new MediaGenerationService();

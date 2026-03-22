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
import {
  ensureRemoteUrlForImageAsset,
  ensureRemoteUrlForImageSource,
  ensureRemoteUrlForImageSources,
} from './mediaRemoteUrlService';
import type { RemoteUrlPolicy } from './mediaRemoteUrlService';
import type { PromptCompilationInput } from './promptCompilation/types';
import { compileGrokITV, compileGrokTTI } from './promptCompilation/grokImageIndexCompiler';
import { parseMentions } from '../editor/mentionTypes';

const logger = createLogger('MediaGeneration');

function truncateString(value: string, max = 600): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max)}...(truncated, ${value.length} chars)`;
}

function sanitizeBodyForLog(body: any): any {
  // Avoid spewing huge base64 payloads to console while keeping the overall structure visible.
  const walk = (v: any): any => {
    if (typeof v === 'string') {
      if (v.startsWith('data:')) return truncateString(v, 140);
      return v.length > 2000 ? truncateString(v, 800) : v;
    }
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') {
      const out: Record<string, any> = {};
      for (const [k, val] of Object.entries(v)) out[k] = walk(val);
      return out;
    }
    return v;
  };
  return walk(body);
}

function getPromptProtocol(provider: any): string | undefined {
  // ChannelConfig.providerConfig is spread into resolved config (see store/settings/mediaConfig.ts),
  // so protocol flags appear on provider.config directly.
  return provider?.config?.promptProtocol as string | undefined;
}

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

function supportsDataUrl(transports: Array<'remote-url' | 'data-url'> | undefined): boolean {
  return Boolean(transports?.includes('data-url'));
}

function providerAllowsDataUrlForITV(provider: any): { primary: boolean; additional: boolean } {
  const primaryTransports = provider?.assetTransports?.primaryImage as Array<'remote-url' | 'data-url'> | undefined;
  const additionalTransports = provider?.assetTransports?.additionalReferences as Array<'remote-url' | 'data-url'> | undefined;
  return {
    // Default is URL-only to stay safe for remote servers.
    primary: supportsDataUrl(primaryTransports),
    additional: supportsDataUrl(additionalTransports ?? primaryTransports),
  };
}

export class MediaGenerationService {
  async generateImage(params: {
    projectId: string;
    ownerRef: MediaOwnerRef;
    request: TTIRequest<MediaAssetSource | ProviderAssetInput>;
    promptCompilation?: PromptCompilationInput;
    ttiConfigId?: string;
    taskName?: string;
  }): Promise<StoredMediaAsset> {
    const { projectId, ownerRef, request, ttiConfigId, taskName, promptCompilation } = params;
    const provider = await getProjectTTIProvider(ttiConfigId);
    if (!provider) throw new Error('未配置 TTI 服务');

    const protocol = getPromptProtocol(provider);
    logger.info('TTI generateImage entry', {
      ownerRef,
      provider: provider.config?.provider,
      protocol: protocol || 'none',
      hasPromptCompilation: Boolean(promptCompilation?.selectedAssets?.length),
      referencesCount: (request.references || []).length,
    });
    const originalPrompt = request.prompt;
    let compiledPrompt = originalPrompt;
    let compilationDebug: any = null;
    let compileReferences = request.references || [];

    if (protocol === 'grok-image-index' && promptCompilation?.selectedAssets?.length) {
      const { compiledPrompt: cp, compiledReferences, debug } = compileGrokTTI({
        prompt: originalPrompt,
        selectedAssets: promptCompilation.selectedAssets,
        // Keep any manual refs as trailing extras (do not shift @Image N indices).
        extraReferences: (request.references || []),
      });
      compiledPrompt = cp;
      compilationDebug = debug;
      compileReferences = compiledReferences;

      logger.info('TTI prompt compiled (grok-image-index)', {
        ownerRef,
        protocol,
        originalPrompt: truncateString(originalPrompt, 800),
        compiledPrompt: truncateString(compiledPrompt, 800),
        mentions: parseMentions(originalPrompt),
        debug,
      });
    }

    const references = await ensureProviderAssetInputs(compileReferences);
    if (protocol === 'grok-image-index') {
      logger.info('TTI start payload (post-compile)', sanitizeBodyForLog({
        provider: provider.config?.provider,
        promptProtocol: protocol,
        prompt: compiledPrompt,
        references: references.map(r => ({ transport: r.transport, value: r.value, mimeType: r.mimeType })),
        options: request.options,
      }));
    }
    const started = await provider.start({
      prompt: compiledPrompt,
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
          prompt: originalPrompt,
          ...(protocol ? { promptProtocol: protocol } : undefined),
          ...(compilationDebug ? { compiledPrompt, compilationDebug } : undefined),
          ...(optionWidth ? { width: optionWidth } : undefined),
          ...(optionHeight ? { height: optionHeight } : undefined),
          ...(optionSeed !== undefined ? { seed: optionSeed } : undefined),
        },
      });

      const normalized = await ensureRemoteUrlForImageAsset({
        projectId,
        asset: persisted,
        policy: 'best-effort',
      });

      const finalAsset = mergeMediaMetadata(normalized, {
        provider: provider.config?.provider,
        width: optionWidth ?? output.width ?? normalized.width,
        height: optionHeight ?? output.height ?? normalized.height,
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
          prompt: originalPrompt,
          ...(protocol ? { promptProtocol: protocol } : undefined),
          ...(compilationDebug ? { compiledPrompt, compilationDebug } : undefined),
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
    promptCompilation?: PromptCompilationInput;
    itvConfigId?: string;
    taskName?: string;
  }): Promise<StoredMediaAsset> {
    const { projectId, ownerRef, request, itvConfigId, taskName, promptCompilation } = params;
    const provider = await getProjectITVProvider(itvConfigId);
    if (!provider) throw new Error('未配置 ITV 服务');

    const protocol = getPromptProtocol(provider);
    logger.info('ITV generateVideo entry', {
      ownerRef,
      provider: provider.config?.provider,
      protocol: protocol || 'none',
      hasPromptCompilation: Boolean(promptCompilation?.selectedAssets?.length),
      additionalRefsCount: (request.additionalReferences || []).length,
    });
    const originalPrompt = request.prompt;
    let compiledPrompt = originalPrompt;
    let compilationDebug: any = null;
    let additionalReferencesInput = (request.additionalReferences || []);

    // Decide policy based on provider supported transports:
    // - URL-only providers: remoteUrl is required (fail fast if cannot upload / missing image-hosting)
    // - data-url-capable providers: remoteUrl is best-effort (fall back to data-url payload)
    const allow = providerAllowsDataUrlForITV(provider);
    const primaryPolicy: RemoteUrlPolicy = allow.primary ? 'best-effort' : 'required';
    const additionalPolicy: RemoteUrlPolicy = allow.additional ? 'best-effort' : 'required';

    // When provider accepts data-url, do not attempt "best-effort" image hosting uploads here.
    // This avoids hard dependency on image-hosting plugins and keeps the pipeline deterministic:
    // local paths -> data-url (resolver), remote URLs remain remote-url.
    const normalizedPrimary = primaryPolicy === 'required'
      ? await ensureRemoteUrlForImageSource({
          projectId,
          source: request.primaryImage as any,
          policy: primaryPolicy,
        })
      : (request.primaryImage as any);

    const normalizedAdditional = additionalPolicy === 'required'
      ? await ensureRemoteUrlForImageSources({
          projectId,
          sources: (additionalReferencesInput as any[]),
          policy: additionalPolicy,
        })
      : (additionalReferencesInput as any[]);

    const primaryImage = await ensureProviderAssetInput(normalizedPrimary as any);
    if (!primaryImage) throw new Error('缺少 primaryImage');
    let additionalReferences = await ensureProviderAssetInputs(normalizedAdditional as any);

    if (protocol === 'grok-image-index' && promptCompilation?.selectedAssets?.length) {
      // Rebuild additional references in strict order (selectedAssets -> extras) so @Image N is stable.
      // Important: We compile on the "raw prompt" and rely on the normalized remote/data URLs above.
      const { compiledPrompt: cp, compiledAdditionalReferences, debug } = compileGrokITV({
        prompt: originalPrompt,
        primaryImage: primaryImage.value,
        selectedAssets: promptCompilation.selectedAssets,
        extraReferences: (request.additionalReferences || []),
      });
      compiledPrompt = cp;
      compilationDebug = debug;

      // Normalize the compiled additional refs again (they may include StoredMediaAsset / local paths).
      const normalizedCompiledAdditional = additionalPolicy === 'required'
        ? await ensureRemoteUrlForImageSources({
            projectId,
            sources: (compiledAdditionalReferences as any[]),
            policy: additionalPolicy,
          })
        : (compiledAdditionalReferences as any[]);
      additionalReferences = await ensureProviderAssetInputs(normalizedCompiledAdditional as any);

      logger.info('ITV prompt compiled (grok-image-index)', {
        ownerRef,
        protocol,
        originalPrompt: truncateString(originalPrompt, 800),
        compiledPrompt: truncateString(compiledPrompt, 800),
        mentions: parseMentions(originalPrompt),
        debug,
      });
    }

    if (protocol === 'grok-image-index') {
      logger.info('ITV start payload (post-compile)', sanitizeBodyForLog({
        provider: provider.config?.provider,
        promptProtocol: protocol,
        prompt: compiledPrompt,
        primaryImage: { transport: primaryImage.transport, value: primaryImage.value, mimeType: primaryImage.mimeType },
        additionalReferences: additionalReferences.map(r => ({ transport: r.transport, value: r.value, mimeType: r.mimeType })),
        options: request.options,
      }));
    }

    if (!allow.primary && primaryImage.transport !== 'remote-url') {
      throw new Error('当前 ITV Provider 仅支持 URL 图片输入（remote-url），请启用图床以获得 remoteUrl');
    }
    if (!allow.additional && additionalReferences.some(r => r.transport !== 'remote-url')) {
      throw new Error('当前 ITV Provider 仅支持 URL 图片输入（remote-url），请启用图床以获得 remoteUrl');
    }

    const started = await provider.start({
      prompt: compiledPrompt,
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
          prompt: originalPrompt,
          ...(protocol ? { promptProtocol: protocol } : undefined),
          ...(compilationDebug ? { compiledPrompt, compilationDebug } : undefined),
          ...(optionDuration ? { durationSec: optionDuration } : undefined),
        },
      });
      const finalAsset = mergeMediaMetadata(persisted, {
        provider: provider.config?.provider,
        durationMs: durationSecToMs(optionDuration) ?? persisted.durationMs,
        metadata: {
          prompt: originalPrompt,
          ...(protocol ? { promptProtocol: protocol } : undefined),
          ...(compilationDebug ? { compiledPrompt, compilationDebug } : undefined),
        },
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
        metadata: {
          prompt: originalPrompt,
          ...(protocol ? { promptProtocol: protocol } : undefined),
          ...(compilationDebug ? { compiledPrompt, compilationDebug } : undefined),
        },
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

        const enriched = enrichAsset(persisted);
        const finalAsset = kind === 'image'
          ? await ensureRemoteUrlForImageAsset({ projectId, asset: enriched, policy: 'best-effort' })
          : enriched;
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

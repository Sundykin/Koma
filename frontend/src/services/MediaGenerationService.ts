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
import {
  isImageToVideoRequest,
  isReferenceToVideoRequest,
  isTextToVideoRequest,
} from '../types';
import { createLogger } from '../store/logger';
import {
  createTask,
  markTaskCompleted,
  markTaskFailed,
  updateTask,
  updateTaskProgress,
} from '../store/taskQueueStore';
import { loadSettings } from '../store/globalStore';
import { resolveProviderAssetInput, resolveProviderAssetInputs } from './mediaAssetResolver';
import { persistMediaAsset } from './mediaPersistenceService';
import { bindOwnerRefMedia } from './mediaTaskBindingService';
import { getProjectITVProvider, getProjectTTIProvider, getProjectTTSProvider } from '../providers';
import {
  listConfiguredModelSelectOptions,
  resolveConfiguredChannelModel,
  resolveConfiguredChannelModelWithCapabilityFallback,
  serializeMediaSelection,
  type ResolvedChannelModelContext,
} from '../providers/channel/resolver';
import type { MediaCategory, ModelCapability } from '../providers/channel/types';
import {
  ensureRemoteUrlForImageAsset,
} from './mediaRemoteUrlService';
import type { PromptCompilationInput } from './promptCompilation/types';
import { compileGrokTTI } from './promptCompilation/grokImageIndexCompiler';
import {
  compileWorkflowVideoDomainRequest,
  getPromptProtocol,
  mapVideoRequestToProviderRequest,
  resolveITVTransportSupport,
  resolveVideoProtocolCompilationLimit,
} from './promptCompilation/videoRequestCompiler';
import { parseMentions } from '../editor/mentionTypes';
import { sanitizeBodyForLog, truncateString } from '../utils/logFormatting';
import {
  createVideoTraceContext,
  summarizeVideoRequestForLog,
  withVideoTrace,
} from '../utils/videoGenerationTrace';
import { DEFAULT_POLLING_CONFIG } from '../providers/polling';

const logger = createLogger('MediaGeneration');

function buildExecutionMetadata(
  context: ResolvedChannelModelContext | undefined,
  capability: ModelCapability,
) {
  return {
    channelId: context?.channelConfig.id,
    modelId: context?.model.id,
    capability,
  };
}

const CAPABILITY_LABELS: Partial<Record<ModelCapability, string>> = {
  'llm.chat': '对话',
  'image.text-to-image': '文生图',
  'image.image-to-image': '图生图',
  'video.text-to-video': '文生视频',
  'video.image-to-video': '图生视频',
  'video.reference-to-video': '参考生视频',
  'video.start-end-to-video': '首尾帧视频',
  'speech.text-to-speech': '语音合成',
};

function buildMissingCapabilityError(params: {
  category: MediaCategory;
  capability: ModelCapability;
  selectionKey?: string;
  hasCapableModels: boolean;
  fallbackMessage: string;
}): string {
  const capabilityLabel = CAPABILITY_LABELS[params.capability] || params.capability;
  if (params.hasCapableModels && params.selectionKey) {
    return `当前选择的模型不支持${capabilityLabel}，请切换模型`;
  }
  if (!params.hasCapableModels) {
    return `当前没有配置支持${capabilityLabel}的模型`;
  }
  return params.fallbackMessage;
}

async function resolveProviderAndContext<T>(params: {
  category: MediaCategory;
  selectionKey?: string;
  capability: ModelCapability;
  getProvider: (
    selectionKey?: string,
    capability?: ModelCapability,
    settingsSnapshot?: Awaited<ReturnType<typeof loadSettings>>,
  ) => Promise<T | null>;
  missingError: string;
  allowCapabilityFallback?: boolean;
}): Promise<{ provider: T; resolvedContext?: ResolvedChannelModelContext }> {
  let resolvedContext: ResolvedChannelModelContext | undefined;
  let resolvedSelectionKey = params.selectionKey;
  let capabilityError: string | undefined;
  let settingsSnapshot: Awaited<ReturnType<typeof loadSettings>> | undefined;
  try {
    const canReadSettings = typeof window !== 'undefined'
      ? typeof window.localStorage !== 'undefined'
      : typeof localStorage !== 'undefined';
    if (canReadSettings) {
      const settings = await loadSettings();
      settingsSnapshot = settings;
      const resolved = params.allowCapabilityFallback
        ? resolveConfiguredChannelModelWithCapabilityFallback(
            settings,
            params.category,
            params.selectionKey,
            params.capability,
          )
        : {
            context: resolveConfiguredChannelModel(
              settings,
              params.category,
              params.selectionKey,
              params.capability,
            ),
            effectiveSelectionKey: params.selectionKey,
          };
      resolvedContext = resolved.context;
      resolvedSelectionKey = resolved.effectiveSelectionKey || resolvedSelectionKey;
      if (!resolvedContext) {
        const capableModels = listConfiguredModelSelectOptions(
          settings,
          params.category,
          params.capability,
        );
        capabilityError = buildMissingCapabilityError({
          category: params.category,
          capability: params.capability,
          selectionKey: params.selectionKey,
          hasCapableModels: capableModels.length > 0,
          fallbackMessage: params.missingError,
        });
      }
    }
  } catch (error) {
    logger.warn('Failed to resolve media execution context metadata', {
      category: params.category,
      capability: params.capability,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  const provider = await params.getProvider(
    resolvedSelectionKey,
    params.capability,
    settingsSnapshot,
  );
  if (!provider) {
    throw new Error(capabilityError || params.missingError);
  }

  return { provider, resolvedContext };
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

function summarizeImageSource(source: string | undefined): Record<string, unknown> {
  if (!source) return { present: false };
  if (source.startsWith('data:')) {
    return {
      present: true,
      kind: 'data-url',
      length: source.length,
      preview: truncateString(source, 120),
    };
  }
  return {
    present: true,
    kind: /^https?:\/\//i.test(source) ? 'remote-url' : 'path',
    value: truncateString(source, 500),
  };
}

function summarizeImageAsset(asset: StoredMediaAsset): Record<string, unknown> {
  return {
    kind: asset.kind,
    localPath: asset.localPath,
    remoteUrl: asset.remoteUrl,
    mimeType: asset.mimeType,
    provider: asset.provider,
    providerTaskId: asset.providerTaskId,
    channelId: asset.channelId,
    modelId: asset.modelId,
    width: asset.width,
    height: asset.height,
    capability: asset.capability,
  };
}

function resolveTaskSelectionKey(task: AsyncTask, fallbackSelection?: string): string | undefined {
  if (task.channelId && task.modelId) {
    return serializeMediaSelection({
      channelId: task.channelId,
      modelId: task.modelId,
    });
  }
  return fallbackSelection;
}

function resolveTaskCapability(task: AsyncTask): ModelCapability {
  if (task.capability) {
    return task.capability as ModelCapability;
  }

  switch (task.type) {
    case 'tts':
      return 'speech.text-to-speech';
    case 'itv':
      return 'video.image-to-video';
    case 'tti':
    default:
      return 'image.text-to-image';
  }
}

export class MediaGenerationService {
  async generateImage(params: {
    projectId: string;
    ownerRef: MediaOwnerRef;
    request: TTIRequest<MediaAssetSource | ProviderAssetInput>;
    promptCompilation?: PromptCompilationInput;
    ttiSelection?: string;
    taskName?: string;
  }): Promise<StoredMediaAsset> {
    const { projectId, ownerRef, request, ttiSelection, taskName, promptCompilation } = params;
    const { provider, resolvedContext } = await resolveProviderAndContext({
      category: 'tti',
      selectionKey: ttiSelection,
      capability: 'image.text-to-image',
      getProvider: getProjectTTIProvider,
      missingError: '未配置 TTI 服务',
    });
    const executionMetadata = buildExecutionMetadata(resolvedContext, 'image.text-to-image');

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

    let references: ProviderAssetInput[];
    try {
      references = await ensureProviderAssetInputs(compileReferences);
      logger.info('TTI references resolved', sanitizeBodyForLog({
        ownerRef,
        provider: provider.config?.provider,
        protocol: protocol || 'none',
        requestedReferences: compileReferences.length,
        resolvedReferences: references.map(r => ({ transport: r.transport, value: r.value, mimeType: r.mimeType })),
      }));
    } catch (error) {
      logger.error('TTI reference resolve failed', {
        ownerRef,
        provider: provider.config?.provider,
        protocol: protocol || 'none',
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }

    logger.info('TTI provider.start payload', sanitizeBodyForLog({
      ownerRef,
      provider: provider.config?.provider,
      channelId: executionMetadata.channelId,
      modelId: executionMetadata.modelId,
      promptProtocol: protocol || 'none',
      prompt: compiledPrompt,
      references: references.map(r => ({ transport: r.transport, value: r.value, mimeType: r.mimeType })),
      options: request.options,
    }));

    let started: Awaited<ReturnType<typeof provider.start>>;
    try {
      started = await provider.start({
        prompt: compiledPrompt,
        references,
        options: request.options,
      });
      logger.info('TTI provider.start succeeded', {
        ownerRef,
        provider: provider.config?.provider,
        mode: started.mode,
        taskId: started.mode === 'async' ? started.taskId : (started.output as any).taskId,
        outputSource: started.mode === 'immediate'
          ? summarizeImageSource(started.output.url || started.output.path)
          : undefined,
        outputWidth: started.mode === 'immediate' ? started.output.width : undefined,
        outputHeight: started.mode === 'immediate' ? started.output.height : undefined,
      });
    } catch (error) {
      logger.error('TTI provider.start failed', {
        ownerRef,
        provider: provider.config?.provider,
        channelId: executionMetadata.channelId,
        modelId: executionMetadata.modelId,
        protocol: protocol || 'none',
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }

    const kind: MediaKind = 'image';
    const options = request.options as Record<string, unknown> | undefined;
    const optionWidth = getOptionNumber(options, 'width');
    const optionHeight = getOptionNumber(options, 'height');
    const optionSeed = getOptionNumber(options, 'seed');

    if (started.mode === 'immediate') {
      const output = started.output;
      const source = output.url || output.path;
      if (!source) {
        logger.error('TTI immediate output missing source', {
          ownerRef,
          provider: provider.config?.provider,
          output: sanitizeBodyForLog(output as any),
        });
        throw new Error('图片生成完成但未返回结果地址');
      }
      logger.info('TTI immediate persist start', {
        ownerRef,
        provider: provider.config?.provider,
        source: summarizeImageSource(source),
      });
      const persisted = await persistMediaAsset({
        projectId,
        kind,
        source,
        ownerRef,
        provider: provider.config?.provider,
        channelId: executionMetadata.channelId,
        modelId: executionMetadata.modelId,
        capability: executionMetadata.capability,
        metadata: {
          ...executionMetadata,
          prompt: originalPrompt,
          ...(protocol ? { promptProtocol: protocol } : undefined),
          ...(compilationDebug ? { compiledPrompt, compilationDebug } : undefined),
          ...(optionWidth ? { width: optionWidth } : undefined),
          ...(optionHeight ? { height: optionHeight } : undefined),
          ...(optionSeed !== undefined ? { seed: optionSeed } : undefined),
        },
      });
      logger.info('TTI immediate persisted', {
        ownerRef,
        asset: summarizeImageAsset(persisted),
      });

      const normalized = await ensureRemoteUrlForImageAsset({
        projectId,
        asset: persisted,
        policy: 'best-effort',
      });
      logger.info('TTI immediate remote-url normalized', {
        ownerRef,
        before: summarizeImageAsset(persisted),
        after: summarizeImageAsset(normalized),
      });

      const finalAsset = mergeMediaMetadata(normalized, {
        provider: provider.config?.provider,
        width: optionWidth ?? output.width ?? normalized.width,
        height: optionHeight ?? output.height ?? normalized.height,
      });

      logger.info('TTI immediate bind owner start', {
        ownerRef,
        asset: summarizeImageAsset(finalAsset),
      });
      await bindOwnerRefMedia(projectId, ownerRef, finalAsset);
      logger.info('TTI immediate bind owner done', {
        ownerRef,
        asset: summarizeImageAsset(finalAsset),
      });
      return finalAsset;
    }

    const task = await this.createMediaTask(projectId, {
      kind,
      ownerRef,
      remoteTaskId: started.taskId,
      taskName: taskName || '图片生成',
      ...executionMetadata,
    });
    logger.info('TTI async task created', {
      localTaskId: task.id,
      remoteTaskId: started.taskId,
      ownerRef,
      provider: provider.config?.provider,
      channelId: executionMetadata.channelId,
      modelId: executionMetadata.modelId,
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
        channelId: executionMetadata.channelId,
        modelId: executionMetadata.modelId,
        capability: executionMetadata.capability,
        width: optionWidth ?? asset.width,
        height: optionHeight ?? asset.height,
        metadata: {
          ...executionMetadata,
          prompt: originalPrompt,
          ...(protocol ? { promptProtocol: protocol } : undefined),
          ...(compilationDebug ? { compiledPrompt, compilationDebug } : undefined),
          ...(optionSeed !== undefined ? { seed: optionSeed } : undefined),
        },
      }),
      providerTaskId: started.taskId,
      ...executionMetadata,
    });
  }

  async generateVideo(params: {
    projectId: string;
    ownerRef: MediaOwnerRef;
    request: ITVRequest<MediaAssetSource | ProviderAssetInput>;
    promptCompilation?: PromptCompilationInput;
    itvSelection?: string;
    taskName?: string;
    allowCapabilityFallback?: boolean;
  }): Promise<StoredMediaAsset> {
    const {
      projectId,
      ownerRef,
      request,
      itvSelection,
      taskName,
      promptCompilation,
      allowCapabilityFallback = true,
    } = params;
    const { provider, resolvedContext } = await resolveProviderAndContext({
      category: 'itv',
      selectionKey: itvSelection,
      capability: request.capability,
      getProvider: getProjectITVProvider,
      missingError: '未配置 ITV 服务',
      allowCapabilityFallback,
    });
    const executionMetadata = buildExecutionMetadata(resolvedContext, request.capability);
    const traceContext = createVideoTraceContext({
      prefix: 'itv',
      source: 'media-generation',
      operation: 'media.generate-video',
      debugBody: true,
    });

    const protocol = getPromptProtocol(provider);
    logger.info('ITV generateVideo entry', {
      traceId: traceContext.traceId,
      ownerRef,
      selectionKey: itvSelection,
      channelId: executionMetadata.channelId,
      modelId: executionMetadata.modelId,
      provider: provider.config?.provider,
      capability: request.capability,
      protocol: protocol || 'none',
      hasPromptCompilation: Boolean(promptCompilation?.selectedAssets?.length),
      visualInputCount: isTextToVideoRequest(request)
        ? 0
        : isImageToVideoRequest(request)
          ? 1 + (request.additionalReferences || []).length
          : isReferenceToVideoRequest(request)
            ? request.referenceImages.length
            : 2,
      request: summarizeVideoRequestForLog(request),
    });
    const originalPrompt = request.prompt;
    let compiledPrompt = originalPrompt;
    let compilationDebug: any = null;
    const maxAdditionalReferences = resolveVideoProtocolCompilationLimit({
      provider,
      protocol,
    });
    const compiledDomainRequest = compileWorkflowVideoDomainRequest({
      request,
      promptCompilation,
      protocol,
      maxAdditionalReferences,
    });
    compiledPrompt = compiledDomainRequest.compiledPrompt;
    compilationDebug = compiledDomainRequest.compilationDebug;

    logger.info('ITV domain request compiled', {
      traceId: traceContext.traceId,
      provider: provider.config?.provider,
      capability: request.capability,
      protocol: protocol || 'none',
      unresolvedMentions: compiledDomainRequest.unresolvedMentions,
      compiledPrompt: truncateString(compiledPrompt, 800),
      request: summarizeVideoRequestForLog(compiledDomainRequest.request),
      compilationDebug: compilationDebug ? sanitizeBodyForLog(compilationDebug) : undefined,
    });

    if (compilationDebug && protocol === 'grok-image-index') {
      logger.info('ITV prompt compiled (grok-image-index)', {
        traceId: traceContext.traceId,
        ownerRef,
        protocol,
        originalPrompt: truncateString(originalPrompt, 800),
        compiledPrompt: truncateString(compiledPrompt, 800),
        mentions: parseMentions(originalPrompt),
        debug: compilationDebug,
      });
    }

    const transportSupport = resolveITVTransportSupport(provider);
    logger.info('ITV transport support resolved', {
      traceId: traceContext.traceId,
      provider: provider.config?.provider,
      transportSupport,
    });
    const providerRequest = await mapVideoRequestToProviderRequest({
      projectId,
      request: compiledDomainRequest.request,
      transportSupport,
      maxAdditionalReferences,
      preferLocalAssetInput: provider.config?.provider === 'seedance',
    });
    const tracedProviderRequest = withVideoTrace(providerRequest, traceContext);

    logger.info('ITV provider request mapped', {
      traceId: traceContext.traceId,
      provider: provider.config?.provider,
      capability: tracedProviderRequest.capability,
      promptProtocol: protocol || 'none',
      request: summarizeVideoRequestForLog(tracedProviderRequest),
    });

    let started: Awaited<ReturnType<typeof provider.start>>;
    try {
      started = await provider.start(tracedProviderRequest as any);
    } catch (error) {
      logger.error('ITV provider.start failed', {
        traceId: traceContext.traceId,
        ownerRef,
        selectionKey: itvSelection,
        provider: provider.config?.provider,
        channelId: executionMetadata.channelId,
        modelId: executionMetadata.modelId,
        capability: request.capability,
        protocol: protocol || 'none',
        error: error instanceof Error ? error.message : String(error),
        originalRequest: summarizeVideoRequestForLog(request),
        compiledRequest: summarizeVideoRequestForLog(compiledDomainRequest.request),
        providerRequest: summarizeVideoRequestForLog(tracedProviderRequest),
      });
      throw error;
    }

    logger.info('ITV provider.start succeeded', {
      traceId: traceContext.traceId,
      provider: provider.config?.provider,
      capability: request.capability,
      mode: started.mode,
      taskId: started.mode === 'async' ? started.taskId : started.output.taskId,
      immediateSource: started.mode === 'immediate' ? started.output.source : undefined,
    });

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
        channelId: executionMetadata.channelId,
        modelId: executionMetadata.modelId,
        capability: executionMetadata.capability,
        metadata: {
          ...executionMetadata,
          capability: request.capability,
          prompt: originalPrompt,
          ...(protocol ? { promptProtocol: protocol } : undefined),
          ...(compilationDebug ? { compiledPrompt, compilationDebug } : undefined),
          ...(optionDuration ? { durationSec: optionDuration } : undefined),
        },
      });
      const finalAsset = mergeMediaMetadata(persisted, {
        provider: provider.config?.provider,
        channelId: executionMetadata.channelId,
        modelId: executionMetadata.modelId,
        capability: executionMetadata.capability,
        durationMs: durationSecToMs(optionDuration) ?? persisted.durationMs,
        metadata: {
          ...executionMetadata,
          capability: request.capability,
          prompt: originalPrompt,
          ...(protocol ? { promptProtocol: protocol } : undefined),
          ...(compilationDebug ? { compiledPrompt, compilationDebug } : undefined),
        },
      });
      logger.info('ITV immediate result persisted', {
        traceId: traceContext.traceId,
        ownerRef,
        source,
        provider: provider.config?.provider,
      });
      await bindOwnerRefMedia(projectId, ownerRef, finalAsset);
      return finalAsset;
    }

    const task = await this.createMediaTask(projectId, {
      kind,
      ownerRef,
      remoteTaskId: started.taskId,
      taskName: taskName || '视频生成',
      ...executionMetadata,
    });

    logger.info('ITV async task created', {
      traceId: traceContext.traceId,
      localTaskId: task.id,
      remoteTaskId: started.taskId,
      ownerRef,
      provider: provider.config?.provider,
    });

    return this.pollAndFinalizeTask({
      projectId,
      kind,
      task,
      getSnapshot: async (remoteTaskId) => {
        if (!provider.getTaskSnapshot) {
          throw new Error('ITV Provider 不支持任务查询');
        }
        return provider.getTaskSnapshot(remoteTaskId, {
          capability: request.capability,
        });
      },
      extractSource: (output: any) => output?.source,
      enrichAsset: (asset) => mergeMediaMetadata(asset, {
        provider: provider.config?.provider,
        providerTaskId: started.taskId,
        channelId: executionMetadata.channelId,
        modelId: executionMetadata.modelId,
        capability: executionMetadata.capability,
        durationMs: durationSecToMs(optionDuration) ?? asset.durationMs,
        metadata: {
          ...executionMetadata,
          prompt: originalPrompt,
          ...(protocol ? { promptProtocol: protocol } : undefined),
          ...(compilationDebug ? { compiledPrompt, compilationDebug } : undefined),
        },
      }),
      providerTaskId: started.taskId,
      ...executionMetadata,
    });
  }

  async generateAudio(params: {
    projectId: string;
    ownerRef: MediaOwnerRef;
    request: TTSRequest;
    ttsSelection?: string;
    taskName?: string;
  }): Promise<StoredMediaAsset> {
    const { projectId, ownerRef, request, ttsSelection, taskName } = params;
    const { provider, resolvedContext } = await resolveProviderAndContext({
      category: 'tts',
      selectionKey: ttsSelection,
      capability: 'speech.text-to-speech',
      getProvider: getProjectTTSProvider,
      missingError: '未配置 TTS 服务',
    });
    const executionMetadata = buildExecutionMetadata(resolvedContext, 'speech.text-to-speech');

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
        channelId: executionMetadata.channelId,
        modelId: executionMetadata.modelId,
        capability: executionMetadata.capability,
        metadata: {
          ...executionMetadata,
          voiceId: request.voiceId,
        },
      });

      const finalAsset = mergeMediaMetadata(persisted, {
        provider: provider.config?.provider,
        channelId: executionMetadata.channelId,
        modelId: executionMetadata.modelId,
        capability: executionMetadata.capability,
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
      ...executionMetadata,
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
        channelId: executionMetadata.channelId,
        modelId: executionMetadata.modelId,
        capability: executionMetadata.capability,
        metadata: {
          ...executionMetadata,
          voiceId: request.voiceId,
        },
      }),
      providerTaskId: started.taskId,
      ...executionMetadata,
    });
  }

  async recoverTask(params: {
    projectId: string;
    task: AsyncTask;
    ttiSelection?: string;
    itvSelection?: string;
    ttsSelection?: string;
    onProgress?: (task: AsyncTask, progress: number) => void;
  }): Promise<StoredMediaAsset | null> {
    const { projectId, task, ttiSelection, itvSelection, ttsSelection, onProgress } = params;
    if (!task.remoteTaskId) return null;
    const kind: MediaKind = task.type === 'itv' ? 'video' : task.type === 'tts' ? 'audio' : 'image';
    const taskCapability = resolveTaskCapability(task);
    const resolvedTTISelection = resolveTaskSelectionKey(task, ttiSelection);
    const resolvedITVSelection = resolveTaskSelectionKey(task, itvSelection);
    const resolvedTTSSelection = resolveTaskSelectionKey(task, ttsSelection);

    const getSnapshot = async (remoteTaskId: string): Promise<ProviderTaskSnapshot<any>> => {
      if (task.type === 'tti') {
        const provider = await getProjectTTIProvider(
          resolvedTTISelection,
          taskCapability === 'image.image-to-image' ? 'image.image-to-image' : 'image.text-to-image',
        );
        if (!provider?.getTaskSnapshot) throw new Error('TTI Provider 不可用');
        return provider.getTaskSnapshot(remoteTaskId);
      }
      if (task.type === 'itv') {
        const provider = await getProjectITVProvider(resolvedITVSelection, taskCapability as any);
        if (!provider?.getTaskSnapshot) throw new Error('ITV Provider 不可用');
        return provider.getTaskSnapshot(remoteTaskId, {
          capability: taskCapability as any,
        });
      }
      const provider = await getProjectTTSProvider(resolvedTTSSelection, 'speech.text-to-speech');
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
        channelId: task.channelId,
        modelId: task.modelId,
        capability: task.capability,
      }),
      providerTaskId: task.remoteTaskId,
      channelId: task.channelId,
      modelId: task.modelId,
      capability: task.capability,
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
      channelId?: string;
      modelId?: string;
      capability?: string;
    }
  ): Promise<AsyncTask> {
    const { kind, ownerRef, remoteTaskId, taskName, channelId, modelId, capability } = params;
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
      channelId,
      modelId,
      capability,
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
    channelId?: string;
    modelId?: string;
    capability?: string;
    onProgress?: (task: AsyncTask, progress: number) => void;
  }): Promise<StoredMediaAsset> {
    const { projectId, kind, task, getSnapshot, extractSource, enrichAsset, providerTaskId, channelId, modelId, capability, onProgress } = params;

    const pollIntervalMs = DEFAULT_POLLING_CONFIG.interval;
    const maxPollMs = DEFAULT_POLLING_CONFIG.maxDuration;
    const startTime = Date.now();

    while (Date.now() - startTime < maxPollMs) {
      const snapshot = await getSnapshot(task.remoteTaskId);
      const mapped = mapSnapshotToTaskStatus(snapshot);

      if (kind === 'image') {
        logger.info('TTI task snapshot', {
          localTaskId: task.id,
          remoteTaskId: task.remoteTaskId,
          state: snapshot.state,
          progress: snapshot.progress,
          outputSource: snapshot.output ? summarizeImageSource(extractSource(snapshot.output)) : undefined,
          error: snapshot.error,
        });
      }

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
          logger.error('媒体任务完成但缺少结果地址', {
            localTaskId: task.id,
            remoteTaskId: task.remoteTaskId,
            kind,
            output: snapshot.output ? sanitizeBodyForLog(snapshot.output as any) : undefined,
          });
          await markTaskFailed(projectId, task.id, error);
          throw new Error(error);
        }

        logger.info('媒体任务结果落盘开始', {
          localTaskId: task.id,
          remoteTaskId: task.remoteTaskId,
          kind,
          source: kind === 'image' ? summarizeImageSource(source) : truncateString(source, 500),
        });

        const persisted = await persistMediaAsset({
          projectId,
          kind,
          source,
          ownerRef: task.ownerRef,
          providerTaskId: providerTaskId || task.remoteTaskId,
          channelId,
          modelId,
          capability,
          metadata: {
            ...(channelId ? { channelId } : undefined),
            ...(modelId ? { modelId } : undefined),
            ...(capability ? { capability } : undefined),
          },
        });

        const enriched = enrichAsset(persisted);
        const finalAsset = kind === 'image'
          ? await ensureRemoteUrlForImageAsset({ projectId, asset: enriched, policy: 'best-effort' })
          : enriched;
        if (kind === 'image') {
          logger.info('TTI async finalized asset', {
            localTaskId: task.id,
            remoteTaskId: task.remoteTaskId,
            persisted: summarizeImageAsset(persisted),
            finalAsset: summarizeImageAsset(finalAsset),
          });
        }
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

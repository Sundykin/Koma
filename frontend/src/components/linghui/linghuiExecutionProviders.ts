import type { MediaAssetSource, ProviderAssetInput, VideoGenerationCapability } from '../../types';
import { getProjectITVProvider, getProjectLLMProvider, getProjectTTIProvider, getProjectTTSProvider } from '../../providers';
import { resolveConfiguredChannelModel } from '../../providers/channel/resolver';
import { DEFAULT_POLLING_CONFIG } from '../../providers/polling';
import type { ITVResult, ITVTaskSnapshotContext } from '../../providers/itv/types';
import type { ImageResult, MultiAngleTTIRequest } from '../../providers/tti/types';
import type { AudioResult } from '../../providers/tts/types';
import { resolveProviderAssetInput } from '../../services/mediaAssetResolver';
import { compileLinghuiMultiAnglePrompt } from '../../services/promptCompilation/multiAnglePromptCompiler';
import {
  buildVideoCapabilityRequest,
  compileWorkflowVideoDomainRequest,
  getPromptProtocol,
  mapVideoRequestToProviderRequest,
  resolveITVTransportSupport,
  resolveVideoProtocolCompilationLimit,
} from '../../services/promptCompilation/videoRequestCompiler';
import { createLogger } from '../../store/logger';
import { loadSettings } from '../../store/settings/core';
import type { LinghuiMediaItem } from '../../types/linghui';
import { sanitizeBodyForLog, truncateString } from '../../utils/logFormatting';
import {
  createVideoTraceContext,
  summarizeVideoRequestForLog,
  withVideoTrace,
} from '../../utils/videoGenerationTrace';
import {
  compileLinghuiPromptReferences,
  type LinghuiPromptReferenceItem,
} from './linghuiPromptReferences';
import {
  EXECUTION_PROJECT_ID,
  buildMediaItem,
  createPlaceholderImage,
  delay,
  throwIfExecutionAborted,
  toPreviewSource,
} from './linghuiExecutionShared';
import { getVideoCapabilityDescriptor } from './videoCapabilityUtils';

const logger = createLogger('LinghuiVideoExecution');
const imageLogger = createLogger('LinghuiImageExecution');

type AsyncTaskSnapshot<T> = {
  state: string;
  progress?: number;
  output?: T;
  error?: string;
};

type AsyncTaskSnapshotGetter<T> = (taskId: string) => Promise<AsyncTaskSnapshot<T>>;

interface AsyncPollingLogContext {
  traceId?: string;
  provider?: string;
  capability?: string;
  mediaKind: 'image' | 'video' | 'audio';
}

async function ensureProviderAssetInputs(
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

function createTaskSnapshotGetter<T>(
  provider: { getTaskSnapshot?: (taskId: string, context?: ITVTaskSnapshotContext) => Promise<AsyncTaskSnapshot<T>> },
  context?: ITVTaskSnapshotContext,
): AsyncTaskSnapshotGetter<T> | undefined {
  if (!provider.getTaskSnapshot) {
    return undefined;
  }
  return async (taskId: string) => provider.getTaskSnapshot!(taskId, context);
}

async function resolveAsyncProviderResult<T>(
  taskId: string,
  getTaskSnapshot: AsyncTaskSnapshotGetter<T> | undefined,
  onProgress?: (progress: number, message?: string) => void,
  signal?: AbortSignal,
  logContext?: AsyncPollingLogContext,
): Promise<T> {
  if (!getTaskSnapshot) throw new Error('当前 Provider 不支持任务状态查询');

  const startedAt = Date.now();
  let pollCount = 0;
  logger.info('灵绘异步任务开始轮询', {
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
      logger.error('灵绘异步任务轮询异常', {
        taskId,
        pollCount,
        ...logContext,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
    logger.info('灵绘异步任务轮询快照', {
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
      logger.error('灵绘异步任务轮询判定失败', {
        taskId,
        pollCount,
        ...logContext,
        error: snapshot.error || '生成失败',
      });
      throw new Error(snapshot.error || '生成失败');
    }
    if (snapshot.state === 'succeeded' && snapshot.output) {
      throwIfExecutionAborted(signal);
      logger.info('灵绘异步任务轮询完成', {
        taskId,
        pollCount,
        ...logContext,
      });
      onProgress?.(100, '生成完成');
      return snapshot.output;
    }
    await delay(DEFAULT_POLLING_CONFIG.interval, signal);
  }

  logger.error('灵绘异步任务轮询超时', {
    taskId,
    pollCount,
    ...logContext,
    maxDuration: DEFAULT_POLLING_CONFIG.maxDuration,
  });
  throw new Error('任务轮询超时');
}

export async function generateImageWithProvider(params: {
  prompt: string;
  referenceSources?: string[];
  silentReferenceSources?: string[];
  steps?: number;
  onProgress?: (progress: number, message?: string) => void;
  placeholderTitle: string;
  placeholderSubtitle?: string;
  accent?: string;
  ttiSelection?: string;
  promptReferences?: LinghuiPromptReferenceItem[];
  multiAngle?: Omit<MultiAngleTTIRequest, 'originalPrompt' | 'anglePrompt' | 'compiledPrompt'> | null;
  signal?: AbortSignal;
}): Promise<LinghuiMediaItem> {
  throwIfExecutionAborted(params.signal);
  const requestedCapability = params.multiAngle ? 'image.image-to-image' : 'image.text-to-image';
  const settings = await loadSettings();
  const selectedContext = resolveConfiguredChannelModel(settings, 'tti', params.ttiSelection);
  const capableContext = resolveConfiguredChannelModel(settings, 'tti', params.ttiSelection, requestedCapability);

  imageLogger.info('灵绘图片生成入口', {
    selectionKey: params.ttiSelection,
    capability: requestedCapability,
    requestType: params.multiAngle ? 'multi-angle' : 'text-to-image',
    channelId: capableContext?.channelConfig.id ?? selectedContext?.channelConfig.id,
    modelId: capableContext?.model.id ?? selectedContext?.model.id,
    prompt: truncateString(params.prompt || '', 600),
    referenceCount: params.referenceSources?.length ?? 0,
    silentReferenceCount: params.silentReferenceSources?.length ?? 0,
    promptReferenceCount: params.promptReferences?.length ?? 0,
    multiAngle: params.multiAngle ? {
      azimuth: params.multiAngle.azimuth,
      elevation: params.multiAngle.elevation,
      distance: params.multiAngle.distance,
      promptProtocol: params.multiAngle.promptProtocol,
      endpointPath: params.multiAngle.endpointPath,
    } : undefined,
  });

  if (params.multiAngle && selectedContext && !selectedContext.model.capabilities.includes('image.image-to-image')) {
    imageLogger.warn('灵绘多角度能力校验失败', {
      selectionKey: params.ttiSelection,
      requestedCapability,
      channelId: selectedContext.channelConfig.id,
      modelId: selectedContext.model.id,
      capabilities: selectedContext.model.capabilities,
    });
    throw new Error('当前生图模型不支持图生图，请切换到支持图生图的渠道后重试');
  }

  const provider = await getProjectTTIProvider(params.ttiSelection || undefined, requestedCapability);
  if (!provider || !provider.validate()) {
    if (params.multiAngle) {
      imageLogger.error('灵绘多角度未找到可用 TTI Provider', {
        selectionKey: params.ttiSelection,
        requestedCapability,
      });
      throw new Error('当前没有配置支持图生图的生图渠道，请先切换或配置支持图生图的模型');
    }

    imageLogger.warn('灵绘图片未配置 TTI Provider，返回占位结果', {
      selectionKey: params.ttiSelection,
      requestedCapability,
    });
    return buildMediaItem({
      kind: 'image',
      source: createPlaceholderImage({
        title: params.placeholderTitle,
        subtitle: params.placeholderSubtitle ?? (params.prompt || '未配置 TTI 服务，已生成占位预览'),
        accent: params.accent,
      }),
      placeholder: true,
    });
  }

  let compiledPrompt = params.prompt || params.placeholderTitle;
  let referenceSources: Array<MediaAssetSource | ProviderAssetInput> = params.referenceSources ?? [];
  const silentReferenceSources = params.silentReferenceSources ?? [];
  const replacementStrategy = getPromptProtocol(provider) === 'grok-image-index'
    ? 'image-index'
    : 'readable-name';

  if (!params.multiAngle && (params.promptReferences?.length ?? 0) > 0) {
    const compiled = compileLinghuiPromptReferences({
      prompt: compiledPrompt,
      references: params.promptReferences ?? [],
      extraReferences: referenceSources,
      replacementStrategy,
    });
    compiledPrompt = compiled.compiledPrompt;
    referenceSources = compiled.compiledReferences;
  }

  let multiAngleRequest: MultiAngleTTIRequest | undefined;
  let references: ProviderAssetInput[] = [];
  try {
    if (params.multiAngle) {
      if (provider.supportsMultiAngle === false) {
        throw new Error('当前生图渠道暂不支持多角度接口，请切换到支持多角度的渠道后重试');
      }
      if (!referenceSources.length) {
        throw new Error('多角度生图需要至少一张上游参考图');
      }

      if (provider.supportsMultiAngle !== true) {
        imageLogger.info('灵绘多角度将回退为通用图生图执行', {
          selectionKey: params.ttiSelection,
          capability: requestedCapability,
          provider: provider.config?.provider,
        });
      }

      const compiledMultiAngle = compileLinghuiMultiAnglePrompt({
        prompt: '',
        config: params.multiAngle,
      });
      compiledPrompt = compiledMultiAngle.compiledPrompt;
      multiAngleRequest = {
        ...params.multiAngle,
        originalPrompt: '',
        anglePrompt: compiledMultiAngle.anglePrompt,
        compiledPrompt,
      };
    }

    references = [
      ...await ensureProviderAssetInputs(referenceSources),
      ...await ensureProviderAssetInputs(silentReferenceSources),
    ];

    if (params.multiAngle && references.length === 0) {
      throw new Error('多角度生图无法读取上游参考图，请确认当前图片文件仍可访问');
    }
  } catch (error) {
    imageLogger.error('灵绘图片请求编译失败', {
      selectionKey: params.ttiSelection,
      capability: requestedCapability,
      provider: provider.config?.provider,
      requestType: params.multiAngle ? 'multi-angle' : 'text-to-image',
      referenceCount: referenceSources.length,
      silentReferenceCount: silentReferenceSources.length,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }

  imageLogger.info('灵绘图片请求已编译', {
    selectionKey: params.ttiSelection,
    capability: requestedCapability,
    provider: provider.config?.provider,
    prompt: truncateString(compiledPrompt, 600),
    referenceCount: references.length,
    request: sanitizeBodyForLog({
      requestType: multiAngleRequest ? 'multi-angle' : 'text-to-image',
      multiAngle: multiAngleRequest
        ? {
            azimuth: multiAngleRequest.azimuth,
            elevation: multiAngleRequest.elevation,
            distance: multiAngleRequest.distance,
            promptProtocol: multiAngleRequest.promptProtocol,
            endpointPath: multiAngleRequest.endpointPath,
            anglePrompt: multiAngleRequest.anglePrompt,
            compiledPrompt: multiAngleRequest.compiledPrompt,
            originalPrompt: multiAngleRequest.originalPrompt,
          }
        : undefined,
    }),
  });

  let started;
  try {
    started = await provider.start({
      prompt: compiledPrompt,
      references,
      options: { steps: params.steps },
      ...(multiAngleRequest ? { requestType: 'multi-angle' as const, multiAngle: multiAngleRequest } : undefined),
    });
  } catch (error) {
    imageLogger.error('灵绘图片任务提交失败', {
      selectionKey: params.ttiSelection,
      capability: requestedCapability,
      provider: provider.config?.provider,
      error: error instanceof Error ? error.message : String(error),
      requestType: multiAngleRequest ? 'multi-angle' : 'text-to-image',
    });
    throw error;
  }

  imageLogger.info('灵绘图片任务提交成功', {
    selectionKey: params.ttiSelection,
    capability: requestedCapability,
    provider: provider.config?.provider,
    mode: started.mode,
    taskId: started.mode === 'async' ? started.taskId : undefined,
    requestType: multiAngleRequest ? 'multi-angle' : 'text-to-image',
  });
  throwIfExecutionAborted(params.signal);
  const output = started.mode === 'immediate'
    ? started.output
    : await resolveAsyncProviderResult<ImageResult>(
        started.taskId,
        createTaskSnapshotGetter(provider),
        params.onProgress,
        params.signal,
        {
          mediaKind: 'image',
          provider: provider.config?.provider,
        },
      );
  throwIfExecutionAborted(params.signal);

  return buildMediaItem({
    kind: 'image',
    source: output.url || output.path,
    mimeType: output.mimeType,
    width: output.width,
    height: output.height,
    metadata: output.metadata,
  });
}

export async function generateVideoWithProvider(params: {
  capability: VideoGenerationCapability;
  prompt: string;
  primaryImageSource?: string;
  additionalReferenceSources?: string[];
  referenceImageSources?: string[];
  startFrameSource?: string;
  endFrameSource?: string;
  duration?: number;
  aspectRatio?: string;
  resolution?: string;
  onProgress?: (progress: number, message?: string) => void;
  itvSelection?: string;
  promptReferences?: LinghuiPromptReferenceItem[];
  primaryReferenceId?: string;
  signal?: AbortSignal;
}): Promise<LinghuiMediaItem> {
  throwIfExecutionAborted(params.signal);
  const traceContext = createVideoTraceContext({
    prefix: 'linghui-video',
    source: 'linghui',
    operation: 'linghui.generate-video',
    debugBody: true,
  });
  const previewSource = params.primaryImageSource
    || params.startFrameSource
    || params.referenceImageSources?.[0];
  const placeholderPoster = previewSource
    ? toPreviewSource(previewSource)
    : createPlaceholderImage({ title: '视频预览占位', subtitle: '未配置 ITV 服务', accent: '#22c55e' });

  const settings = await loadSettings();
  const selectedContext = resolveConfiguredChannelModel(settings, 'itv', params.itvSelection);
  if (selectedContext && !selectedContext.model.capabilities.includes(params.capability)) {
    logger.warn('灵绘视频能力校验失败', {
      traceId: traceContext.traceId,
      selectionKey: params.itvSelection,
      capability: params.capability,
      channelId: selectedContext.channelConfig.id,
      modelId: selectedContext.model.id,
    });
    throw new Error(`当前视频模型不支持${getVideoCapabilityDescriptor(params.capability).label}`);
  }

  logger.info('灵绘视频生成入口', {
    traceId: traceContext.traceId,
    selectionKey: params.itvSelection,
    capability: params.capability,
    channelId: selectedContext?.channelConfig.id,
    modelId: selectedContext?.model.id,
    prompt: truncateString(params.prompt, 800),
    hasPrimaryImage: Boolean(params.primaryImageSource),
    referenceImageCount: params.referenceImageSources?.length || 0,
    additionalReferenceCount: params.additionalReferenceSources?.length || 0,
    hasStartFrame: Boolean(params.startFrameSource),
    hasEndFrame: Boolean(params.endFrameSource),
  });

  const provider = await getProjectITVProvider(params.itvSelection || undefined, params.capability);
  if (!provider || !provider.validate()) {
    logger.warn('灵绘视频未配置 ITV Provider，返回占位结果', {
      traceId: traceContext.traceId,
      selectionKey: params.itvSelection,
      capability: params.capability,
    });
    return buildMediaItem({
      kind: 'video',
      posterSource: placeholderPoster,
      placeholder: true,
      metadata: { note: '未配置 ITV 服务。' },
    });
  }

  const protocol = getPromptProtocol(provider);
  const maxAdditionalReferences = resolveVideoProtocolCompilationLimit({
    provider,
    protocol,
  });
  const primarySource = params.capability === 'video.start-end-to-video'
    ? params.startFrameSource
    : params.primaryImageSource;
  let additionalSources: Array<MediaAssetSource | ProviderAssetInput>;
  if (params.capability === 'video.reference-to-video') {
    additionalSources = params.referenceImageSources ?? [];
  } else if (params.capability === 'video.start-end-to-video') {
    additionalSources = params.endFrameSource ? [params.endFrameSource] : [];
  } else {
    additionalSources = params.additionalReferenceSources ?? [];
  }

  const commonOptions = {
    duration: params.duration,
    aspectRatio: params.aspectRatio,
    resolution: params.resolution,
  } as Record<string, unknown>;

  const domainRequest = params.capability === 'video.reference-to-video'
    ? buildVideoCapabilityRequest({
        capability: params.capability,
        prompt: params.prompt,
        referenceImages: additionalSources,
        options: commonOptions,
      })
    : params.capability === 'video.start-end-to-video'
      ? buildVideoCapabilityRequest({
          capability: params.capability,
          prompt: params.prompt,
          startFrame: primarySource,
          endFrame: additionalSources[0],
          options: commonOptions,
        })
      : params.capability === 'video.text-to-video'
        ? buildVideoCapabilityRequest({
            capability: params.capability,
            prompt: params.prompt,
            options: commonOptions,
          })
      : buildVideoCapabilityRequest({
          capability: params.capability,
          prompt: params.prompt,
          primaryImage: primarySource,
          additionalReferences: additionalSources,
          options: commonOptions,
        });
  logger.info('灵绘视频领域请求已构建', {
    traceId: traceContext.traceId,
    selectionKey: params.itvSelection,
    capability: params.capability,
    request: summarizeVideoRequestForLog(domainRequest),
  });
  const compiledDomainRequest = compileWorkflowVideoDomainRequest({
    request: domainRequest,
    promptCompilation: (params.promptReferences?.length ?? 0) > 0
      ? {
          promptReferences: {
            references: (params.promptReferences ?? []).map(item => ({
              id: item.id,
              name: item.name,
              textValue: item.textValue,
              source: item.source,
            })),
            extraReferences: additionalSources,
            primaryReferenceId: params.primaryReferenceId,
            ensurePrimaryReference: params.capability !== 'video.text-to-video',
          },
        }
      : undefined,
    protocol,
    maxAdditionalReferences,
  });
  logger.info('灵绘视频请求已编译', {
    traceId: traceContext.traceId,
    provider: provider.config?.provider,
    protocol: protocol || 'none',
    unresolvedMentions: compiledDomainRequest.unresolvedMentions,
    compiledPrompt: truncateString(compiledDomainRequest.compiledPrompt, 800),
    request: summarizeVideoRequestForLog(compiledDomainRequest.request),
    compilationDebug: compiledDomainRequest.compilationDebug
      ? sanitizeBodyForLog(compiledDomainRequest.compilationDebug)
      : undefined,
  });
  const transportSupport = resolveITVTransportSupport(provider);
  const providerRequest = await mapVideoRequestToProviderRequest({
    projectId: EXECUTION_PROJECT_ID,
    request: compiledDomainRequest.request,
    transportSupport,
    maxAdditionalReferences,
    messages: {
      missingPrimaryImage: '缺少主图输入',
      missingReferenceImages: '缺少参考图输入',
      missingStartEndFrames: '缺少首尾帧输入',
      remotePrimary: params.capability === 'video.start-end-to-video'
        ? '当前 ITV Provider 仅支持远程 URL 首帧'
        : '当前 ITV Provider 仅支持远程 URL 主图',
      remoteAdditional: '当前 ITV Provider 仅支持远程 URL 附加参考图',
      remoteReference: '当前 ITV Provider 仅支持远程 URL 参考图',
      remoteStart: '当前 ITV Provider 仅支持远程 URL 首帧',
      remoteEnd: '当前 ITV Provider 仅支持远程 URL 尾帧',
    },
  });
  const tracedProviderRequest = withVideoTrace(providerRequest, traceContext);
  logger.info('灵绘视频 Provider 请求已映射', {
    traceId: traceContext.traceId,
    provider: provider.config?.provider,
    protocol: protocol || 'none',
    transportSupport,
    request: summarizeVideoRequestForLog(tracedProviderRequest),
  });

  let started: Awaited<ReturnType<typeof provider.start>>;
  try {
    started = await provider.start(tracedProviderRequest as never);
  } catch (error) {
    logger.error('灵绘视频任务提交失败', {
      traceId: traceContext.traceId,
      selectionKey: params.itvSelection,
      provider: provider.config?.provider,
      capability: params.capability,
      error: error instanceof Error ? error.message : String(error),
      originalRequest: summarizeVideoRequestForLog(domainRequest),
      compiledRequest: summarizeVideoRequestForLog(compiledDomainRequest.request),
      providerRequest: summarizeVideoRequestForLog(tracedProviderRequest),
    });
    throw error;
  }
  logger.info('灵绘视频任务提交成功', {
    traceId: traceContext.traceId,
    provider: provider.config?.provider,
    capability: params.capability,
    mode: started.mode,
    taskId: started.mode === 'async' ? started.taskId : started.output.taskId,
    immediateSource: started.mode === 'immediate' ? started.output.source : undefined,
  });
  throwIfExecutionAborted(params.signal);

  const output = started.mode === 'immediate'
    ? started.output
    : await resolveAsyncProviderResult<ITVResult>(
        started.taskId,
        createTaskSnapshotGetter(provider, { capability: params.capability }),
        params.onProgress,
        params.signal,
        {
          traceId: traceContext.traceId,
          mediaKind: 'video',
          provider: provider.config?.provider,
          capability: params.capability,
        },
      );
  throwIfExecutionAborted(params.signal);

  return buildMediaItem({
    kind: 'video',
    source: output.source,
    posterSource: placeholderPoster,
    durationSec: output.durationSec,
    width: output.width,
    height: output.height,
    mimeType: output.mimeType,
    metadata: output.metadata,
  });
}

async function resolveTTSVoiceId(provider: NonNullable<Awaited<ReturnType<typeof getProjectTTSProvider>>>): Promise<string> {
  if (provider.config?.defaultVoice) {
    return provider.config.defaultVoice;
  }

  const voices = await provider.listVoices();
  return voices[0]?.id || 'default';
}

export async function generateAudioWithProvider(params: {
  text: string;
  ttsSelection?: string;
  onProgress?: (progress: number, message?: string) => void;
  signal?: AbortSignal;
}): Promise<LinghuiMediaItem> {
  throwIfExecutionAborted(params.signal);
  const provider = await getProjectTTSProvider(params.ttsSelection || undefined);
  if (!provider || !provider.validate()) {
    throw new Error('未配置可用的 TTS 服务');
  }

  const voiceId = await resolveTTSVoiceId(provider);
  const started = await provider.start({
    text: params.text,
    voiceId,
  } as never);
  throwIfExecutionAborted(params.signal);
  const output = started.mode === 'immediate'
    ? started.output
    : await resolveAsyncProviderResult<AudioResult>(
        started.taskId,
        createTaskSnapshotGetter(provider),
        params.onProgress,
        params.signal,
        {
          mediaKind: 'audio',
          provider: provider.config?.provider,
        },
      );
  throwIfExecutionAborted(params.signal);

  const format = output.format?.toLowerCase();
  const mimeType = format
    ? (format === 'wav' ? 'audio/wav' : format === 'ogg' ? 'audio/ogg' : format === 'aac' ? 'audio/aac' : format === 'flac' ? 'audio/flac' : 'audio/mpeg')
    : undefined;

  return buildMediaItem({
    kind: 'audio',
    source: output.path,
    mimeType,
    durationSec: output.duration,
    metadata: { voiceId, format: output.format },
  });
}

export async function generateTextWithProvider(params: {
  prompt: string;
  systemPrompt?: string;
  llmSelection?: string;
  signal?: AbortSignal;
}): Promise<string> {
  throwIfExecutionAborted(params.signal);
  const provider = await getProjectLLMProvider(params.llmSelection || undefined);
  if (!provider || !provider.validate()) {
    throw new Error('未配置可用的 LLM 服务');
  }

  const output = await provider.generateText(
    params.prompt,
    params.systemPrompt || undefined,
    {
      source: 'linghui',
      operation: 'text-node-generate',
      projectId: EXECUTION_PROJECT_ID,
    },
  );
  throwIfExecutionAborted(params.signal);
  return output;
}

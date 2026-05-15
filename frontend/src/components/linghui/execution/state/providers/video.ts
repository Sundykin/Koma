import type { AppSettings, MediaAssetSource, ProviderAssetInput, VideoGenerationCapability } from '../../../../../types';
import { getProjectITVProvider } from '../../../../../providers';
import { listCapabilityFallbackCandidates, resolveConfiguredChannelModel } from '../../../../../providers/channel/resolver';
import {
  clampDurationToSpec,
  getDurationSpecForModel,
  getDurationSpecForProviderType,
} from '../../../../../providers/itv/durationSpec';
import type { ITVResult } from '../../../../../providers/itv/types';
import {
  buildVideoCapabilityRequest,
  compileWorkflowVideoDomainRequest,
  getPromptProtocol,
  mapVideoRequestToProviderRequest,
  resolveITVTransportSupport,
  resolveVideoProtocolCompilationLimit,
} from '../../../../../services/promptCompilation/videoRequestCompiler';
import { createLogger } from '../../../../../store/logger';
import type { LinghuiVideoMediaItem } from '../../../../../types/linghui';
import { sanitizeBodyForLog, truncateString } from '../../../../../utils/logFormatting';
import {
  createVideoTraceContext,
  summarizeVideoRequestForLog,
  withVideoTrace,
} from '../../../../../utils/videoGenerationTrace';
import type { LinghuiPromptReferenceItem } from '../../../editors/state/linghuiPromptReferences';
import {
  EXECUTION_PROJECT_ID,
  buildMediaItem,
  createPlaceholderImage,
  throwIfExecutionAborted,
  toPreviewSource,
} from '../linghuiExecutionShared';
import { getVideoCapabilityDescriptor } from '../../../editors/state/videoCapabilityUtils';
import { persistMediaAsset } from '../../../../../services/mediaPersistenceService';
import { getLinghuiSourceDisplayValue } from '../../../utils/linghuiMediaAssetSource';
import {
  executeSingleProviderWithRetry,
  summarizeProviderFallbackMetadata,
  withProviderFallbackMetadata,
  type LinghuiProviderFallbackCandidate,
} from './fallback';
import {
  createTaskSnapshotGetter,
  resolveAsyncProviderResult,
  resolveExecutionSettings,
} from './shared';

const logger = createLogger('LinghuiVideoExecution');
type LinghuiVideoAssetSource = MediaAssetSource | ProviderAssetInput;

async function executeVideoProviderAttempt(
  provider: NonNullable<Awaited<ReturnType<typeof getProjectITVProvider>>>,
  traceContext: ReturnType<typeof createVideoTraceContext>,
  placeholderPoster: string,
  candidate: LinghuiProviderFallbackCandidate,
  params: {
    capability: VideoGenerationCapability;
    prompt: string;
    primaryImageSource?: LinghuiVideoAssetSource;
    additionalReferenceSources?: LinghuiVideoAssetSource[];
    referenceImageSources?: LinghuiVideoAssetSource[];
    startFrameSource?: LinghuiVideoAssetSource;
    endFrameSource?: LinghuiVideoAssetSource;
    duration?: number;
    aspectRatio?: string;
    resolution?: string;
    onProgress?: (progress: number, message?: string, partialResult?: unknown) => void;
    itvSelection?: string;
    promptReferences?: LinghuiPromptReferenceItem[];
    primaryReferenceId?: string;
    settingsSnapshot?: AppSettings;
    signal?: AbortSignal;
  },
): Promise<LinghuiVideoMediaItem> {
  const protocol = getPromptProtocol(provider);
  const maxAdditionalReferences = resolveVideoProtocolCompilationLimit({
    provider,
    protocol,
  });
  const primarySource = params.capability === 'video.start-end-to-video'
    ? params.startFrameSource
    : params.primaryImageSource;
  let additionalSources: LinghuiVideoAssetSource[];
  if (params.capability === 'video.reference-to-video') {
    additionalSources = params.referenceImageSources ?? [];
  } else if (params.capability === 'video.start-end-to-video') {
    additionalSources = params.endFrameSource ? [params.endFrameSource] : [];
  } else {
    additionalSources = params.additionalReferenceSources ?? [];
  }

  const commonOptions = {
    duration: clampDurationToSpec(
      params.duration,
      getDurationSpecForModel(candidate.modelId) ?? getDurationSpecForProviderType(candidate.providerType),
    ),
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
              // 透传 kind 让 @Image / @Video / @Audio 各自命名空间编号
              kind: item.kind === 'image' || item.kind === 'video' || item.kind === 'audio' ? item.kind : undefined,
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
  let providerRequest;
  try {
    providerRequest = await mapVideoRequestToProviderRequest({
      projectId: EXECUTION_PROJECT_ID,
      request: compiledDomainRequest.request,
      transportSupport,
      maxAdditionalReferences,
      preferLocalAssetInput: provider.config?.provider === 'seedance',
      fallbackToSourceOnRequiredUploadFailure: false,
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
  } catch (error) {
    logger.error('灵绘视频 Provider 请求映射失败', {
      traceId: traceContext.traceId,
      selectionKey: params.itvSelection,
      provider: provider.config?.provider,
      capability: params.capability,
      protocol: protocol || 'none',
      transportSupport,
      error: error instanceof Error ? error.message : String(error),
      originalRequest: summarizeVideoRequestForLog(domainRequest),
      compiledRequest: summarizeVideoRequestForLog(compiledDomainRequest.request),
    });
    throw error;
  }

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

  // 把视频结果落盘到 EXECUTION_PROJECT_ID 项目目录下，避免远程链接（包括需要 channel
  // 鉴权的 /v1/videos/{id}/content 端点）失效；channelId 透传给 mediaPersistenceService，
  // 由其按需附加 Authorization 头下载。
  const remoteTaskId = started.mode === 'async'
    ? started.taskId
    : (started.output as { taskId?: string }).taskId;
  let persistedSource = output.source;
  let persistedMimeType = output.mimeType;
  let persistMetadata: Record<string, unknown> | undefined;
  try {
    const persisted = await persistMediaAsset({
      projectId: EXECUTION_PROJECT_ID,
      kind: 'video',
      source: output.source,
      mimeType: output.mimeType,
      provider: provider.config?.provider,
      providerTaskId: remoteTaskId,
      channelId: candidate.channelId,
      modelId: candidate.modelId,
      capability: params.capability,
      metadata: {
        traceId: traceContext.traceId,
        selectionKey: candidate.selectionKey,
      },
    });
    persistedSource = persisted.localPath || persisted.remoteUrl || output.source;
    persistedMimeType = persisted.mimeType || output.mimeType;
    persistMetadata = {
      localPath: persisted.localPath,
      remoteUrl: persisted.remoteUrl,
      ...(persisted.metadata?.localPersistFailed
        ? { localPersistFailed: true, localPersistError: persisted.metadata.localPersistError }
        : undefined),
    };
    logger.info('灵绘视频中间产物落盘完成', {
      traceId: traceContext.traceId,
      provider: provider.config?.provider,
      capability: params.capability,
      remoteTaskId,
      localPath: persisted.localPath,
      remoteUrl: persisted.remoteUrl,
      localPersistFailed: Boolean(persisted.metadata?.localPersistFailed),
    });
  } catch (error) {
    // 落盘失败不阻塞流程，回落到上游返回的远程地址。
    logger.warn('灵绘视频中间产物落盘失败，回落到远程链接', {
      traceId: traceContext.traceId,
      provider: provider.config?.provider,
      capability: params.capability,
      remoteTaskId,
      source: output.source,
      error: error instanceof Error ? error.message : String(error),
    });
    persistMetadata = {
      localPersistFailed: true,
      localPersistError: error instanceof Error ? error.message : String(error),
    };
  }

  return buildMediaItem({
    kind: 'video',
    source: persistedSource,
    posterSource: placeholderPoster,
    durationSec: output.durationSec,
    width: output.width,
    height: output.height,
    mimeType: persistedMimeType,
    metadata: {
      ...output.metadata,
      ...(persistMetadata ? { persist: persistMetadata } : undefined),
    },
  });
}

export async function generateVideoWithProvider(params: {
  capability: VideoGenerationCapability;
  prompt: string;
  primaryImageSource?: LinghuiVideoAssetSource;
  additionalReferenceSources?: LinghuiVideoAssetSource[];
  referenceImageSources?: LinghuiVideoAssetSource[];
  startFrameSource?: LinghuiVideoAssetSource;
  endFrameSource?: LinghuiVideoAssetSource;
  duration?: number;
  aspectRatio?: string;
  resolution?: string;
  onProgress?: (progress: number, message?: string, partialResult?: unknown) => void;
  itvSelection?: string;
  promptReferences?: LinghuiPromptReferenceItem[];
  primaryReferenceId?: string;
  settingsSnapshot?: AppSettings;
  signal?: AbortSignal;
}): Promise<LinghuiVideoMediaItem> {
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
  const previewSourceValue = getLinghuiSourceDisplayValue(previewSource);
  const placeholderPoster = previewSourceValue
    ? toPreviewSource(previewSourceValue)
    : createPlaceholderImage({ title: '视频预览占位', subtitle: '未配置 ITV 服务' });

  const settings = await resolveExecutionSettings(params.settingsSnapshot);
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

  const candidates = listCapabilityFallbackCandidates(
    settings,
    'itv',
    params.capability,
    params.itvSelection,
  );

  if (!candidates.length) {
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

  // 视频执行严禁跨 Provider 降级：用户选了哪个渠道就只用哪个，失败如实抛错。
  // 同一 Provider 上的瞬时抖动（网络 / 5xx）由 executeSingleProviderWithRetry 内部
  // 指数退避重试消化（默认 2 次），不会变成静默切换到别的视频渠道。
  const execution = await executeSingleProviderWithRetry({
    mediaLabel: '视频',
    category: 'itv',
    capability: params.capability,
    settings,
    preferredSelection: params.itvSelection,
    signal: params.signal,
    loadProvider: selectionKey => getProjectITVProvider(selectionKey, params.capability, settings),
    validateProvider: provider => provider.validate(),
    execute: (provider, candidate) =>
      executeVideoProviderAttempt(provider, traceContext, placeholderPoster, candidate, params),
  });

  return withProviderFallbackMetadata(
    execution.result,
    summarizeProviderFallbackMetadata(
      'itv',
      params.capability,
      execution.attempts,
      execution.finalCandidate,
    ),
  );
}

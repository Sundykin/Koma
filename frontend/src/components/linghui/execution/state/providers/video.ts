import type { AppSettings, VideoGenerationCapability } from '../../../../../types';
import { getProjectITVProvider } from '../../../../../providers';
import { listCapabilityFallbackCandidates, resolveConfiguredChannelModel } from '../../../../../providers/channel/resolver';
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
import {
  executeWithProviderFallback,
  summarizeProviderFallbackMetadata,
  withProviderFallbackMetadata,
} from './fallback';
import {
  createTaskSnapshotGetter,
  resolveAsyncProviderResult,
  resolveExecutionSettings,
} from './shared';

const logger = createLogger('LinghuiVideoExecution');

async function executeVideoProviderAttempt(
  provider: NonNullable<Awaited<ReturnType<typeof getProjectITVProvider>>>,
  traceContext: ReturnType<typeof createVideoTraceContext>,
  placeholderPoster: string,
  params: {
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
  let additionalSources;
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
  let providerRequest;
  try {
    providerRequest = await mapVideoRequestToProviderRequest({
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
  const placeholderPoster = previewSource
    ? toPreviewSource(previewSource)
    : createPlaceholderImage({ title: '视频预览占位', subtitle: '未配置 ITV 服务', accent: '#22c55e' });

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

  const execution = await executeWithProviderFallback({
    mediaLabel: '视频',
    category: 'itv',
    capability: params.capability,
    settings,
    preferredSelection: params.itvSelection,
    signal: params.signal,
    loadProvider: selectionKey => getProjectITVProvider(selectionKey, params.capability, settings),
    validateProvider: provider => provider.validate(),
    execute: provider => executeVideoProviderAttempt(provider, traceContext, placeholderPoster, params),
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

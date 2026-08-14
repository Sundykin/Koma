import type {
  ITVRequest,
  MediaAssetSource,
  MediaKind,
  MediaOwnerRef,
  ProviderAssetInput,
  StoredMediaAsset,
} from '../../types';
import {
  isImageToVideoRequest,
  isReferenceToVideoRequest,
  isTextToVideoRequest,
} from '../../types';
import { persistMediaAsset } from '../mediaPersistenceService';
import { bindOwnerRefMedia } from '../mediaTaskBindingService';
import { getProjectITVProvider } from '../../providers';
import '../taskHandlers'; // 副作用 import：注册内置 TTI/ITV/TTS 任务处理器




import type { PromptCompilationInput } from '../promptCompilation/types';
import {
  compileWorkflowVideoDomainRequest,
  getPromptProtocol,
  mapVideoRequestToProviderRequest,
  resolveITVPrefersLocalAssets,
  resolveVideoProtocolCompilationLimit,
} from '../promptCompilation/videoRequestCompiler';
import { parseMentions } from '../../editor/mentionTypes';
import { sanitizeBodyForLog, truncateString } from '../../utils/logFormatting';
import {
  createVideoTraceContext,
  summarizeVideoRequestForLog,
  withVideoTrace,
} from '../../utils/videoGenerationTrace';


import {
  buildExecutionMetadata,
  resolveProviderAndContext,
  mergeMediaMetadata,
  durationSecToMs,
  getOptionNumber,
  buildVersionedVideoDestPath,
  logger,
} from './helpers';
import { pollAndFinalizeViaMain } from './tasks';

export async function generateVideo(params: {
  projectId: string;
  ownerRef: MediaOwnerRef;
  request: ITVRequest<MediaAssetSource | ProviderAssetInput>;
  promptCompilation?: PromptCompilationInput;
  itvSelection?: string;
  taskName?: string;
  destPath?: string;
  /**
   * @deprecated 视频渠道**降级零容忍**：用户选了哪个渠道就只用哪个，
   * capability 不匹配时直接报错让用户调整，不静默切到另一个能力更广的模型/渠道。
   * 该参数保留但默认 false；显式传 true 也会被忽略以维持安全行为。
   */
  allowCapabilityFallback?: boolean;
}): Promise<StoredMediaAsset> {
  const {
    projectId,
    ownerRef,
    request,
    itvSelection,
    taskName,
    promptCompilation,
    destPath,
  } = params;
  // 视频渠道零容忍：永远关掉 capability fallback。
  const allowCapabilityFallback = false;
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

  const providerRequest = await mapVideoRequestToProviderRequest({
    projectId,
    request: compiledDomainRequest.request,
    maxAdditionalReferences,
    preferLocalAssetInput: resolveITVPrefersLocalAssets(provider),
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
  const resolvedDestPath = destPath ?? await buildVersionedVideoDestPath(projectId, ownerRef);

  if (started.mode === 'immediate') {
    const output = started.output;
    const source = (output as any).source;
    const persisted = await persistMediaAsset({
      projectId,
      kind,
      source,
      destPath: resolvedDestPath,
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

  logger.info('ITV async submit (main-driven polling)', {
    traceId: traceContext.traceId,
    remoteTaskId: started.taskId,
    ownerRef,
    provider: provider.config?.provider,
  });

  return pollAndFinalizeViaMain({
    projectId,
    kind,
    ownerRef,
    taskName: taskName || '视频生成',
    remoteTaskId: started.taskId,
    selection: itvSelection,
    destPath: resolvedDestPath,
    ...executionMetadata,
    assetMetadataPatch: {
      provider: provider.config?.provider,
      providerTaskId: started.taskId,
      channelId: executionMetadata.channelId,
      modelId: executionMetadata.modelId,
      capability: executionMetadata.capability,
      ...(durationSecToMs(optionDuration) !== undefined
        ? { durationMs: durationSecToMs(optionDuration) }
        : undefined),
      metadata: {
        ...executionMetadata,
        prompt: originalPrompt,
        ...(protocol ? { promptProtocol: protocol } : undefined),
        ...(compilationDebug ? { compiledPrompt, compilationDebug } : undefined),
      },
    },
  });
}


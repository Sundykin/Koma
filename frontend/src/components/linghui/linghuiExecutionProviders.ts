import type { MediaAssetSource, ProviderAssetInput, VideoGenerationCapability } from '../../types';
import { getProjectITVProvider, getProjectLLMProvider, getProjectTTIProvider, getProjectTTSProvider } from '../../providers';
import { resolveConfiguredChannelModel } from '../../providers/channel/resolver';
import { DEFAULT_POLLING_CONFIG } from '../../providers/polling';
import type { ITVResult } from '../../providers/itv/types';
import type { ImageResult } from '../../providers/tti/types';
import type { AudioResult } from '../../providers/tts/types';
import { resolveProviderAssetInput } from '../../services/mediaAssetResolver';
import {
  buildVideoCapabilityRequest,
  compileWorkflowVideoDomainRequest,
  getPromptProtocol,
  mapVideoRequestToProviderRequest,
  resolveITVTransportSupport,
  resolveVideoProtocolCompilationLimit,
} from '../../services/promptCompilation/videoRequestCompiler';
import { loadSettings } from '../../store/settings/core';
import type { LinghuiMediaItem } from '../../types/linghui';
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

async function resolveAsyncProviderResult<T>(
  taskId: string,
  getTaskSnapshot: ((taskId: string) => Promise<{ state: string; progress?: number; output?: T; error?: string }>) | undefined,
  onProgress?: (progress: number, message?: string) => void,
  signal?: AbortSignal,
): Promise<T> {
  if (!getTaskSnapshot) throw new Error('当前 Provider 不支持任务状态查询');

  const startedAt = Date.now();
  await delay(DEFAULT_POLLING_CONFIG.initialDelay ?? 0, signal);

  while (Date.now() - startedAt < DEFAULT_POLLING_CONFIG.maxDuration) {
    throwIfExecutionAborted(signal);
    const snapshot = await getTaskSnapshot(taskId);
    if (snapshot.state === 'running' || snapshot.state === 'queued') {
      throwIfExecutionAborted(signal);
      onProgress?.(snapshot.progress ?? 0, '生成中');
      await delay(DEFAULT_POLLING_CONFIG.interval, signal);
      continue;
    }
    if (snapshot.state === 'failed') throw new Error(snapshot.error || '生成失败');
    if (snapshot.state === 'succeeded' && snapshot.output) {
      throwIfExecutionAborted(signal);
      onProgress?.(100, '生成完成');
      return snapshot.output;
    }
    await delay(DEFAULT_POLLING_CONFIG.interval, signal);
  }

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
  signal?: AbortSignal;
}): Promise<LinghuiMediaItem> {
  throwIfExecutionAborted(params.signal);
  const provider = await getProjectTTIProvider(params.ttiSelection || undefined);
  if (!provider || !provider.validate()) {
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

  if ((params.promptReferences?.length ?? 0) > 0) {
    const compiled = compileLinghuiPromptReferences({
      prompt: compiledPrompt,
      references: params.promptReferences ?? [],
      extraReferences: referenceSources,
      replacementStrategy,
    });
    compiledPrompt = compiled.compiledPrompt;
    referenceSources = compiled.compiledReferences;
  }

  const references = [
    ...await ensureProviderAssetInputs(referenceSources),
    ...await ensureProviderAssetInputs(silentReferenceSources),
  ];
  const started = await provider.start({
    prompt: compiledPrompt,
    references,
    options: { steps: params.steps },
  });
  throwIfExecutionAborted(params.signal);
  const output = started.mode === 'immediate'
    ? started.output
    : await resolveAsyncProviderResult<ImageResult>(started.taskId, provider.getTaskSnapshot, params.onProgress, params.signal);
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
  const previewSource = params.primaryImageSource
    || params.startFrameSource
    || params.referenceImageSources?.[0];
  const placeholderPoster = previewSource
    ? toPreviewSource(previewSource)
    : createPlaceholderImage({ title: '视频预览占位', subtitle: '未配置 ITV 服务', accent: '#22c55e' });

  const settings = await loadSettings();
  const selectedContext = resolveConfiguredChannelModel(settings, 'itv', params.itvSelection);
  if (selectedContext && !selectedContext.model.capabilities.includes(params.capability)) {
    throw new Error(`当前视频模型不支持${getVideoCapabilityDescriptor(params.capability).label}`);
  }

  const provider = await getProjectITVProvider(params.itvSelection || undefined, params.capability);
  if (!provider || !provider.validate()) {
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
  const providerRequest = await mapVideoRequestToProviderRequest({
    projectId: EXECUTION_PROJECT_ID,
    request: compiledDomainRequest.request,
    transportSupport: resolveITVTransportSupport(provider),
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

  const started = await provider.start(providerRequest as never);
  throwIfExecutionAborted(params.signal);

  const output = started.mode === 'immediate'
    ? started.output
    : await resolveAsyncProviderResult<ITVResult>(started.taskId, provider.getTaskSnapshot, params.onProgress, params.signal);
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
    : await resolveAsyncProviderResult<AudioResult>(started.taskId, provider.getTaskSnapshot, params.onProgress, params.signal);
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

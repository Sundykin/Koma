import type { MediaAssetSource, ProviderAssetInput } from '../../types';
import { getProjectITVProvider, getProjectLLMProvider, getProjectTTIProvider, getProjectTTSProvider } from '../../providers';
import { DEFAULT_POLLING_CONFIG } from '../../providers/polling';
import type { ITVProvider, ITVResult } from '../../providers/itv/types';
import type { ImageResult } from '../../providers/tti/types';
import type { AudioResult } from '../../providers/tts/types';
import { resolveProviderAssetInput } from '../../services/mediaAssetResolver';
import { ensureRemoteUrlForImageSource } from '../../services/mediaRemoteUrlService';
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

function getPromptProtocol(provider: unknown): string | undefined {
  return (provider as { config?: { promptProtocol?: string } } | undefined)?.config?.promptProtocol;
}

function supportsDataUrl(transports: ReadonlyArray<'remote-url' | 'data-url'> | undefined): boolean {
  return Boolean(transports?.includes('data-url'));
}

function providerAllowsDataUrlForITV(provider: ITVProvider): { primary: boolean; additional: boolean } {
  const primaryTransports = provider.assetTransports?.primaryImage;
  const additionalTransports = provider.assetTransports?.additionalReferences;
  return {
    primary: supportsDataUrl(primaryTransports),
    additional: supportsDataUrl(additionalTransports ?? primaryTransports),
  };
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
  ttiConfigId?: string;
  promptReferences?: LinghuiPromptReferenceItem[];
  signal?: AbortSignal;
}): Promise<LinghuiMediaItem> {
  throwIfExecutionAborted(params.signal);
  const provider = await getProjectTTIProvider(params.ttiConfigId || undefined);
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

async function normalizeAdditionalITVSources(
  sources: Array<MediaAssetSource | ProviderAssetInput>,
  requiresRemoteUrl: boolean,
): Promise<Array<MediaAssetSource | ProviderAssetInput>> {
  if (!requiresRemoteUrl || sources.length === 0) {
    return sources;
  }

  return Promise.all(
    sources.map((source, index) => {
      const rawSource = typeof source === 'object' && source && 'transport' in source
        ? source.value
        : source;
      return ensureRemoteUrlForImageSource({
        projectId: EXECUTION_PROJECT_ID,
        source: rawSource as MediaAssetSource,
        policy: 'required',
        filenameHint: `linghui-additional-${index + 1}.png`,
      });
    }),
  );
}

async function normalizePrimaryITVSource(
  source: MediaAssetSource | undefined,
  requiresRemoteUrl: boolean,
): Promise<MediaAssetSource | undefined> {
  if (!source || !requiresRemoteUrl) {
    return source;
  }

  return await ensureRemoteUrlForImageSource({
    projectId: EXECUTION_PROJECT_ID,
    source,
    policy: 'required',
    filenameHint: 'linghui-primary.png',
  }) as MediaAssetSource | undefined;
}

export async function generateVideoWithProvider(params: {
  prompt: string;
  imageSource?: string;
  additionalReferenceSources?: string[];
  duration?: number;
  aspectRatio?: string;
  resolution?: string;
  onProgress?: (progress: number, message?: string) => void;
  itvConfigId?: string;
  promptReferences?: LinghuiPromptReferenceItem[];
  primaryReferenceId?: string;
  signal?: AbortSignal;
}): Promise<LinghuiMediaItem> {
  throwIfExecutionAborted(params.signal);
  const placeholderPoster = params.imageSource
    ? toPreviewSource(params.imageSource)
    : createPlaceholderImage({ title: '视频预览占位', subtitle: '未配置 ITV 服务', accent: '#22c55e' });

  const provider = await getProjectITVProvider(params.itvConfigId || undefined);
  if (!provider || !provider.validate() || !params.imageSource) {
    return buildMediaItem({
      kind: 'video',
      posterSource: placeholderPoster,
      placeholder: true,
      metadata: { note: params.imageSource ? '未配置 ITV 服务。' : '缺少主参考图。' },
    });
  }

  const allow = providerAllowsDataUrlForITV(provider);
  const normalizedPrimary = await normalizePrimaryITVSource(params.imageSource, !allow.primary);
  let compiledPrompt = params.prompt;
  let additionalSources: Array<MediaAssetSource | ProviderAssetInput> = params.additionalReferenceSources ?? [];
  const replacementStrategy = getPromptProtocol(provider) === 'grok-image-index'
    ? 'image-index'
    : 'readable-name';

  if ((params.promptReferences?.length ?? 0) > 0) {
    const compiled = compileLinghuiPromptReferences({
      prompt: compiledPrompt,
      references: params.promptReferences ?? [],
      extraReferences: additionalSources,
      replacementStrategy,
      primaryReferenceId: params.primaryReferenceId,
      ensurePrimaryReference: replacementStrategy === 'image-index',
    });
    compiledPrompt = compiled.compiledPrompt;
    additionalSources = compiled.compiledReferences;
  }

  const normalizedAdditionalSources = await normalizeAdditionalITVSources(additionalSources, !allow.additional);
  const primaryImage = await resolveProviderAssetInput(normalizedPrimary);
  if (!primaryImage) throw new Error('无法解析主参考图');

  const additionalReferences = await ensureProviderAssetInputs(normalizedAdditionalSources);
  if (!allow.primary && primaryImage.transport !== 'remote-url') {
    throw new Error('当前 ITV Provider 仅支持远程 URL 主图');
  }
  if (!allow.additional && additionalReferences.some(item => item.transport !== 'remote-url')) {
    throw new Error('当前 ITV Provider 仅支持远程 URL 附加参考图');
  }

  const started = await provider.start({
    prompt: compiledPrompt,
    primaryImage,
    additionalReferences,
    options: {
      duration: params.duration,
      aspectRatio: params.aspectRatio,
      resolution: params.resolution,
    } as Record<string, unknown>,
  } as never);
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
  ttsConfigId?: string;
  onProgress?: (progress: number, message?: string) => void;
  signal?: AbortSignal;
}): Promise<LinghuiMediaItem> {
  throwIfExecutionAborted(params.signal);
  const provider = await getProjectTTSProvider(params.ttsConfigId || undefined);
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
  llmConfigId?: string;
  signal?: AbortSignal;
}): Promise<string> {
  throwIfExecutionAborted(params.signal);
  const provider = await getProjectLLMProvider(params.llmConfigId || undefined);
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

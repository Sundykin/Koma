import type { AppSettings, MediaAssetSource, ProviderAssetInput } from '../../../../../types';
import { getProjectTTIProvider } from '../../../../../providers';
import { listCapabilityFallbackCandidates, resolveConfiguredChannelModel } from '../../../../../providers/channel/resolver';
import type { ImageResult, MultiAngleTTIRequest } from '../../../../../providers/tti/types';
import { compileLinghuiMultiAnglePrompt } from '../../../../../services/promptCompilation/multiAnglePromptCompiler';
import { getPromptProtocol } from '../../../../../services/promptCompilation/videoRequestCompiler';
import { createLogger } from '../../../../../store/logger';
import type { LinghuiImageMediaItem } from '../../../../../types/linghui';
import { sanitizeBodyForLog, truncateString } from '../../../../../utils/logFormatting';
import {
  compileLinghuiPromptReferences,
  type LinghuiPromptReferenceItem,
} from '../../../editors/state/linghuiPromptReferences';
import { ensureRemoteUrlForImageSources } from '../../../../../services/mediaRemoteUrlService';
import { persistMediaAsset } from '../../../../../services/mediaPersistenceService';
import {
  EXECUTION_PROJECT_ID,
  buildMediaItem,
  createPlaceholderImage,
  throwIfExecutionAborted,
} from '../linghuiExecutionShared';
import {
  executeSingleProviderWithRetry,
  summarizeProviderFallbackMetadata,
  withProviderFallbackMetadata,
  type LinghuiProviderFallbackCandidate,
} from './fallback';
import {
  createTaskSnapshotGetter,
  ensureProviderAssetInputs,
  resolveAsyncProviderResult,
  resolveExecutionSettings,
} from './shared';

const imageLogger = createLogger('LinghuiImageExecution');

type GenerateImageWithProviderParams = {
  prompt: string;
  referenceSources?: Array<MediaAssetSource | ProviderAssetInput>;
  silentReferenceSources?: Array<MediaAssetSource | ProviderAssetInput>;
  steps?: number;
  count?: number;
  /** 画布上用户选的比例（'1:1' / '16:9' / '9:16' / ...）。会透传给 provider.start 的 options。 */
  aspectRatio?: string;
  /** 画布上用户选的分辨率档位（'1K' / '2K' / '4K' / 'auto'）。透传到 options.imageSize，
   *  让 OpenAI 兼容 / 通用上游按用户挑的档位算尺寸。'auto' / 空值表示用模型默认。 */
  resolution?: string;
  onProgress?: (progress: number, message?: string, partialResult?: unknown) => void;
  placeholderTitle: string;
  placeholderSubtitle?: string;
  accent?: string;
  ttiSelection?: string;
  promptReferences?: LinghuiPromptReferenceItem[];
  settingsSnapshot?: AppSettings;
  multiAngle?: Omit<MultiAngleTTIRequest, 'originalPrompt' | 'anglePrompt' | 'compiledPrompt'> | null;
  signal?: AbortSignal;
};

function buildTTIRequestOptions(params: GenerateImageWithProviderParams): Record<string, unknown> | undefined {
  const options: Record<string, unknown> = {};
  if (params.steps !== undefined) options.steps = params.steps;
  const aspectRatio = String(params.aspectRatio ?? '').trim();
  if (aspectRatio) options.aspectRatio = aspectRatio;
  const imageSize = String(params.resolution ?? '').trim();
  // 'auto' 表示让 provider 决定；只有用户显式挑了档位才透传。
  if (imageSize && imageSize.toLowerCase() !== 'auto') options.imageSize = imageSize;
  return Object.keys(options).length > 0 ? options : undefined;
}

interface GenerateImageVariantRequest {
  label?: string;
  prompt: string;
  placeholderTitle?: string;
  placeholderSubtitle?: string;
  metadata?: Record<string, unknown>;
}

type GenerateImageVariantsWithProviderParams = Omit<GenerateImageWithProviderParams, 'prompt' | 'count'> & {
  variants: GenerateImageVariantRequest[];
};

function isImageResult(value: unknown): value is ImageResult {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<ImageResult>;
  return typeof candidate.path === 'string' || typeof candidate.url === 'string';
}

function omitBatchImagesMetadata(metadata?: ImageResult['metadata']): Record<string, unknown> | undefined {
  if (!metadata) return undefined;
  const { batchImages: _batchImages, ...rest } = metadata;
  return Object.keys(rest).length > 0 ? rest : undefined;
}

function extractProviderImageResults(output: ImageResult): ImageResult[] {
  const batchImages = Array.isArray(output.metadata?.batchImages)
    ? output.metadata.batchImages.filter(isImageResult)
    : [];
  return batchImages.length > 0 ? batchImages : [output];
}

function clampProgressValue(progress?: number): number {
  const numeric = Number(progress);
  if (!Number.isFinite(numeric)) {
    return 0;
  }
  return Math.max(0, Math.min(100, Math.round(numeric)));
}

function resolveAverageVariantProgress(progresses: number[]): number {
  if (!progresses.length) {
    return 0;
  }
  return Math.round(progresses.reduce((sum, value) => sum + clampProgressValue(value), 0) / progresses.length);
}

function withVariantImageMetadata(
  item: LinghuiImageMediaItem,
  variant: GenerateImageVariantRequest,
  index: number,
): LinghuiImageMediaItem {
  const mergedMetadata = {
    ...(item.metadata ?? {}),
    variantIndex: index + 1,
    ...(variant.metadata ?? {}),
  };

  return {
    ...item,
    label: String(variant.label ?? '').trim() || item.label || `#${index + 1}`,
    metadata: Object.keys(mergedMetadata).length > 0 ? mergedMetadata : undefined,
  };
}

function buildImageReferenceSourceKey(source: MediaAssetSource | ProviderAssetInput): string {
  if (typeof source === 'string') {
    return source;
  }
  if (source && typeof source === 'object' && 'transport' in source && 'value' in source) {
    return `${source.transport}:${source.value}`;
  }

  const asset = source as Exclude<MediaAssetSource, string>;
  return asset.localPath || asset.remoteUrl || JSON.stringify(asset);
}

function dedupeImageReferenceSources(
  sources: Array<MediaAssetSource | ProviderAssetInput | undefined>,
): Array<MediaAssetSource | ProviderAssetInput> {
  const seen = new Set<string>();
  const deduped: Array<MediaAssetSource | ProviderAssetInput> = [];

  for (const source of sources) {
    if (!source) continue;
    const key = buildImageReferenceSourceKey(source);
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(source);
  }

  return deduped;
}

async function persistImageResult(
  output: ImageResult,
  provider: NonNullable<Awaited<ReturnType<typeof getProjectTTIProvider>>>,
  requestedCapability: 'image.text-to-image' | 'image.image-to-image',
  candidate: LinghuiProviderFallbackCandidate,
  params: GenerateImageWithProviderParams,
): Promise<LinghuiImageMediaItem> {
  const rawSource = output.url || output.path;
  const imageMetadata = omitBatchImagesMetadata(output.metadata);
  let persistedSource = rawSource;
  let persistedMimeType = output.mimeType;
  let persistMetadata: Record<string, unknown> | undefined;
  try {
    const persisted = await persistMediaAsset({
      projectId: EXECUTION_PROJECT_ID,
      kind: 'image',
      source: rawSource,
      mimeType: output.mimeType,
      provider: provider.config?.provider,
      channelId: candidate.channelId,
      modelId: candidate.modelId,
      capability: requestedCapability,
      metadata: {
        selectionKey: candidate.selectionKey,
      },
    });
    persistedSource = persisted.localPath || persisted.remoteUrl || rawSource;
    persistedMimeType = persisted.mimeType || output.mimeType;
    persistMetadata = {
      localPath: persisted.localPath,
      remoteUrl: persisted.remoteUrl,
      ...(persisted.metadata?.localPersistFailed
        ? { localPersistFailed: true, localPersistError: persisted.metadata.localPersistError }
        : undefined),
    };
    imageLogger.info('灵绘图片中间产物落盘完成', {
      selectionKey: params.ttiSelection,
      capability: requestedCapability,
      provider: provider.config?.provider,
      localPath: persisted.localPath,
      remoteUrl: persisted.remoteUrl,
      localPersistFailed: Boolean(persisted.metadata?.localPersistFailed),
    });
  } catch (error) {
    imageLogger.warn('灵绘图片中间产物落盘失败，回落到原始链接', {
      selectionKey: params.ttiSelection,
      capability: requestedCapability,
      provider: provider.config?.provider,
      source: rawSource,
      error: error instanceof Error ? error.message : String(error),
    });
    persistMetadata = {
      localPersistFailed: true,
      localPersistError: error instanceof Error ? error.message : String(error),
    };
  }

  return buildMediaItem({
    kind: 'image',
    source: persistedSource,
    mimeType: persistedMimeType,
    width: output.width,
    height: output.height,
    metadata: {
      ...(imageMetadata ?? {}),
      ...(persistMetadata ? { persist: persistMetadata } : undefined),
    },
  });
}

async function persistImageResults(
  output: ImageResult,
  provider: NonNullable<Awaited<ReturnType<typeof getProjectTTIProvider>>>,
  requestedCapability: 'image.text-to-image' | 'image.image-to-image',
  candidate: LinghuiProviderFallbackCandidate,
  params: GenerateImageWithProviderParams,
): Promise<LinghuiImageMediaItem[]> {
  const results = extractProviderImageResults(output);
  return Promise.all(results.map(item => persistImageResult(item, provider, requestedCapability, candidate, params)));
}

async function executeImageProviderAttempt(
  provider: NonNullable<Awaited<ReturnType<typeof getProjectTTIProvider>>>,
  requestedCapability: 'image.text-to-image' | 'image.image-to-image',
  candidate: LinghuiProviderFallbackCandidate,
  params: GenerateImageWithProviderParams,
): Promise<LinghuiImageMediaItem[]> {
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
        prompt: params.prompt,
        config: params.multiAngle,
      });
      compiledPrompt = compiledMultiAngle.compiledPrompt;
      multiAngleRequest = {
        ...params.multiAngle,
        originalPrompt: params.prompt,
        anglePrompt: compiledMultiAngle.anglePrompt,
        compiledPrompt,
      };
    }

    // grok 协议下，data-uri 会让 chat/completions body 暴增（部分代理 413/超时），
    // 这里先尝试把本地参考图上传到图床（best-effort），失败则回落到原始 data-url。
    const requiresRemoteUrlUpload = replacementStrategy === 'image-index';
    const [resolvedReferenceSources, resolvedSilentReferenceSources] = requiresRemoteUrlUpload
      ? await (async () => {
          const combinedSources = [...referenceSources, ...silentReferenceSources];
          const resolvedCombinedSources = await ensureRemoteUrlForImageSources({
            projectId: EXECUTION_PROJECT_ID,
            sources: combinedSources,
            policy: 'best-effort',
          });
          return [
            resolvedCombinedSources.slice(0, referenceSources.length),
            resolvedCombinedSources.slice(referenceSources.length),
          ];
        })()
      : [referenceSources, silentReferenceSources];

    const providerReferenceSources = dedupeImageReferenceSources([
      ...resolvedReferenceSources,
      ...resolvedSilentReferenceSources,
    ]);
    references = await ensureProviderAssetInputs(providerReferenceSources, {
      preferLocalFile: !requiresRemoteUrlUpload,
    });

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
    count: Math.max(1, Math.floor(Number(params.count ?? 1) || 1)),
    request: sanitizeBodyForLog({
      requestType: multiAngleRequest ? 'multi-angle' : 'text-to-image',
      multiAngle: multiAngleRequest
        ? {
            azimuth: multiAngleRequest.azimuth,
            elevation: multiAngleRequest.elevation,
            distance: multiAngleRequest.distance,
            mode: multiAngleRequest.mode,
            rotation: multiAngleRequest.rotation,
            tilt: multiAngleRequest.tilt,
            scale: multiAngleRequest.scale,
            isWideAngle: multiAngleRequest.isWideAngle,
            presetKey: multiAngleRequest.presetKey,
            promptEnabled: multiAngleRequest.promptEnabled,
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
      count: Math.max(1, Math.floor(Number(params.count ?? 1) || 1)),
      options: buildTTIRequestOptions(params) as never,
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

  // 把生成的图片落盘到 EXECUTION_PROJECT_ID 项目目录下，避免远程链接（包括需要
  // channel 鉴权的端点）失效；channelId 透传给 mediaPersistenceService 用于按需鉴权下载。
  return persistImageResults(output, provider, requestedCapability, candidate, params);
}

export async function generateImagesWithProvider(params: GenerateImageWithProviderParams): Promise<LinghuiImageMediaItem[]> {
  throwIfExecutionAborted(params.signal);
  const requestedCapability = params.multiAngle ? 'image.image-to-image' : 'image.text-to-image';
  const settings = await resolveExecutionSettings(params.settingsSnapshot);
  const selectedContext = resolveConfiguredChannelModel(settings, 'tti', params.ttiSelection);
  const capableContext = resolveConfiguredChannelModel(settings, 'tti', params.ttiSelection, requestedCapability);

  imageLogger.info('灵绘图片生成入口', {
    selectionKey: params.ttiSelection,
    capability: requestedCapability,
    requestType: params.multiAngle ? 'multi-angle' : 'text-to-image',
    channelId: capableContext?.channelConfig.id ?? selectedContext?.channelConfig.id,
    modelId: capableContext?.model.id ?? selectedContext?.model.id,
    prompt: truncateString(params.prompt || '', 600),
    count: Math.max(1, Math.floor(Number(params.count ?? 1) || 1)),
    referenceCount: params.referenceSources?.length ?? 0,
    silentReferenceCount: params.silentReferenceSources?.length ?? 0,
    promptReferenceCount: params.promptReferences?.length ?? 0,
    multiAngle: params.multiAngle
      ? {
          azimuth: params.multiAngle.azimuth,
          elevation: params.multiAngle.elevation,
          distance: params.multiAngle.distance,
          mode: params.multiAngle.mode,
          rotation: params.multiAngle.rotation,
          tilt: params.multiAngle.tilt,
          scale: params.multiAngle.scale,
          isWideAngle: params.multiAngle.isWideAngle,
          presetKey: params.multiAngle.presetKey,
          promptEnabled: params.multiAngle.promptEnabled,
          promptProtocol: params.multiAngle.promptProtocol,
          endpointPath: params.multiAngle.endpointPath,
        }
      : undefined,
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

  const candidates = listCapabilityFallbackCandidates(
    settings,
    'tti',
    requestedCapability,
    params.ttiSelection,
  );

  if (!candidates.length) {
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
    return [buildMediaItem({
      kind: 'image',
      source: createPlaceholderImage({
        title: params.placeholderTitle,
        subtitle: params.placeholderSubtitle ?? (params.prompt || '未配置 TTI 服务，已生成占位预览'),
        accent: params.accent,
      }),
      placeholder: true,
    })];
  }

  // 与视频路径对齐：用户选哪个 TTI 渠道就只用哪个，**绝不跨渠道降级**。
  // 同 provider 上的瞬时错误（502 / ERR_CONNECTION_CLOSED）通过指数退避重试消化；
  // 重试用尽仍失败就把原始错误如实抛出，不悄悄换上别的渠道让账单和效果都出乎意料。
  const execution = await executeSingleProviderWithRetry({
    mediaLabel: '图片',
    category: 'tti',
    capability: requestedCapability,
    settings,
    preferredSelection: params.ttiSelection,
    signal: params.signal,
    loadProvider: selectionKey => getProjectTTIProvider(selectionKey, requestedCapability, settings),
    validateProvider: provider => provider.validate(),
    execute: (provider, candidate) =>
      executeImageProviderAttempt(provider, requestedCapability, candidate, params),
  });

  const providerFallback = summarizeProviderFallbackMetadata(
    'tti',
    requestedCapability,
    execution.attempts,
    execution.finalCandidate,
  );

  return execution.result.map(item => withProviderFallbackMetadata(item, providerFallback));
}

export async function generateImageVariantsWithProvider(
  params: GenerateImageVariantsWithProviderParams,
): Promise<LinghuiImageMediaItem[]> {
  const { variants, onProgress, ...sharedParams } = params;
  const normalizedVariants = variants
    .map((variant, index) => ({
      ...variant,
      label: String(variant.label ?? '').trim() || `#${index + 1}`,
      prompt: String(variant.prompt ?? '').trim(),
    }))
    .filter(variant => variant.prompt);

  if (!normalizedVariants.length) {
    return [];
  }

  const progressByIndex = Array.from({ length: normalizedVariants.length }, () => 0);
  const emitVariantProgress = (index: number, progress: number, message?: string) => {
    progressByIndex[index] = clampProgressValue(progress);
    const aggregateProgress = resolveAverageVariantProgress(progressByIndex);
    const label = normalizedVariants[index]?.label || `#${index + 1}`;
    const normalizedMessage = String(message ?? '').trim();
    onProgress?.(
      aggregateProgress,
      normalizedMessage ? `${label} · ${normalizedMessage}` : `${label} 生成中`,
    );
  };

  return Promise.all(normalizedVariants.map(async (variant, index) => {
    emitVariantProgress(index, 0, '准备生成');

    const image = await generateImageWithProvider({
      ...sharedParams,
      prompt: variant.prompt,
      onProgress: (progress, message) => emitVariantProgress(index, progress, message),
      placeholderTitle: variant.placeholderTitle ?? sharedParams.placeholderTitle,
      placeholderSubtitle: variant.placeholderSubtitle ?? sharedParams.placeholderSubtitle,
    });

    emitVariantProgress(index, 100, '已完成');
    return withVariantImageMetadata(image, variant, index);
  }));
}

export async function generateImageWithProvider(params: GenerateImageWithProviderParams): Promise<LinghuiImageMediaItem> {
  const items = await generateImagesWithProvider({
    ...params,
    count: 1,
  });
  const first = items[0];
  if (!first) {
    throw new Error('图片生成未返回有效结果');
  }
  return first;
}

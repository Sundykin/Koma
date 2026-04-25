import type {
  AppSettings,
  Character,
  ITVRequest,
  MediaAssetSource,
  Prop,
  Scene,
  Shot,
  StoredMediaAsset,
  VideoGenerationCapability,
} from '../types';
import { getMediaAssetDisplaySource } from '../types';
import { normalizeVideoDurationSeconds } from '../utils/videoDuration';
import type { ModelCapability } from '../providers/channel/types';
import type { PromptCompilationAsset } from '../services/promptCompilation/types';
import { buildVideoCapabilityRequest } from '../services/promptCompilation/videoRequestCompiler';
import { normalizeShotMediaState } from '../store/project/mediaState';
import {
  listConfiguredModelSelectOptions,
  resolveConfiguredChannelModel,
  type ResolvedChannelModelContext,
} from '../providers/channel/resolver';
import { buildShotAssetReferences } from './assetReferenceBuilder';

export const SHOT_VIDEO_CAPABILITY_LABELS: Record<VideoGenerationCapability, string> = {
  'video.text-to-video': '文生视频',
  'video.image-to-video': '图生视频',
  'video.reference-to-video': '参考生视频',
  'video.start-end-to-video': '首尾帧视频',
};

export interface ShotVideoPlan {
  shot: Shot;
  selectedImageAsset?: StoredMediaAsset;
  selectedImageSource?: string;
  primaryImageInput?: MediaAssetSource;
  primaryImageSource?: string;
  visualReferenceInputs: MediaAssetSource[];
  additionalReferenceImages: MediaAssetSource[];
  selectedAssetsForCompilation: PromptCompilationAsset[];
  capability: VideoGenerationCapability;
  capabilityLabel: string;
}

export interface ShotVideoCapabilitySupport {
  requestedCapability: VideoGenerationCapability;
  capability: VideoGenerationCapability;
  capabilityLabel: string;
  resolvedContext?: ResolvedChannelModelContext;
  effectiveSelectionKey?: string;
  disabledReason?: string;
}

function getVideoThumbnailSource(asset?: StoredMediaAsset): string | undefined {
  if (!asset || asset.kind !== 'video') return undefined;
  const thumbnailPath = typeof asset.metadata?.thumbnailPath === 'string'
    ? asset.metadata.thumbnailPath.trim()
    : '';
  return thumbnailPath || undefined;
}

function getVisualReferenceSource(source?: MediaAssetSource): string | undefined {
  if (!source) return undefined;
  if (typeof source === 'string') {
    return source.trim() || undefined;
  }
  if (source.kind === 'video') {
    return getVideoThumbnailSource(source);
  }
  return getMediaAssetDisplaySource(source)?.trim() || undefined;
}

function pushUniqueSource(
  bucket: MediaAssetSource[],
  dedupe: Set<string>,
  source?: MediaAssetSource,
  excludeKey?: string,
) {
  const normalized = getVisualReferenceSource(source);
  if (!normalized || normalized === excludeKey || dedupe.has(normalized)) {
    return;
  }

  dedupe.add(normalized);
  bucket.push(source as MediaAssetSource);
}

export function collectShotVideoPlan(params: {
  shot: Shot;
  characters: Character[];
  scenes: Scene[];
  props: Prop[];
  /**
   * 当前选中 ITV 模型的能力矩阵。传入后：若没有真主图（selectedImageAsset）
   * 但模型支持 video.reference-to-video，则不再把首个参考图/视频缩略图
   * 伪装成主图，而是直接走参考生视频。未传入时保持旧有的兼容降级路径。
   */
  modelCapabilities?: ModelCapability[];
}): ShotVideoPlan {
  const normalizedShot = normalizeShotMediaState(params.shot);
  const selectedImageIndex = normalizedShot.media?.currentImageIndex ?? 0;
  const selectedImageAsset = normalizedShot.media?.images?.[selectedImageIndex];
  const selectedImageSource = getVisualReferenceSource(selectedImageAsset);
  const selectedReferenceIndex = normalizedShot.media?.selectedReferenceIndex ?? 0;
  const selectedReferenceAsset = normalizedShot.media?.references?.[selectedReferenceIndex];
  const selectedReferenceSource = getVisualReferenceSource(selectedReferenceAsset);
  const currentVideoIndex = normalizedShot.media?.currentVideoIndex ?? 0;
  const currentVideoAsset = normalizedShot.media?.videos?.[currentVideoIndex];
  const currentVideoPosterSource = getVisualReferenceSource(currentVideoAsset);

  const {
    compilationAssets,
  } = buildShotAssetReferences(normalizedShot, params.characters, params.scenes, params.props);

  const modelSupportsReferenceToVideo = params.modelCapabilities
    ? params.modelCapabilities.includes('video.reference-to-video')
    : false;

  // 仅当用户在「图像设计」列明确选中一张时才算真主图；参考图/视频缩略图/资产图不充当主图。
  const realPrimaryImage = selectedImageAsset;
  // 兼容降级：模型不支持参考生视频时，沿用老逻辑把首个可用参考图/视频缩略图当作主图。
  // 资产图（角色/场景/道具）不走这条兜底——历史上它们只参与提示词编译，不直接充当主图。
  const legacyFallbackPrimary = selectedReferenceAsset || currentVideoPosterSource;

  // 从关联的角色/场景/道具里提取可作为视觉参考的源（costumePhoto / previewImage / 视频封面）。
  // 历史默认：资产图仅参与提示词编译，不直接进视频请求。只有在「模型声明支持参考生视频」
  // 时才升级为真正的视觉输入，避免对没有传入 modelCapabilities 的调用路径产生副作用。
  const assetVisualSources: MediaAssetSource[] = [];
  if (modelSupportsReferenceToVideo) {
    for (const asset of compilationAssets) {
      const rawSource = asset.source;
      if (!rawSource) continue;
      if (typeof rawSource === 'string') {
        if (rawSource.trim()) assetVisualSources.push(rawSource);
        continue;
      }
      // ProviderAssetInput 只在已提交过的 provider 请求上下文里出现，分镜
      // 采集阶段不会塞这种类型；过滤掉以满足 MediaAssetSource 收窄。
      if ('transport' in rawSource) continue;
      if (getVisualReferenceSource(rawSource)) {
        assetVisualSources.push(rawSource);
      }
    }
  }

  // 是否有任何可用视觉输入
  const hasAnyVisualInput = Boolean(
    selectedReferenceAsset
    || currentVideoPosterSource
    || (normalizedShot.media?.references?.length ?? 0) > 0
    || (normalizedShot.media?.videos?.length ?? 0) > 0
    || assetVisualSources.length > 0,
  );

  let capability: VideoGenerationCapability;
  let primaryImageInput: MediaAssetSource | undefined;

  if (realPrimaryImage) {
    capability = 'video.image-to-video';
    primaryImageInput = realPrimaryImage;
  } else if (hasAnyVisualInput && modelSupportsReferenceToVideo) {
    // 新规则：无真主图 + 模型支持参考生视频 → 走参考生视频，不强占主图位。
    capability = 'video.reference-to-video';
    primaryImageInput = undefined;
  } else if (legacyFallbackPrimary) {
    // 兼容老模型：只会图生不会参考生，仍把首个参考图当主图。
    capability = 'video.image-to-video';
    primaryImageInput = legacyFallbackPrimary;
  } else {
    capability = 'video.text-to-video';
    primaryImageInput = undefined;
  }

  const primaryImageSource = getVisualReferenceSource(primaryImageInput);

  const additionalReferenceImages: MediaAssetSource[] = [];
  const dedupe = new Set<string>();

  (normalizedShot.media?.references || []).forEach((reference, index) => {
    if (index === selectedReferenceIndex && primaryImageSource === selectedReferenceSource) {
      return;
    }
    pushUniqueSource(additionalReferenceImages, dedupe, reference, primaryImageSource);
  });

  (normalizedShot.media?.videos || []).forEach((video, index) => {
    if (index === currentVideoIndex && primaryImageSource === currentVideoPosterSource) {
      return;
    }
    pushUniqueSource(additionalReferenceImages, dedupe, getVideoThumbnailSource(video), primaryImageSource);
  });

  // 资产图（角色/场景/道具）：去重后追加，保证没有 shot.media 参考图时也能凑出 referenceImages。
  for (const assetSource of assetVisualSources) {
    pushUniqueSource(additionalReferenceImages, dedupe, assetSource, primaryImageSource);
  }

  const visualReferenceInputs: MediaAssetSource[] = primaryImageInput
    ? [primaryImageInput, ...additionalReferenceImages]
    : [...additionalReferenceImages];

  return {
    shot: normalizedShot,
    selectedImageAsset,
    selectedImageSource,
    primaryImageInput,
    primaryImageSource,
    visualReferenceInputs,
    additionalReferenceImages,
    selectedAssetsForCompilation: compilationAssets,
    capability,
    capabilityLabel: SHOT_VIDEO_CAPABILITY_LABELS[capability],
  };
}

export function buildShotVideoRequest(params: {
  plan: ShotVideoPlan;
  prompt: string;
  aspectRatio: string;
  duration: number;
  motionPrompt?: string;
  capability?: VideoGenerationCapability;
}): ITVRequest<MediaAssetSource> {
  const capability = params.capability || params.plan.capability;
  const options = {
    duration: normalizeVideoDurationSeconds(params.duration),
    motionPrompt: params.motionPrompt,
    aspectRatio: params.aspectRatio,
  };

  if (capability === 'video.image-to-video') {
    return buildVideoCapabilityRequest<MediaAssetSource>({
      capability,
      prompt: params.prompt,
      primaryImage: params.plan.primaryImageInput,
      additionalReferences: params.plan.additionalReferenceImages,
      options,
    });
  }

  if (capability === 'video.reference-to-video') {
    return buildVideoCapabilityRequest<MediaAssetSource>({
      capability,
      prompt: params.prompt,
      referenceImages: params.plan.visualReferenceInputs,
      options,
    });
  }

  return buildVideoCapabilityRequest<MediaAssetSource>({
    capability: 'video.text-to-video',
    prompt: params.prompt,
    options,
  });
}

export function resolveShotVideoCapabilitySupport(params: {
  settings: AppSettings;
  selectionKey?: string;
  capability: VideoGenerationCapability;
  visualInputCount?: number;
}): ShotVideoCapabilitySupport {
  const resolvedContext = resolveConfiguredChannelModel(
    params.settings,
    'itv',
    params.selectionKey,
    params.capability,
  );
  if (resolvedContext) {
    return {
      requestedCapability: params.capability,
      capability: params.capability,
      capabilityLabel: SHOT_VIDEO_CAPABILITY_LABELS[params.capability],
      resolvedContext,
      effectiveSelectionKey: params.selectionKey,
    };
  }

  const availableModels = listConfiguredModelSelectOptions(
    params.settings,
    'itv',
    params.capability,
  );
  const targetCapability = params.capability;
  const capabilityLabel = SHOT_VIDEO_CAPABILITY_LABELS[targetCapability];
  const selectedContext = params.selectionKey
    ? resolveConfiguredChannelModel(params.settings, 'itv', params.selectionKey)
    : undefined;

  return {
    requestedCapability: params.capability,
    capability: targetCapability,
    capabilityLabel,
    effectiveSelectionKey: params.selectionKey,
    disabledReason: selectedContext && availableModels.length > 0
      ? `当前选择的模型不支持${capabilityLabel}，请切换模型`
      : `当前没有配置支持${capabilityLabel}的视频模型`,
  };
}

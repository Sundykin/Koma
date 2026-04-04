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

  const additionalReferenceImages: MediaAssetSource[] = [];
  const dedupe = new Set<string>();
  const primaryImageInput = selectedImageAsset
    || selectedReferenceAsset
    || currentVideoPosterSource;
  const primaryImageSource = getVisualReferenceSource(primaryImageInput);

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

  const visualReferenceInputs: MediaAssetSource[] = primaryImageInput
    ? [primaryImageInput, ...additionalReferenceImages]
    : [...additionalReferenceImages];

  const capability: VideoGenerationCapability = primaryImageInput
    ? 'video.image-to-video'
    : additionalReferenceImages.length > 0
      ? 'video.reference-to-video'
      : 'video.text-to-video';

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
    duration: params.duration,
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

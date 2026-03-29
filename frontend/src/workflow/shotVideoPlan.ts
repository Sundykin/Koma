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
  additionalReferenceImages: MediaAssetSource[];
  selectedAssetsForCompilation: PromptCompilationAsset[];
  capability: VideoGenerationCapability;
  capabilityLabel: string;
}

export interface ShotVideoCapabilitySupport {
  capability: VideoGenerationCapability;
  capabilityLabel: string;
  resolvedContext?: ResolvedChannelModelContext;
  disabledReason?: string;
}

function pushUniqueSource(
  bucket: MediaAssetSource[],
  dedupe: Set<string>,
  source?: MediaAssetSource,
  excludeKey?: string,
) {
  const normalized = typeof source === 'string'
    ? source.trim()
    : getMediaAssetDisplaySource(source)?.trim();
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
  const selectedImageSource = getMediaAssetDisplaySource(selectedImageAsset);

  const {
    displaySourceUrls: assetReferenceSources,
    compilationAssets,
  } = buildShotAssetReferences(normalizedShot, params.characters, params.scenes, params.props);

  const additionalReferenceImages: MediaAssetSource[] = [];
  const dedupe = new Set<string>();

  assetReferenceSources.forEach(source => {
    pushUniqueSource(additionalReferenceImages, dedupe, source, selectedImageSource);
  });

  (normalizedShot.media?.references || []).forEach(reference => {
    pushUniqueSource(additionalReferenceImages, dedupe, reference, selectedImageSource);
  });

  const capability: VideoGenerationCapability = selectedImageAsset
    ? 'video.image-to-video'
    : additionalReferenceImages.length > 0
      ? 'video.reference-to-video'
      : 'video.text-to-video';

  return {
    shot: normalizedShot,
    selectedImageAsset,
    selectedImageSource,
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
}): ITVRequest<MediaAssetSource> {
  const options = {
    duration: params.duration,
    motionPrompt: params.motionPrompt,
    aspectRatio: params.aspectRatio,
  };

  if (params.plan.capability === 'video.image-to-video') {
    return buildVideoCapabilityRequest<MediaAssetSource>({
      capability: params.plan.capability,
      prompt: params.prompt,
      primaryImage: params.plan.selectedImageAsset,
      additionalReferences: params.plan.additionalReferenceImages,
      options,
    });
  }

  if (params.plan.capability === 'video.reference-to-video') {
    return buildVideoCapabilityRequest<MediaAssetSource>({
      capability: params.plan.capability,
      prompt: params.prompt,
      referenceImages: params.plan.additionalReferenceImages,
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
}): ShotVideoCapabilitySupport {
  const resolvedContext = resolveConfiguredChannelModel(
    params.settings,
    'itv',
    params.selectionKey,
    params.capability,
  );

  if (resolvedContext) {
    return {
      capability: params.capability,
      capabilityLabel: SHOT_VIDEO_CAPABILITY_LABELS[params.capability],
      resolvedContext,
    };
  }

  const availableModels = listConfiguredModelSelectOptions(
    params.settings,
    'itv',
    params.capability,
  );
  const capabilityLabel = SHOT_VIDEO_CAPABILITY_LABELS[params.capability];

  return {
    capability: params.capability,
    capabilityLabel,
    disabledReason: availableModels.length > 0
      ? `当前项目选择的视频模型不支持${capabilityLabel}，请切换模型`
      : `当前没有配置支持${capabilityLabel}的视频模型`,
  };
}

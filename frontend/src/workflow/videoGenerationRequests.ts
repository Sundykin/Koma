import type { Character, ITVRequest, MediaAssetSource, Prop, ProviderAssetInput, VideoGenerationCapability } from '../types';
import {
  isImageToVideoRequest,
  isReferenceToVideoRequest,
} from '../types';
import type { PromptCompilationInput } from '../services/promptCompilation/types';
import { resolvePromptTemplate } from '../store/promptTemplates';
import {
  buildShotVideoRequest,
  type ShotVideoPlan,
} from './shotVideoPlan';
import { DEFAULT_VIDEO_DURATION_SECONDS } from '../utils/videoDuration';

// 这一层只做最低限度的"非空整数"兜底；按 ITV 渠道枚举/范围吸附在 ShotAnalysisService / Storyboard
// 创建/编辑路径上已完成；上游 provider（Grok2ApiImagineITVProvider / SeedanceProvider）也会再做一次
// 自己 spec 的 normalize。这里再走 grok 风格的 normalizeVideoDurationSeconds 会把 seedance 的 5/8
// 强制吸到 6/10，是上一轮 "时长被 grok 枚举锁死" 的根因之一。
function coerceRequestDurationSeconds(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.max(1, Math.round(value));
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) return Math.max(1, Math.round(parsed));
  }
  return DEFAULT_VIDEO_DURATION_SECONDS;
}

export interface CompiledVideoGenerationRequest {
  prompt: string;
  request: ITVRequest<MediaAssetSource>;
  promptCompilation?: PromptCompilationInput;
  templateId?: string;
  promptSource?: 'default' | 'custom' | 'finalized';
}

function buildMediaSourceKey(source: MediaAssetSource | ProviderAssetInput): string {
  if (typeof source === 'string') {
    return source;
  }
  if (source && typeof source === 'object' && 'transport' in source && 'value' in source) {
    return `${source.transport}:${source.value}`;
  }
  return source.remoteUrl || source.localPath || JSON.stringify(source);
}

function collectSeedanceSelectedAssetReferences(plan: ShotVideoPlan): MediaAssetSource[] {
  const references: MediaAssetSource[] = [];
  const dedupe = new Set<string>();

  for (const asset of plan.selectedAssetsForCompilation) {
    if (!asset.source) {
      continue;
    }
    const key = buildMediaSourceKey(asset.source);
    if (dedupe.has(key)) {
      continue;
    }
    dedupe.add(key);
    references.push(asset.source);
  }

  return references;
}

function mergeSeedanceShotReferences(
  request: ITVRequest<MediaAssetSource>,
  plan: ShotVideoPlan,
): ITVRequest<MediaAssetSource> {
  const assetReferences = collectSeedanceSelectedAssetReferences(plan);
  if (!assetReferences.length) {
    return request;
  }

  if (isImageToVideoRequest(request)) {
    const primaryKey = buildMediaSourceKey(request.primaryImage);
    const dedupe = new Set<string>([primaryKey]);
    const mergedAdditional: MediaAssetSource[] = [];

    for (const source of [...assetReferences, ...(request.additionalReferences || [])]) {
      const key = buildMediaSourceKey(source);
      if (dedupe.has(key)) {
        continue;
      }
      dedupe.add(key);
      mergedAdditional.push(source);
    }

    return {
      ...request,
      additionalReferences: mergedAdditional,
    };
  }

  if (isReferenceToVideoRequest(request)) {
    const [primaryReference, ...restReferences] = request.referenceImages;
    const dedupe = new Set<string>();
    const mergedReferences: MediaAssetSource[] = [];

    if (primaryReference) {
      const key = buildMediaSourceKey(primaryReference);
      dedupe.add(key);
      mergedReferences.push(primaryReference);
    }

    for (const source of [...assetReferences, ...restReferences]) {
      const key = buildMediaSourceKey(source);
      if (dedupe.has(key)) {
        continue;
      }
      dedupe.add(key);
      mergedReferences.push(source);
    }

    return {
      ...request,
      referenceImages: mergedReferences,
    };
  }

  return request;
}

function normalizePromptSource(
  source: string | undefined,
): 'default' | 'custom' | 'finalized' | undefined {
  return source === 'default' || source === 'custom' || source === 'finalized'
    ? source
    : undefined;
}

export function compileShotVideoGenerationRequest(params: {
  plan: ShotVideoPlan;
  prompt: string;
  aspectRatio: string;
  duration: number;
  motionPrompt?: string;
  capability?: VideoGenerationCapability;
  providerType?: string;
}): CompiledVideoGenerationRequest {
  const request = buildShotVideoRequest({
    plan: params.plan,
    prompt: params.prompt,
    duration: coerceRequestDurationSeconds(params.duration),
    motionPrompt: params.motionPrompt,
    aspectRatio: params.aspectRatio,
    capability: params.capability,
  });

  return {
    prompt: params.prompt,
    request: params.providerType === 'seedance'
      ? mergeSeedanceShotReferences(request, params.plan)
      : request,
    promptCompilation: {
      selectedAssets: params.plan.selectedAssetsForCompilation,
      primaryReferenceSource: params.capability === 'video.reference-to-video'
        ? params.plan.primaryImageInput
        : undefined,
    },
  };
}

export async function compileCharacterPreviewVideoRequest(params: {
  character: Character;
  primaryImage: MediaAssetSource;
  stylePrefix: string;
  duration?: number;
}): Promise<CompiledVideoGenerationRequest> {
  const visualPrompt = params.character.prompt || params.character.name;
  const resolvedPrompt = await resolvePromptTemplate('itv_character_motion', {
    stylePrefix: params.stylePrefix,
    characterName: params.character.name,
    action: `${visualPrompt}, character showcase, subtle breathing, natural eye movement, steady camera`,
  });

  const finalDuration = coerceRequestDurationSeconds(params.duration);

  return {
    prompt: resolvedPrompt.prompt,
    request: {
      capability: 'video.image-to-video',
      prompt: resolvedPrompt.prompt,
      primaryImage: params.primaryImage,
      additionalReferences: [],
      options: { duration: finalDuration, aspectRatio: '9:16' },
    },
    templateId: resolvedPrompt.template.id,
    promptSource: normalizePromptSource(resolvedPrompt.source),
  };
}

export async function compilePropPreviewVideoRequest(params: {
  prop: Prop;
  primaryImage: MediaAssetSource;
  stylePrefix: string;
  duration?: number;
}): Promise<CompiledVideoGenerationRequest> {
  const resolvedPrompt = await resolvePromptTemplate('itv_prop_motion', {
    stylePrefix: params.stylePrefix,
    description: params.prop.prompt || params.prop.name,
    motion: 'prop showcase, rotating slowly, detailed view',
  });

  const finalDuration = coerceRequestDurationSeconds(params.duration);

  return {
    prompt: resolvedPrompt.prompt,
    request: {
      capability: 'video.image-to-video',
      prompt: resolvedPrompt.prompt,
      primaryImage: params.primaryImage,
      additionalReferences: [],
      options: { duration: finalDuration, aspectRatio: '1:1' },
    },
    templateId: resolvedPrompt.template.id,
    promptSource: normalizePromptSource(resolvedPrompt.source),
  };
}

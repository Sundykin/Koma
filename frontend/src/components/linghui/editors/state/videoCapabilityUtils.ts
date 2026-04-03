import type { ModelCapability } from '../../../../providers/channel/types';
import type { VideoGenerationCapability } from '../../../../types';

export type LinghuiVideoCapability = VideoGenerationCapability;
export type LinghuiVisualReferenceRole =
  | 'primary'
  | 'reference'
  | 'start'
  | 'end'
  | 'prompt-only'
  | 'unused';

export interface VideoCapabilityDescriptor {
  key: LinghuiVideoCapability;
  label: string;
  shortDescription: string;
  inputHint: string;
  emptyStateHint: string;
}

export interface ResolvedVideoCapabilitySources {
  visualSources: string[];
  primaryImageSource?: string;
  additionalReferenceSources: string[];
  referenceImageSources: string[];
  startFrameSource?: string;
  endFrameSource?: string;
}

export const VIDEO_CAPABILITY_ORDER: LinghuiVideoCapability[] = [
  'video.text-to-video',
  'video.image-to-video',
  'video.reference-to-video',
  'video.start-end-to-video',
];

export const VIDEO_CAPABILITY_LABELS: Record<LinghuiVideoCapability, string> = {
  'video.text-to-video': '文生视频',
  'video.image-to-video': '图生视频',
  'video.reference-to-video': '参考生视频',
  'video.start-end-to-video': '首尾帧视频',
};

const VIDEO_CAPABILITY_DESCRIPTORS: Record<LinghuiVideoCapability, VideoCapabilityDescriptor> = {
  'video.text-to-video': {
    key: 'video.text-to-video',
    label: VIDEO_CAPABILITY_LABELS['video.text-to-video'],
    shortDescription: '只根据提示词生成镜头，不强制要求视觉素材。',
    inputHint: '当前模式不直接上传图片，视觉上游只用于提示词引用和语义补充。',
    emptyStateHint: '当前模式不依赖视觉素材，可以直接描述镜头、动作和风格。',
  },
  'video.image-to-video': {
    key: 'video.image-to-video',
    label: VIDEO_CAPABILITY_LABELS['video.image-to-video'],
    shortDescription: '使用一张主图驱动视频生成，可附带补充视觉参考。',
    inputHint: '第一路视觉输入会作为主图，其余视觉输入会按补充参考参与生成。',
    emptyStateHint: '请至少连接一张图片或一段带封面的上游视频，第一路视觉输入会作为主图。',
  },
  'video.reference-to-video': {
    key: 'video.reference-to-video',
    label: VIDEO_CAPABILITY_LABELS['video.reference-to-video'],
    shortDescription: '将全部视觉输入作为参考集合，一起约束生成结果。',
    inputHint: '所有视觉输入都会按顺序作为参考图集合参与执行。',
    emptyStateHint: '请连接至少一张图片或一段带封面的上游视频，作为参考集合输入。',
  },
  'video.start-end-to-video': {
    key: 'video.start-end-to-video',
    label: VIDEO_CAPABILITY_LABELS['video.start-end-to-video'],
    shortDescription: '要求首帧和尾帧，生成从起始到结束的连续过渡镜头。',
    inputHint: '第一路视觉输入作为首帧，最后一路视觉输入作为尾帧，中间视觉输入仅作展示。',
    emptyStateHint: '请至少连接两路视觉输入，分别作为首帧和尾帧。',
  },
};

export function isVideoCapability(value: unknown): value is LinghuiVideoCapability {
  return typeof value === 'string' && VIDEO_CAPABILITY_ORDER.includes(value as LinghuiVideoCapability);
}

export function listVideoCapabilities(
  capabilities?: ReadonlyArray<ModelCapability | string>,
): LinghuiVideoCapability[] {
  if (!capabilities?.length) {
    return [...VIDEO_CAPABILITY_ORDER];
  }

  const dedupe = new Set<LinghuiVideoCapability>();
  const filtered: LinghuiVideoCapability[] = [];

  for (const capability of capabilities) {
    if (!isVideoCapability(capability) || dedupe.has(capability)) {
      continue;
    }

    dedupe.add(capability);
    filtered.push(capability);
  }

  return filtered.length > 0 ? filtered : [...VIDEO_CAPABILITY_ORDER];
}

export function pickDefaultVideoCapability(
  capabilities?: ReadonlyArray<ModelCapability | string>,
): LinghuiVideoCapability {
  return listVideoCapabilities(capabilities)[0] || 'video.text-to-video';
}

export function resolveSupportedVideoCapability(
  preferred?: LinghuiVideoCapability | string,
  capabilities?: ReadonlyArray<ModelCapability | string>,
): LinghuiVideoCapability {
  const supported = listVideoCapabilities(capabilities);
  if (preferred && supported.includes(preferred as LinghuiVideoCapability)) {
    return preferred as LinghuiVideoCapability;
  }

  return supported[0] || 'video.text-to-video';
}

export function getVideoCapabilityDescriptor(
  capability?: LinghuiVideoCapability | string,
): VideoCapabilityDescriptor {
  const resolved = isVideoCapability(capability) ? capability : 'video.text-to-video';
  return VIDEO_CAPABILITY_DESCRIPTORS[resolved];
}

export function resolveVideoCapabilitySources(
  capability: LinghuiVideoCapability,
  visualSources: string[],
): ResolvedVideoCapabilitySources {
  const normalized = Array.from(new Set(
    visualSources
      .map(source => String(source || '').trim())
      .filter(Boolean),
  ));

  if (capability === 'video.text-to-video') {
    return {
      visualSources: normalized,
      additionalReferenceSources: [],
      referenceImageSources: [],
    };
  }

  if (capability === 'video.image-to-video') {
    return {
      visualSources: normalized,
      primaryImageSource: normalized[0],
      additionalReferenceSources: normalized.slice(1),
      referenceImageSources: [],
    };
  }

  if (capability === 'video.reference-to-video') {
    return {
      visualSources: normalized,
      additionalReferenceSources: [],
      referenceImageSources: normalized,
    };
  }

  return {
    visualSources: normalized,
    additionalReferenceSources: [],
    referenceImageSources: [],
    startFrameSource: normalized[0],
    endFrameSource: normalized.length > 1 ? normalized[normalized.length - 1] : undefined,
  };
}

export function getVideoCapabilityInputError(
  capability: LinghuiVideoCapability,
  sources: ResolvedVideoCapabilitySources,
): string | undefined {
  if (capability === 'video.text-to-video') {
    return undefined;
  }

  if (capability === 'video.image-to-video' && !sources.primaryImageSource) {
    return '图生视频至少需要一张主图';
  }

  if (capability === 'video.reference-to-video' && sources.referenceImageSources.length === 0) {
    return '参考生视频至少需要一张参考图';
  }

  if (capability === 'video.start-end-to-video') {
    if (!sources.startFrameSource || !sources.endFrameSource) {
      return '首尾帧视频需要同时提供首帧和尾帧';
    }
  }

  return undefined;
}

export function getVisualReferenceRoleLabel(
  role: LinghuiVisualReferenceRole,
): string | undefined {
  switch (role) {
    case 'primary':
      return '主图';
    case 'reference':
      return '参考';
    case 'start':
      return '首帧';
    case 'end':
      return '尾帧';
    case 'prompt-only':
      return '仅提示词';
    case 'unused':
      return '忽略';
    default:
      return undefined;
  }
}

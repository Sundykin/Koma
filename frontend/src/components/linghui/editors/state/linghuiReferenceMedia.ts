import type {
  LinghuiAudioNodeProperties,
  LinghuiImageNodeProperties,
  LinghuiNodeData,
  LinghuiNodeResult,
  LinghuiVideoNodeProperties,
} from '../../../../types/linghui';
import {
  getLinghuiResultPrimaryMedia,
  isLinghuiAudioMediaItem,
  isLinghuiImageMediaItem,
  isLinghuiVideoMediaItem,
} from '../../../../types/linghui';
import { resolveLinghuiImagePrimaryForNode } from './linghuiImageCollections';

export interface LinghuiReferenceImage {
  source?: string;
  label?: string;
}

export interface LinghuiReferenceVideo {
  source?: string;
  posterSource?: string;
  label?: string;
}

export interface LinghuiReferenceAudio {
  source?: string;
  label?: string;
}

export interface LinghuiReferenceMediaBuckets {
  images: LinghuiReferenceImage[];
  videos: LinghuiReferenceVideo[];
  audios: LinghuiReferenceAudio[];
}

function resolveImageFallbackMode(properties: LinghuiImageNodeProperties): 'import' | 'generate' {
  if (properties.mode === 'import' || properties.mode === 'generate') {
    return properties.mode;
  }
  return String(properties.source ?? '').trim() ? 'import' : 'generate';
}

function pushUnique<T extends { label?: string }>(
  bucket: T[],
  dedupe: Set<string>,
  key: string,
  value: T,
) {
  const normalizedKey = key.trim();
  if (!normalizedKey || dedupe.has(normalizedKey)) return;
  dedupe.add(normalizedKey);
  bucket.push(value);
}

function appendImageReference(
  bucket: LinghuiReferenceImage[],
  dedupe: Set<string>,
  sourceNodeData: LinghuiNodeData,
  result?: LinghuiNodeResult,
) {
  const primary = resolveLinghuiImagePrimaryForNode(sourceNodeData, result);
  const primaryImage = isLinghuiImageMediaItem(primary) ? primary : null;
  const sourceNodeProps = sourceNodeData.properties as unknown as LinghuiImageNodeProperties;
  const fallbackSource = (sourceNodeData.linghuiType === 'linghui/image' || sourceNodeData.linghuiType === 'linghui/panorama')
    && resolveImageFallbackMode(sourceNodeProps) === 'import'
    ? String(sourceNodeProps.source ?? '').trim()
    : '';
  const source = String(primaryImage?.source ?? fallbackSource).trim();

  pushUnique(bucket, dedupe, source, {
    source,
    label: primaryImage?.label || sourceNodeData.label || `参考 ${bucket.length + 1}`,
  });
}

function appendVideoReference(
  bucket: LinghuiReferenceVideo[],
  dedupe: Set<string>,
  sourceNodeData: LinghuiNodeData,
  result?: LinghuiNodeResult,
) {
  const primary = getLinghuiResultPrimaryMedia(result);
  const primaryVideo = isLinghuiVideoMediaItem(primary) ? primary : null;
  const videoProps = sourceNodeData.linghuiType === 'linghui/video'
    ? sourceNodeData.properties as unknown as LinghuiVideoNodeProperties
    : null;
  // 3D 导演台：用户在工作台导出时间轴视频后 properties 有 timelineVideoUrl，
  // 即便节点还没在 workflow 里 run 完，下游也应该能在"参考视频"面板看到它
  const director3dProps = sourceNodeData.linghuiType === 'linghui/director3d'
    ? sourceNodeData.properties as Record<string, unknown> | undefined
    : null;
  const director3dVideoSource = director3dProps?.outputMode === 'video'
    ? String(director3dProps?.timelineVideoUrl ?? '').trim()
    : '';
  const director3dVideoPoster = director3dProps?.outputMode === 'video'
    ? String(director3dProps?.timelineVideoPosterUrl ?? '').trim()
    : '';

  const source = String(primaryVideo?.source ?? videoProps?.source ?? director3dVideoSource ?? '').trim();
  const posterSource = String(primaryVideo?.posterSource ?? videoProps?.posterSource ?? director3dVideoPoster ?? '').trim();
  const key = source || posterSource;
  if (!key) return;

  pushUnique(bucket, dedupe, key, {
    source,
    posterSource,
    label: primaryVideo?.label || sourceNodeData.label || `视频 ${bucket.length + 1}`,
  });
}

function appendAudioReference(
  bucket: LinghuiReferenceAudio[],
  dedupe: Set<string>,
  sourceNodeData: LinghuiNodeData,
  result?: LinghuiNodeResult,
) {
  const primary = getLinghuiResultPrimaryMedia(result);
  const primaryAudio = isLinghuiAudioMediaItem(primary) ? primary : null;
  const props = sourceNodeData.linghuiType === 'linghui/audio'
    ? sourceNodeData.properties as unknown as LinghuiAudioNodeProperties
    : null;
  const source = String(primaryAudio?.source ?? props?.source ?? '').trim();

  pushUnique(bucket, dedupe, source, {
    source,
    label: primaryAudio?.label || sourceNodeData.label || `音频 ${bucket.length + 1}`,
  });
}

export function buildLinghuiReferenceMediaBuckets(params: {
  upstreamNodeIds: string[];
  nodeDataMap: Map<string, LinghuiNodeData>;
  getNodeResult: (nodeId: string) => LinghuiNodeResult | undefined;
}): LinghuiReferenceMediaBuckets {
  const images: LinghuiReferenceImage[] = [];
  const videos: LinghuiReferenceVideo[] = [];
  const audios: LinghuiReferenceAudio[] = [];
  const imageDedupe = new Set<string>();
  const videoDedupe = new Set<string>();
  const audioDedupe = new Set<string>();

  for (const upstreamNodeId of params.upstreamNodeIds) {
    const sourceNodeData = params.nodeDataMap.get(upstreamNodeId);
    if (!sourceNodeData) continue;

    const result = params.getNodeResult(upstreamNodeId);
    appendImageReference(images, imageDedupe, sourceNodeData, result);
    appendVideoReference(videos, videoDedupe, sourceNodeData, result);
    appendAudioReference(audios, audioDedupe, sourceNodeData, result);
  }

  return { images, videos, audios };
}

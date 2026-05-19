import { nanoid } from 'nanoid';
import type {
  LinghuiMediaItem,
  LinghuiNodeResult,
  LinghuiVideoClipNodeProperties,
} from '../../../../types/linghui';
import {
  getLinghuiResultItems,
  getLinghuiResultPrimaryMedia,
} from '../../../../types/linghui';
import { ffmpegManager } from '../../../../services/ffmpegManager';
import { fromKomaLocalUrl } from '../../../../utils/urlUtils';
import {
  buildMediaItem,
  type ExecutionNodeView,
} from './linghuiExecutionShared';
import type { NodeExecutionProgressHandler } from './linghuiNodeExecutorTypes';

type VideoClipInput = LinghuiVideoClipNodeProperties['clips'][number];

const RESOLUTION_SIZE: Record<LinghuiVideoClipNodeProperties['resolution'], { width: number; height: number }> = {
  '720p': { width: 1280, height: 720 },
  '1080p': { width: 1920, height: 1080 },
  '4K': { width: 3840, height: 2160 },
};

function normalizeClipSource(source?: string): string {
  return fromKomaLocalUrl(String(source ?? '').trim());
}

function mediaItemToClip(item: LinghuiMediaItem, index: number): VideoClipInput | null {
  const source = normalizeClipSource(item.source);
  if (!source) return null;
  if (item.kind !== 'video' && item.kind !== 'image' && item.kind !== 'audio') return null;
  return {
    id: `${item.kind}-${index}-${source}`,
    kind: item.kind,
    source,
    durationSec: item.durationSec,
    label: item.label,
  };
}

function collectUpstreamClips(node: ExecutionNodeView): VideoClipInput[] {
  const results = [
    ...node.getAllInputResults(0),
    ...node.getAllInputResults(1),
    ...node.getAllInputResults(2),
  ];
  const clips: VideoClipInput[] = [];
  const seen = new Set<string>();

  for (const result of results) {
    const candidates = [
      getLinghuiResultPrimaryMedia(result),
      ...getLinghuiResultItems(result),
    ].filter(Boolean) as LinghuiMediaItem[];
    for (const item of candidates) {
      const clip = mediaItemToClip(item, clips.length);
      if (!clip) continue;
      const key = `${clip.kind}:${clip.source}`;
      if (seen.has(key)) continue;
      seen.add(key);
      clips.push(clip);
    }
  }

  return clips;
}

function resolveVideoClipInputs(node: ExecutionNodeView): VideoClipInput[] {
  const props = node.properties as unknown as LinghuiVideoClipNodeProperties;
  const explicitClips = Array.isArray(props.clips)
    ? props.clips
        .map((clip, index) => ({
          id: clip.id || `clip-${index + 1}`,
          kind: clip.kind,
          source: normalizeClipSource(clip.source),
          durationSec: clip.durationSec,
          label: clip.label,
        }))
        .filter(clip => (clip.kind === 'video' || clip.kind === 'image' || clip.kind === 'audio') && clip.source)
    : [];

  return explicitClips.length > 0 ? explicitClips : collectUpstreamClips(node);
}

export async function executeVideoClipNode(
  node: ExecutionNodeView,
  onProgress?: NodeExecutionProgressHandler,
): Promise<LinghuiNodeResult> {
  const props = node.properties as unknown as LinghuiVideoClipNodeProperties;
  const existingSource = normalizeClipSource(props.source);
  if (existingSource) {
    return {
      kind: 'video',
      primary: buildMediaItem({
        kind: 'video',
        source: existingSource,
        posterSource: props.posterSource,
        durationSec: props.durationSec,
        label: node.title,
      }),
      metadata: {
        source: existingSource,
        posterSource: props.posterSource,
        durationSec: props.durationSec,
        mode: 'video-clip-resource',
      },
    };
  }

  const clips = resolveVideoClipInputs(node);
  const visualClips = clips.filter(clip => clip.kind === 'video' || clip.kind === 'image');
  const hasVideoClip = clips.some(clip => clip.kind === 'video');
  const canCompose = visualClips.length >= 2 || (hasVideoClip && clips.some(clip => clip.kind === 'audio'));
  if (!canCompose) {
    throw new Error(clips.length === 0
      ? '空空如也，请连接多个视频节点后操作'
      : '请连接2个及以上的视频/音频后操作');
  }

  const resolution = props.resolution ?? '1080p';
  const size = RESOLUTION_SIZE[resolution] ?? RESOLUTION_SIZE['1080p'];
  const fps = props.fps ?? 30;
  const imageDurationSec = Math.max(0.5, Number(props.imageDurationSec ?? 3) || 3);
  const cacheDir = await ffmpegManager.getCacheDir('linghui-video-clip');
  const outputPath = `${cacheDir}/${node.id}-${nanoid(8)}.mp4`;

  onProgress?.(5, '准备视频合成');
  const source = await ffmpegManager.concatMediaClips({
    clips: clips.map(clip => ({
      kind: clip.kind,
      source: clip.source,
      durationSec: clip.kind === 'image' ? (clip.durationSec ?? imageDurationSec) : clip.durationSec,
      label: clip.label,
    })),
    outputPath,
    width: size.width,
    height: size.height,
    fps,
    imageDurationSec,
  });
  onProgress?.(100, '视频合成完成');

  return {
    kind: 'video',
    primary: buildMediaItem({
      kind: 'video',
      source,
      label: node.title,
    }),
    metadata: {
      mode: 'video-clip',
      clipCount: clips.length,
      resolution,
      fps,
      imageDurationSec,
      source,
    },
  };
}

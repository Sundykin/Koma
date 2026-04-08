/**
 * StoryboardExportService - 分镜直出导出服务
 * 直接从 Shot 数据构建导出内容，不需要经过时间线编辑器。
 */
import { v4 as uuidv4 } from 'uuid';
import type { Shot } from '../types';
import { getMediaAssetDisplaySource } from '../types';
import { loadEpisodeShots, loadProject } from '../store/projectStore';
import { createLogger } from '../store/logger';
import { electronService } from './electronService';
import { JianyingExporter } from './draftExport';
import { SimpleExportRenderer } from './simpleExportRenderer';
import { getCanvasSize, type AspectRatio } from '../components/editor/aspectRatio';
import { MediaType, type Track, type Clip } from '../types/editor';

const logger = createLogger('StoryboardExport');

type ResolutionPreset = '720p' | '1080p' | '4K';

export interface StoryboardExportOptions {
  projectId: string;
  episodeId: string;
  range?: StoryboardExportRange;
  onProgress?: (current: number, total: number) => void;
}

export type StoryboardExportRange =
  | 'all'
  | { start: number; end: number }
  | { shotIds: string[] };

export interface VideoExportOptions extends StoryboardExportOptions {
  resolution: ResolutionPreset;
  stillDuration: number;
  includeAudio: boolean;
  includeSubtitles: boolean;
  format: 'mp4' | 'webm';
  outputPath: string;
}

export interface ImageSequenceExportOptions extends StoryboardExportOptions {
  imageFormat: 'png' | 'jpeg';
  superResolution: boolean;
  outputDir: string;
}

export interface JianyingExportOptions extends StoryboardExportOptions {
  outputDir: string;
  stillDuration: number;
  includeAudio: boolean;
  includeSubtitles: boolean;
}

export interface ExportResult {
  success: boolean;
  outputPath: string;
  itemCount: number;
  error?: string;
}

export interface ShotMediaSource {
  type: 'video' | 'image' | 'none';
  path?: string;
  url?: string;
  durationSeconds?: number;
}

export interface StoryboardManifestItem {
  index: number;
  shot: Shot;
  media: ShotMediaSource;
  duration: number;
  subtitle: string;
  hasMissingMedia: boolean;
}

export interface StoryboardManifest {
  shots: StoryboardManifestItem[];
  totalDuration: number;
}

interface BuildTracksOptions {
  includeSubtitles: boolean;
  stillDuration: number;
}

function resolveAspectRatio(projectAspectRatio?: string): AspectRatio {
  return projectAspectRatio === '9:16' ? '9:16' : '16:9';
}

function resolveCanvasSize(aspectRatio: AspectRatio, resolution: ResolutionPreset): { width: number; height: number } {
  const base = getCanvasSize(aspectRatio);
  const longestEdge = resolution === '720p' ? 1280 : resolution === '4K' ? 3840 : 1920;
  const currentLongest = Math.max(base.width, base.height);
  const scale = longestEdge / currentLongest;

  return {
    width: Math.round(base.width * scale),
    height: Math.round(base.height * scale),
  };
}

async function resolveProjectExportContext(projectId: string): Promise<{
  title: string;
  aspectRatio: AspectRatio;
}> {
  const project = await loadProject(projectId).catch(() => null);

  return {
    title: project?.title || 'Storyboard Export',
    aspectRatio: resolveAspectRatio(project?.aspectRatio),
  };
}

async function ensureDirectory(path: string): Promise<void> {
  if (!path) {
    throw new Error('输出路径不能为空');
  }
  await electronService.fs.mkdir(path);
}

async function loadShotsForExport(options: StoryboardExportOptions): Promise<Shot[]> {
  const shots = await loadEpisodeShots(options.projectId, options.episodeId);
  if (!options.range || options.range === 'all') {
    return shots;
  }
  if ('shotIds' in options.range) {
    const idSet = new Set(options.range.shotIds);
    return shots.filter((shot) => idSet.has(shot.id));
  }
  return shots.slice(options.range.start, options.range.end + 1);
}

export function getShotMediaSource(shot: Shot): ShotMediaSource {
  const videos = shot.media?.videos || [];
  const images = shot.media?.images || [];
  const videoIndex = shot.media?.currentVideoIndex ?? (videos.length - 1);
  const imageIndex = shot.media?.currentImageIndex ?? 0;

  if (videos.length > 0) {
    const video = videos[videoIndex] || videos[videos.length - 1];
    return {
      type: 'video',
      path: video.localPath,
      url: video.remoteUrl || getMediaAssetDisplaySource(video),
      durationSeconds: typeof video.durationMs === 'number' && video.durationMs > 0
        ? Math.round(video.durationMs / 100) / 10
        : undefined,
    };
  }

  if (images.length > 0) {
    const image = images[imageIndex] || images[0];
    return {
      type: 'image',
      path: image.localPath,
      url: image.remoteUrl || getMediaAssetDisplaySource(image),
    };
  }

  return { type: 'none' };
}

export async function buildShotManifest(options: StoryboardExportOptions): Promise<StoryboardManifest> {
  const shots = await loadShotsForExport(options);
  const manifest = shots.map((shot, index) => {
    const media = getShotMediaSource(shot);
    const duration = media.type === 'video'
      ? Math.max(1, Math.round(media.durationSeconds || shot.duration || 5))
      : Math.max(1, Math.round(shot.duration || 5));

    return {
      index,
      shot,
      media,
      duration,
      subtitle: shot.dialogue?.trim() || shot.scriptContent || '',
      hasMissingMedia: media.type === 'none',
    } satisfies StoryboardManifestItem;
  });

  const totalDuration = manifest.reduce((sum, item) => sum + item.duration, 0);
  return { shots: manifest, totalDuration };
}

export function buildStoryboardTracks(
  manifest: StoryboardManifest,
  options: BuildTracksOptions,
): { tracks: Track[]; duration: number; exportedShotCount: number } {
  const videoTrackId = `storyboard-video-${uuidv4()}`;
  const textTrackId = `storyboard-text-${uuidv4()}`;
  const videoClips: Clip[] = [];
  const textClips: Clip[] = [];

  let cursor = 0;
  let exportedShotCount = 0;

  manifest.shots.forEach((item) => {
    if (item.media.type === 'none') {
      return;
    }

    const source = item.media.path || item.media.url;
    if (!source) {
      return;
    }

    const clipDuration = item.media.type === 'video'
      ? Math.max(1, item.duration)
      : Math.max(1, options.stillDuration || item.duration);

    const clipId = `storyboard-clip-${uuidv4()}`;
    videoClips.push({
      id: clipId,
      assetId: clipId,
      trackId: videoTrackId,
      start: cursor,
      duration: clipDuration,
      offset: 0,
      sourceDuration: item.media.durationSeconds,
      name: `Shot ${item.index + 1}`,
      type: item.media.type === 'video' ? MediaType.VIDEO : MediaType.IMAGE,
      src: source,
      x: 0,
      y: 0,
      scale: 1,
      rotation: 0,
      opacity: 1,
    });

    if (options.includeSubtitles && item.subtitle.trim()) {
      const textId = `storyboard-text-${uuidv4()}`;
      textClips.push({
        id: textId,
        assetId: textId,
        trackId: textTrackId,
        start: cursor,
        duration: clipDuration,
        offset: 0,
        name: `Subtitle ${item.index + 1}`,
        type: MediaType.TEXT,
        src: item.subtitle,
        text: item.subtitle,
        x: 0,
        y: 0,
        scale: 1,
        rotation: 0,
        opacity: 1,
        fontSize: 52,
        fontFamily: 'Microsoft YaHei, PingFang SC, Arial',
        fontColor: '#FFFFFF',
        backgroundColor: 'rgba(0, 0, 0, 0.42)',
        textPosition: 'bottom',
        textAlign: 'center',
      });
    }

    cursor += clipDuration;
    exportedShotCount += 1;
  });

  const tracks: Track[] = [
    {
      id: videoTrackId,
      type: 'video',
      clips: videoClips,
      isMainTrack: true,
      order: 0,
      name: 'Storyboard Video',
    },
  ];

  if (textClips.length > 0) {
    tracks.push({
      id: textTrackId,
      type: 'text',
      clips: textClips,
      order: 10,
      name: 'Storyboard Subtitle',
    });
  }

  return {
    tracks,
    duration: cursor,
    exportedShotCount,
  };
}

export async function exportStoryboardVideo(options: VideoExportOptions): Promise<ExportResult> {
  const project = await resolveProjectExportContext(options.projectId);
  const manifest = await buildShotManifest(options);
  const { tracks, duration, exportedShotCount } = buildStoryboardTracks(manifest, {
    includeSubtitles: options.includeSubtitles,
    stillDuration: options.stillDuration,
  });

  if (exportedShotCount === 0) {
    return {
      success: false,
      outputPath: options.outputPath,
      itemCount: 0,
      error: '没有可导出的分镜媒体',
    };
  }

  if (options.includeAudio) {
    logger.warn('快速视频导出暂未接入独立音轨，当前将仅导出视频与字幕。');
  }

  const canvasSize = resolveCanvasSize(project.aspectRatio, options.resolution);
  const renderer = new SimpleExportRenderer({
    width: canvasSize.width,
    height: canvasSize.height,
    fps: 30,
    format: options.format,
    quality: options.resolution === '4K' ? 'high' : 'medium',
    outputPath: options.outputPath,
  });

  renderer.onProgress((progress) => {
    options.onProgress?.(progress.currentFrame, progress.totalFrames);
  });

  await renderer.export(tracks, duration);
  return {
    success: true,
    outputPath: options.outputPath,
    itemCount: exportedShotCount,
  };
}

export async function exportStoryboardJianying(options: JianyingExportOptions): Promise<ExportResult> {
  const project = await resolveProjectExportContext(options.projectId);
  const manifest = await buildShotManifest(options);
  const { tracks, exportedShotCount } = buildStoryboardTracks(manifest, {
    includeSubtitles: options.includeSubtitles,
    stillDuration: options.stillDuration,
  });

  if (exportedShotCount === 0) {
    return {
      success: false,
      outputPath: options.outputDir,
      itemCount: 0,
      error: '没有可导出的分镜媒体',
    };
  }

  if (!electronService.isElectron()) {
    return {
      success: false,
      outputPath: options.outputDir,
      itemCount: 0,
      error: '剪映草稿导出需要桌面端环境',
    };
  }

  const exporter = new JianyingExporter();
  const canvasSize = getCanvasSize(project.aspectRatio);
  const outputDir = options.outputDir;
  await ensureDirectory(outputDir);

  const exportResult = await exporter.export(
    tracks,
    {
      outputPath: outputDir,
      projectName: project.title,
      fps: 30,
      copyMaterials: false,
    },
    canvasSize,
  );

  if (!exportResult.success) {
    return {
      success: false,
      outputPath: outputDir,
      itemCount: 0,
      error: exportResult.error || '剪映草稿导出失败',
    };
  }

  const resultWithDrafts = exportResult as typeof exportResult & {
    draftContent?: unknown;
    draftMetaInfo?: unknown;
  };

  await electronService.fs.writeFile(
    `${outputDir}/draft_content.json`,
    JSON.stringify(resultWithDrafts.draftContent || {}, null, 2),
  );
  await electronService.fs.writeFile(
    `${outputDir}/draft_meta_info.json`,
    JSON.stringify(resultWithDrafts.draftMetaInfo || {}, null, 2),
  );

  if (options.includeAudio) {
    logger.warn('剪映草稿导出当前不生成独立音频素材，只保留可用的视频/图片与字幕轨道。');
  }

  return {
    success: true,
    outputPath: outputDir,
    itemCount: exportedShotCount,
  };
}

export async function exportStoryboardImages(options: ImageSequenceExportOptions): Promise<ExportResult> {
  const manifest = await buildShotManifest(options);
  const imageItems = manifest.shots.filter((item) => item.media.type === 'image' && (item.media.path || item.media.url));

  if (imageItems.length === 0) {
    return {
      success: false,
      outputPath: options.outputDir,
      itemCount: 0,
      error: '没有可导出的分镜图片',
    };
  }

  if (!electronService.isElectron()) {
    return {
      success: false,
      outputPath: options.outputDir,
      itemCount: 0,
      error: '图片序列导出需要桌面端环境',
    };
  }

  await ensureDirectory(options.outputDir);

  if (options.superResolution) {
    logger.warn('图片序列导出暂未接入超分辨率，当前导出原始已选图片。');
  }

  for (let index = 0; index < imageItems.length; index += 1) {
    const item = imageItems[index];
    const sourcePath = item.media.path;
    const sourceUrl = item.media.url;
    const targetPath = `${options.outputDir}/${String(index + 1).padStart(3, '0')}.${options.imageFormat}`;

    if (sourcePath) {
      await electronService.fs.copy(sourcePath, targetPath);
    } else if (sourceUrl) {
      await electronService.fs.downloadFile(sourceUrl, targetPath);
    }

    options.onProgress?.(index + 1, imageItems.length);
  }

  return {
    success: true,
    outputPath: options.outputDir,
    itemCount: imageItems.length,
  };
}

export const storyboardExportService = {
  loadShotsForExport,
  getShotMediaSource,
  buildShotManifest,
  buildStoryboardTracks,
  exportStoryboardVideo,
  exportStoryboardJianying,
  exportStoryboardImages,
};

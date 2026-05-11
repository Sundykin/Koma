/**
 * Director3D 时间轴导出视频（C-6B）。
 *
 * 流程：
 *  1. 准备临时目录 `{ffmpegCache}/director3d-render/{nodeId}/`
 *  2. 按 fps 逐帧渲染：调用 renderFrameToDataUrl(time) 拿 PNG dataUrl
 *  3. 把 base64 写到 frame_{NNNNN}.png
 *  4. ffmpegManager.composeVideo 拼成 mp4，输出到 .../timeline.mp4
 *  5. 转 koma-local URL 返回
 *
 * renderFrameToDataUrl 由调用方实现（编辑器内部需要先 setCurrentTime 再 capture），
 * 这里只编排"循环写帧 + 合成视频"流程。
 */
import { electronService } from '../../../services/electronService';
import { ffmpegManager } from '../../../services/ffmpegManager';
import { toFileSystemDisplayUrl } from '../../../services/fileSystemPort';

export interface ExportTimelineVideoParams {
  nodeId: string;
  duration: number;
  fps: number;
  width: number;
  /** 输出高度。未提供时按 16:9 推断 */
  height?: number;
  /**
   * 每帧渲染函数：调用方负责把 viewport 推到 time 并 capture，返回 PNG dataUrl。
   * 返回 null 表示该帧渲染失败（流程会中止）。
   */
  renderFrameToDataUrl: (time: number) => Promise<string | null>;
  /** 进度回调 */
  onProgress?: (current: number, total: number, phase: 'render' | 'encode') => void;
  /** 中止信号 */
  signal?: AbortSignal;
  /** 视频码率 kbps，默认 4000 */
  videoBitrate?: number;
  /** 输出格式，默认 mp4 */
  format?: 'mp4' | 'webm';
}

export interface ExportTimelineVideoResult {
  /** 落盘绝对路径 */
  localPath: string;
  /** 可直接 src 引用的 koma-local URL */
  localUrl: string;
  /** 首帧 PNG 绝对路径，作为下游 video 节点 posterSource / image-to-video 输入 */
  firstFramePath: string;
  /** 首帧 koma-local URL */
  firstFrameUrl: string;
  /** 帧数 / 实际 fps / 宽高 */
  frameCount: number;
  fps: number;
  width: number;
  height: number;
  duration: number;
}

function stripBase64FromDataUrl(dataUrl: string): { base64: string; mimeType: string } | null {
  const match = /^data:([^;,]+);base64,(.+)$/i.exec(dataUrl);
  if (!match) return null;
  return { mimeType: match[1], base64: match[2] };
}

function padFrameIndex(idx: number): string {
  return idx.toString().padStart(5, '0');
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new Error('时间轴导出已取消');
  }
}

export async function exportDirector3DTimelineVideo(params: ExportTimelineVideoParams): Promise<ExportTimelineVideoResult> {
  if (!electronService.isElectron()) {
    throw new Error('时间轴导出仅在桌面端可用');
  }

  const fps = Math.max(6, Math.min(60, Math.round(params.fps)));
  const duration = Math.max(0.5, params.duration);
  const width = Math.max(256, Math.min(2560, Math.round(params.width)));
  const height = params.height ? Math.max(256, Math.min(2560, Math.round(params.height))) : Math.round((width * 9) / 16);
  const totalFrames = Math.max(2, Math.ceil(duration * fps));
  const format = params.format ?? 'mp4';

  const api = (window as { electronAPI?: { ffmpeg?: { getCacheDir: (cat?: string) => Promise<string>; ensureDir: (p: string) => Promise<void> } } }).electronAPI?.ffmpeg;
  if (!api?.getCacheDir || !api?.ensureDir) {
    throw new Error('FFmpeg API 不可用');
  }

  const rootDir = await api.getCacheDir('director3d-timeline');
  const workDir = `${rootDir}/${params.nodeId}-${Date.now().toString(36)}`;
  await api.ensureDir(workDir);

  // 1. 渲染所有帧
  let firstFramePath = '';
  for (let i = 0; i < totalFrames; i += 1) {
    throwIfAborted(params.signal);
    const t = (i / fps);
    const dataUrl = await params.renderFrameToDataUrl(t);
    if (!dataUrl) {
      throw new Error(`第 ${i + 1}/${totalFrames} 帧渲染失败`);
    }
    const split = stripBase64FromDataUrl(dataUrl);
    if (!split) {
      throw new Error(`第 ${i + 1} 帧 dataUrl 格式异常`);
    }
    const framePath = `${workDir}/frame_${padFrameIndex(i)}.png`;
    await electronService.fs.writeFile(framePath, split.base64, true);
    if (i === 0) {
      firstFramePath = framePath;
    }
    params.onProgress?.(i + 1, totalFrames, 'render');
  }

  throwIfAborted(params.signal);

  // 2. ffmpeg 拼视频
  const outputPath = `${workDir}/timeline.${format}`;
  const framePattern = `${workDir}/frame_%05d.png`;
  await ffmpegManager.composeVideo({
    framePattern,
    fps,
    width,
    height,
    format,
    videoBitrate: params.videoBitrate ?? 4000,
    audioBitrate: 128,
    audioTracks: [],
    outputPath,
    onProgress: (percent: number) => {
      params.onProgress?.(Math.round(percent), 100, 'encode');
    },
  });

  return {
    localPath: outputPath,
    localUrl: toFileSystemDisplayUrl(outputPath) ?? outputPath,
    firstFramePath,
    firstFrameUrl: firstFramePath ? (toFileSystemDisplayUrl(firstFramePath) ?? firstFramePath) : '',
    frameCount: totalFrames,
    fps,
    width,
    height,
    duration,
  };
}

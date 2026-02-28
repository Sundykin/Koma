/**
 * 导出渲染服务
 * 负责将时间线渲染为视频文件
 */
import type { TrackLine, TrackItem, VideoTrackItem, AudioTrackItem, ImageTrackItem } from '../types/track';
import { getElectronAPI } from './electronService';

export interface ExportConfig {
  width: number;
  height: number;
  fps: number;
  format: 'mp4' | 'webm' | 'gif';
  quality: 'low' | 'medium' | 'high' | 'custom';
  videoBitrate?: number;    // kbps
  audioBitrate?: number;    // kbps
  audioCodec?: 'aac' | 'mp3';
  videoCodec?: 'h264' | 'h265' | 'vp9';
  outputPath: string;
}

export interface ExportProgress {
  stage: 'preparing' | 'rendering' | 'encoding' | 'finalizing' | 'done' | 'error';
  progress: number;         // 0-100
  currentFrame: number;
  totalFrames: number;
  estimatedTimeRemaining?: number;  // 秒
  message?: string;
}

export type ExportProgressCallback = (progress: ExportProgress) => void;

// 预设质量配置
const QUALITY_PRESETS: Record<string, { videoBitrate: number; audioBitrate: number }> = {
  low: { videoBitrate: 2000, audioBitrate: 128 },
  medium: { videoBitrate: 5000, audioBitrate: 192 },
  high: { videoBitrate: 10000, audioBitrate: 320 },
};

/**
 * 导出渲染器
 * 使用 Canvas 逐帧渲染然后通过 FFmpeg 编码
 */
export class ExportRenderer {
  private config: ExportConfig;
  private tracks: TrackLine[] = [];
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private mediaCache: Map<string, HTMLVideoElement | HTMLImageElement> = new Map();
  private aborted = false;
  private progressCallback: ExportProgressCallback | null = null;

  constructor(config: ExportConfig) {
    this.config = config;

    // 创建离屏 Canvas
    this.canvas = document.createElement('canvas');
    this.canvas.width = config.width;
    this.canvas.height = config.height;
    this.ctx = this.canvas.getContext('2d')!;
  }

  /**
   * 设置进度回调
   */
  onProgress(callback: ExportProgressCallback) {
    this.progressCallback = callback;
  }

  /**
   * 开始导出
   */
  async export(tracks: TrackLine[]): Promise<string> {
    this.tracks = tracks;
    this.aborted = false;

    try {
      // 阶段1: 准备
      this.emitProgress({
        stage: 'preparing',
        progress: 0,
        currentFrame: 0,
        totalFrames: this.getTotalFrames(),
        message: '正在预加载媒体资源...',
      });

      await this.preloadMedia();

      // 阶段2: 渲染帧
      this.emitProgress({
        stage: 'rendering',
        progress: 0,
        currentFrame: 0,
        totalFrames: this.getTotalFrames(),
        message: '正在渲染帧...',
      });

      const frames = await this.renderAllFrames();

      // 阶段3: 编码
      this.emitProgress({
        stage: 'encoding',
        progress: 0,
        currentFrame: 0,
        totalFrames: this.getTotalFrames(),
        message: '正在编码视频...',
      });

      const outputPath = await this.encodeVideo(frames);

      // 完成
      this.emitProgress({
        stage: 'done',
        progress: 100,
        currentFrame: this.getTotalFrames(),
        totalFrames: this.getTotalFrames(),
        message: '导出完成！',
      });

      return outputPath;
    } catch (err) {
      this.emitProgress({
        stage: 'error',
        progress: 0,
        currentFrame: 0,
        totalFrames: this.getTotalFrames(),
        message: (err as Error).message,
      });
      throw err;
    }
  }

  /**
   * 取消导出
   */
  abort() {
    this.aborted = true;
  }

  /**
   * 预加载媒体
   */
  private async preloadMedia() {
    for (const track of this.tracks) {
      for (const item of track.items) {
        if (this.aborted) throw new Error('Export aborted');

        if (item.type === 'video') {
          const source = (item as VideoTrackItem).source;
          if (source && !this.mediaCache.has(source)) {
            const video = await this.loadVideo(source);
            this.mediaCache.set(source, video);
          }
        } else if (item.type === 'image') {
          const source = (item as ImageTrackItem).source;
          if (source && !this.mediaCache.has(source)) {
            const image = await this.loadImage(source);
            this.mediaCache.set(source, image);
          }
        }
      }
    }
  }

  private loadVideo(src: string): Promise<HTMLVideoElement> {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      video.crossOrigin = 'anonymous';
      video.muted = true;
      video.preload = 'auto';

      video.onloadeddata = () => resolve(video);
      video.onerror = () => reject(new Error(`Failed to load video: ${src}`));

      video.src = `koma-local:///${src.replace(/\\/g, '/')}`;
    });
  }

  private loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.crossOrigin = 'anonymous';

      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error(`Failed to load image: ${src}`));

      image.src = `koma-local:///${src.replace(/\\/g, '/')}`;
    });
  }

  /**
   * 渲染所有帧
   */
  private async renderAllFrames(): Promise<Blob[]> {
    const totalFrames = this.getTotalFrames();
    const frames: Blob[] = [];
    const startTime = Date.now();

    for (let frame = 0; frame < totalFrames; frame++) {
      if (this.aborted) throw new Error('Export aborted');

      // 渲染帧
      this.renderFrame(frame);

      // 导出为 Blob
      const blob = await new Promise<Blob>((resolve) => {
        this.canvas.toBlob((b) => resolve(b!), 'image/png');
      });
      frames.push(blob);

      // 更新进度
      const elapsed = (Date.now() - startTime) / 1000;
      const framesPerSecond = (frame + 1) / elapsed;
      const remaining = (totalFrames - frame - 1) / framesPerSecond;

      this.emitProgress({
        stage: 'rendering',
        progress: ((frame + 1) / totalFrames) * 50,
        currentFrame: frame + 1,
        totalFrames,
        estimatedTimeRemaining: remaining,
        message: `正在渲染帧 ${frame + 1}/${totalFrames}`,
      });
    }

    return frames;
  }

  /**
   * 渲染单帧
   */
  private renderFrame(frame: number) {
    const ctx = this.ctx;
    const canvas = this.canvas;

    // 清空画布
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 按 order 从低到高渲染
    const sortedTracks = [...this.tracks].sort((a, b) => a.order - b.order);

    for (const track of sortedTracks) {
      if (!track.visible) continue;

      for (const item of track.items) {
        if (frame < item.start || frame >= item.end) continue;
        this.renderItem(item, frame);
      }
    }
  }

  /**
   * 渲染单个媒体项
   */
  private renderItem(item: TrackItem, frame: number) {
    const ctx = this.ctx;
    const canvas = this.canvas;

    // 计算内部时间
    const internalFrame = frame - item.start + item.offsetL;
    const internalTime = internalFrame * 1000 / this.config.fps;

    // 获取关键帧动画值
    const keyframes = (item as any).keyframes || [];
    const animValues = KeyframeInterpolator.interpolate(keyframes, internalTime, {
      x: (item as any).x ?? 0,
      y: (item as any).y ?? 0,
      scale: (item as any).scale ?? 1,
      rotation: (item as any).rotation ?? 0,
      opacity: (item as any).opacity ?? 1,
    });

    if (item.type === 'video') {
      const source = (item as VideoTrackItem).source;
      const video = this.mediaCache.get(source || '') as HTMLVideoElement;
      if (video) {
        video.currentTime = internalFrame / this.config.fps;

        ctx.save();
        ctx.globalAlpha = animValues.opacity;
        ctx.translate(canvas.width / 2 + animValues.x, canvas.height / 2 + animValues.y);
        ctx.rotate((animValues.rotation * Math.PI) / 180);
        ctx.scale(animValues.scale, animValues.scale);

        ctx.drawImage(video, -canvas.width / 2, -canvas.height / 2, canvas.width, canvas.height);
        ctx.restore();
      }
    } else if (item.type === 'image') {
      const source = (item as ImageTrackItem).source;
      const image = this.mediaCache.get(source || '') as HTMLImageElement;
      if (image) {
        const baseScale = Math.min(canvas.width / image.width, canvas.height / image.height);
        const w = image.width * baseScale;
        const h = image.height * baseScale;

        ctx.save();
        ctx.globalAlpha = animValues.opacity;
        ctx.translate(canvas.width / 2 + animValues.x, canvas.height / 2 + animValues.y);
        ctx.rotate((animValues.rotation * Math.PI) / 180);
        ctx.scale(animValues.scale, animValues.scale);

        ctx.drawImage(image, -w / 2, -h / 2, w, h);
        ctx.restore();
      }
    }
  }

  /**
   * 编码视频（通过 FFmpeg）
   */
  private async encodeVideo(frames: Blob[]): Promise<string> {
    const ffmpegAPI = (getElectronAPI() as any)?.ffmpeg;
    if (!ffmpegAPI) {
      throw new Error('FFmpeg not available');
    }

    // 获取质量配置
    const quality = this.config.quality === 'custom'
      ? { videoBitrate: this.config.videoBitrate || 5000, audioBitrate: this.config.audioBitrate || 192 }
      : QUALITY_PRESETS[this.config.quality];

    // 1. 将帧转为 Base64 并保存到临时目录
    this.emitProgress({
      stage: 'encoding',
      progress: 10,
      currentFrame: 0,
      totalFrames: frames.length,
      message: '正在保存帧数据...',
    });

    const base64Frames: string[] = [];
    for (let i = 0; i < frames.length; i++) {
      if (this.aborted) throw new Error('Export aborted');
      const arrayBuffer = await frames[i].arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      let binary = '';
      for (let j = 0; j < bytes.length; j++) {
        binary += String.fromCharCode(bytes[j]);
      }
      base64Frames.push('data:image/png;base64,' + btoa(binary));

      if (i % 10 === 0) {
        this.emitProgress({
          stage: 'encoding',
          progress: 10 + (i / frames.length) * 30,
          currentFrame: i,
          totalFrames: frames.length,
          message: `正在保存帧 ${i + 1}/${frames.length}...`,
        });
      }
    }

    const framesDir = await ffmpegAPI.saveFrames(base64Frames);

    // 2. 收集音频轨道文件
    const audioFiles: string[] = [];
    for (const track of this.tracks) {
      for (const item of track.items) {
        if (item.type === 'audio') {
          const source = (item as AudioTrackItem).source;
          if (source && !source.startsWith('blob:')) {
            audioFiles.push(source);
          }
        }
      }
    }

    // 3. 调用 FFmpeg 编码
    this.emitProgress({
      stage: 'encoding',
      progress: 50,
      currentFrame: 0,
      totalFrames: frames.length,
      message: '正在编码视频...',
    });

    const outputPath = await ffmpegAPI.encodeVideo({
      framesDir,
      audioFiles: audioFiles.length > 0 ? audioFiles : undefined,
      outputPath: this.config.outputPath,
      fps: this.config.fps,
      width: this.config.width,
      height: this.config.height,
      videoBitrate: quality.videoBitrate,
      audioBitrate: quality.audioBitrate,
      videoCodec: this.config.videoCodec || 'h264',
    });

    return outputPath;
  }

  /**
   * 获取总帧数
   */
  private getTotalFrames(): number {
    let maxEnd = 0;
    for (const track of this.tracks) {
      for (const item of track.items) {
        if (item.end > maxEnd) {
          maxEnd = item.end;
        }
      }
    }
    return maxEnd;
  }

  /**
   * 发送进度
   */
  private emitProgress(progress: ExportProgress) {
    this.progressCallback?.(progress);
  }

  /**
   * 清理资源
   */
  dispose() {
    this.aborted = true;
    this.mediaCache.clear();
  }
}

export default ExportRenderer;

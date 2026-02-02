/**
 * 视频渲染器
 * 使用 Canvas 渲染时间线画面
 * 性能优化：预排序轨道、可见性剪裁
 */
import type { Clip, Track, Timeline } from '../types';
import { getInterpolatedValues } from './keyframe';
import { electronService } from '../services/electronService';

export class VideoRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private mediaCache: Map<string, HTMLImageElement | HTMLVideoElement> =
    new Map();

  // 预排序的轨道缓存
  private _sortedVideoTracks: Track[] = [];
  private _sortedSubtitleTracks: Track[] = [];
  private _lastTimeline: Timeline | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Failed to get 2D context');
    }
    this.ctx = ctx;
    this.ctx.imageSmoothingEnabled = true;
    this.ctx.imageSmoothingQuality = 'high';
  }

  /**
   * 设置画布尺寸
   */
  setSize(width: number, height: number) {
    this.canvas.width = width;
    this.canvas.height = height;
  }

  /**
   * 预加载媒体资源
   */
  async preloadMedia(sourcePath: string): Promise<void> {
    if (!sourcePath) return;
    if (this.mediaCache.has(sourcePath)) {
      return;
    }

    return new Promise((resolve, reject) => {
      // 去掉查询参数后判断文件类型
      const pathWithoutQuery = sourcePath.split('?')[0];
      const isVideo =
        pathWithoutQuery.endsWith('.mp4') ||
        pathWithoutQuery.endsWith('.webm') ||
        pathWithoutQuery.endsWith('.mov');

      // 转换为可用的 URL（本地路径需要使用 koma-local:// 协议）
      const mediaUrl = electronService.fs.toLocalUrl(sourcePath);

      if (isVideo) {
        const video = document.createElement('video');
        video.crossOrigin = 'anonymous';
        video.src = mediaUrl;
        video.preload = 'auto';
        video.onloadeddata = () => {
          this.mediaCache.set(sourcePath, video);
          resolve();
        };
        video.onerror = (e) => {
          console.warn('[VideoRenderer] Failed to load video:', sourcePath, e);
          resolve(); // 不阻塞其他资源加载
        };
      } else {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.src = mediaUrl;
        img.onload = () => {
          this.mediaCache.set(sourcePath, img);
          resolve();
        };
        img.onerror = (e) => {
          console.warn('[VideoRenderer] Failed to load image:', sourcePath, e);
          resolve(); // 不阻塞其他资源加载
        };
      }
    });
  }

  /**
   * 渲染单帧
   * @param timeline 时间线数据
   * @param currentTime 当前时间（毫秒）
   */
  render(timeline: Timeline, currentTime: number) {
    const { width, height } = timeline.resolution;
    this.ctx.fillStyle = '#000';
    this.ctx.fillRect(0, 0, width, height);

    // 检查是否需要重新排序轨道
    if (timeline !== this._lastTimeline) {
      this._lastTimeline = timeline;
      // 底层轨道先渲染（order 小的在底层）
      this._sortedVideoTracks = timeline.tracks
        .filter((t) => t.type === 'video' && t.visible)
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      this._sortedSubtitleTracks = timeline.tracks.filter(
        (t) => t.type === 'subtitle' && t.visible
      );
    }

    // 渲染视频轨道（使用缓存的排序结果）
    for (const track of this._sortedVideoTracks) {
      if (!track.visible) continue;
      for (const clip of track.clips) {
        if (
          currentTime >= clip.startTime &&
          currentTime < clip.startTime + clip.duration
        ) {
          this.renderClip(clip, currentTime, width, height);
        }
      }
    }

    // 渲染字幕轨道
    for (const track of this._sortedSubtitleTracks) {
      if (!track.visible) continue;
      for (const clip of track.clips) {
        if (
          currentTime >= clip.startTime &&
          currentTime < clip.startTime + clip.duration
        ) {
          this.renderSubtitle(clip, currentTime, width, height);
        }
      }
    }
  }

  /**
   * 渲染单个 Clip
   */
  private renderClip(
    clip: Clip,
    currentTime: number,
    canvasWidth: number,
    canvasHeight: number
  ) {
    const media = this.mediaCache.get(clip.sourcePath);
    if (!media) {
      return;
    }

    // 计算相对于 clip 起点的时间
    const clipTime = currentTime - clip.startTime;

    // 获取关键帧插值后的变换属性
    const values = getInterpolatedValues(clip.keyframes, clipTime, {
      'position.x': clip.position.x,
      'position.y': clip.position.y,
      scale: clip.scale,
      rotation: clip.rotation,
      opacity: clip.opacity,
    });

    const x = values['position.x'];
    const y = values['position.y'];
    const scale = values['scale'];
    const rotation = values['rotation'];
    const opacity = values['opacity'];

    this.ctx.save();
    this.ctx.globalAlpha = opacity;

    // 应用变换
    const centerX = canvasWidth / 2 + x;
    const centerY = canvasHeight / 2 + y;
    this.ctx.translate(centerX, centerY);
    this.ctx.rotate((rotation * Math.PI) / 180);
    this.ctx.scale(scale, scale);

    // 绘制媒体
    if (media instanceof HTMLVideoElement) {
      // 设置视频当前时间
      const sourceTime = (clip.sourceStart || 0) + clipTime;
      if (Math.abs(media.currentTime * 1000 - sourceTime) > 100) {
        media.currentTime = sourceTime / 1000;
      }

      const w = media.videoWidth;
      const h = media.videoHeight;
      this.ctx.drawImage(media, -w / 2, -h / 2, w, h);
    } else {
      const w = media.width;
      const h = media.height;
      this.ctx.drawImage(media, -w / 2, -h / 2, w, h);
    }

    this.ctx.restore();
  }

  /**
   * 渲染字幕
   */
  private renderSubtitle(
    clip: Clip,
    currentTime: number,
    canvasWidth: number,
    canvasHeight: number
  ) {
    if (!clip.text) return;

    const clipTime = currentTime - clip.startTime;
    const values = getInterpolatedValues(clip.keyframes, clipTime, {
      'position.x': clip.position.x,
      'position.y': clip.position.y,
      opacity: clip.opacity,
    });

    this.ctx.save();
    this.ctx.globalAlpha = values['opacity'];

    // 设置字体
    const fontSize = clip.fontSize || 32;
    const fontFamily = clip.fontFamily || 'sans-serif';
    this.ctx.font = `${fontSize}px ${fontFamily}`;
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';

    const x = canvasWidth / 2 + values['position.x'];
    const y = canvasHeight - 100 + values['position.y']; // 默认在底部

    // 绘制背景
    if (clip.backgroundColor) {
      const metrics = this.ctx.measureText(clip.text);
      const padding = 10;
      this.ctx.fillStyle = clip.backgroundColor;
      this.ctx.fillRect(
        x - metrics.width / 2 - padding,
        y - fontSize / 2 - padding / 2,
        metrics.width + padding * 2,
        fontSize + padding
      );
    }

    // 绘制文字
    this.ctx.fillStyle = clip.fontColor || '#fff';
    this.ctx.fillText(clip.text, x, y);

    this.ctx.restore();
  }

  /**
   * 清理资源
   */
  dispose() {
    this.mediaCache.forEach((media) => {
      if (media instanceof HTMLVideoElement) {
        media.pause();
        media.src = '';
        media.load();
      }
    });
    this.mediaCache.clear();
    this._sortedVideoTracks = [];
    this._sortedSubtitleTracks = [];
    this._lastTimeline = null;
  }

  /**
   * 使轨道缓存失效（外部调用，当轨道变化时）
   */
  invalidateTrackCache() {
    this._lastTimeline = null;
  }
}

export default VideoRenderer;

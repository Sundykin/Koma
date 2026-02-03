/**
 * 媒体引擎
 * 统一管理视频渲染和音频播放
 * 性能优化：箭头函数 RAF、状态更新节流
 */
import type { Timeline } from '../types';
import { VideoRenderer } from './VideoRenderer';
import { AudioController } from './AudioController';

export interface PlaybackState {
  isPlaying: boolean;
  currentTime: number;    // 毫秒
  duration: number;       // 毫秒
  fps: number;
}

export type PlaybackCallback = (state: PlaybackState) => void;

export class MediaEngine {
  private canvas: HTMLCanvasElement | null = null;
  private videoRenderer: VideoRenderer | null = null;
  private audioController: AudioController;
  private timeline: Timeline | null = null;

  private isPlaying = false;
  private currentTime = 0;
  private animationFrameId: number | null = null;
  private lastFrameTime = 0;

  // 状态更新节流
  private _lastEmitTime = 0;
  private static readonly EMIT_INTERVAL = 16;  // ~60fps

  private onPlaybackUpdate: PlaybackCallback | null = null;

  constructor() {
    this.audioController = new AudioController();
  }

  /**
   * 绑定渲染画布
   */
  bindCanvas(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.videoRenderer = new VideoRenderer(canvas);
  }

  /**
   * 加载时间线（智能检测，避免重复加载媒体）
   */
  async loadTimeline(timeline: Timeline): Promise<void> {
    const isNewTimeline = !this.timeline || this.timeline.id !== timeline.id;
    const prevTimeline = this.timeline;
    this.timeline = timeline;

    // 设置画布尺寸（只在分辨率变化时设置）
    if (this.videoRenderer && isNewTimeline) {
      this.videoRenderer.setSize(
        timeline.resolution.width,
        timeline.resolution.height
      );
    }

    // 收集新的媒体路径
    const newMediaPaths = new Set<string>();
    const prevMediaPaths = new Set<string>();

    for (const track of timeline.tracks) {
      if (track.type === 'video') {
        for (const clip of track.clips) {
          if (clip.sourcePath) {
            newMediaPaths.add(clip.sourcePath);
          }
        }
      }
    }

    if (prevTimeline) {
      for (const track of prevTimeline.tracks) {
        if (track.type === 'video') {
          for (const clip of track.clips) {
            if (clip.sourcePath) {
              prevMediaPaths.add(clip.sourcePath);
            }
          }
        }
      }
    }

    // 只加载新增的媒体
    if (this.videoRenderer) {
      for (const path of newMediaPaths) {
        if (!prevMediaPaths.has(path)) {
          await this.videoRenderer.preloadMedia(path);
        }
      }
    }

    // 音频也做同样的优化：只在有新音频时重新加载
    const audioChanged = this.checkAudioChanged(prevTimeline, timeline);
    if (audioChanged) {
      await this.audioController.loadTimeline(timeline);
    }

    // 使 VideoRenderer 的轨道缓存失效（因为轨道顺序可能变化）
    if (this.videoRenderer) {
      this.videoRenderer.invalidateTrackCache();
    }

    // 渲染当前帧
    this.render();
  }

  /**
   * 检测音频是否变化
   */
  private checkAudioChanged(prev: Timeline | null, next: Timeline): boolean {
    if (!prev) return true;

    const prevAudioPaths = new Set<string>();
    const nextAudioPaths = new Set<string>();

    for (const track of prev.tracks) {
      if (track.type === 'audio') {
        for (const clip of track.clips) {
          prevAudioPaths.add(clip.sourcePath);
        }
      }
    }

    for (const track of next.tracks) {
      if (track.type === 'audio') {
        for (const clip of track.clips) {
          nextAudioPaths.add(clip.sourcePath);
        }
      }
    }

    if (prevAudioPaths.size !== nextAudioPaths.size) return true;
    for (const path of nextAudioPaths) {
      if (!prevAudioPaths.has(path)) return true;
    }
    return false;
  }

  /**
   * 播放
   */
  play() {
    if (!this.timeline || this.isPlaying) return;

    this.isPlaying = true;
    this.audioController.play();
    this.lastFrameTime = performance.now();
    this._lastEmitTime = 0;
    this.animationFrameId = requestAnimationFrame(this._tick);
    this.emitState();
  }

  /**
   * 暂停
   */
  pause() {
    this.isPlaying = false;
    this.audioController.pause();
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    this.emitState();
  }

  /**
   * 播放/暂停切换
   */
  togglePlay() {
    if (this.isPlaying) {
      this.pause();
    } else {
      this.play();
    }
  }

  /**
   * 跳转到指定时间
   */
  seek(time: number) {
    this.currentTime = Math.max(0, Math.min(time, this.getDuration()));
    this.audioController.seek(this.currentTime);
    this.render();
    this.emitState();
  }

  /**
   * 获取当前播放时间
   */
  getCurrentTime(): number {
    return this.currentTime;
  }

  /**
   * 获取总时长
   */
  getDuration(): number {
    return this.timeline?.duration || 0;
  }

  /**
   * 是否正在播放
   */
  getIsPlaying(): boolean {
    return this.isPlaying;
  }

  /**
   * 设置播放状态回调
   */
  onUpdate(callback: PlaybackCallback) {
    this.onPlaybackUpdate = callback;
  }

  /**
   * 渲染当前帧
   */
  private render() {
    if (!this.timeline || !this.videoRenderer) return;
    this.videoRenderer.render(this.timeline, this.currentTime);
  }

  /**
   * RAF 播放循环（箭头函数保持 this 上下文）
   */
  private _tick = (timestamp: number): void => {
    if (!this.isPlaying) return;

    // 计算时间增量
    const delta = timestamp - this.lastFrameTime;
    this.lastFrameTime = timestamp;

    // 更新当前时间
    this.currentTime += delta;

    // 检查是否播放结束
    if (this.currentTime >= this.getDuration()) {
      this.currentTime = this.getDuration();
      this.pause();
      return;
    }

    // 同步音频
    this.audioController.update(this.currentTime);

    // 渲染视频
    this.render();

    // 节流状态更新
    if (timestamp - this._lastEmitTime >= MediaEngine.EMIT_INTERVAL) {
      this._lastEmitTime = timestamp;
      this.emitState();
    }

    // 继续下一帧
    this.animationFrameId = requestAnimationFrame(this._tick);
  };

  /**
   * 发送播放状态
   */
  private emitState() {
    if (this.onPlaybackUpdate) {
      this.onPlaybackUpdate({
        isPlaying: this.isPlaying,
        currentTime: this.currentTime,
        duration: this.getDuration(),
        fps: this.timeline?.fps || 30,
      });
    }
  }

  /**
   * 设置主音量
   */
  setVolume(volume: number) {
    this.audioController.setMasterVolume(volume);
  }

  /**
   * 清理资源
   */
  dispose() {
    this.pause();
    this.videoRenderer?.dispose();
    this.audioController.dispose();
    this.timeline = null;
    this.canvas = null;
    this.onPlaybackUpdate = null;
  }
}

export default MediaEngine;

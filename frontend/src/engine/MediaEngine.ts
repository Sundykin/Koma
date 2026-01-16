/**
 * 媒体引擎
 * 统一管理视频渲染和音频播放
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
   * 加载时间线
   */
  async loadTimeline(timeline: Timeline): Promise<void> {
    this.timeline = timeline;

    // 设置画布尺寸
    if (this.videoRenderer) {
      this.videoRenderer.setSize(
        timeline.resolution.width,
        timeline.resolution.height
      );
    }

    // 加载音频
    await this.audioController.loadTimeline(timeline);

    // 预加载所有媒体资源
    if (this.videoRenderer) {
      const videoTracks = timeline.tracks.filter((t) => t.type === 'video');
      for (const track of videoTracks) {
        for (const clip of track.clips) {
          await this.videoRenderer.preloadMedia(clip.sourcePath);
        }
      }
    }

    // 渲染第一帧
    this.render();
  }

  /**
   * 播放
   */
  play() {
    if (!this.timeline) return;

    this.isPlaying = true;
    this.audioController.play();
    this.lastFrameTime = performance.now();
    this.scheduleNextFrame();
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
   * 调度下一帧渲染
   */
  private scheduleNextFrame() {
    this.animationFrameId = requestAnimationFrame((timestamp) => {
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

      // 发送状态更新
      this.emitState();

      // 调度下一帧
      this.scheduleNextFrame();
    });
  }

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
  }
}

export default MediaEngine;

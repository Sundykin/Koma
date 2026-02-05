/**
 * 播放引擎
 * 基于 trackStore 的播放控制和渲染引擎
 */
import type { TrackLine, TrackItem, VideoTrackItem, AudioTrackItem, ImageTrackItem, TrackKeyframe } from '../types/track';
import { message } from 'antd';
import { handleError, ignoreError } from '../utils/errorHandler';
import { DEFAULT_PLAYBACK_CONFIG } from '../constants/dimensions';
import { createLogger } from '../store/logger';

const logger = createLogger('PlaybackEngine');

const PLAYBACK_AUDIO_ERROR_KEY = 'playback-engine-audio-error';

const _notifyPlaybackAudioError = (error: unknown) => {
  handleError(error, { module: 'PlaybackEngine', action: 'audioPlay', severity: 'warning' });
  message.error({
    content: '音频播放失败，请检查浏览器自动播放权限或重新播放。',
    key: PLAYBACK_AUDIO_ERROR_KEY,
  });
};
import { KeyframeInterpolator } from './KeyframeInterpolator';

export interface PlaybackConfig {
  fps: number;
  width: number;
  height: number;
}

export interface PlaybackState {
  isPlaying: boolean;
  currentFrame: number;
  currentTime: number;    // 毫秒
  duration: number;       // 帧
  durationMs: number;     // 毫秒
  fps: number;
}

export type PlaybackCallback = (state: PlaybackState) => void;

// 媒体元素缓存
interface MediaCache {
  video: Map<string, HTMLVideoElement>;
  audio: Map<string, HTMLAudioElement>;
  image: Map<string, HTMLImageElement>;
}

export class PlaybackEngine {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private config: PlaybackConfig = { ...DEFAULT_PLAYBACK_CONFIG };

  private tracks: TrackLine[] = [];
  private _sortedTracks: TrackLine[] = [];  // 预排序的轨道缓存
  private mediaCache: MediaCache = {
    video: new Map(),
    audio: new Map(),
    image: new Map(),
  };

  private isPlaying = false;
  private currentFrame = 0;
  private animationFrameId: number | null = null;
  private lastFrameTime = 0;
  private frameInterval = 1000 / 30;

  // 时长缓存
  private _cachedDuration: number | null = null;
  private _durationDirty = true;

  // 时间同步容差（秒）
  private static readonly SYNC_TOLERANCE = 0.1;

  // 状态更新节流
  private _lastEmitTime = 0;
  private static readonly EMIT_INTERVAL = 16;  // ~60fps

  private callbacks: Set<PlaybackCallback> = new Set();
  private audioContext: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private activeAudioSources: Map<string, { source: AudioBufferSourceNode; startFrame: number }> = new Map();

  constructor() {
    this.initAudio();
  }

  private initAudio() {
    try {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      this.masterGain = this.audioContext.createGain();
      this.masterGain.connect(this.audioContext.destination);
    } catch (err) {
      logger.warn('Failed to create AudioContext', err);
    }
  }

  /**
   * 绑定渲染画布
   */
  bindCanvas(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    if (this.ctx) {
      this.ctx.imageSmoothingEnabled = true;
      this.ctx.imageSmoothingQuality = 'high';
    }
  }

  /**
   * 设置配置
   */
  setConfig(config: Partial<PlaybackConfig>) {
    this.config = { ...this.config, ...config };
    this.frameInterval = 1000 / this.config.fps;

    if (this.canvas) {
      this.canvas.width = this.config.width;
      this.canvas.height = this.config.height;
    }
  }

  /**
   * 加载轨道数据
   */
  async loadTracks(tracks: TrackLine[]): Promise<void> {
    this.tracks = tracks;
    this._durationDirty = true;
    // 预排序轨道（按 order 从低到高）
    this._sortedTracks = [...tracks].sort((a, b) => a.order - b.order);

    // 预加载所有媒体
    for (const track of tracks) {
      for (const item of track.items) {
        await this.preloadItem(item);
      }
    }

    // 渲染当前帧
    this.render();
  }

  /**
   * 预加载媒体项
   */
  private async preloadItem(item: TrackItem): Promise<void> {
    if (item.type === 'video') {
      const videoItem = item as VideoTrackItem;
      if (videoItem.source && !this.mediaCache.video.has(videoItem.source)) {
        const video = await this.loadVideo(videoItem.source);
        this.mediaCache.video.set(videoItem.source, video);
      }
    } else if (item.type === 'audio') {
      const audioItem = item as AudioTrackItem;
      if (audioItem.source && !this.mediaCache.audio.has(audioItem.source)) {
        const audio = await this.loadAudio(audioItem.source);
        this.mediaCache.audio.set(audioItem.source, audio);
      }
    } else if (item.type === 'image') {
      const imageItem = item as ImageTrackItem;
      if (imageItem.source && !this.mediaCache.image.has(imageItem.source)) {
        const image = await this.loadImage(imageItem.source);
        this.mediaCache.image.set(imageItem.source, image);
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

  private loadAudio(src: string): Promise<HTMLAudioElement> {
    return new Promise((resolve, reject) => {
      const audio = document.createElement('audio');
      audio.crossOrigin = 'anonymous';
      audio.preload = 'auto';

      audio.onloadeddata = () => resolve(audio);
      audio.onerror = () => reject(new Error(`Failed to load audio: ${src}`));

      audio.src = `koma-local:///${src.replace(/\\/g, '/')}`;
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
   * 播放
   */
  play() {
    if (this.isPlaying) return;

    // 恢复 AudioContext
    if (this.audioContext?.state === 'suspended') {
      this.audioContext.resume();
    }

    this.isPlaying = true;
    this.lastFrameTime = performance.now();
    this._lastEmitTime = 0;  // 重置节流计时
    // 启动 RAF 循环
    this.animationFrameId = requestAnimationFrame(this._tick);
    this.emitState();
  }

  /**
   * 暂停
   */
  pause() {
    this.isPlaying = false;
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    // 暂停所有音频
    this.pauseAllAudio();
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
   * 跳转到指定帧（带容差检测）
   */
  seekFrame(frame: number) {
    const duration = this.getDuration();
    const targetFrame = Math.max(0, Math.min(frame, duration));

    // 容差检测：小于 SYNC_TOLERANCE 秒的差异不触发 seek
    const currentTimeS = this.currentFrame / this.config.fps;
    const targetTimeS = targetFrame / this.config.fps;
    if (Math.abs(currentTimeS - targetTimeS) < PlaybackEngine.SYNC_TOLERANCE) {
      return;
    }

    this.currentFrame = targetFrame;
    this.syncAudio();
    this.render();
    this.emitState();
  }

  /**
   * 跳转到指定时间（毫秒）
   */
  seekTime(ms: number) {
    const frame = Math.round(ms * this.config.fps / 1000);
    this.seekFrame(frame);
  }

  /**
   * 获取当前帧
   */
  getCurrentFrame(): number {
    return this.currentFrame;
  }

  /**
   * 获取当前时间（毫秒）
   */
  getCurrentTime(): number {
    return this.currentFrame * 1000 / this.config.fps;
  }

  /**
   * 获取总时长（帧）- 使用缓存
   */
  getDuration(): number {
    if (!this._durationDirty && this._cachedDuration !== null) {
      return this._cachedDuration;
    }

    let maxEnd = 0;
    for (const track of this.tracks) {
      for (const item of track.items) {
        if (item.end > maxEnd) {
          maxEnd = item.end;
        }
      }
    }

    this._cachedDuration = maxEnd;
    this._durationDirty = false;
    return maxEnd;
  }

  /**
   * 使时长缓存失效（外部调用）
   */
  invalidateDuration() {
    this._durationDirty = true;
  }

  /**
   * 是否正在播放
   */
  getIsPlaying(): boolean {
    return this.isPlaying;
  }

  /**
   * 注册状态回调
   */
  onUpdate(callback: PlaybackCallback) {
    this.callbacks.add(callback);
    return () => this.callbacks.delete(callback);
  }

  /**
   * 设置主音量
   */
  setVolume(volume: number) {
    if (this.masterGain) {
      this.masterGain.gain.setValueAtTime(volume, this.audioContext?.currentTime || 0);
    }
  }

  /**
   * 获取当前时间可见的片段
   */
  private getVisibleItems(frame: number): { item: TrackItem; track: TrackLine }[] {
    const visible: { item: TrackItem; track: TrackLine }[] = [];
    for (const track of this._sortedTracks) {
      if (!track.visible) continue;
      for (const item of track.items) {
        if (frame >= item.start && frame < item.end) {
          visible.push({ item, track });
        }
      }
    }
    return visible;
  }

  /**
   * 渲染当前帧
   */
  render() {
    if (!this.ctx || !this.canvas) return;

    // 清空画布
    this.ctx.fillStyle = '#000';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // 只渲染可见片段（已按 order 排序）
    const visibleItems = this.getVisibleItems(this.currentFrame);
    for (const { item } of visibleItems) {
      this.renderItem(item);
    }
  }

  /**
   * 渲染单个媒体项
   */
  private renderItem(item: TrackItem) {
    const ctx = this.ctx!;
    const canvas = this.canvas!;

    // 计算媒体内部时间（考虑 offset）
    const internalFrame = this.currentFrame - item.start + item.offsetL;
    const internalTime = internalFrame * 1000 / this.config.fps;

    // 获取关键帧动画值
    const keyframes = (item as any).keyframes as TrackKeyframe[] | undefined;
    const animValues = KeyframeInterpolator.interpolate(keyframes || [], internalTime, {
      x: (item as any).x ?? 0,
      y: (item as any).y ?? 0,
      scale: (item as any).scale ?? 1,
      rotation: (item as any).rotation ?? 0,
      opacity: (item as any).opacity ?? 1,
      volume: (item as any).volume ?? 1,
    });

    if (item.type === 'video') {
      const videoItem = item as VideoTrackItem;
      const video = this.mediaCache.video.get(videoItem.source || '');
      if (video) {
        // 同步视频时间
        const videoTime = internalFrame / this.config.fps;
        if (Math.abs(video.currentTime - videoTime) > 0.1) {
          video.currentTime = videoTime;
        }

        // 应用变换绘制
        ctx.save();
        ctx.globalAlpha = animValues.opacity;
        ctx.translate(canvas.width / 2 + animValues.x, canvas.height / 2 + animValues.y);
        ctx.rotate((animValues.rotation * Math.PI) / 180);
        ctx.scale(animValues.scale, animValues.scale);

        const w = canvas.width;
        const h = canvas.height;
        ctx.drawImage(video, -w / 2, -h / 2, w, h);
        ctx.restore();
      }
    } else if (item.type === 'image') {
      const imageItem = item as ImageTrackItem;
      const image = this.mediaCache.image.get(imageItem.source || '');
      if (image) {
        // 计算缩放以适应画布
        const baseScale = Math.min(
          canvas.width / image.width,
          canvas.height / image.height
        );
        const w = image.width * baseScale;
        const h = image.height * baseScale;

        // 应用变换绘制
        ctx.save();
        ctx.globalAlpha = animValues.opacity;
        ctx.translate(canvas.width / 2 + animValues.x, canvas.height / 2 + animValues.y);
        ctx.rotate((animValues.rotation * Math.PI) / 180);
        ctx.scale(animValues.scale, animValues.scale);

        ctx.drawImage(image, -w / 2, -h / 2, w, h);
        ctx.restore();
      }
    }
    // 文本和字幕渲染可以后续添加
  }

  /**
   * 同步音频
   */
  private syncAudio() {
    // 简化处理：暂停所有音频然后重新定位
    this.pauseAllAudio();

    if (!this.isPlaying) return;

    // 找到当前帧的音频项并播放
    for (const track of this.tracks) {
      if (track.muted || !track.visible) continue;

      for (const item of track.items) {
        if (item.type !== 'audio') continue;
        if (this.currentFrame < item.start || this.currentFrame >= item.end) continue;

        const audioItem = item as AudioTrackItem;
        const audio = this.mediaCache.audio.get(audioItem.source || '');
        if (audio) {
          const internalTime = (this.currentFrame - item.start + item.offsetL) / this.config.fps;
          audio.currentTime = internalTime;
          audio.volume = audioItem.volume ?? 1;
          audio.play().catch(ignoreError('PlaybackEngine:audioPlay'));
        }
      }
    }
  }

  /**
   * 暂停所有音频
   */
  private pauseAllAudio() {
    for (const audio of this.mediaCache.audio.values()) {
      audio.pause();
    }
  }

  /**
   * RAF 播放循环（箭头函数保持 this 上下文）
   */
  private _tick = (timestamp: number): void => {
    if (!this.isPlaying) return;

    // 计算经过的时间
    const elapsed = timestamp - this.lastFrameTime;
    const framesToAdvance = Math.floor(elapsed / this.frameInterval);

    if (framesToAdvance > 0) {
      this.lastFrameTime = timestamp - (elapsed % this.frameInterval);
      this.currentFrame += framesToAdvance;

      // 检查是否播放结束
      const duration = this.getDuration();
      if (this.currentFrame >= duration) {
        this.currentFrame = duration;
        this.pause();
        return;
      }

      // 渲染
      this.render();

      // 节流状态更新
      if (timestamp - this._lastEmitTime >= PlaybackEngine.EMIT_INTERVAL) {
        this._lastEmitTime = timestamp;
        this.emitState();
      }
    }

    // 继续下一帧（非递归，单次请求）
    this.animationFrameId = requestAnimationFrame(this._tick);
  };

  /**
   * 发送状态
   */
  private emitState() {
    const state: PlaybackState = {
      isPlaying: this.isPlaying,
      currentFrame: this.currentFrame,
      currentTime: this.currentFrame * 1000 / this.config.fps,
      duration: this.getDuration(),
      durationMs: this.getDuration() * 1000 / this.config.fps,
      fps: this.config.fps,
    };

    for (const callback of this.callbacks) {
      callback(state);
    }
  }

  /**
   * 清理
   */
  dispose() {
    this.pause();

    // 清理媒体缓存
    for (const video of this.mediaCache.video.values()) {
      video.src = '';
      video.load();
    }
    this.mediaCache.video.clear();

    for (const audio of this.mediaCache.audio.values()) {
      audio.src = '';
      audio.load();
    }
    this.mediaCache.audio.clear();

    this.mediaCache.image.clear();

    // 关闭音频上下文
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }

    this.canvas = null;
    this.ctx = null;
    this.callbacks.clear();
  }
}

export default PlaybackEngine;

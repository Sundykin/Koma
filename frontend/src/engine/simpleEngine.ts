/**
 * Simple 编辑器独立引擎
 * 迁移自 electron-egg，与原有系统隔离
 */

import { Track, Clip, MediaType } from '../types/editor';
import { getAnimatedProperties } from './simpleKeyframe';
import { ignoreError } from '../utils/errorHandler';

// ========== MediaEngine ==========
export type EngineEventType = 'play' | 'pause' | 'seek' | 'timeUpdate' | 'ended' | 'rateChange';

export interface EngineEvent {
  type: EngineEventType;
  time: number;
  rate?: number;
}

type EventCallback = (event: EngineEvent) => void;

export class SimpleMediaEngine {
  private _time: number = 0;
  private _duration: number = 60;
  private _playRate: number = 1;
  private _isPlaying: boolean = false;
  private _animationFrameId: number | null = null;
  private _lastFrameTime: number = 0;
  private _listeners: Map<EngineEventType, Set<EventCallback>> = new Map();

  constructor(duration: number = 60) {
    this._duration = duration;
  }

  get time(): number { return this._time; }
  get duration(): number { return this._duration; }
  get playRate(): number { return this._playRate; }
  get isPlaying(): boolean { return this._isPlaying; }

  set duration(value: number) {
    this._duration = Math.max(0, value);
  }

  on(type: EngineEventType, callback: EventCallback): void {
    if (!this._listeners.has(type)) {
      this._listeners.set(type, new Set());
    }
    this._listeners.get(type)!.add(callback);
  }

  off(type: EngineEventType, callback: EventCallback): void {
    this._listeners.get(type)?.delete(callback);
  }

  private emit(type: EngineEventType, extra?: Partial<EngineEvent>): void {
    const event: EngineEvent = { type, time: this._time, ...extra };
    this._listeners.get(type)?.forEach(cb => cb(event));
  }

  play(): boolean {
    if (this._isPlaying) return false;
    if (this._time >= this._duration) {
      this._time = 0;
    }

    this._isPlaying = true;
    this._lastFrameTime = performance.now();
    this._tick();
    this.emit('play');
    return true;
  }

  pause(): void {
    if (!this._isPlaying) return;
    this._isPlaying = false;
    if (this._animationFrameId !== null) {
      cancelAnimationFrame(this._animationFrameId);
      this._animationFrameId = null;
    }
    this.emit('pause');
  }

  seek(time: number): void {
    const clampedTime = Math.max(0, Math.min(time, this._duration));
    this._time = clampedTime;
    this.emit('seek');
    this.emit('timeUpdate');
  }

  setPlayRate(rate: number): void {
    this._playRate = Math.max(0.1, Math.min(rate, 4));
    this.emit('rateChange', { rate: this._playRate });
  }

  private _tick = (): void => {
    if (!this._isPlaying) return;

    const now = performance.now();
    const delta = (now - this._lastFrameTime) / 1000;
    this._lastFrameTime = now;
    this._time += delta * this._playRate;

    if (this._time >= this._duration) {
      this._time = this._duration;
      this.pause();
      this.emit('ended');
      return;
    }

    this.emit('timeUpdate');
    this._animationFrameId = requestAnimationFrame(this._tick);
  };

  destroy(): void {
    this.pause();
    this._listeners.clear();
  }
}

// ========== VideoRenderer ==========
interface MediaCache {
  type: 'image' | 'video';
  element: HTMLImageElement | HTMLVideoElement;
  isReady: boolean;
}

export class SimpleVideoRenderer {
  private engine: SimpleMediaEngine;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private mediaCache: Map<string, MediaCache> = new Map();
  private tracks: Track[] = [];
  private rafId: number | null = null;
  private isRendering: boolean = false;
  private width: number = 1920;
  private height: number = 1080;
  private audioController: SimpleAudioController | null = null;

  constructor(engine: SimpleMediaEngine, canvas: HTMLCanvasElement) {
    this.engine = engine;
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.setupCanvas();
    this.setupEngineListeners();
  }

  // 设置音频控制器引用，用于共享视频元素
  setAudioController(controller: SimpleAudioController): void {
    this.audioController = controller;
  }

  private setupCanvas(): void {
    this.canvas.width = this.width;
    this.canvas.height = this.height;
    this.ctx.fillStyle = '#000';
    this.ctx.fillRect(0, 0, this.width, this.height);
  }

  private setupEngineListeners(): void {
    this.engine.on('play', () => this.startRenderLoop());
    this.engine.on('pause', () => this.stopRenderLoop());
    this.engine.on('seek', () => this.renderFrame());
    this.engine.on('timeUpdate', () => {
      if (!this.isRendering) this.renderFrame();
    });
  }

  setTracks(tracks: Track[]): void {
    this.tracks = tracks;
    tracks.forEach(track => {
      track.clips.forEach(clip => {
        if (clip.type === MediaType.VIDEO || clip.type === MediaType.IMAGE) {
          this.preloadMedia(clip);
        }
      });
    });
    this.renderFrame();
  }

  private preloadMedia(clip: Clip): void {
    if (this.mediaCache.has(clip.id)) return;

    // 直接转换为 koma-local:// 协议（与 PlaybackEngine 一致）
    const mediaSrc = clip.src.startsWith('http://') || clip.src.startsWith('https://') || clip.src.startsWith('koma-local://')
      ? clip.src
      : `koma-local:///${clip.src.replace(/\\/g, '/')}`;

    if (clip.type === MediaType.IMAGE) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = mediaSrc;
      const cache: MediaCache = { type: 'image', element: img, isReady: false };
      img.onload = () => { cache.isReady = true; this.renderFrame(); };
      img.onerror = () => { console.warn('[SimpleRenderer] Failed to load image:', mediaSrc); };
      this.mediaCache.set(clip.id, cache);
    } else if (clip.type === MediaType.VIDEO) {
      const video = document.createElement('video');
      video.crossOrigin = 'anonymous';
      video.src = mediaSrc;
      video.preload = 'auto';
      video.muted = false; // 不静音，声音由这个元素播放
      video.playsInline = true;
      const cache: MediaCache = { type: 'video', element: video, isReady: false };
      video.onloadeddata = () => {
        cache.isReady = true;
        // 将视频元素共享给音频控制器
        this.audioController?.shareVideoElement(clip.id, video);
        this.renderFrame();
      };
      video.onerror = () => { console.warn('[SimpleRenderer] Failed to load video:', mediaSrc); };
      this.mediaCache.set(clip.id, cache);
    }
  }

  // 获取视频元素（供外部使用）
  getVideoElement(clipId: string): HTMLVideoElement | null {
    const cache = this.mediaCache.get(clipId);
    if (cache?.type === 'video') {
      return cache.element as HTMLVideoElement;
    }
    return null;
  }

  private startRenderLoop(): void {
    this.isRendering = true;
    this.renderLoop();
  }

  private stopRenderLoop(): void {
    this.isRendering = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    // 暂停所有视频
    this.mediaCache.forEach(cache => {
      if (cache.type === 'video') (cache.element as HTMLVideoElement).pause();
    });
  }

  private renderLoop = (): void => {
    if (!this.isRendering) return;
    this.renderFrame();
    this.rafId = requestAnimationFrame(this.renderLoop);
  };

  renderFrame(): void {
    const currentTime = this.engine.time;
    this.ctx.fillStyle = '#000';
    this.ctx.fillRect(0, 0, this.width, this.height);

    const visibleClips = this.getVisibleClips(currentTime);
    visibleClips.forEach(clip => this.renderClip(clip, currentTime));
  }

  private getVisibleClips(time: number): Clip[] {
    const visible: { clip: Clip; order: number; trackHidden: boolean }[] = [];
    this.tracks.forEach(track => {
      track.clips.forEach(clip => {
        if (time >= clip.start && time < clip.start + clip.duration) {
          if (clip.type === MediaType.VIDEO || clip.type === MediaType.IMAGE || clip.type === MediaType.TEXT) {
            visible.push({ clip, order: track.order ?? 0, trackHidden: !!track.hidden });
          }
        }
      });
    });
    // 过滤掉隐藏轨道的素材
    return visible
      .filter(v => !v.trackHidden)
      .sort((a, b) => a.order - b.order)
      .map(v => v.clip);
  }

  private renderClip(clip: Clip, currentTime: number): void {
    this.ctx.save();

    // 计算片段内的本地时间
    const clipLocalTime = currentTime - clip.start;

    // 获取动画属性（如果有关键帧则插值）
    const props = getAnimatedProperties(clip, clipLocalTime);

    const centerX = this.width / 2 + props.x;
    const centerY = this.height / 2 + props.y;
    this.ctx.translate(centerX, centerY);
    this.ctx.rotate((props.rotation * Math.PI) / 180);
    this.ctx.scale(props.scale, props.scale);
    this.ctx.globalAlpha = props.opacity;

    if (clip.type === MediaType.TEXT) {
      this.renderText(clip, props);
    } else {
      const cache = this.mediaCache.get(clip.id);
      if (cache?.isReady) {
        const source = cache.element;
        if (cache.type === 'video') {
          const video = source as HTMLVideoElement;
          const clipTime = currentTime - clip.start + clip.offset;
          // 只在差距较大时才 seek，避免频繁 seek 导致卡顿
          if (Math.abs(video.currentTime - clipTime) > 0.15) {
            video.currentTime = clipTime;
          }
          if (this.engine.isPlaying && video.paused) {
            video.playbackRate = this.engine.playRate;
            video.play().catch(ignoreError('SimpleEngine:videoPlay'));
          } else if (!this.engine.isPlaying && !video.paused) {
            video.pause();
          }
        }
        const sourceWidth = source.width || (source as HTMLVideoElement).videoWidth || this.width;
        const sourceHeight = source.height || (source as HTMLVideoElement).videoHeight || this.height;
        const aspectRatio = sourceWidth / sourceHeight;
        const canvasRatio = this.width / this.height;
        let drawWidth: number, drawHeight: number;
        if (aspectRatio > canvasRatio) {
          drawWidth = this.width;
          drawHeight = this.width / aspectRatio;
        } else {
          drawHeight = this.height;
          drawWidth = this.height * aspectRatio;
        }
        this.ctx.drawImage(source, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
      }
    }

    this.ctx.restore();
  }

  // 渲染字幕/文本
  private renderText(clip: Clip, props: { x: number; y: number; scale: number; rotation: number; opacity: number }): void {
    const text = clip.text || clip.src || '';
    if (!text) return;

    // 字幕样式
    const fontSize = clip.fontSize || 48;
    const fontFamily = clip.fontFamily || 'Arial, sans-serif';
    const fontColor = clip.fontColor || '#FFFFFF';
    const backgroundColor = clip.backgroundColor;
    const textPosition = clip.textPosition || 'bottom';
    const textAlign = clip.textAlign || 'center';

    // 先重置变换，字幕使用绝对定位
    this.ctx.restore();
    this.ctx.save();
    this.ctx.globalAlpha = props.opacity;

    // 设置字体
    this.ctx.font = `bold ${fontSize}px ${fontFamily}`;
    this.ctx.textAlign = textAlign;
    this.ctx.textBaseline = 'middle';

    // 计算文本宽度和位置
    const lines = text.split('\n');
    const lineHeight = fontSize * 1.3;
    const totalHeight = lines.length * lineHeight;

    // 根据 textPosition 计算 Y 坐标
    let baseY: number;
    switch (textPosition) {
      case 'top':
        baseY = totalHeight / 2 + 50;
        break;
      case 'center':
        baseY = this.height / 2;
        break;
      case 'bottom':
      default:
        baseY = this.height - totalHeight / 2 - 50;
        break;
    }

    // 根据 textAlign 计算 X 坐标
    let baseX: number;
    switch (textAlign) {
      case 'left':
        baseX = 50 + props.x;
        break;
      case 'right':
        baseX = this.width - 50 + props.x;
        break;
      case 'center':
      default:
        baseX = this.width / 2 + props.x;
        break;
    }

    baseY += props.y;

    // 绘制每行文本
    lines.forEach((line, i) => {
      const lineY = baseY + (i - (lines.length - 1) / 2) * lineHeight;

      // 绘制背景
      if (backgroundColor) {
        const metrics = this.ctx.measureText(line);
        const padding = 10;
        const bgWidth = metrics.width + padding * 2;
        const bgHeight = lineHeight;

        let bgX = baseX - bgWidth / 2;
        if (textAlign === 'left') bgX = baseX - padding;
        if (textAlign === 'right') bgX = baseX - bgWidth + padding;

        this.ctx.fillStyle = backgroundColor;
        this.ctx.fillRect(bgX, lineY - bgHeight / 2, bgWidth, bgHeight);
      }

      // 绘制文字阴影
      this.ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
      this.ctx.shadowBlur = 4;
      this.ctx.shadowOffsetX = 2;
      this.ctx.shadowOffsetY = 2;

      // 绘制文字
      this.ctx.fillStyle = fontColor;
      this.ctx.fillText(line, baseX, lineY);
    });

    // 清除阴影
    this.ctx.shadowColor = 'transparent';
    this.ctx.shadowBlur = 0;
    this.ctx.shadowOffsetX = 0;
    this.ctx.shadowOffsetY = 0;
  }

  destroy(): void {
    this.stopRenderLoop();
    this.mediaCache.forEach(cache => {
      if (cache.type === 'video') (cache.element as HTMLVideoElement).src = '';
    });
    this.mediaCache.clear();
  }
}

// ========== AudioController ==========
// 媒体元素实例（支持音频和视频的声音）
interface MediaInstance {
  element: HTMLAudioElement | HTMLVideoElement;
  clip: Clip;
  isReady: boolean;
  type: 'audio' | 'video';
  isShared?: boolean; // 是否是共享的视频元素
}

export class SimpleAudioController {
  private engine: SimpleMediaEngine;
  private mediaMap: Map<string, MediaInstance> = new Map();
  private masterVolume: number = 1;
  private mutedClips: Set<string> = new Set();
  private mutedTracks: Set<string> = new Set();
  private tracks: Track[] = [];

  constructor(engine: SimpleMediaEngine) {
    this.engine = engine;
    this.setupEngineListeners();
  }

  private setupEngineListeners(): void {
    this.engine.on('play', () => this.onEnginePlay());
    this.engine.on('pause', () => this.onEnginePause());
    this.engine.on('seek', () => this.onEngineSeek());
    this.engine.on('timeUpdate', () => this.onTimeUpdate());
    this.engine.on('rateChange', (e) => this.onRateChange(e.rate!));
  }

  // 设置轨道数据（用于检查轨道静音状态）
  setTracks(tracks: Track[]): void {
    this.tracks = tracks;
    // 更新轨道静音状态
    this.mutedTracks.clear();
    tracks.forEach(track => {
      if (track.muted) {
        this.mutedTracks.add(track.id);
      }
    });
  }

  // 接收共享的视频元素（由 VideoRenderer 调用）
  shareVideoElement(clipId: string, video: HTMLVideoElement): void {
    // 查找对应的 clip
    let targetClip: Clip | null = null;
    for (const track of this.tracks) {
      const clip = track.clips.find(c => c.id === clipId);
      if (clip) {
        targetClip = clip;
        break;
      }
    }
    if (!targetClip) return;

    // 如果已存在非共享的实例，先清理
    const existing = this.mediaMap.get(clipId);
    if (existing && !existing.isShared) {
      existing.element.pause();
      existing.element.src = '';
    }

    // 设置为共享实例
    this.mediaMap.set(clipId, {
      element: video,
      clip: targetClip,
      isReady: true,
      type: 'video',
      isShared: true,
    });
  }

  // 加载片段（支持音频和视频）
  loadClip(clip: Clip): void {
    if (clip.type !== MediaType.AUDIO && clip.type !== MediaType.VIDEO) return;

    // 视频由 VideoRenderer 共享，这里只处理纯音频
    if (clip.type === MediaType.VIDEO) {
      // 视频元素会通过 shareVideoElement 方法共享过来
      return;
    }

    if (this.mediaMap.has(clip.id)) return;

    // 转换为 koma-local:// 协议
    const mediaSrc = clip.src.startsWith('http://') || clip.src.startsWith('https://') || clip.src.startsWith('koma-local://')
      ? clip.src
      : `koma-local:///${clip.src.replace(/\\/g, '/')}`;

    const audio = new Audio();
    audio.src = mediaSrc;
    audio.preload = 'auto';
    audio.volume = this.masterVolume * (clip.opacity ?? 1);

    const instance: MediaInstance = { element: audio, clip, isReady: false, type: 'audio' };
    audio.addEventListener('canplaythrough', () => { instance.isReady = true; });
    audio.onerror = () => { console.warn('[SimpleAudio] Failed to load audio:', mediaSrc); };
    this.mediaMap.set(clip.id, instance);
  }

  // 设置片段音量
  setVolume(clipId: string, volume: number): void {
    const instance = this.mediaMap.get(clipId);
    if (instance) {
      instance.element.volume = Math.max(0, Math.min(1, volume * this.masterVolume));
    }
  }

  // 设置片段静音
  setMuted(clipId: string, muted: boolean): void {
    if (muted) {
      this.mutedClips.add(clipId);
    } else {
      this.mutedClips.delete(clipId);
    }
    const instance = this.mediaMap.get(clipId);
    if (instance) {
      instance.element.muted = muted;
    }
  }

  // 设置轨道静音
  setTrackMuted(trackId: string, muted: boolean): void {
    if (muted) {
      this.mutedTracks.add(trackId);
    } else {
      this.mutedTracks.delete(trackId);
    }
    // 更新该轨道所有片段的静音状态
    this.mediaMap.forEach(instance => {
      if (instance.clip.trackId === trackId) {
        instance.element.muted = muted || this.mutedClips.has(instance.clip.id);
      }
    });
  }

  // 设置主音量
  setMasterVolume(volume: number): void {
    this.masterVolume = Math.max(0, Math.min(1, volume));
    this.mediaMap.forEach(instance => {
      const clipVolume = instance.clip.opacity ?? 1;
      instance.element.volume = this.masterVolume * clipVolume;
    });
  }

  // 获取视频元素（供 VideoRenderer 同步使用）
  getVideoElement(clipId: string): HTMLVideoElement | null {
    const instance = this.mediaMap.get(clipId);
    if (instance && instance.type === 'video') {
      return instance.element as HTMLVideoElement;
    }
    return null;
  }

  private onEnginePlay(): void {
    const currentTime = this.engine.time;
    this.mediaMap.forEach(instance => {
      if (this.isClipActive(instance.clip, currentTime)) {
        this.playMedia(instance, currentTime);
      }
    });
  }

  private onEnginePause(): void {
    this.mediaMap.forEach(instance => {
      // 共享的视频元素由 VideoRenderer 控制
      if (!instance.isShared) {
        instance.element.pause();
      }
    });
  }

  private onEngineSeek(): void {
    const currentTime = this.engine.time;
    this.mediaMap.forEach(instance => {
      if (this.isClipActive(instance.clip, currentTime)) {
        this.syncMediaTime(instance, currentTime);
        if (this.engine.isPlaying && !instance.isShared) {
          instance.element.play().catch(ignoreError('SimpleEngine:mediaPlay'));
        }
      } else if (!instance.isShared) {
        instance.element.pause();
      }
    });
  }

  private onTimeUpdate(): void {
    const currentTime = this.engine.time;
    this.mediaMap.forEach(instance => {
      const isActive = this.isClipActive(instance.clip, currentTime);
      const isPlaying = !instance.element.paused;

      // 检查轨道和片段是否被静音
      const isMuted = this.isClipMuted(instance.clip);
      instance.element.muted = isMuted;

      if (isActive && !isPlaying && this.engine.isPlaying && !isMuted) {
        this.playMedia(instance, currentTime);
      } else if (!isActive && isPlaying && !instance.isShared) {
        instance.element.pause();
      }
    });
  }

  private onRateChange(rate: number): void {
    this.mediaMap.forEach(instance => { instance.element.playbackRate = rate; });
  }

  private isClipActive(clip: Clip, time: number): boolean {
    return time >= clip.start && time < clip.start + clip.duration;
  }

  private isClipMuted(clip: Clip): boolean {
    return this.mutedClips.has(clip.id) || this.mutedTracks.has(clip.trackId);
  }

  private playMedia(instance: MediaInstance, currentTime: number): void {
    if (!instance.isReady) return;
    if (this.isClipMuted(instance.clip)) return;

    this.syncMediaTime(instance, currentTime);
    instance.element.playbackRate = this.engine.playRate;
    // 共享的视频元素由 VideoRenderer 控制播放
    if (!instance.isShared) {
      instance.element.play().catch(ignoreError('SimpleEngine:instancePlay'));
    }
  }

  private syncMediaTime(instance: MediaInstance, currentTime: number): void {
    const clipTime = currentTime - instance.clip.start + instance.clip.offset;
    let mediaDuration: number;

    if (instance.type === 'video') {
      mediaDuration = (instance.element as HTMLVideoElement).duration || 0;
    } else {
      mediaDuration = (instance.element as HTMLAudioElement).duration || 0;
    }

    if (mediaDuration > 0) {
      const seekTime = Math.min(clipTime, mediaDuration);
      if (Math.abs(instance.element.currentTime - seekTime) > 0.1) {
        instance.element.currentTime = seekTime;
      }
    }
  }

  // 清除特定片段
  removeClip(clipId: string): void {
    const instance = this.mediaMap.get(clipId);
    if (instance) {
      if (!instance.isShared) {
        instance.element.pause();
        instance.element.src = '';
      }
      this.mediaMap.delete(clipId);
      this.mutedClips.delete(clipId);
    }
  }

  destroy(): void {
    this.mediaMap.forEach(instance => {
      if (!instance.isShared) {
        instance.element.pause();
        instance.element.src = '';
      }
    });
    this.mediaMap.clear();
    this.mutedClips.clear();
    this.mutedTracks.clear();
  }
}

/**
 * Simple 编辑器独立引擎
 * 迁移自 electron-egg，与原有系统隔离
 */

import { Track, Clip, MediaType } from '../types/editor';
import { getAnimatedProperties } from './simpleKeyframe';

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

  constructor(engine: SimpleMediaEngine, canvas: HTMLCanvasElement) {
    this.engine = engine;
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.setupCanvas();
    this.setupEngineListeners();
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
      video.muted = true;
      const cache: MediaCache = { type: 'video', element: video, isReady: false };
      video.onloadeddata = () => { cache.isReady = true; this.renderFrame(); };
      video.onerror = () => { console.warn('[SimpleRenderer] Failed to load video:', mediaSrc); };
      this.mediaCache.set(clip.id, cache);
    }
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
    const visible: { clip: Clip; order: number }[] = [];
    this.tracks.forEach(track => {
      track.clips.forEach(clip => {
        if (time >= clip.start && time < clip.start + clip.duration) {
          if (clip.type === MediaType.VIDEO || clip.type === MediaType.IMAGE || clip.type === MediaType.TEXT) {
            visible.push({ clip, order: track.order ?? 0 });
          }
        }
      });
    });
    return visible.sort((a, b) => a.order - b.order).map(v => v.clip);
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
      this.ctx.font = 'bold 72px Arial, sans-serif';
      this.ctx.fillStyle = '#fff';
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'middle';
      this.ctx.shadowColor = 'rgba(0,0,0,0.5)';
      this.ctx.shadowBlur = 10;
      this.ctx.fillText(clip.src, 0, 0);
    } else {
      const cache = this.mediaCache.get(clip.id);
      if (cache?.isReady) {
        const source = cache.element;
        if (cache.type === 'video') {
          const video = source as HTMLVideoElement;
          const clipTime = currentTime - clip.start + clip.offset;
          if (Math.abs(video.currentTime - clipTime) > 0.1) video.currentTime = clipTime;
          if (this.engine.isPlaying && video.paused) {
            video.playbackRate = this.engine.playRate;
            video.play().catch(() => {});
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

  destroy(): void {
    this.stopRenderLoop();
    this.mediaCache.forEach(cache => {
      if (cache.type === 'video') (cache.element as HTMLVideoElement).src = '';
    });
    this.mediaCache.clear();
  }
}

// ========== AudioController ==========
interface AudioInstance {
  element: HTMLAudioElement;
  clip: Clip;
  isReady: boolean;
}

export class SimpleAudioController {
  private engine: SimpleMediaEngine;
  private audioMap: Map<string, AudioInstance> = new Map();
  private masterVolume: number = 1;

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

  loadClip(clip: Clip): void {
    if (clip.type !== MediaType.AUDIO) return;
    if (this.audioMap.has(clip.id)) return;

    // 直接转换为 koma-local:// 协议
    const audioSrc = clip.src.startsWith('http://') || clip.src.startsWith('https://') || clip.src.startsWith('koma-local://')
      ? clip.src
      : `koma-local:///${clip.src.replace(/\\/g, '/')}`;

    const audio = new Audio();
    audio.src = audioSrc;
    audio.preload = 'auto';
    audio.volume = this.masterVolume * clip.opacity;

    const instance: AudioInstance = { element: audio, clip, isReady: false };
    audio.addEventListener('canplaythrough', () => { instance.isReady = true; });
    audio.onerror = () => { console.warn('[SimpleAudio] Failed to load:', audioSrc); };
    this.audioMap.set(clip.id, instance);
  }

  private onEnginePlay(): void {
    const currentTime = this.engine.time;
    this.audioMap.forEach(instance => {
      if (this.isClipActive(instance.clip, currentTime)) {
        this.playAudio(instance, currentTime);
      }
    });
  }

  private onEnginePause(): void {
    this.audioMap.forEach(instance => instance.element.pause());
  }

  private onEngineSeek(): void {
    const currentTime = this.engine.time;
    this.audioMap.forEach(instance => {
      if (this.isClipActive(instance.clip, currentTime)) {
        this.syncAudioTime(instance, currentTime);
        if (this.engine.isPlaying) instance.element.play().catch(() => {});
      } else {
        instance.element.pause();
      }
    });
  }

  private onTimeUpdate(): void {
    const currentTime = this.engine.time;
    this.audioMap.forEach(instance => {
      const isActive = this.isClipActive(instance.clip, currentTime);
      const isPlaying = !instance.element.paused;

      if (isActive && !isPlaying && this.engine.isPlaying) {
        this.playAudio(instance, currentTime);
      } else if (!isActive && isPlaying) {
        instance.element.pause();
      }
    });
  }

  private onRateChange(rate: number): void {
    this.audioMap.forEach(instance => { instance.element.playbackRate = rate; });
  }

  private isClipActive(clip: Clip, time: number): boolean {
    return time >= clip.start && time < clip.start + clip.duration;
  }

  private playAudio(instance: AudioInstance, currentTime: number): void {
    if (!instance.isReady) return;
    this.syncAudioTime(instance, currentTime);
    instance.element.playbackRate = this.engine.playRate;
    instance.element.play().catch(() => {});
  }

  private syncAudioTime(instance: AudioInstance, currentTime: number): void {
    const clipTime = currentTime - instance.clip.start + instance.clip.offset;
    const audioDuration = instance.element.duration || 0;
    if (audioDuration > 0) {
      const seekTime = clipTime % audioDuration;
      if (Math.abs(instance.element.currentTime - seekTime) > 0.1) {
        instance.element.currentTime = seekTime;
      }
    }
  }

  destroy(): void {
    this.audioMap.forEach(instance => {
      instance.element.pause();
      instance.element.src = '';
    });
    this.audioMap.clear();
  }
}

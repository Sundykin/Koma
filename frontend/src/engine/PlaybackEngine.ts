/**
 * ??????
 * ??? trackStore ???????????????
 */
import type { TrackLine, TrackItem, VideoTrackItem, AudioTrackItem, ImageTrackItem, TrackKeyframe } from '../types/track';
import { KeyframeInterpolator } from './KeyframeInterpolator';
import { ignoreError } from '../utils/errorHandler';

export interface PlaybackConfig {
  fps: number;
  width: number;
  height: number;
}

export interface PlaybackState {
  isPlaying: boolean;
  currentFrame: number;
  currentTime: number;    // ???
  duration: number;       // ?
  durationMs: number;     // ???
  fps: number;
}

export type PlaybackCallback = (state: PlaybackState) => void;

// ?????????
interface MediaCache {
  video: Map<string, HTMLVideoElement>;
  audio: Map<string, HTMLAudioElement>;
  image: Map<string, HTMLImageElement>;
}

// ??? Window ??????? webkitAudioContext
interface WindowWithWebkitAudio extends Window {
  webkitAudioContext: typeof AudioContext;
}

// ????????????????????????????????? as any
type AnimatableTrackItem = TrackItem & {
  x?: number;
  y?: number;
  scale?: number;
  rotation?: number;
  opacity?: number;
  volume?: number;
  keyframes?: TrackKeyframe[];
};

export class PlaybackEngine {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private config: PlaybackConfig = { fps: 30, width: 1920, height: 1080 };

  private tracks: TrackLine[] = [];
  private _sortedTracks: TrackLine[] = [];  // ????????????        
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

  // ??????
  private _cachedDuration: number | null = null;
  private _durationDirty = true;

  // ?????????????
  private static readonly SYNC_TOLERANCE = 0.1;

  // ?????????
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
      const Win = window as unknown as WindowWithWebkitAudio;
      this.audioContext = new (window.AudioContext || Win.webkitAudioContext)();
      this.masterGain = this.audioContext.createGain();
      this.masterGain.connect(this.audioContext.destination);
    } catch (err) {
      console.warn('[PlaybackEngine] Failed to create AudioContext:', err);
    }
  }

  /**
   * ?????????
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
   * ??????
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
   * ?????????
   */
  async loadTracks(tracks: TrackLine[]): Promise<void> {
    this.tracks = tracks;
    this._durationDirty = true;
    // ?????????? order ???????
    this._sortedTracks = [...tracks].sort((a, b) => a.order - b.order);

    // ??????????
    for (const track of tracks) {
      for (const item of track.items) {
        await this.preloadItem(item);
      }
    }

    // ???????
    this.render();
  }

  /**
   * ?????????
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
      video.onerror = () => reject(new Error(Failed to load video: ));

      video.src = koma-local:///;
    });
  }

  private loadAudio(src: string): Promise<HTMLAudioElement> {
    return new Promise((resolve, reject) => {
      const audio = document.createElement('audio');
      audio.crossOrigin = 'anonymous';
      audio.preload = 'auto';

      audio.onloadeddata = () => resolve(audio);
      audio.onerror = () => reject(new Error(Failed to load audio: ));

      audio.src = koma-local:///;
    });
  }

  private loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.crossOrigin = 'anonymous';

      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error(Failed to load image: ));

      image.src = koma-local:///;
    });
  }

  /**
   * ???
   */
  play() {
    if (this.isPlaying) return;

    // ??? AudioContext
    if (this.audioContext?.state === 'suspended') {
      this.audioContext.resume();
    }

    this.isPlaying = true;
    this.lastFrameTime = performance.now();
    this._lastEmitTime = 0;  // ?????????
    // ??? RAF ???
    this.animationFrameId = requestAnimationFrame(this._tick);
    this.emitState();
  }

  /**
   * ???
   */
  pause() {
    this.isPlaying = false;
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    // ?????????
    this.pauseAllAudio();
    this.emitState();
  }

  /**
   * ???/??????
   */
  togglePlay() {
    if (this.isPlaying) {
      this.pause();
    } else {
      this.play();
    }
  }

  /**
   * ????????????????????
   */
  seekFrame(frame: number) {
    const duration = this.getDuration();
    const targetFrame = Math.max(0, Math.min(frame, duration));        

    // ??????????? SYNC_TOLERANCE ?????????? seek
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
   * ????????????????
   */
  seekTime(ms: number) {
    const frame = Math.round(ms * this.config.fps / 1000);
    this.seekFrame(frame);
  }

  /**
   * ???????
   */
  getCurrentFrame(): number {
    return this.currentFrame;
  }

  /**
   * ???????????????
   */
  getCurrentTime(): number {
    return this.currentFrame * 1000 / this.config.fps;
  }

  /**
   * ????????????- ??????
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
   * ???????????????????
   */
  invalidateDuration() {
    this._durationDirty = true;
  }

  /**
   * ?????????
   */
  getIsPlaying(): boolean {
    return this.isPlaying;
  }

  /**
   * ?????????
   */
  onUpdate(callback: PlaybackCallback) {
    this.callbacks.add(callback);
    return () => this.callbacks.delete(callback);
  }

  /**
   * ???????
   */
  setVolume(volume: number) {
    if (this.masterGain) {
      this.masterGain.gain.setValueAtTime(volume, this.audioContext?.currentTime || 0);
    }
  }

  /**
   * ????????????????
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
   * ???????
   */
  render() {
    if (!this.ctx || !this.canvas) return;

    // ??????
    this.ctx.fillStyle = '#000';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);    

    // ??????????????? order ????
    const visibleItems = this.getVisibleItems(this.currentFrame);      
    for (const { item } of visibleItems) {
      this.renderItem(item);
    }
  }

  /**
   * ??????????
   */
  private renderItem(item: TrackItem) {
    const ctx = this.ctx!;
    const canvas = this.canvas!;

    // ????????????????? offset?
    const internalFrame = this.currentFrame - item.start + item.offsetL;
    const internalTime = internalFrame * 1000 / this.config.fps;       

    // ?????????????????????? as any
    const animItem = item as AnimatableTrackItem;

    // ????????????
    const keyframes = animItem.keyframes;
    const animValues = KeyframeInterpolator.interpolate(keyframes || [], internalTime, {
      x: animItem.x ?? 0,
      y: animItem.y ?? 0,
      scale: animItem.scale ?? 1,
      rotation: animItem.rotation ?? 0,
      opacity: animItem.opacity ?? 1,
      volume: animItem.volume ?? 1,
    });

    if (item.type === 'video') {
      const videoItem = item as VideoTrackItem;
      const video = this.mediaCache.video.get(videoItem.source || ''); 
      if (video) {
        // ?????????
        const videoTime = internalFrame / this.config.fps;
        if (Math.abs(video.currentTime - videoTime) > 0.1) {
          video.currentTime = videoTime;
        }

        // ?????????
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
        // ??????????????
        const baseScale = Math.min(
          canvas.width / image.width,
          canvas.height / image.height
        );
        const w = image.width * baseScale;
        const h = image.height * baseScale;

        // ?????????
        ctx.save();
        ctx.globalAlpha = animValues.opacity;
        ctx.translate(canvas.width / 2 + animValues.x, canvas.height / 2 + animValues.y);
        ctx.rotate((animValues.rotation * Math.PI) / 180);
        ctx.scale(animValues.scale, animValues.scale);

        ctx.drawImage(image, -w / 2, -h / 2, w, h);
        ctx.restore();
      }
    }
    // ???????????????????
  }

  /**
   * ??????
   */
  private syncAudio() {
    // ??????????????????????????
    this.pauseAllAudio();

    if (!this.isPlaying) return;

    // ??????????????????
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
   * ?????????
   */
  private pauseAllAudio() {
    for (const audio of this.mediaCache.audio.values()) {
      audio.pause();
    }
  }

  /**
   * RAF ???????????????? this ??????
   */
  private _tick = (timestamp: number): void => {
    if (!this.isPlaying) return;

    // ??????????
    const elapsed = timestamp - this.lastFrameTime;
    const framesToAdvance = Math.floor(elapsed / this.frameInterval);  

    if (framesToAdvance > 0) {
      this.lastFrameTime = timestamp - (elapsed % this.frameInterval); 
      this.currentFrame += framesToAdvance;

      // ????????????
      const duration = this.getDuration();
      if (this.currentFrame >= duration) {
        this.currentFrame = duration;
        this.pause();
        return;
      }

      // ???
      this.render();

      // ????????
      if (timestamp - this._lastEmitTime >= PlaybackEngine.EMIT_INTERVAL) {
        this._lastEmitTime = timestamp;
        this.emitState();
      }
    }

    // ???????????????????????
    this.animationFrameId = requestAnimationFrame(this._tick);
  };

  /**
   * ??????
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
   * ???
   */
  dispose() {
    this.pause();

    // ?????????
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

    // ??????????
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

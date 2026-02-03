/**
 * 音频控制器
 * 管理多轨道音频播放和同步
 */
import { message } from 'antd';
import type { Clip, Timeline } from '../types';
import { handleError } from '../utils/errorHandler';

const AUDIO_PLAY_ERROR_KEY = 'audio-playback-error';

const notifyAudioPlayError = (error: unknown) => {
  handleError(error, { module: 'AudioController', action: 'play', severity: 'warning' });
  message.error({
    content: '音频播放失败，请检查浏览器是否允许自动播放或设备音频是否可用。',
    key: AUDIO_PLAY_ERROR_KEY,
  });
};

interface AudioTrackState {
  clip: Clip;
  audio: HTMLAudioElement;
  isPlaying: boolean;
}

export class AudioController {
  private audioTracks: Map<string, AudioTrackState> = new Map();
  private masterVolume = 1;
  private isPlaying = false;
  private currentTime = 0;

  /**
   * 加载时间线中的所有音频 Clip
   */
  async loadTimeline(timeline: Timeline): Promise<void> {
    this.dispose();

    const audioTracks = timeline.tracks.filter((t) => t.type === 'audio');

    for (const track of audioTracks) {
      for (const clip of track.clips) {
        if (clip.type === 'audio') {
          await this.loadClip(clip, track.muted);
        }
      }
    }
  }

  /**
   * 加载单个音频 Clip
   */
  private async loadClip(clip: Clip, muted: boolean): Promise<void> {
    return new Promise((resolve, reject) => {
      const audio = new Audio(clip.sourcePath);
      audio.preload = 'auto';
      audio.muted = muted;
      audio.volume = clip.opacity * this.masterVolume; // 使用 opacity 作为音量

      audio.onloadeddata = () => {
        this.audioTracks.set(clip.id, {
          clip,
          audio,
          isPlaying: false,
        });
        resolve();
      };

      audio.onerror = () => {
        console.error(`Failed to load audio: ${clip.sourcePath}`);
        resolve(); // 不阻塞其他音频加载
      };
    });
  }

  /**
   * 播放
   */
  play() {
    this.isPlaying = true;
    this.syncAudio();
  }

  /**
   * 暂停
   */
  pause() {
    this.isPlaying = false;
    this.audioTracks.forEach((state) => {
      state.audio.pause();
      state.isPlaying = false;
    });
  }

  /**
   * 跳转到指定时间
   */
  seek(time: number) {
    this.currentTime = time;
    this.syncAudio();
  }

  /**
   * 同步音频播放状态
   */
  private syncAudio() {
    this.audioTracks.forEach((state) => {
      const { clip, audio } = state;
      const clipEnd = clip.startTime + clip.duration;

      // 检查 clip 是否应该播放
      if (this.currentTime >= clip.startTime && this.currentTime < clipEnd) {
        // 计算音频内的播放位置
        const audioTime =
          (clip.sourceStart || 0) + (this.currentTime - clip.startTime);

        // 同步播放位置
        if (Math.abs(audio.currentTime * 1000 - audioTime) > 100) {
          audio.currentTime = audioTime / 1000;
        }

        // 开始播放
        if (this.isPlaying && !state.isPlaying) {
          audio.play().catch(notifyAudioPlayError);
          state.isPlaying = true;
        }
      } else {
        // 停止播放
        if (state.isPlaying) {
          audio.pause();
          state.isPlaying = false;
        }
      }
    });
  }

  /**
   * 更新当前时间（由外部调用）
   */
  update(time: number) {
    this.currentTime = time;
    if (this.isPlaying) {
      this.syncAudio();
    }
  }

  /**
   * 设置主音量
   */
  setMasterVolume(volume: number) {
    this.masterVolume = Math.max(0, Math.min(1, volume));
    this.audioTracks.forEach((state) => {
      state.audio.volume = state.clip.opacity * this.masterVolume;
    });
  }

  /**
   * 设置轨道静音
   */
  setTrackMuted(trackId: string, muted: boolean) {
    this.audioTracks.forEach((state) => {
      if (state.clip.trackId === trackId) {
        state.audio.muted = muted;
      }
    });
  }

  /**
   * 清理资源
   */
  dispose() {
    this.audioTracks.forEach((state) => {
      state.audio.pause();
      state.audio.src = '';
    });
    this.audioTracks.clear();
  }
}

export default AudioController;

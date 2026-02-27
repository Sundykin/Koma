/**
 * FFmpeg IPC 控制器
 * 处理前端发来的 FFmpeg 相关请求
 */
import { IpcMainInvokeEvent } from 'electron';
import { services } from '../service';
import type { ExtractFramesOptions, WaveformOptions, EncodeVideoOptions } from '../service/ffmpeg';

export class FFmpegController {
  /**
   * 检查 FFmpeg 是否可用
   */
  async isAvailable(): Promise<boolean> {
    return services.ffmpeg.isAvailable();
  }

  /**
   * 获取媒体信息
   */
  async getInfo(args: { input: string }, _event: IpcMainInvokeEvent) {
    return services.ffmpeg.getMediaInfo(args.input);
  }

  /**
   * 抽取视频帧
   */
  async extractFrames(args: ExtractFramesOptions, _event: IpcMainInvokeEvent) {
    return services.ffmpeg.extractFrames(args);
  }

  /**
   * 生成音频波形
   */
  async waveform(args: WaveformOptions, _event: IpcMainInvokeEvent) {
    return services.ffmpeg.generateWaveform(args);
  }

  /**
   * 分离音频
   */
  async splitAudio(args: { input: string; output: string }, _event: IpcMainInvokeEvent) {
    return services.ffmpeg.splitAudio(args.input, args.output);
  }

  /**
   * 获取缓存目录
   */
  async getCacheDir(args: { subDir?: string }, _event: IpcMainInvokeEvent) {
    return services.ffmpeg.getCacheDir(args.subDir);
  }

  /**
   * 清理缓存
   */
  async clearCache(args: { subDir?: string }, _event: IpcMainInvokeEvent) {
    return services.ffmpeg.clearCache(args.subDir);
  }

  /**
   * 取消当前任务
   */
  async cancelTask(_args: {}, _event: IpcMainInvokeEvent) {
    services.ffmpeg.cancelCurrentTask();
    return { success: true };
  }

  /**
   * 清空任务队列
   */
  async clearQueue(_args: {}, _event: IpcMainInvokeEvent) {
    services.ffmpeg.clearQueue();
    return { success: true };
  }

  /**
   * 编码视频（帧序列 → 视频文件）
   */
  async encodeVideo(args: EncodeVideoOptions, _event: IpcMainInvokeEvent) {
    return services.ffmpeg.encodeVideo(args);
  }

  /**
   * 保存 Base64 帧到临时目录
   */
  async saveFrames(args: { frames: string[]; subDir?: string }, _event: IpcMainInvokeEvent) {
    return services.ffmpeg.saveFramesToDir(args.frames, args.subDir);
  }
}

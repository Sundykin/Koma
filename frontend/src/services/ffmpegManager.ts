/**
 * 前端 FFmpeg 管理器
 * 负责与 Electron FFmpeg 服务通信，管理帧缓存和波形缓存
 */
import { isElectron, appGetPath } from './electronService';

// 媒体信息类型
export interface MediaInfo {
  duration: number;       // 毫秒
  width?: number;
  height?: number;
  fps?: number;
  format: string;
  videoCodec?: string;
  audioCodec?: string;
  bitrate?: number;
  audioChannels?: number;
  audioSampleRate?: number;
  hasVideo: boolean;
  hasAudio: boolean;
}

// 抽帧选项
export interface ExtractFramesOptions {
  input: string;
  outputDir: string;
  fps?: number;
  startTime?: number;
  endTime?: number;
  width?: number;
  quality?: number;
}

// 波形生成选项
export interface WaveformOptions {
  input: string;
  output: string;
  width?: number;
  height?: number;
  color?: string;
  backgroundColor?: string;
}

// 资源处理结果
export interface ResourceProcessResult {
  mediaInfo: MediaInfo;
  frames?: string[];       // 帧文件路径列表
  waveform?: string;       // 波形图路径
  audioPath?: string;      // 分离后的音频路径
}

// 视频合成选项
export interface ComposeVideoOptions {
  framePattern: string;    // 帧文件模式，如 '/tmp/frame_%05d.png'
  fps: number;
  width: number;
  height: number;
  format: 'mp4' | 'webm' | 'gif';
  videoBitrate: number;    // kbps
  audioBitrate: number;    // kbps
  audioTracks: Array<{
    src: string;
    start: number;
    duration: number;
    offset: number;
    volume: number;
  }>;
  outputPath: string;
  onProgress?: (percent: number) => void;
}

// 获取 FFmpeg API
const getFFmpegAPI = (): any => {
  if (isElectron() && (window as any).electronAPI?.ffmpeg) {
    return (window as any).electronAPI.ffmpeg;
  }
  return null;
};

/**
 * FFmpeg 管理器
 */
class FFmpegManager {
  private frameCache: Map<string, string[]> = new Map();
  private waveformCache: Map<string, string> = new Map();
  private mediaInfoCache: Map<string, MediaInfo> = new Map();
  private cacheDir: string = '';
  private initialized: boolean = false;

  /**
   * 初始化管理器
   */
  async init(): Promise<void> {
    if (this.initialized) return;

    const api = getFFmpegAPI();
    if (api) {
      try {
        this.cacheDir = await api.getCacheDir();
      } catch (err) {
        console.warn('[FFmpegManager] Failed to get cache dir:', err);
      }
    }

    this.initialized = true;
    console.log('[FFmpegManager] Initialized, cacheDir:', this.cacheDir);
  }

  /**
   * 检查 FFmpeg 是否可用
   */
  async isAvailable(): Promise<boolean> {
    const api = getFFmpegAPI();
    if (!api) return false;

    try {
      return await api.isAvailable();
    } catch {
      return false;
    }
  }

  /**
   * 获取媒体信息
   */
  async getMediaInfo(filePath: string): Promise<MediaInfo> {
    // 检查缓存
    if (this.mediaInfoCache.has(filePath)) {
      return this.mediaInfoCache.get(filePath)!;
    }

    const api = getFFmpegAPI();
    if (!api) {
      throw new Error('FFmpeg not available');
    }

    const info = await api.getInfo(filePath);
    this.mediaInfoCache.set(filePath, info);
    return info;
  }

  /**
   * 抽取视频帧
   */
  async extractFrames(options: ExtractFramesOptions): Promise<string[]> {
    const cacheKey = this.getFrameCacheKey(options);

    // 检查缓存
    if (this.frameCache.has(cacheKey)) {
      return this.frameCache.get(cacheKey)!;
    }

    const api = getFFmpegAPI();
    if (!api) {
      throw new Error('FFmpeg not available');
    }

    const frames = await api.extractFrames(options);
    this.frameCache.set(cacheKey, frames);
    return frames;
  }

  /**
   * 生成音频波形
   */
  async generateWaveform(options: WaveformOptions): Promise<string> {
    // 检查缓存
    if (this.waveformCache.has(options.input)) {
      return this.waveformCache.get(options.input)!;
    }

    const api = getFFmpegAPI();
    if (!api) {
      throw new Error('FFmpeg not available');
    }

    const waveformPath = await api.waveform(options);
    this.waveformCache.set(options.input, waveformPath);
    return waveformPath;
  }

  /**
   * 分离音频
   */
  async splitAudio(input: string, output: string): Promise<string> {
    const api = getFFmpegAPI();
    if (!api) {
      throw new Error('FFmpeg not available');
    }

    return await api.splitAudio(input, output);
  }

  /**
   * 处理资源（获取媒体信息、抽帧、生成波形）
   */
  async processResource(
    filePath: string,
    resourceId: string,
    options?: {
      extractFrames?: boolean;
      generateWaveform?: boolean;
      splitAudio?: boolean;
      framesFps?: number;
      framesWidth?: number;
    }
  ): Promise<ResourceProcessResult> {
    await this.init();

    // 获取媒体信息
    const mediaInfo = await this.getMediaInfo(filePath);

    const result: ResourceProcessResult = { mediaInfo };

    // 构建缓存目录
    const resourceCacheDir = `${this.cacheDir}/${resourceId}`;

    // 抽帧
    if (options?.extractFrames && mediaInfo.hasVideo) {
      result.frames = await this.extractFrames({
        input: filePath,
        outputDir: `${resourceCacheDir}/frames`,
        fps: options.framesFps ?? 1,
        width: options.framesWidth ?? 320
      });
    }

    // 生成波形
    if (options?.generateWaveform && mediaInfo.hasAudio) {
      result.waveform = await this.generateWaveform({
        input: filePath,
        output: `${resourceCacheDir}/waveform.png`
      });
    }

    // 分离音频
    if (options?.splitAudio && mediaInfo.hasAudio && mediaInfo.hasVideo) {
      const ext = mediaInfo.audioCodec === 'aac' ? 'm4a' : 'mp3';
      result.audioPath = await this.splitAudio(
        filePath,
        `${resourceCacheDir}/audio.${ext}`
      );
    }

    return result;
  }

  /**
   * 获取资源的帧
   */
  async getFrames(
    filePath: string,
    resourceId: string,
    timeRange?: [number, number]
  ): Promise<string[]> {
    const cacheKey = `${resourceId}:${timeRange?.join('-') || 'all'}`;

    if (this.frameCache.has(cacheKey)) {
      return this.frameCache.get(cacheKey)!;
    }

    const resourceCacheDir = `${this.cacheDir}/${resourceId}/frames`;

    const frames = await this.extractFrames({
      input: filePath,
      outputDir: resourceCacheDir,
      fps: 1,
      startTime: timeRange?.[0],
      endTime: timeRange?.[1]
    });

    return frames;
  }

  /**
   * 获取资源的波形图
   */
  async getWaveform(filePath: string, resourceId: string): Promise<string> {
    if (this.waveformCache.has(filePath)) {
      return this.waveformCache.get(filePath)!;
    }

    const output = `${this.cacheDir}/${resourceId}/waveform.png`;
    return this.generateWaveform({ input: filePath, output });
  }

  /**
   * 生成帧缓存键
   */
  private getFrameCacheKey(options: ExtractFramesOptions): string {
    return `${options.input}:${options.fps || 1}:${options.startTime || 0}:${options.endTime || 'end'}:${options.width || 'auto'}`;
  }

  /**
   * 清除资源缓存
   */
  clearResourceCache(resourceId: string): void {
    // 清除帧缓存
    for (const key of this.frameCache.keys()) {
      if (key.startsWith(resourceId)) {
        this.frameCache.delete(key);
      }
    }
  }

  /**
   * 清除所有缓存
   */
  async clearAllCache(): Promise<void> {
    this.frameCache.clear();
    this.waveformCache.clear();
    this.mediaInfoCache.clear();

    const api = getFFmpegAPI();
    if (api) {
      await api.clearCache();
    }
  }

  /**
   * 取消当前任务
   */
  async cancelCurrentTask(): Promise<void> {
    const api = getFFmpegAPI();
    if (api) {
      await api.cancelTask();
    }
  }

  /**
   * 清空任务队列
   */
  async clearQueue(): Promise<void> {
    const api = getFFmpegAPI();
    if (api) {
      await api.clearQueue();
    }
  }

  /**
   * 合成视频（图片序列 + 音频 -> 视频文件）
   */
  async composeVideo(options: ComposeVideoOptions): Promise<string> {
    const api = getFFmpegAPI();
    if (!api) {
      throw new Error('FFmpeg not available');
    }

    return await api.composeVideo(options);
  }

  /**
   * 获取临时目录
   */
  async getTempDir(): Promise<string> {
    const api = getFFmpegAPI();
    if (api) {
      return await api.getTempDir();
    }
    return '/tmp/koma-export';
  }

  /**
   * 确保目录存在
   */
  async ensureDir(dirPath: string): Promise<void> {
    const api = getFFmpegAPI();
    if (api) {
      await api.ensureDir(dirPath);
    }
  }

  /**
   * 保存帧图片
   */
  async saveFrame(filePath: string, dataUrl: string): Promise<void> {
    const api = getFFmpegAPI();
    if (api) {
      await api.saveFrame(filePath, dataUrl);
    }
  }

  /**
   * 清理临时目录
   */
  async cleanupTemp(tempDir: string): Promise<void> {
    const api = getFFmpegAPI();
    if (api) {
      await api.cleanupTemp(tempDir);
    }
  }
}

// 单例
export const ffmpegManager = new FFmpegManager();
export default ffmpegManager;

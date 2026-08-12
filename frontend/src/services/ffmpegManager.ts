/**
 * 前端 FFmpeg 管理器
 * 负责与 Electron FFmpeg 服务通信，管理帧缓存和波形缓存
 */
import { isElectron, electronService } from './electronService';
import { createLogger } from '../store/logger';
import type { MediaAssetSource } from '../types';

const logger = createLogger('FFmpegManager');

function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return hash;
}

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

// 宫格图片分割选项（支持 2×2 / 3×3 / 4×4 / 5×5）
export interface SplitGridImageOptions {
  input: string;
  outputDir: string;
  aspectRatio?: string;
  gridSize?: 2 | 3 | 4 | 5;
  minCellWidth?: number;
  minCellHeight?: number;
  targetWidth?: number;
  targetHeight?: number;
  sharpenAmount?: number;
  format?: 'png' | 'jpg' | 'webp';
}

export interface UpscaleImageOptions {
  input: string;
  output: string;
  factor?: number;
  sharpenAmount?: number;
}

export interface CropImageOptions {
  input: string;
  output: string;
  aspectRatio: string;
  anchorX?: number;
  anchorY?: number;
  sharpenAmount?: number;
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
  /** 帧序列所在目录（绝对路径） */
  frameDir: string;
  /** 帧文件名占位（不含目录），例如 'frame_%05d.png' */
  framePattern: string;
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
    fadeInDuration?: number;
    fadeOutDuration?: number;
  }>;
  outputPath: string;
  onProgress?: (percent: number) => void;
}

export interface ConcatMediaClipOptions {
  clips: Array<{
    kind: 'video' | 'image' | 'audio';
    source: string;
    /** 视频/音频段在源素材内的起始秒（剪辑 trim 入点）；缺省从头开始 */
    offsetSec?: number;
    durationSec?: number;
    /** 音频段在时间轴上的起始秒（配音/配乐定位）；缺省按顺序头尾相接 */
    startSec?: number;
    label?: string;
  }>;
  outputPath: string;
  width: number;
  height: number;
  fps: 24 | 30 | 60;
  imageDurationSec?: number;
  /** 文字叠加层（PNG 透明图 + 起止时间）：存在时最终合成阶段 overlay 烧录（视频轨重编码一次） */
  subtitleOverlays?: Array<{ imagePath: string; startSec: number; endSec: number }>;
  onProgress?: (percent: number) => void;
}

export interface TrimVideoOptions {
  input: string;
  output: string;
  startTime: number;
  endTime: number;
}

export interface UpscaleVideoOptions {
  input: string;
  output: string;
  factor?: 2 | 4;
  sharpenAmount?: number;
}

// 获取 FFmpeg API
const getFFmpegAPI = (): any => {
  if (isElectron() && window.electronAPI?.ffmpeg) {
    return window.electronAPI.ffmpeg;
  }
  return null;
};

/**
 * FFmpeg 管理器
 */
class FFmpegManager {
  private frameCache: Map<string, string[]> = new Map();
  private posterFrameCache: Map<string, string> = new Map();
  private tailFrameCache: Map<string, string> = new Map();
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
        logger.warn('Failed to get cache dir:', err);
      }
    }

    this.initialized = true;
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
   * 将远程 URL 下载到本地缓存目录，供 FFmpeg 使用。
   * 如果已经是本地路径则直接返回。
   */
  async #materializeInput(input: string): Promise<string | null> {
    if (!input) return null;
    if (!/^https?:\/\//i.test(input) && !/^data:/i.test(input) && !/^blob:/i.test(input)) {
      return input;
    }
    if (!this.cacheDir) {
      logger.warn('[materializeInput] cacheDir 未初始化，无法下载远程 URL');
      return null;
    }
    const hash = Math.abs(hashCode(input)).toString(36);
    const dataMime = input.match(/^data:([^;,]+)/i)?.[1];
    const ext = (dataMime?.split('/')[1] || input.split('.').pop()?.split('?')[0] || 'mp4').substring(0, 8);
    const downloadDir = `${this.cacheDir}/_materialized`;
    const localPath = `${downloadDir}/${hash}.${ext}`;
    const alreadyExists = await electronService.fs.exists(localPath);
    if (alreadyExists) {
      return localPath;
    }
    try {
      await electronService.fs.mkdir(downloadDir);
      if (/^data:/i.test(input)) {
        const match = input.match(/^data:[^;,]+;base64,(.+)$/i);
        if (!match) throw new Error('不支持的 data URL：需要 base64 编码');
        await electronService.fs.writeFile(localPath, match[1], true);
      } else if (/^blob:/i.test(input)) {
        const response = await fetch(input);
        if (!response.ok) throw new Error(`读取 blob 视频失败（${response.status}）`);
        const bytes = new Uint8Array(await response.arrayBuffer());
        let binary = '';
        const chunkSize = 0x8000;
        for (let offset = 0; offset < bytes.length; offset += chunkSize) {
          binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
        }
        await electronService.fs.writeFile(localPath, btoa(binary), true);
      } else {
        logger.info('[materializeInput] 下载远程 URL 到本地', { input: input.substring(0, 80), localPath });
        await electronService.fs.downloadFile(input, localPath);
      }
      return localPath;
    } catch (err) {
      logger.error('[materializeInput] 下载远程 URL 失败', {
        input: input.substring(0, 80),
        localPath,
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
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
      throw new Error('FFmpeg 不可用');
    }

    const info = await api.getInfo(filePath);
    // ee-core 会把主进程 handler 的异常吞成 undefined（见 ee-core socket/ipcServer），
    // 这里兜底成可读错误，避免下游出现 "reading 'hasVideo' of undefined"。
    if (!info) {
      throw new Error('读取媒体信息失败：ffprobe 执行出错或文件无法解析');
    }
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
      throw new Error('FFmpeg 不可用');
    }

    const frames = await api.extractFrames(options);
    this.frameCache.set(cacheKey, frames);
    return frames;
  }

  /**
   * 宫格图片分割（支持 2×2 / 3×3 / 4×4 / 5×5）
   */
  async splitGridImage(options: SplitGridImageOptions): Promise<string[]> {
    await this.init();
    const api = getFFmpegAPI();
    if (!api) {
      throw new Error('FFmpeg 不可用');
    }

    const available = await this.isAvailable();
    if (!available) {
      throw new Error('FFmpeg 不可用');
    }

    return await api.splitGridImage(options);
  }

  /**
   * 高清放大图片
   */
  async upscaleImage(options: UpscaleImageOptions): Promise<string> {
    await this.init();
    const api = getFFmpegAPI();
    if (!api) {
      throw new Error('FFmpeg 不可用');
    }

    const available = await this.isAvailable();
    if (!available) {
      throw new Error('FFmpeg 不可用');
    }

    return await api.upscaleImage(options);
  }

  /**
   * 裁剪图片到指定比例
   */
  async cropImage(options: CropImageOptions): Promise<string> {
    await this.init();
    const api = getFFmpegAPI();
    if (!api) {
      throw new Error('FFmpeg 不可用');
    }

    const available = await this.isAvailable();
    if (!available) {
      throw new Error('FFmpeg 不可用');
    }

    return await api.cropImage(options);
  }

  /**
   * 提取视频首帧，作为缩略图/预览图。
   */
  async getPosterFrame(
    filePath: string,
    resourceId: string,
    width: number = 320
  ): Promise<string | null> {
    const cacheKey = `${filePath}:${resourceId}:${width}:poster`;
    if (this.posterFrameCache.has(cacheKey)) {
      return this.posterFrameCache.get(cacheKey)!;
    }

    await this.init();
    const api = getFFmpegAPI();
    if (!api) {
      return null;
    }

    const available = await this.isAvailable();
    if (!available) {
      return null;
    }

    const inputPath = await this.#materializeInput(filePath);
    if (!inputPath) {
      logger.warn('[getPosterFrame] 无法获取本地文件，跳过抽帧', { filePath: filePath.substring(0, 80) });
      return null;
    }

    const rootDir = await api.getCacheDir('video-posters');
    const outputDir = `${rootDir}/${resourceId}`;
    await api.ensureDir(outputDir);

    const frames = await api.extractFrames({
      input: inputPath,
      outputDir,
      fps: 1,
      startTime: 0,
      endTime: 0.1,
      width,
      quality: 2,
    });

    const firstFrame = Array.isArray(frames) && frames.length > 0 ? frames[0] : null;
    if (firstFrame) {
      this.posterFrameCache.set(cacheKey, firstFrame);
    }
    return firstFrame;
  }

  /**
   * 提取真实视频尾帧（不是 poster/首帧）。在片尾前 50–120ms 的安全窗口内取单帧，
   * 并按来源版本键缓存，供项目相邻 Shot 的视频连续性引用使用。
   */
  async getTailFrame(
    source: MediaAssetSource,
    resourceId: string,
    options?: { sourceVideoKey?: string; width?: number; tailOffsetMs?: number },
  ): Promise<string> {
    const rawSource = typeof source === 'string'
      ? source
      : (source.localPath || source.remoteUrl || '');
    if (!rawSource) throw new Error('上一镜没有可读取的视频媒体');

    await this.init();
    const inputPath = await this.#materializeInput(rawSource);
    if (!inputPath) throw new Error('上一镜视频无法物化为本地文件');

    const width = options?.width ?? 320;
    const sourceKey = options?.sourceVideoKey || `${inputPath}:${sourceVideoFingerprint(source)}`;
    const cacheKey = `${resourceId}:${sourceKey}:${width}:${options?.tailOffsetMs ?? 80}`;
    const cached = this.tailFrameCache.get(cacheKey);
    if (cached) return cached;

    const api = getFFmpegAPI();
    if (!api || !(await this.isAvailable())) throw new Error('FFmpeg 不可用，无法截取上一镜尾帧');
    const info = await this.getMediaInfo(inputPath);
    if (!info.hasVideo || !Number.isFinite(info.duration) || info.duration <= 0) {
      throw new Error('上一镜没有已完成的真实视频，无法截取尾帧');
    }

    const durationSec = info.duration / 1000;
    // 片尾安全窗口：抽最后 ~0.5s、fps=10 再取最后一帧。
    // 旧实现只抽片尾前 ~80ms 且 fps=1，窗口内经常一帧都落不到（"未能提取真实尾帧"）。
    const windowSec = Math.min(durationSec, 0.5);
    const startTime = Math.max(0, durationSec - windowSec);
    const rootDir = await api.getCacheDir('video-tail-frames');
    const outputDir = `${rootDir}/${Math.abs(hashCode(cacheKey)).toString(36)}`;
    await api.ensureDir(outputDir);
    const frames = await api.extractFrames({
      input: inputPath,
      outputDir,
      fps: 10,
      startTime,
      endTime: durationSec,
      width,
      quality: 2,
    });
    const tailFrame = Array.isArray(frames) && frames.length > 0 ? frames[frames.length - 1] : undefined;
    if (!tailFrame) throw new Error('FFmpeg 未能从上一镜视频提取真实尾帧');
    this.tailFrameCache.set(cacheKey, tailFrame);
    return tailFrame;
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
      throw new Error('FFmpeg 不可用');
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
      throw new Error('FFmpeg 不可用');
    }

    return await api.splitAudio(input, output);
  }

  /**
   * 提取人声样本音轨（统一重编码成 wav，音色库/克隆直接可用）。
   * 与 splitAudio 不同：不做 `-acodec copy`，任何容器/编码的视频都能提。
   */
  async extractAudioTrack(options: {
    input: string;
    output: string;
    sampleRate?: number;
    channels?: number;
    startSeconds?: number;
    durationSeconds?: number;
  }): Promise<string> {
    const api = getFFmpegAPI();
    if (!api) {
      throw new Error('FFmpeg 不可用');
    }

    return await api.extractAudioTrack(options);
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
      const cached = this.frameCache.get(cacheKey)!;
      logger.info('[getFrames] memory cache hit', { resourceId, count: cached.length });
      return cached;
    }

    if (!this.cacheDir) {
      logger.warn('[getFrames] cacheDir 为空，init 是否成功？', { resourceId, filePath });
    }

    const inputPath = await this.#materializeInput(filePath);
    if (!inputPath) {
      logger.warn('[getFrames] 无法获取本地文件，跳过抽帧', { filePath: filePath.substring(0, 80) });
      return [];
    }

    const resourceCacheDir = `${this.cacheDir}/${resourceId}/frames`;
    logger.info('[getFrames] extracting', {
      resourceId,
      filePath: inputPath,
      outputDir: resourceCacheDir,
      timeRange,
    });

    const frames = await this.extractFrames({
      input: inputPath,
      outputDir: resourceCacheDir,
      fps: 1,
      startTime: timeRange?.[0],
      endTime: timeRange?.[1]
    });

    logger.info('[getFrames] extracted', {
      resourceId,
      count: Array.isArray(frames) ? frames.length : 0,
      first: Array.isArray(frames) ? frames[0] : undefined,
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
    this.tailFrameCache.clear();
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
   * 合成视频（图片序列 + 音频 -> 视频文件）。
   *
   * IPC 不支持 structuredClone Function，必须剥离 onProgress 后再传过桥。
   * 进度回调暂时丢弃；端到端进度由调用方在帧渲染阶段自行追踪即可。
   */
  async composeVideo(options: ComposeVideoOptions): Promise<string> {
    const api = getFFmpegAPI();
    if (!api) {
      throw new Error('FFmpeg 不可用');
    }

    const { onProgress: _onProgress, ...rest } = options;
    void _onProgress;
    return await api.composeVideo(rest);
  }

  async getCacheDir(subDir?: string): Promise<string> {
    await this.init();
    const api = getFFmpegAPI();
    if (api) {
      return await api.getCacheDir(subDir);
    }
    return subDir ? `/tmp/koma-ffmpeg/${subDir}` : '/tmp/koma-ffmpeg';
  }

  /**
   * 拼接多个视频 / 图片片段为单一 mp4。
   */
  async concatMediaClips(options: ConcatMediaClipOptions): Promise<string> {
    await this.init();
    const api = getFFmpegAPI();
    if (!api) {
      throw new Error('FFmpeg 不可用');
    }

    const available = await this.isAvailable();
    if (!available) {
      throw new Error('FFmpeg 不可用');
    }

    const { onProgress: _onProgress, ...rest } = options;
    void _onProgress;
    const result = await api.concatMediaClips(rest);
    // ee-core 的 ipcMain.handle 会吞掉主进程异常并返回 undefined（只写主进程日志），
    // 必须把"空返回"翻译回错误，否则调用方会把失败当成功
    if (typeof result !== 'string' || !result) {
      throw new Error('视频拼接失败：主进程未返回输出路径（详见主进程日志）');
    }
    return result;
  }

  /**
   * 顺序拼接多个音频片段为一个 mp3（多段配音合成）。
   * 与 concatMediaClips 互补：那条不支持纯音频输入（视频轨拼接 + 音轨混叠）。
   */
  async concatAudioClips(sources: string[], outputPath: string): Promise<string> {
    await this.init();
    const api = getFFmpegAPI();
    if (!api) {
      throw new Error('FFmpeg 不可用');
    }

    const available = await this.isAvailable();
    if (!available) {
      throw new Error('FFmpeg 不可用');
    }

    const result = await api.concatAudioClips({ sources, outputPath });
    if (typeof result !== 'string' || !result) {
      throw new Error('音频拼接失败：主进程未返回输出路径（详见主进程日志）');
    }
    return result;
  }

  /**
   * 裁剪单个视频片段，输出新的本地 mp4。
   */
  async trimVideo(options: TrimVideoOptions): Promise<string> {
    await this.init();
    const api = getFFmpegAPI();
    if (!api) {
      throw new Error('FFmpeg 不可用');
    }

    const available = await this.isAvailable();
    if (!available) {
      throw new Error('FFmpeg 不可用');
    }

    const result = await api.trimVideo(options);
    if (typeof result !== 'string' || !result) {
      throw new Error('视频裁剪失败：主进程未返回输出路径（详见主进程日志）');
    }
    return result;
  }

  /**
   * 高清放大单个视频，输出新的本地 mp4。
   */
  async upscaleVideo(options: UpscaleVideoOptions): Promise<string> {
    await this.init();
    const api = getFFmpegAPI();
    if (!api) {
      throw new Error('FFmpeg 不可用');
    }

    const available = await this.isAvailable();
    if (!available) {
      throw new Error('FFmpeg 不可用');
    }

    return await api.upscaleVideo(options);
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

function sourceVideoFingerprint(source: MediaAssetSource): string {
  if (typeof source === 'string') return source;
  return [source.providerTaskId, source.createdAt, source.durationMs, source.remoteUrl, source.localPath]
    .filter(value => value !== undefined && value !== '')
    .join(':');
}

// 单例
export const ffmpegManager = new FFmpegManager();
export default ffmpegManager;

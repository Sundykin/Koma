/**
 * FFmpeg 服务层
 * 负责视频处理任务：抽帧、波形生成、音视频分离、媒体信息获取等
 */
import * as path from 'path';
import * as fs from 'fs';
import { spawn, ChildProcess } from 'child_process';
import { app } from 'electron';

// 媒体信息接口
export interface MediaInfo {
  duration: number;      // 毫秒
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
  fps?: number;         // 每秒抽取帧数，默认 1
  startTime?: number;   // 开始时间（秒）
  endTime?: number;     // 结束时间（秒）
  width?: number;       // 输出宽度
  quality?: number;     // JPEG 质量 1-31（越小越好）
}

// 波形生成选项
export interface WaveformOptions {
  input: string;
  output: string;
  width?: number;       // 波形图宽度
  height?: number;      // 波形图高度
  color?: string;       // 波形颜色
  backgroundColor?: string;
}

// 视频编码选项
export interface EncodeVideoOptions {
  framesDir: string;        // 帧图片目录
  audioFiles?: string[];    // 音频文件列表
  outputPath: string;       // 输出路径
  fps?: number;             // 帧率，默认 24
  width?: number;           // 宽度，默认 1920
  height?: number;          // 高度，默认 1080
  videoBitrate?: number;    // 视频码率 kbps，默认 5000
  audioBitrate?: number;    // 音频码率 kbps，默认 192
  videoCodec?: 'h264' | 'h265' | 'vp9';
}

// 任务类型
type TaskType = 'getInfo' | 'extractFrames' | 'waveform' | 'splitAudio' | 'export';

// 任务定义
interface Task {
  id: string;
  type: TaskType;
  args: any;
  resolve: (value: any) => void;
  reject: (reason: any) => void;
  onProgress?: (progress: number) => void;
}

// 进度回调
export type ProgressCallback = (progress: number) => void;

/**
 * FFmpeg 服务
 */
export class FFmpegService {
  private ffmpegPath: string = '';
  private ffprobePath: string = '';
  private workDir: string = '';
  private taskQueue: Task[] = [];
  private runningTask: Task | null = null;
  private runningProcess: ChildProcess | null = null;
  private initialized: boolean = false;

  /**
   * 初始化服务
   */
  async init(workDir?: string): Promise<void> {
    if (this.initialized) return;

    // 设置工作目录
    this.workDir = workDir || path.join(app.getPath('userData'), 'ffmpeg-cache');
    await fs.promises.mkdir(this.workDir, { recursive: true });

    // 检测 FFmpeg 路径
    this.ffmpegPath = await this.detectFFmpegPath('ffmpeg');
    this.ffprobePath = await this.detectFFmpegPath('ffprobe');

    if (!this.ffmpegPath) {
      console.warn('[FFmpegService] FFmpeg not found, some features will be disabled');
    }

    this.initialized = true;
    console.log('[FFmpegService] Initialized', {
      ffmpeg: this.ffmpegPath,
      ffprobe: this.ffprobePath,
      workDir: this.workDir
    });
  }

  /**
   * 检测 FFmpeg 可执行文件路径
   */
  private async detectFFmpegPath(name: 'ffmpeg' | 'ffprobe'): Promise<string> {
    const isWin = process.platform === 'win32';
    const ext = isWin ? '.exe' : '';
    const execName = name + ext;

    // 候选路径列表
    const candidates: string[] = [
      // 1. 应用内置路径
      path.join(app.getAppPath(), 'resources', 'ffmpeg', execName),
      path.join(app.getAppPath(), '..', 'ffmpeg', execName),
      // 2. 用户数据目录
      path.join(app.getPath('userData'), 'ffmpeg', execName),
      // 3. 系统路径（通过 which/where 查找）
    ];

    // 检查候选路径
    for (const p of candidates) {
      try {
        await fs.promises.access(p, fs.constants.X_OK);
        return p;
      } catch {
        // 继续检查下一个
      }
    }

    // 尝试从系统 PATH 查找
    try {
      const result = await this.execCommand(isWin ? 'where' : 'which', [execName]);
      const systemPath = result.trim().split('\n')[0];
      if (systemPath) {
        await fs.promises.access(systemPath, fs.constants.X_OK);
        return systemPath;
      }
    } catch {
      // 系统中也没有
    }

    return '';
  }

  /**
   * 执行命令并返回输出
   */
  private execCommand(cmd: string, args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      const proc = spawn(cmd, args, { shell: true });
      let stdout = '';
      let stderr = '';

      proc.stdout?.on('data', (data) => { stdout += data.toString(); });
      proc.stderr?.on('data', (data) => { stderr += data.toString(); });

      proc.on('close', (code) => {
        if (code === 0) {
          resolve(stdout);
        } else {
          reject(new Error(stderr || `Command failed with code ${code}`));
        }
      });

      proc.on('error', reject);
    });
  }

  /**
   * 检查 FFmpeg 是否可用
   */
  isAvailable(): boolean {
    return !!this.ffmpegPath;
  }

  /**
   * 获取媒体信息
   */
  async getMediaInfo(input: string): Promise<MediaInfo> {
    return this.queueTask<MediaInfo>('getInfo', { input });
  }

  /**
   * 抽取视频帧
   */
  async extractFrames(options: ExtractFramesOptions): Promise<string[]> {
    return this.queueTask<string[]>('extractFrames', options);
  }

  /**
   * 生成音频波形图
   */
  async generateWaveform(options: WaveformOptions): Promise<string> {
    return this.queueTask<string>('waveform', options);
  }

  /**
   * 分离音频
   */
  async splitAudio(input: string, output: string): Promise<string> {
    return this.queueTask<string>('splitAudio', { input, output });
  }

  /**
   * 添加任务到队列
   */
  private queueTask<T>(type: TaskType, args: any, onProgress?: ProgressCallback): Promise<T> {
    return new Promise((resolve, reject) => {
      const task: Task = {
        id: `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        type,
        args,
        resolve,
        reject,
        onProgress
      };

      this.taskQueue.push(task);
      this.processQueue();
    });
  }

  /**
   * 处理任务队列
   */
  private async processQueue(): Promise<void> {
    if (this.runningTask || this.taskQueue.length === 0) return;

    const task = this.taskQueue.shift()!;
    this.runningTask = task;

    try {
      let result: any;
      switch (task.type) {
        case 'getInfo':
          result = await this.doGetMediaInfo(task.args.input);
          break;
        case 'extractFrames':
          result = await this.doExtractFrames(task.args);
          break;
        case 'waveform':
          result = await this.doGenerateWaveform(task.args);
          break;
        case 'splitAudio':
          result = await this.doSplitAudio(task.args.input, task.args.output);
          break;
        case 'export':
          result = await this.doEncodeVideo(task.args, task.onProgress);
          break;
        default:
          throw new Error(`Unknown task type: ${task.type}`);
      }
      task.resolve(result);
    } catch (err) {
      task.reject(err);
    } finally {
      this.runningTask = null;
      this.runningProcess = null;
      // 继续处理队列
      this.processQueue();
    }
  }

  /**
   * 实际获取媒体信息
   */
  private async doGetMediaInfo(input: string): Promise<MediaInfo> {
    if (!this.ffprobePath) {
      throw new Error('FFprobe not available');
    }

    const args = [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_format',
      '-show_streams',
      input
    ];

    const output = await this.runFFprobe(args);
    const data = JSON.parse(output);

    const videoStream = data.streams?.find((s: any) => s.codec_type === 'video');
    const audioStream = data.streams?.find((s: any) => s.codec_type === 'audio');
    const format = data.format;

    // 解析帧率
    let fps: number | undefined;
    if (videoStream?.r_frame_rate) {
      const [num, den] = videoStream.r_frame_rate.split('/').map(Number);
      fps = den ? num / den : num;
    }

    return {
      duration: parseFloat(format?.duration || '0') * 1000,
      width: videoStream?.width,
      height: videoStream?.height,
      fps,
      format: format?.format_name || '',
      videoCodec: videoStream?.codec_name,
      audioCodec: audioStream?.codec_name,
      bitrate: parseInt(format?.bit_rate || '0'),
      audioChannels: audioStream?.channels,
      audioSampleRate: parseInt(audioStream?.sample_rate || '0'),
      hasVideo: !!videoStream,
      hasAudio: !!audioStream
    };
  }

  /**
   * 实际抽帧
   */
  private async doExtractFrames(options: ExtractFramesOptions): Promise<string[]> {
    if (!this.ffmpegPath) {
      throw new Error('FFmpeg not available');
    }

    const {
      input,
      outputDir,
      fps = 1,
      startTime,
      endTime,
      width,
      quality = 5
    } = options;

    // 确保输出目录存在
    await fs.promises.mkdir(outputDir, { recursive: true });

    const args: string[] = [];

    // 输入选项
    if (startTime !== undefined) {
      args.push('-ss', startTime.toString());
    }
    args.push('-i', input);
    if (endTime !== undefined) {
      args.push('-t', (endTime - (startTime || 0)).toString());
    }

    // 视频过滤器
    const filters: string[] = [`fps=${fps}`];
    if (width) {
      filters.push(`scale=${width}:-1`);
    }
    args.push('-vf', filters.join(','));

    // 输出选项
    args.push('-q:v', quality.toString());
    args.push('-f', 'image2');
    args.push(path.join(outputDir, 'frame_%06d.jpg'));

    await this.runFFmpeg(args);

    // 返回生成的帧文件列表
    const files = await fs.promises.readdir(outputDir);
    return files
      .filter(f => f.startsWith('frame_') && f.endsWith('.jpg'))
      .sort()
      .map(f => path.join(outputDir, f));
  }

  /**
   * 实际生成波形
   */
  private async doGenerateWaveform(options: WaveformOptions): Promise<string> {
    if (!this.ffmpegPath) {
      throw new Error('FFmpeg not available');
    }

    const {
      input,
      output,
      width = 1800,
      height = 140,
      color = '0x4a9eff',
      backgroundColor = '0x1a1a2e'
    } = options;

    // 确保输出目录存在
    await fs.promises.mkdir(path.dirname(output), { recursive: true });

    const args = [
      '-i', input,
      '-filter_complex',
      `aformat=channel_layouts=mono,showwavespic=s=${width}x${height}:colors=${color}:split_channels=0`,
      '-frames:v', '1',
      '-y',
      output
    ];

    await this.runFFmpeg(args);
    return output;
  }

  /**
   * 实际分离音频
   */
  private async doSplitAudio(input: string, output: string): Promise<string> {
    if (!this.ffmpegPath) {
      throw new Error('FFmpeg not available');
    }

    // 确保输出目录存在
    await fs.promises.mkdir(path.dirname(output), { recursive: true });

    const args = [
      '-i', input,
      '-vn',              // 不要视频
      '-acodec', 'copy',  // 音频直接复制
      '-y',
      output
    ];

    await this.runFFmpeg(args);
    return output;
  }

  /**
   * 运行 FFmpeg 命令
   */
  private runFFmpeg(args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      console.log('[FFmpegService] Running:', this.ffmpegPath, args.join(' '));

      const proc = spawn(this.ffmpegPath, args);
      this.runningProcess = proc;

      let stderr = '';

      proc.stderr?.on('data', (data) => {
        stderr += data.toString();
        // 解析进度
        this.parseProgress(data.toString());
      });

      proc.on('close', (code) => {
        if (code === 0) {
          resolve('');
        } else {
          reject(new Error(`FFmpeg failed: ${stderr}`));
        }
      });

      proc.on('error', reject);
    });
  }

  /**
   * 运行 FFprobe 命令
   */
  private runFFprobe(args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      console.log('[FFmpegService] Running:', this.ffprobePath, args.join(' '));

      const proc = spawn(this.ffprobePath, args);
      this.runningProcess = proc;

      let stdout = '';
      let stderr = '';

      proc.stdout?.on('data', (data) => { stdout += data.toString(); });
      proc.stderr?.on('data', (data) => { stderr += data.toString(); });

      proc.on('close', (code) => {
        if (code === 0) {
          resolve(stdout);
        } else {
          reject(new Error(`FFprobe failed: ${stderr}`));
        }
      });

      proc.on('error', reject);
    });
  }

  /**
   * 解析 FFmpeg 进度输出
   */
  private parseProgress(output: string): void {
    if (!this.runningTask?.onProgress) return;

    // 解析 time=00:01:23.45 格式
    const timeMatch = output.match(/time=(\d{2}):(\d{2}):(\d{2})\.(\d{2})/);
    if (timeMatch) {
      const [, h, m, s, ms] = timeMatch.map(Number);
      const currentTime = h * 3600 + m * 60 + s + ms / 100;
      // 这里需要知道总时长才能计算进度，暂时不实现
    }
  }

  /**
   * 取消当前任务
   */
  cancelCurrentTask(): void {
    if (this.runningProcess) {
      this.runningProcess.kill('SIGKILL');
      this.runningProcess = null;
    }
  }

  /**
   * 清空任务队列
   */
  clearQueue(): void {
    for (const task of this.taskQueue) {
      task.reject(new Error('Task cancelled'));
    }
    this.taskQueue = [];
    this.cancelCurrentTask();
  }

  /**
   * 获取缓存目录
   */
  getCacheDir(subDir?: string): string {
    const dir = subDir ? path.join(this.workDir, subDir) : this.workDir;
    return dir;
  }

  /**
   * 编码视频（公共方法）
   * @param options 编码选项
   * @param onProgress 进度回调 0-100
   */
  async encodeVideo(options: EncodeVideoOptions, onProgress?: ProgressCallback): Promise<string> {
    return this.queueTask<string>('export', options, onProgress);
  }

  /**
   * 实际编码视频：将帧图片序列 + 音频合成为视频
   */
  private async doEncodeVideo(options: EncodeVideoOptions, onProgress?: ProgressCallback): Promise<string> {
    if (!this.ffmpegPath) {
      throw new Error('FFmpeg not available');
    }

    const {
      framesDir,
      audioFiles,
      outputPath,
      fps = 24,
      width = 1920,
      height = 1080,
      videoBitrate = 5000,
      audioBitrate = 192,
      videoCodec = 'h264',
    } = options;

    // 确保输出目录存在
    await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });

    const args: string[] = [];

    // 输入帧序列
    args.push('-framerate', fps.toString());
    args.push('-i', path.join(framesDir, 'frame_%06d.png'));

    // 输入音频文件（如果有）
    if (audioFiles && audioFiles.length > 0) {
      for (const audio of audioFiles) {
        args.push('-i', audio);
      }
    }

    // 视频编码设置
    const codecMap: Record<string, string> = { h264: 'libx264', h265: 'libx265', vp9: 'libvpx-vp9' };
    args.push('-c:v', codecMap[videoCodec] || 'libx264');
    args.push('-b:v', `${videoBitrate}k`);
    args.push('-pix_fmt', 'yuv420p');
    args.push('-s', `${width}x${height}`);

    // 音频编码
    if (audioFiles && audioFiles.length > 0) {
      args.push('-c:a', 'aac');
      args.push('-b:a', `${audioBitrate}k`);
      // 如果有多个音频，混合
      if (audioFiles.length > 1) {
        const filterInputs = audioFiles.map((_, i) => `[${i + 1}:a]`).join('');
        args.push('-filter_complex', `${filterInputs}amix=inputs=${audioFiles.length}[aout]`);
        args.push('-map', '0:v');
        args.push('-map', '[aout]');
      }
    } else {
      args.push('-an'); // 无音频
    }

    args.push('-y', outputPath);

    // 执行编码
    await this.runFFmpeg(args);

    // 通知完成
    onProgress?.(100);

    return outputPath;
  }

  /**
   * 将 Base64 帧数据保存到临时目录
   */
  async saveFramesToDir(frames: string[], subDir?: string): Promise<string> {
    const framesDir = path.join(this.workDir, subDir || `frames-${Date.now()}`);
    await fs.promises.mkdir(framesDir, { recursive: true });

    for (let i = 0; i < frames.length; i++) {
      const frameData = frames[i].replace(/^data:image\/\w+;base64,/, '');
      const buffer = Buffer.from(frameData, 'base64');
      const framePath = path.join(framesDir, `frame_${String(i).padStart(6, '0')}.png`);
      await fs.promises.writeFile(framePath, buffer);
    }

    return framesDir;
  }

  /**
   * 清理缓存
   */
  async clearCache(subDir?: string): Promise<void> {
    const dir = this.getCacheDir(subDir);
    try {
      await fs.promises.rm(dir, { recursive: true, force: true });
      await fs.promises.mkdir(dir, { recursive: true });
    } catch (err) {
      console.error('[FFmpegService] Clear cache failed:', err);
    }
  }
}

// 单例
export const ffmpegService = new FFmpegService();

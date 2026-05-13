/**
 * RecreationModifyService — R4 二创：修改单单项执行器集合（主进程侧）。
 *
 * 渲染进程的 RecreationModifyService fulfiller 按 kind 派发到本服务的方法：
 *   - runAspectRatio: 本地 ffmpeg crop+pad，纯离线，0 channel 消耗
 *   - runLanguageDub: 复用 TTS channel；时间轴对齐留 TODO
 *   - runStylization / runWardrobe: 逐帧 TTI 重绘 → composeVideo 拼回（实验性）
 *
 * 每个 executor 完成后：把产物文件写到 ~/.koma/recreation/derived/<derivedId>.mp4
 * → recreationVideosService.insertDerived 落库 → 返回 { derivedVideoId, derivedKind }
 *
 * face_swap / body_reshape 不在此服务内实装：UI 层禁用按钮，不会有任务进来。
 */
import * as path from 'node:path';
import * as fsp from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { logger } from 'ee-core/log';

import { getRecreationDerivedDir } from './paths';
import { recreationVideosService } from './recreationVideos';
import { ffmpegService } from './ffmpeg';
import type { RecreationVideo } from './recreationVideos';

export interface ModifyExecutorInput {
  videoId: string;
  planId: string;
  itemId: string;
  kind: string;
  params: Record<string, unknown>;
  sourceTaskId: string;
}

export interface ModifyExecutorResult {
  derivedVideoId: string;
  derivedKind: string;
  filePath: string;
}

type AspectPreset = '16:9' | '9:16' | '1:1' | '4:3' | '3:4';
const ASPECT_RATIOS: Record<AspectPreset, number> = {
  '16:9': 16 / 9,
  '9:16': 9 / 16,
  '1:1': 1,
  '4:3': 4 / 3,
  '3:4': 3 / 4,
};

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const cmd = (ffmpegService as any).ffmpegPath || 'ffmpeg';
    if (!cmd) {
      reject(new Error('FFmpeg 不可用'));
      return;
    }
    logger.info('[recreationModify] spawn ffmpeg', { cmd, args });
    const proc = spawn(cmd, args, { shell: false });
    let stderr = '';
    proc.stderr?.on('data', (d) => { stderr += d.toString(); });
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg 失败 (code=${code}): ${stderr.slice(-500)}`));
    });
    proc.on('error', reject);
  });
}

/**
 * 抽出源视频音轨为 m4a，供 styliz/wardrobe 拼回视频时复用，
 * 也供 dub 暂存源音轨（虽然 dub 用新合成的，但留个文件用于失败回滚）。
 */
async function extractAudio(srcVideo: string, outPath: string): Promise<void> {
  await runFfmpeg([
    '-y',
    '-i', srcVideo,
    '-vn',
    '-c:a', 'aac',
    '-b:a', '128k',
    outPath,
  ]);
}

/**
 * 替换音轨：保留源视频画面 + 新音频。视频流 copy，音频 aac。
 * 若新音频比视频长 → 截掉超出部分；短 → 用 -shortest 让视频按音频长度截尾（dub 用）。
 */
async function muxAudio(srcVideo: string, newAudioPath: string, outPath: string): Promise<void> {
  await runFfmpeg([
    '-y',
    '-i', srcVideo,
    '-i', newAudioPath,
    '-map', '0:v:0',
    '-map', '1:a:0',
    '-c:v', 'copy',
    '-c:a', 'aac',
    '-b:a', '128k',
    '-shortest',
    outPath,
  ]);
}

/**
 * 图片序列 + 音频 → 视频。styliz / wardrobe 用：N 张帧 + 原音轨重组。
 * 帧目录约定：所有帧用 `frame-%05d.jpg` 命名，按字典序顺序即时间顺序。
 *
 * audioPath 传 null 时只合视频不挂音频（少见，留口子）。
 */
async function recombineFrames(
  frameDir: string,
  framePattern: string,
  audioPath: string | null,
  outPath: string,
  fps: number,
): Promise<void> {
  const args = [
    '-y',
    '-framerate', String(fps),
    '-i', path.join(frameDir, framePattern),
  ];
  if (audioPath) {
    args.push('-i', audioPath);
  }
  args.push(
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-crf', '20',
    '-pix_fmt', 'yuv420p',
  );
  if (audioPath) {
    args.push('-c:a', 'aac', '-b:a', '128k', '-shortest');
  }
  args.push(outPath);
  await runFfmpeg(args);
}

async function ensureSourceVideo(videoId: string): Promise<RecreationVideo> {
  const v = recreationVideosService.getById(videoId);
  if (!v) throw new Error(`源视频不存在: ${videoId}`);
  if (!v.filePath) throw new Error(`源视频路径丢失: ${videoId}`);
  return v;
}

export class RecreationModifyService {
  /**
   * aspect_ratio：把视频转成目标比例。
   *
   * 策略：
   *   - 'fit'（默认）: scale 内嵌 + 黑边 pad，不裁剪不变形
   *   - 'fill': 居中裁剪，画面充满目标比例（可能裁掉边缘内容）
   *
   * 输出分辨率：以源视频短边为基准，长边按目标比例算，最后对齐到偶数像素（ffmpeg 要求）。
   */
  async runAspectRatio(input: ModifyExecutorInput): Promise<ModifyExecutorResult> {
    const src = await ensureSourceVideo(input.videoId);
    const target = String(input.params.targetRatio ?? '9:16') as AspectPreset;
    const mode = String(input.params.mode ?? 'fit') as 'fit' | 'fill';
    if (!(target in ASPECT_RATIOS)) {
      throw new Error(`不支持的目标比例: ${target}`);
    }
    if (!src.width || !src.height) {
      throw new Error('源视频缺少分辨率元数据，无法计算目标尺寸');
    }
    const ratio = ASPECT_RATIOS[target];
    let outW: number;
    let outH: number;
    // 短边对齐到 720（移动端友好）
    const shortEdge = 720;
    if (ratio >= 1) {
      outH = shortEdge;
      outW = Math.round(outH * ratio);
    } else {
      outW = shortEdge;
      outH = Math.round(outW / ratio);
    }
    outW = outW - (outW % 2);
    outH = outH - (outH % 2);

    let vf: string;
    if (mode === 'fill') {
      // 居中裁剪：先 scale 让短边充满目标，再 crop 居中
      vf = `scale=${outW}:${outH}:force_original_aspect_ratio=increase,crop=${outW}:${outH}`;
    } else {
      // fit: scale 内嵌 + 黑边 pad
      vf = `scale=${outW}:${outH}:force_original_aspect_ratio=decrease,pad=${outW}:${outH}:(ow-iw)/2:(oh-ih)/2:color=black`;
    }

    const outDir = getRecreationDerivedDir();
    await fsp.mkdir(outDir, { recursive: true });
    const outName = `${input.itemId}-${Date.now()}.mp4`;
    const outPath = path.join(outDir, outName);

    await runFfmpeg([
      '-y',
      '-i', src.filePath,
      '-vf', vf,
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-crf', '20',
      '-c:a', 'copy',
      outPath,
    ]);

    const filename = `${src.filename.replace(/\.[^.]+$/, '')}-${target}-${mode}.mp4`;
    const derived = await recreationVideosService.insertDerived({
      parentId: input.videoId,
      derivedFromPlanId: input.planId,
      derivedKind: 'aspect_ratio',
      sourceTaskId: input.sourceTaskId,
      filePath: outPath,
      filename,
    });
    return { derivedVideoId: derived.id, derivedKind: 'aspect_ratio', filePath: outPath };
  }

  /**
   * language_dub：renderer 已经把 TTS 合成的音频写到 audioPath（在主进程 fs 上），
   * 这里只做 ffmpeg 替音轨 + 落库。
   */
  async runLanguageDubMux(input: ModifyExecutorInput & { audioPath: string }): Promise<ModifyExecutorResult> {
    const src = await ensureSourceVideo(input.videoId);
    if (!input.audioPath) throw new Error('language_dub: audioPath 缺失');
    try {
      const stat = await fsp.stat(input.audioPath);
      if (!stat.isFile()) throw new Error('non-file');
    } catch {
      throw new Error(`language_dub: 音频文件不存在: ${input.audioPath}`);
    }

    const outDir = getRecreationDerivedDir();
    await fsp.mkdir(outDir, { recursive: true });
    const outName = `${input.itemId}-${Date.now()}.mp4`;
    const outPath = path.join(outDir, outName);

    await muxAudio(src.filePath, input.audioPath, outPath);

    const lang = String(input.params.targetLang ?? 'dub');
    const filename = `${src.filename.replace(/\.[^.]+$/, '')}-${lang}.mp4`;
    const derived = await recreationVideosService.insertDerived({
      parentId: input.videoId,
      derivedFromPlanId: input.planId,
      derivedKind: 'language_dub',
      sourceTaskId: input.sourceTaskId,
      filePath: outPath,
      filename,
    });
    return { derivedVideoId: derived.id, derivedKind: 'language_dub', filePath: outPath };
  }

  /**
   * 抽帧：默认按源视频原生 FPS 全帧抽取（最大还原度），逐帧 TTI 改写后按相同 FPS 拼回。
   *
   * 注意：30 秒 24fps 视频 = 720 张图；按现代多模态模型 ~3 秒/张推断，
   * 总耗时 ~36 分钟、成本视 channel 而定。客户优先要还原度，由调用方知会用户。
   *
   * input.fps：可选；不传或 <= 0 时取源视频元数据里的 fps；都没有时回退到 24。
   */
  async prepareFrameByFrame(input: { videoId: string; fps?: number }): Promise<{
    frameDir: string;
    framePaths: string[];
    audioPath: string;
    width: number;
    height: number;
    fps: number;
  }> {
    const src = await ensureSourceVideo(input.videoId);
    const fps = input.fps && input.fps > 0
      ? input.fps
      : (src.fps && src.fps > 0 ? src.fps : 24);
    const sessionId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const baseDir = path.join(getRecreationDerivedDir(), '.tmp', sessionId);
    const frameDir = path.join(baseDir, 'frames');
    await fsp.mkdir(frameDir, { recursive: true });

    // 抽帧到 frame-00001.jpg ... 序列文件名约定
    // 关键：不再用 fps=X 滤镜（那是采样率），改成不过滤直接出全部帧 = 视频原生帧序列
    await runFfmpeg([
      '-y',
      '-i', src.filePath,
      '-vsync', '0',
      '-q:v', '3',
      path.join(frameDir, 'frame-%05d.jpg'),
    ]);
    const files = (await fsp.readdir(frameDir)).filter((n) => n.startsWith('frame-') && n.endsWith('.jpg')).sort();
    const framePaths = files.map((n) => path.join(frameDir, n));
    if (framePaths.length === 0) throw new Error('抽帧失败：未产出任何帧');
    logger.info('[recreationModify] prepareFrameByFrame', { count: framePaths.length, fps, videoId: input.videoId });

    const audioPath = path.join(baseDir, 'audio.m4a');
    try {
      await extractAudio(src.filePath, audioPath);
    } catch (err) {
      logger.warn('[recreationModify] extractAudio failed (无音轨视频)', err);
    }

    return {
      frameDir,
      framePaths,
      audioPath,
      width: src.width ?? 0,
      height: src.height ?? 0,
      fps,
    };
  }

  /**
   * 拼回：renderer 已经把每张修改后的帧覆盖写到 frame-%05d.jpg 同名位置，
   * 调本方法重组成视频 + 拼回原音轨 + 落库。
   */
  async runFrameByFrameCompose(input: ModifyExecutorInput & {
    frameDir: string;
    audioPath: string | null;
    fps: number;
  }): Promise<ModifyExecutorResult> {
    const src = await ensureSourceVideo(input.videoId);
    const outDir = getRecreationDerivedDir();
    await fsp.mkdir(outDir, { recursive: true });
    const outName = `${input.itemId}-${Date.now()}.mp4`;
    const outPath = path.join(outDir, outName);

    // 检查 audioPath 是否存在；若源视频无音轨则 audioPath 文件不存在
    let usableAudio: string | null = null;
    if (input.audioPath) {
      try {
        const stat = await fsp.stat(input.audioPath);
        if (stat.isFile() && stat.size > 0) usableAudio = input.audioPath;
      } catch { /* no audio */ }
    }

    await recombineFrames(input.frameDir, 'frame-%05d.jpg', usableAudio, outPath, input.fps);

    // 清理临时帧目录（保留 outPath）
    void fsp.rm(path.dirname(input.frameDir), { recursive: true, force: true }).catch(() => undefined);

    const tag = input.kind === 'wardrobe' ? 'wardrobe' : 'styliz';
    const filename = `${src.filename.replace(/\.[^.]+$/, '')}-${tag}.mp4`;
    const derived = await recreationVideosService.insertDerived({
      parentId: input.videoId,
      derivedFromPlanId: input.planId,
      derivedKind: input.kind,
      sourceTaskId: input.sourceTaskId,
      filePath: outPath,
      filename,
    });
    return { derivedVideoId: derived.id, derivedKind: input.kind, filePath: outPath };
  }
}

export const recreationModifyService = new RecreationModifyService();

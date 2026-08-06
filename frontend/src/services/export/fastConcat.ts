/**
 * 快速拼接导出分析：判断时间轴能否跳过逐帧渲染、直接按片段顺序 ffmpeg 拼接。
 *
 * 背景：SimpleExportRenderer 是 canvas 逐帧渲染 → PNG 序列 → ffmpeg 合成，
 * 几分钟的成片要渲几千帧，非常慢。成熟剪辑软件（Premiere 智能渲染 / 剪映
 * 快速导出）在"片段无特效叠加"时走直接拼接 —— 本模块就是那个资格判定。
 *
 * 合格条件：
 *   - 仅一条视频轨有内容（多轨叠加需要合成，不支持）
 *   - 视频/图片片段：无关键帧、无滤镜、无动画、无蒙版、无变换（位移/缩放/旋转/透明度）
 *   - 无转场、无文字轨内容（字幕烧录需要渲染，走逐帧路径）
 *   - 音频片段：源为本地文件即可——按时间轴位置 adelay 定位混入（v2 起支持）
 *   - 片段源可解析为本地文件（koma-local:// 或绝对路径；远程 URL 需先落盘）
 *   - 时间轴上视频片段互不重叠
 */
import { MediaType, type Clip, type Track } from '../../types/editor';
import { fromKomaLocalUrl } from '../../utils/urlUtils';
import type { ConcatMediaClipOptions } from '../ffmpegManager';

export interface FastConcatAnalysis {
  eligible: boolean;
  /** 不合格原因（人读，给用户解释为什么不能快速导出） */
  reasons: string[];
  /** 合格时的拼接片段（按时间轴顺序，音频段带定位信息在尾部） */
  clips: ConcatMediaClipOptions['clips'];
  /** 参与的视频片段数 */
  videoClipCount: number;
  /** 文字片段（合格时用于构建 ASS 硬字幕烧录） */
  textClips: Clip[];
}

/** 片段是否处于"原始呈现"状态（无变换/无特效/无动画） */
function isClipPlain(clip: Clip): boolean {
  if (clip.keyframes?.length) return false;
  if (clip.filter || clip.mask) return false;
  if (clip.animations?.length) return false;
  if (clip.x !== 0 || clip.y !== 0) return false;
  if (clip.scale !== 1 && clip.scale !== undefined) return false;
  if (clip.rotation !== 0 && clip.rotation !== undefined) return false;
  if (clip.opacity !== 1 && clip.opacity !== undefined) return false;
  return true;
}

/** 解析片段源为本地文件路径；不可解析返回 null */
export function resolveClipLocalPath(source: string | undefined): string | null {
  const raw = String(source || '').trim();
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return null; // 远程源需要先落盘
  if (raw.startsWith('koma-local://')) {
    const path = fromKomaLocalUrl(raw);
    return path || null;
  }
  if (raw.startsWith('/')) return raw;
  if (/^[a-zA-Z]:[\\/]/.test(raw)) return raw; // Windows 盘符
  return null;
}

export function analyzeTimelineForFastConcat(tracks: Track[]): FastConcatAnalysis {
  const reasons: string[] = [];
  const clips: ConcatMediaClipOptions['clips'] = [];

  const activeTracks = tracks.filter(track => !track.hidden);
  const videoTracks = activeTracks.filter(track => track.type === 'video' && track.clips.length > 0);
  // 文字片段收集（有内容的才参与 ASS 烧录）
  const textClips = activeTracks
    .filter(track => track.type === 'text')
    .flatMap(track => track.clips)
    .filter(clip => String(clip.text || '').trim());
  const audioTrackClips = activeTracks
    .filter(track => track.type === 'audio')
    .flatMap(track => track.clips);
  const transitionCount = activeTracks
    .reduce((sum, track) => sum + (track.transitions?.length ?? 0), 0);

  if (transitionCount > 0) reasons.push('含转场');
  if (videoTracks.length === 0) reasons.push('没有视频片段');
  if (videoTracks.length > 1) reasons.push('多条视频轨叠加需要合成');

  let orderedClips: Clip[] = [];
  if (videoTracks.length === 1) {
    orderedClips = [...videoTracks[0].clips].sort((a, b) => a.start - b.start);
    for (let i = 1; i < orderedClips.length; i += 1) {
      if (orderedClips[i].start < orderedClips[i - 1].start + orderedClips[i - 1].duration - 1e-6) {
        reasons.push('片段时间上重叠');
        break;
      }
    }
  }

  const audioClipsOut: ConcatMediaClipOptions['clips'] = [];
  for (const audioClip of audioTrackClips) {
    if (audioClip.audioFade) {
      reasons.push(`音频片段「${audioClip.name}」带淡入淡出`);
      continue;
    }
    const localPath = resolveClipLocalPath(audioClip.src);
    if (!localPath) {
      reasons.push(`音频片段「${audioClip.name}」的源不是本地文件`);
      continue;
    }
    audioClipsOut.push({
      kind: 'audio',
      source: localPath,
      offsetSec: Math.max(0, audioClip.offset || 0),
      durationSec: Math.max(0.1, audioClip.duration),
      startSec: Math.max(0, audioClip.start),
      label: audioClip.name,
    });
  }

  for (const clip of orderedClips) {
    if (clip.type !== MediaType.VIDEO && clip.type !== MediaType.IMAGE) {
      reasons.push(`片段「${clip.name}」不是视频/图片`);
      continue;
    }
    if (!isClipPlain(clip)) {
      reasons.push(`片段「${clip.name}」带特效/动画/变换`);
      continue;
    }
    const localPath = resolveClipLocalPath(clip.src);
    if (!localPath) {
      reasons.push(`片段「${clip.name}」的源不是本地文件`);
      continue;
    }
    clips.push({
      kind: clip.type === MediaType.IMAGE ? 'image' : 'video',
      source: localPath,
      offsetSec: clip.type === MediaType.VIDEO ? Math.max(0, clip.offset || 0) : undefined,
      durationSec: Math.max(0.1, clip.duration),
      label: clip.name,
    });
  }

  return {
    eligible: reasons.length === 0 && clips.length > 0,
    reasons: Array.from(new Set(reasons)),
    clips: [...clips, ...audioClipsOut],
    videoClipCount: clips.length,
    textClips,
  };
}

// ---------------------------------------------------------------------------
// 时间轴空缺检测（导出黑场预防）
// ---------------------------------------------------------------------------

export interface TimelineGap {
  /** 空缺起点（秒） */
  start: number;
  /** 空缺终点（秒） */
  end: number;
}

/**
 * 检测主视频轨未覆盖的时间轴空缺——这些位置导出会是黑场。
 * 合并 clip 覆盖区间后找 [0, duration] 内空隙；主轨无视频则整段空缺。
 */
export function detectTimelineGaps(tracks: Track[], duration: number): TimelineGap[] {
  const main = tracks.find(t => t.type === 'video' && t.isMainTrack) ?? tracks.find(t => t.type === 'video');
  const clips = main?.clips ?? [];
  if (clips.length === 0) {
    return duration > 0 ? [{ start: 0, end: duration }] : [];
  }
  const ranges = clips
    .map(c => [c.start, c.start + c.duration] as const)
    .sort((a, b) => a[0] - b[0]);
  const gaps: TimelineGap[] = [];
  let cursor = 0;
  for (const [start, end] of ranges) {
    if (start > cursor + 0.05) {
      gaps.push({ start: Math.round(cursor * 10) / 10, end: Math.round(start * 10) / 10 });
    }
    cursor = Math.max(cursor, end);
  }
  if (cursor < duration - 0.05) {
    gaps.push({ start: Math.round(cursor * 10) / 10, end: Math.round(duration * 10) / 10 });
  }
  return gaps;
}

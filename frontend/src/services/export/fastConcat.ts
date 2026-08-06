/**
 * 快速拼接导出分析：判断时间轴能否跳过逐帧渲染、直接按片段顺序 ffmpeg 拼接。
 *
 * 背景：SimpleExportRenderer 是 canvas 逐帧渲染 → PNG 序列 → ffmpeg 合成，
 * 几分钟的成片要渲几千帧，非常慢。成熟剪辑软件（Premiere 智能渲染 / 剪映
 * 快速导出）在"片段无特效叠加"时走直接拼接 —— 本模块就是那个资格判定。
 *
 * 合格条件（v1 严格版）：
 *   - 仅主视频轨有内容（多轨叠加需要合成，不支持）
 *   - 视频/图片片段：无关键帧、无滤镜、无动画、无蒙版、无变换（位移/缩放/旋转/透明度）
 *   - 无转场、无文字轨内容、无音频轨内容（独立音轨需要时间轴定位，v1 不支持）
 *   - 片段源可解析为本地文件（koma-local:// 或绝对路径；远程 URL 需先落盘）
 *   - 时间轴上片段互不重叠
 */
import { MediaType, type Clip, type Track } from '../../types/editor';
import { fromKomaLocalUrl } from '../../utils/urlUtils';
import type { ConcatMediaClipOptions } from '../ffmpegManager';

export interface FastConcatAnalysis {
  eligible: boolean;
  /** 不合格原因（人读，给用户解释为什么不能快速导出） */
  reasons: string[];
  /** 合格时的拼接片段（按时间轴顺序） */
  clips: ConcatMediaClipOptions['clips'];
  /** 参与的视频片段数 */
  videoClipCount: number;
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
  const textClipCount = activeTracks
    .filter(track => track.type === 'text')
    .reduce((sum, track) => sum + track.clips.length, 0);
  const audioClipCount = activeTracks
    .filter(track => track.type === 'audio')
    .reduce((sum, track) => sum + track.clips.length, 0);
  const transitionCount = activeTracks
    .reduce((sum, track) => sum + (track.transitions?.length ?? 0), 0);

  if (textClipCount > 0) reasons.push('含字幕/文字片段');
  if (audioClipCount > 0) reasons.push('含独立音频片段（配音/配乐需要时间轴定位）');
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
    clips,
    videoClipCount: clips.length,
  };
}

/**
 * Filmstrip —— 时间轴片段内容预览（文字横幅 / 音频波形 / 视频帧条）。
 * 从 SimpleTimeline.tsx 拆出。
 */
import React from 'react';
import { Clip, MediaType } from '../../types/editor';
import { toKomaLocalUrl } from '../../utils/urlUtils';
import { cssVars } from '../../theme/runtime';
import { CLIP_HEIGHT } from './timelineUtils';
import styles from './SimpleTimeline.module.scss';

/**
 * 确定性波形高度（20%–100%）：以片段 id + 柱序号为种子。
 * 原来用 Math.random() 每轮渲染都变，波形在任意状态变化时闪烁；
 * 成熟剪辑软件的波形占位是稳定的（真实波形数据接入前先用确定性伪随机）。
 */
export function stableWaveformHeight(clipId: string, barIndex: number): number {
  let seed = barIndex + 1;
  for (let i = 0; i < clipId.length; i += 1) {
    seed = (seed * 31 + clipId.charCodeAt(i)) % 2147483647;
  }
  // LCG 推进一步打散相邻柱的相关性
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return 20 + (seed / 2147483648) * 80;
}

export const Filmstrip: React.FC<{ clip: Clip; frames?: string[]; pixelsPerSecond: number }> = ({ clip, frames, pixelsPerSecond }) => {
  if (clip.type === MediaType.TEXT) {
    return (
      <div className="w-full h-full flex items-center px-2 pointer-events-none overflow-hidden bg-accent/15">
        <span className="text-[10px] text-text-primary truncate">{clip.name}</span>
      </div>
    );
  }

  if (clip.type === MediaType.AUDIO) {
    return (
      <div className="w-full h-full flex items-center overflow-hidden bg-status-success/14 pointer-events-none px-1">
        <div className="flex gap-0.5 h-1/2 w-full items-center">
          {Array.from({ length: Math.ceil(clip.duration * 5) }).map((_, i) => (
            <div
              key={i}
              className={`${styles.waveformBar} w-1 bg-status-success/50 rounded-full flex-shrink-0`}
              style={cssVars({ '--waveform-height': `${stableWaveformHeight(clip.id, i)}%` })}
            />
          ))}
        </div>
        <span className="absolute left-2 text-[10px] text-text-secondary drop-shadow truncate">{clip.name}</span>
      </div>
    );
  }

  const frameAspectRatio = 16 / 9;
  const frameWidth = CLIP_HEIGHT * frameAspectRatio;
  const totalWidth = clip.duration * pixelsPerSecond;
  const frameCount = Math.max(1, Math.ceil(totalWidth / frameWidth));

  const hasFrames = frames && frames.length > 0;
  const fallbackSrc = toKomaLocalUrl(clip.src);

  // 帧提取的帧率（与 useVideoFrames 中一致，默认 1fps）
  const extractFps = 1;
  // 每个显示格子对应的时间跨度（秒）
  const timePerFrame = frameWidth / pixelsPerSecond;

  return (
    <div className="flex h-full w-full pointer-events-none select-none overflow-hidden bg-status-info/10">
      {Array.from({ length: frameCount }).map((_, i) => {
        // 计算该位置对应的片段内时间（秒）
        const positionTime = i * timePerFrame;
        // 根据时间计算应显示的帧索引
        let frameIndex = Math.floor(positionTime * extractFps);
        // 确保不越界
        if (hasFrames) {
          frameIndex = Math.min(frameIndex, frames.length - 1);
        }
        const frameSrc = hasFrames ? frames[frameIndex] : fallbackSrc;

        return (
          <div
            key={i}
            className={`${styles.filmFrame} flex-shrink-0 h-full border-r border-white/20 relative bg-bg-elevated`}
            style={cssVars({ '--film-frame-width': `${frameWidth}px` })}
          >
            <img
              src={frameSrc}
              className="w-full h-full object-cover opacity-90 relative z-10"
              alt=""
              draggable={false}
              loading="lazy"
              decoding="async"
            />
            <div className="absolute inset-0 bg-gradient-to-br from-accent/20 to-accent/10" />
          </div>
        );
      })}
      <span className="absolute top-1 left-2 text-[10px] text-white font-medium truncate px-1 drop-shadow-md z-10 bg-black/40 rounded">
        {clip.name}
      </span>
    </div>
  );
};

export default Filmstrip;

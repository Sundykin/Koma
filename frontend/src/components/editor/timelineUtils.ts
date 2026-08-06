/**
 * SimpleTimeline 纯逻辑工具：刻度/时间格式化/吸附点计算/布局常量。
 * 从 SimpleTimeline.tsx 拆出，纯函数便于独立测试与复用。
 */

// ---------------------------------------------------------------------------
// 布局常量
// ---------------------------------------------------------------------------

export const BASE_PIXELS_PER_SECOND = 20;
export const TRACK_HEIGHT = 80;
export const CLIP_HEIGHT = 64;
export const RULER_HEIGHT = 32;
export const HEADER_WIDTH = 200;
export const DRAG_THRESHOLD = 5;

export const ZOOM_MIN = 0.1;
export const ZOOM_MAX = 5;
export const ZOOM_STEP = 0.1;
export const ZOOM_PRESETS = [0.25, 0.5, 1, 2, 3];

/** 吸附像素距离阈值 */
export const SNAP_THRESHOLD = 8;

// ---------------------------------------------------------------------------
// 刻度与时间
// ---------------------------------------------------------------------------

/** 根据缩放级别自动调整刻度间隔（秒） */
export const getMarkerInterval = (pixelsPerSecond: number): number => {
  if (pixelsPerSecond >= 100) return 1;    // 每秒一个
  if (pixelsPerSecond >= 50) return 2;     // 每2秒
  if (pixelsPerSecond >= 20) return 5;     // 每5秒
  if (pixelsPerSecond >= 10) return 10;    // 每10秒
  if (pixelsPerSecond >= 5) return 30;     // 每30秒
  return 60;                                // 每分钟
};

/** 秒 → m:ss.ms（分钟不补零，毫秒两位；与原 SimpleTimeline 显示保持一致） */
export const formatTime = (seconds: number): string => {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 100);
  return `${m}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
};

// ---------------------------------------------------------------------------
// 吸附
// ---------------------------------------------------------------------------

export type SnapTarget = 'playhead' | 'clipStart' | 'clipEnd';

export interface SnapPoint {
  time: number;
  type: SnapTarget;
}

/** 吸附点收集所需的最小轨道形状（resolveTimelineTracks 的返回子集） */
export interface SnapClipWindow {
  resolvedStart: number;
  resolvedEnd: number;
}

export interface SnapTrackShape {
  clipWindows: SnapClipWindow[];
}

/** 收集吸附点：播放头 + 所有片段的起止点（已按转场/速率解析后的时间） */
export function collectSnapPoints(
  tracks: SnapTrackShape[],
  currentTime: number,
): SnapPoint[] {
  const points: SnapPoint[] = [{ time: currentTime, type: 'playhead' }];
  tracks.forEach((track) => {
    track.clipWindows.forEach((clip) => {
      points.push({ time: clip.resolvedStart, type: 'clipStart' });
      points.push({ time: clip.resolvedEnd, type: 'clipEnd' });
    });
  });
  return points;
}

/**
 * 在吸附点中找距离 time 最近阈值内的点。
 * 注意：返回收集顺序中第一个落入阈值的点（播放头优先），而非全局最近点 ——
 * 与原实现保持一致（吸附点密度低时两者等价）。
 */
export function findSnapPoint(
  points: SnapPoint[],
  time: number,
  pixelsPerSecond: number,
  thresholdPx: number = SNAP_THRESHOLD,
): SnapPoint | null {
  for (const point of points) {
    const pixelDiff = Math.abs((point.time - time) * pixelsPerSecond);
    if (pixelDiff < thresholdPx) {
      return point;
    }
  }
  return null;
}

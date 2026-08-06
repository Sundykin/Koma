import { describe, expect, it } from 'vitest';
import {
  collectSnapPoints,
  findSnapPoint,
  formatTime,
  getMarkerInterval,
  SNAP_THRESHOLD,
} from './timelineUtils';

describe('getMarkerInterval', () => {
  it('按每秒像素数分档', () => {
    expect(getMarkerInterval(200)).toBe(1);
    expect(getMarkerInterval(100)).toBe(1);
    expect(getMarkerInterval(50)).toBe(2);
    expect(getMarkerInterval(20)).toBe(5);
    expect(getMarkerInterval(10)).toBe(10);
    expect(getMarkerInterval(5)).toBe(30);
    expect(getMarkerInterval(1)).toBe(60);
  });
});

describe('formatTime', () => {
  it('格式化 分:秒.毫秒（分钟不补零）', () => {
    expect(formatTime(0)).toBe('0:00.00');
    expect(formatTime(61.5)).toBe('1:01.50');
    expect(formatTime(125.049)).toBe('2:05.04');
  });
});

describe('collectSnapPoints', () => {
  it('播放头在前，随后是各片段起止点', () => {
    const points = collectSnapPoints([
      { clipWindows: [{ resolvedStart: 1, resolvedEnd: 5 }, { resolvedStart: 8, resolvedEnd: 12 }] },
      { clipWindows: [{ resolvedStart: 2, resolvedEnd: 4 }] },
    ], 3.5);
    expect(points[0]).toEqual({ time: 3.5, type: 'playhead' });
    expect(points).toContainEqual({ time: 1, type: 'clipStart' });
    expect(points).toContainEqual({ time: 5, type: 'clipEnd' });
    expect(points).toContainEqual({ time: 8, type: 'clipStart' });
    expect(points).toContainEqual({ time: 12, type: 'clipEnd' });
    expect(points).toContainEqual({ time: 2, type: 'clipStart' });
    expect(points).toHaveLength(7);
  });
});

describe('findSnapPoint', () => {
  const pps = 20; // 1 秒 = 20px，阈值 8px = 0.4 秒
  const points = collectSnapPoints([
    { clipWindows: [{ resolvedStart: 5, resolvedEnd: 9 }] },
  ], 0);

  it('阈值内命中播放头', () => {
    expect(findSnapPoint(points, 0.3, pps)).toEqual({ time: 0, type: 'playhead' });
  });

  it('阈值内命中片段起点', () => {
    expect(findSnapPoint(points, 5.2, pps)).toEqual({ time: 5, type: 'clipStart' });
  });

  it('超出阈值返回 null', () => {
    // 距离最近的 5s 也有 1s = 20px > 8px
    expect(findSnapPoint(points, 4, pps)).toBeNull();
  });

  it('像素差按缩放换算：放大后同样时间差更容易命中', () => {
    // 4.6s 距 5s = 0.4s：pps=20 时 8px 不命中（严格小于），pps=100 时 40px 仍不命中？
    // pps=100 → 0.4s*100 = 40px > 8 不命中；pps=20 → 8px 不命中（严格 <）
    expect(findSnapPoint(points, 4.6, 20)).toBeNull();
    // 4.9s 距 5s = 0.1s：pps=20 → 2px 命中
    expect(findSnapPoint(points, 4.9, 20)).toEqual({ time: 5, type: 'clipStart' });
  });

  it('自定义阈值', () => {
    expect(findSnapPoint(points, 4, pps, SNAP_THRESHOLD * 4)).toEqual({ time: 5, type: 'clipStart' });
  });
});

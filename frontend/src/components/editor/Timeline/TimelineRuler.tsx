/**
 * 时间刻度尺组件
 */
import React, { useCallback, useMemo } from 'react';

interface TimelineRulerProps {
  duration: number;       // 总时长（毫秒）
  scale: number;          // 缩放比例（像素/毫秒）
  scrollLeft: number;     // 滚动位置
  width: number;          // 容器宽度
  onClick: (time: number) => void;
}

export function TimelineRuler({
  duration,
  scale,
  scrollLeft,
  width,
  onClick,
}: TimelineRulerProps) {
  // 计算可见范围
  const visibleStart = scrollLeft / scale;
  const visibleEnd = (scrollLeft + width) / scale;

  // 根据缩放级别决定刻度间隔
  const interval = useMemo(() => {
    const pixelsPerSecond = scale * 1000;
    if (pixelsPerSecond > 200) return 100;    // 每 100ms 一个刻度
    if (pixelsPerSecond > 100) return 500;    // 每 500ms
    if (pixelsPerSecond > 50) return 1000;    // 每秒
    if (pixelsPerSecond > 20) return 2000;    // 每 2 秒
    if (pixelsPerSecond > 10) return 5000;    // 每 5 秒
    return 10000;                              // 每 10 秒
  }, [scale]);

  // 格式化时间
  const formatTime = useCallback((ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const milliseconds = Math.floor((ms % 1000) / 100);

    if (interval < 1000) {
      return `${minutes}:${seconds.toString().padStart(2, '0')}.${milliseconds}`;
    }
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }, [interval]);

  // 生成刻度
  const marks = useMemo(() => {
    const result: Array<{ time: number; position: number; major: boolean }> = [];
    const startTime = Math.floor(visibleStart / interval) * interval;
    const majorInterval = interval >= 1000 ? interval * 5 : interval * 10;

    for (let time = startTime; time <= visibleEnd + interval; time += interval) {
      if (time < 0) continue;
      result.push({
        time,
        position: time * scale - scrollLeft,
        major: time % majorInterval === 0,
      });
    }
    return result;
  }, [visibleStart, visibleEnd, interval, scale, scrollLeft]);

  const handleClick = useCallback((e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left + scrollLeft;
    onClick(x / scale);
  }, [scrollLeft, scale, onClick]);

  const totalWidth = duration * scale;

  return (
    <div className="timelineRuler" onClick={handleClick} style={{ width: totalWidth }}>
      {marks.map(({ time, position, major }) => (
        <div
          key={time}
          className={`rulerMark ${major ? 'major' : 'minor'}`}
          style={{ left: position }}
        >
          {major && <span className="rulerLabel">{formatTime(time)}</span>}
        </div>
      ))}
    </div>
  );
}

export default TimelineRuler;

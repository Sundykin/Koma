/**
 * 关键帧标记组件
 * 显示菱形标记，支持点击选中、拖拽调整时间、右键菜单
 */
import React, { memo, useCallback, useRef, useState } from 'react';
import type { TrackKeyframe, EasingType } from '../../../types/track';

interface KeyframeMarkerProps {
  keyframe: TrackKeyframe;
  scale: number;           // 像素/帧
  itemStart: number;       // 片段起始帧
  itemDuration: number;    // 片段时长（帧）
  selected: boolean;
  onSelect: () => void;
  onTimeChange: (newTime: number) => void;
  onContextMenu: (e: React.MouseEvent) => void;
}

// 拖拽阈值
const DRAG_THRESHOLD = 3;

export const KeyframeMarker = memo(function KeyframeMarker({
  keyframe,
  scale,
  itemStart,
  itemDuration,
  selected,
  onSelect,
  onTimeChange,
  onContextMenu,
}: KeyframeMarkerProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [dragTime, setDragTime] = useState<number | null>(null);
  const dragStartRef = useRef<{ x: number; time: number } | null>(null);

  // 计算位置
  const left = keyframe.time * scale;

  // 处理点击
  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isDragging) {
      onSelect();
    }
  }, [onSelect, isDragging]);

  // 处理右键菜单
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onSelect();
    onContextMenu(e);
  }, [onSelect, onContextMenu]);

  // 处理拖拽开始
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    e.stopPropagation();

    dragStartRef.current = { x: e.clientX, time: keyframe.time };

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!dragStartRef.current) return;

      const deltaX = moveEvent.clientX - dragStartRef.current.x;

      // 检查是否超过阈值
      if (Math.abs(deltaX) < DRAG_THRESHOLD && !isDragging) {
        return;
      }

      setIsDragging(true);

      // 计算新时间
      const deltaFrames = deltaX / scale;
      let newTime = dragStartRef.current.time + deltaFrames;

      // 边界检测：不超出片段范围
      newTime = Math.max(0, Math.min(itemDuration, newTime));

      setDragTime(newTime);
    };

    const handleMouseUp = (upEvent: MouseEvent) => {
      if (isDragging && dragTime !== null) {
        onTimeChange(dragTime);
      }

      setIsDragging(false);
      setDragTime(null);
      dragStartRef.current = null;

      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  }, [keyframe.time, scale, itemDuration, isDragging, dragTime, onTimeChange]);

  // 显示时间（拖拽时显示预览时间）
  const displayTime = dragTime !== null ? dragTime : keyframe.time;
  const displayLeft = displayTime * scale;

  return (
    <div
      className={`keyframeMarker ${selected ? 'selected' : ''} ${isDragging ? 'dragging' : ''}`}
      style={{ left: displayLeft }}
      onClick={handleClick}
      onMouseDown={handleMouseDown}
      onContextMenu={handleContextMenu}
    >
      {/* 菱形标记 */}
      <svg
        width="10"
        height="10"
        viewBox="0 0 10 10"
        className="keyframeDiamond"
      >
        <path
          d="M5 0L10 5L5 10L0 5Z"
          fill={selected ? '#22d3ee' : '#facc15'}
          stroke={selected ? '#0891b2' : '#ca8a04'}
          strokeWidth="1"
        />
      </svg>

      {/* 拖拽时显示时间提示 */}
      {isDragging && dragTime !== null && (
        <div className="keyframeTooltip">
          {displayTime.toFixed(0)}f
        </div>
      )}
    </div>
  );
});

export default KeyframeMarker;

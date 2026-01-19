/**
 * 播放头组件
 */
import React, { useCallback } from 'react';

interface PlayheadProps {
  position: number;       // 像素位置
  height: number;         // 高度
  onDrag?: (deltaX: number) => void;
}

export function Playhead({
  position,
  height,
  onDrag,
}: PlayheadProps) {
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const startX = e.clientX;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX;
      onDrag?.(deltaX);
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [onDrag]);

  return (
    <div
      className="playhead"
      style={{ left: position, height }}
      onMouseDown={handleMouseDown}
    >
      <div className="playheadHead" />
      <div className="playheadLine" />
    </div>
  );
}

export default Playhead;

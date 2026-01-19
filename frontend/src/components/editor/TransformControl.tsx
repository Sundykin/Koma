/**
 * 变换控制框组件
 * 用于在预览区域选中素材后显示拖拽、缩放、旋转控制
 */
import React, { useRef, useCallback, useEffect, useState } from 'react';

interface TransformControlProps {
  // 素材在画布中的位置（相对于画布中心的偏移）
  x: number;
  y: number;
  scale: number;
  rotation: number;
  // 预览区域尺寸（像素）
  canvasWidth: number;
  canvasHeight: number;
  // 实际画布尺寸（用于坐标转换）
  mediaWidth: number;
  mediaHeight: number;
  // 回调
  onMove: (deltaX: number, deltaY: number) => void;
  onScale: (newScale: number) => void;
  onRotate: (newRotation: number) => void;
  onTransformEnd: () => void;
}

type HandleType = 'move' | 'nw' | 'ne' | 'sw' | 'se' | 'n' | 's' | 'e' | 'w' | 'rotate';

export const TransformControl: React.FC<TransformControlProps> = ({
  x,
  y,
  scale,
  rotation,
  canvasWidth,
  canvasHeight,
  mediaWidth,
  mediaHeight,
  onMove,
  onScale,
  onRotate,
  onTransformEnd,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragType, setDragType] = useState<HandleType | null>(null);
  const dragStartRef = useRef<{ x: number; y: number; scale: number; rotation: number; startX: number; startY: number }>({
    x: 0, y: 0, scale: 1, rotation: 0, startX: 0, startY: 0
  });

  // 计算素材在预览区的实际显示尺寸（基于 contain 模式）
  const aspectRatio = mediaWidth / mediaHeight;
  const canvasRatio = canvasWidth / canvasHeight;
  let baseWidth: number, baseHeight: number;
  if (aspectRatio > canvasRatio) {
    baseWidth = canvasWidth;
    baseHeight = canvasWidth / aspectRatio;
  } else {
    baseHeight = canvasHeight;
    baseWidth = canvasHeight * aspectRatio;
  }
  const drawWidth = baseWidth * scale;
  const drawHeight = baseHeight * scale;

  // 坐标转换比例（预览区像素 -> 画布坐标）
  const scaleRatioX = mediaWidth / canvasWidth;
  const scaleRatioY = mediaHeight / canvasHeight;

  // 计算控制框位置（预览区中心 + 偏移转换为预览区像素）
  const centerX = canvasWidth / 2 + x / scaleRatioX;
  const centerY = canvasHeight / 2 + y / scaleRatioY;
  const boxLeft = centerX - drawWidth / 2;
  const boxTop = centerY - drawHeight / 2;

  // 控制点大小
  const handleSize = 10;
  const rotateHandleOffset = 30;

  const handleMouseDown = useCallback((e: React.MouseEvent, type: HandleType) => {
    e.stopPropagation();
    e.preventDefault();
    setIsDragging(true);
    setDragType(type);
    dragStartRef.current = {
      x: x,
      y: y,
      scale,
      rotation,
      startX: e.clientX,
      startY: e.clientY,
    };
  }, [x, y, scale, rotation]);

  useEffect(() => {
    if (!isDragging || !dragType) return;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - dragStartRef.current.startX;
      const deltaY = e.clientY - dragStartRef.current.startY;

      switch (dragType) {
        case 'move': {
          // 将预览区像素位移转换为画布坐标位移
          const canvasDeltaX = deltaX * scaleRatioX;
          const canvasDeltaY = deltaY * scaleRatioY;
          // 每次移动都是基于起始位置的绝对位移
          onMove(canvasDeltaX, canvasDeltaY);
          // 更新起始点以实现增量移动
          dragStartRef.current.startX = e.clientX;
          dragStartRef.current.startY = e.clientY;
          break;
        }
        case 'nw':
        case 'ne':
        case 'sw':
        case 'se': {
          // 角点等比缩放
          const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
          const sign = (dragType === 'se' || dragType === 'ne' ? deltaX > 0 : deltaX < 0) ? 1 : -1;
          const scaleDelta = sign * distance / 200;
          const newScale = Math.max(0.1, Math.min(5, dragStartRef.current.scale + scaleDelta));
          onScale(newScale);
          break;
        }
        case 'rotate': {
          // 计算从控制框中心到鼠标的角度
          const rect = containerRef.current?.getBoundingClientRect();
          if (!rect) return;
          const cx = rect.left + rect.width / 2;
          const cy = rect.top + rect.height / 2;
          const angle = Math.atan2(e.clientY - cy, e.clientX - cx) * (180 / Math.PI) + 90;
          onRotate(angle);
          break;
        }
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      setDragType(null);
      onTransformEnd();
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragType, onMove, onScale, onRotate, onTransformEnd, scaleRatioX, scaleRatioY]);

  // 控制点样式
  const handleStyle: React.CSSProperties = {
    position: 'absolute',
    width: handleSize,
    height: handleSize,
    backgroundColor: '#22d3ee',
    border: '2px solid white',
    borderRadius: '2px',
    cursor: 'pointer',
    zIndex: 10,
  };

  return (
    <div
      ref={containerRef}
      className="absolute pointer-events-none"
      style={{
        left: boxLeft,
        top: boxTop,
        width: drawWidth,
        height: drawHeight,
        transform: `rotate(${rotation}deg)`,
        transformOrigin: 'center center',
      }}
    >
      {/* 边框 */}
      <div
        className="absolute inset-0 border-2 border-cyan-400 pointer-events-auto cursor-move"
        onMouseDown={(e) => handleMouseDown(e, 'move')}
      />

      {/* 四角控制点 */}
      <div
        style={{ ...handleStyle, left: -handleSize / 2, top: -handleSize / 2, cursor: 'nwse-resize' }}
        className="pointer-events-auto"
        onMouseDown={(e) => handleMouseDown(e, 'nw')}
      />
      <div
        style={{ ...handleStyle, right: -handleSize / 2, top: -handleSize / 2, cursor: 'nesw-resize' }}
        className="pointer-events-auto"
        onMouseDown={(e) => handleMouseDown(e, 'ne')}
      />
      <div
        style={{ ...handleStyle, left: -handleSize / 2, bottom: -handleSize / 2, cursor: 'nesw-resize' }}
        className="pointer-events-auto"
        onMouseDown={(e) => handleMouseDown(e, 'sw')}
      />
      <div
        style={{ ...handleStyle, right: -handleSize / 2, bottom: -handleSize / 2, cursor: 'nwse-resize' }}
        className="pointer-events-auto"
        onMouseDown={(e) => handleMouseDown(e, 'se')}
      />

      {/* 旋转手柄 */}
      <div
        className="absolute pointer-events-auto"
        style={{
          left: '50%',
          top: -rotateHandleOffset - handleSize,
          transform: 'translateX(-50%)',
        }}
      >
        {/* 连接线 */}
        <div
          className="absolute left-1/2 -translate-x-1/2 bg-cyan-400"
          style={{ width: 2, height: rotateHandleOffset, bottom: handleSize }}
        />
        {/* 旋转手柄 */}
        <div
          style={{
            width: handleSize + 4,
            height: handleSize + 4,
            backgroundColor: '#22d3ee',
            border: '2px solid white',
            borderRadius: '50%',
            cursor: 'grab',
          }}
          onMouseDown={(e) => handleMouseDown(e, 'rotate')}
        />
      </div>
    </div>
  );
};

export default TransformControl;

/**
 * 轨道行组件
 */
import React from 'react';
import type { TrackLine, TrackItem } from '../../../types/track';
import ClipItem from './ClipItem';

interface DropPreview {
  visible: boolean;
  startFrame: number;
  duration: number;
  type: string;
}

interface TrackRowProps {
  track: TrackLine;
  scale: number;
  fps: number;
  width: number;
  selectedItemId: string | null;
  onItemSelect: (itemId: string) => void;
  onItemDragStart: (trackId: string, itemId: string, type: 'move' | 'trim-start' | 'trim-end', e: React.MouseEvent) => void;
  onDrop?: (e: React.DragEvent) => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDragLeave?: (e: React.DragEvent) => void;
  dropPreview?: DropPreview | null;
}

export function TrackRow({
  track,
  scale,
  fps,
  width,
  selectedItemId,
  onItemSelect,
  onItemDragStart,
  onDrop,
  onDragOver,
  onDragLeave,
  dropPreview,
}: TrackRowProps) {
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    onDragOver?.(e);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    onDragLeave?.(e);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    onDrop?.(e);
  };

  // 根据类型获取预览颜色
  const getPreviewColor = (type: string) => {
    switch (type) {
      case 'video': return 'rgba(59, 130, 246, 0.5)';
      case 'audio': return 'rgba(34, 197, 94, 0.5)';
      case 'image': return 'rgba(139, 92, 246, 0.5)';
      default: return 'rgba(156, 163, 175, 0.5)';
    }
  };

  return (
    <div
      className={`trackRow ${!track.visible ? 'hidden' : ''} ${track.locked ? 'locked' : ''}`}
      style={{ height: track.height, width }}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {track.items.map((item) => (
        <ClipItem
          key={item.id}
          item={item}
          scale={scale}
          fps={fps}
          selected={item.id === selectedItemId}
          onSelect={() => onItemSelect(item.id)}
          onDragStart={(type, e) => onItemDragStart(track.id, item.id, type, e)}
        />
      ))}

      {/* 拖拽预览 */}
      {dropPreview && dropPreview.visible && (
        <div
          className="dropPreview"
          style={{
            left: dropPreview.startFrame * scale,
            width: dropPreview.duration * scale,
            background: getPreviewColor(dropPreview.type),
          }}
        />
      )}

      {/* 轨道背景网格线 */}
      <div className="trackGrid" />
    </div>
  );
}

export default TrackRow;

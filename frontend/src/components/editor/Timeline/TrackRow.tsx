/**
 * 轨道行组件
 */
import React, { memo, useCallback } from 'react';
import type { TrackLine, TrackItem, EasingType } from '../../../types/track';
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
  selectedKeyframeId?: string | null;
  onItemSelect: (itemId: string) => void;
  onItemDragStart: (trackId: string, itemId: string, type: 'move' | 'trim-start' | 'trim-end', e: React.MouseEvent) => void;
  onKeyframeSelect?: (itemId: string, keyframeId: string) => void;
  onKeyframeTimeChange?: (itemId: string, keyframeId: string, newTime: number) => void;
  onKeyframeDelete?: (itemId: string, keyframeId: string) => void;
  onKeyframeCopy?: (itemId: string, keyframeId: string) => void;
  onKeyframeEasingChange?: (itemId: string, keyframeId: string, easing: EasingType) => void;
  onDrop?: (e: React.DragEvent) => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDragLeave?: (e: React.DragEvent) => void;
  dropPreview?: DropPreview | null;
}

// 自定义比较函数
function areTrackRowPropsEqual(prevProps: TrackRowProps, nextProps: TrackRowProps): boolean {
  // 基础属性
  if (prevProps.scale !== nextProps.scale) return false;
  if (prevProps.fps !== nextProps.fps) return false;
  if (prevProps.width !== nextProps.width) return false;
  if (prevProps.selectedItemId !== nextProps.selectedItemId) return false;
  if (prevProps.selectedKeyframeId !== nextProps.selectedKeyframeId) return false;

  // track 关键属性比较
  const prevTrack = prevProps.track;
  const nextTrack = nextProps.track;
  if (prevTrack.id !== nextTrack.id) return false;
  if (prevTrack.visible !== nextTrack.visible) return false;
  if (prevTrack.locked !== nextTrack.locked) return false;
  if (prevTrack.height !== nextTrack.height) return false;
  if (prevTrack.items.length !== nextTrack.items.length) return false;

  // items 变化检测（比较关键属性）
  for (let i = 0; i < prevTrack.items.length; i++) {
    const prev = prevTrack.items[i];
    const next = nextTrack.items[i];
    if (prev.id !== next.id ||
        prev.start !== next.start ||
        prev.end !== next.end) {
      return false;
    }
  }

  // dropPreview 比较
  if (prevProps.dropPreview?.visible !== nextProps.dropPreview?.visible) return false;
  if (prevProps.dropPreview?.startFrame !== nextProps.dropPreview?.startFrame) return false;

  // 回调函数不比较（假设稳定）
  return true;
}

export const TrackRow = memo(function TrackRow({
  track,
  scale,
  fps,
  width,
  selectedItemId,
  selectedKeyframeId,
  onItemSelect,
  onItemDragStart,
  onKeyframeSelect,
  onKeyframeTimeChange,
  onKeyframeDelete,
  onKeyframeCopy,
  onKeyframeEasingChange,
  onDrop,
  onDragOver,
  onDragLeave,
  dropPreview,
}: TrackRowProps) {
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    onDragOver?.(e);
  }, [onDragOver]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    onDragLeave?.(e);
  }, [onDragLeave]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    onDrop?.(e);
  }, [onDrop]);

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
      data-track-id={track.id}
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
          selectedKeyframeId={item.id === selectedItemId ? selectedKeyframeId : null}
          onSelect={() => onItemSelect(item.id)}
          onDragStart={(type, e) => onItemDragStart(track.id, item.id, type, e)}
          onKeyframeSelect={(kfId) => onKeyframeSelect?.(item.id, kfId)}
          onKeyframeTimeChange={(kfId, newTime) => onKeyframeTimeChange?.(item.id, kfId, newTime)}
          onKeyframeDelete={(kfId) => onKeyframeDelete?.(item.id, kfId)}
          onKeyframeCopy={(kfId) => onKeyframeCopy?.(item.id, kfId)}
          onKeyframeEasingChange={(kfId, easing) => onKeyframeEasingChange?.(item.id, kfId, easing)}
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
}, areTrackRowPropsEqual);

export default TrackRow;

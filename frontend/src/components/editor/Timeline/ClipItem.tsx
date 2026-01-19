/**
 * 片段项组件
 */
import React, { useCallback, useMemo, memo, useState } from 'react';
import type { TrackItem, TrackKeyframe, VideoTrackItem, AudioTrackItem, EasingType } from '../../../types/track';
import FilmstripRenderer from './FilmstripRenderer';
import WaveformRenderer from './WaveformRenderer';
import KeyframeMarker from './KeyframeMarker';
import KeyframeContextMenu from './KeyframeContextMenu';

interface ClipItemProps {
  item: TrackItem;
  scale: number;          // 像素/帧
  selected: boolean;
  fps: number;            // 帧率
  selectedKeyframeId?: string | null;
  onSelect: () => void;
  onDragStart: (type: 'move' | 'trim-start' | 'trim-end', e: React.MouseEvent) => void;
  onKeyframeSelect?: (keyframeId: string) => void;
  onKeyframeTimeChange?: (keyframeId: string, newTime: number) => void;
  onKeyframeDelete?: (keyframeId: string) => void;
  onKeyframeCopy?: (keyframeId: string) => void;
  onKeyframeEasingChange?: (keyframeId: string, easing: EasingType) => void;
}

// 比较函数，比较 item 的关键属性而非引用
function arePropsEqual(prevProps: ClipItemProps, nextProps: ClipItemProps): boolean {
  // 基础属性比较
  if (prevProps.scale !== nextProps.scale) return false;
  if (prevProps.selected !== nextProps.selected) return false;
  if (prevProps.fps !== nextProps.fps) return false;
  if (prevProps.selectedKeyframeId !== nextProps.selectedKeyframeId) return false;

  // item 关键属性比较（避免引用比较）
  const prevItem = prevProps.item;
  const nextItem = nextProps.item;
  if (prevItem.id !== nextItem.id) return false;
  if (prevItem.start !== nextItem.start) return false;
  if (prevItem.end !== nextItem.end) return false;
  if (prevItem.name !== nextItem.name) return false;
  if (prevItem.offsetL !== nextItem.offsetL) return false;
  if (prevItem.offsetR !== nextItem.offsetR) return false;

  // 关键帧数组长度比较
  const prevKf = (prevItem as any).keyframes;
  const nextKf = (nextItem as any).keyframes;
  if ((prevKf?.length || 0) !== (nextKf?.length || 0)) return false;

  // 回调函数不比较（假设稳定）
  return true;
}

export const ClipItem = memo(function ClipItem({
  item,
  scale,
  selected,
  fps,
  selectedKeyframeId,
  onSelect,
  onDragStart,
  onKeyframeSelect,
  onKeyframeTimeChange,
  onKeyframeDelete,
  onKeyframeCopy,
  onKeyframeEasingChange,
}: ClipItemProps) {
  // 右键菜单状态
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    keyframe: TrackKeyframe;
  } | null>(null);
  // 计算位置和宽度
  const left = item.start * scale;
  const width = (item.end - item.start) * scale;
  const height = 52; // 片段内容高度

  // 获取片段样式类
  const getClipClass = () => {
    switch (item.type) {
      case 'video': return 'clipVideo';
      case 'audio': return 'clipAudio';
      case 'image': return 'clipImage';
      case 'text': return 'clipText';
      case 'subtitle': return 'clipSubtitle';
      default: return '';
    }
  };

  // 渲染缩略图/预览
  const renderPreview = () => {
    // 视频片段 - 显示胶片缩略图
    if (item.type === 'video') {
      const videoItem = item as VideoTrackItem;
      if (videoItem.source && width > 30) {
        return (
          <FilmstripRenderer
            source={videoItem.source}
            resourceId={videoItem.resourceId || item.id}
            width={Math.max(0, width - 16)}
            height={height - 8}
            startFrame={item.start}
            endFrame={item.end}
            fps={fps}
            offsetL={item.offsetL}
            scale={scale}
          />
        );
      }
      // 降级：显示封面图
      if (videoItem.cover) {
        return (
          <div className="clipThumbnail">
            <img src={`koma-local:///${videoItem.cover.replace(/\\/g, '/')}`} alt="" />
          </div>
        );
      }
    }

    // 图片片段
    if (item.type === 'image') {
      const source = (item as any).source;
      if (source) {
        return (
          <div className="clipThumbnail">
            <img src={`koma-local:///${source.replace(/\\/g, '/')}`} alt="" />
          </div>
        );
      }
    }

    // 音频片段 - 显示波形
    if (item.type === 'audio') {
      const audioItem = item as AudioTrackItem;
      if (audioItem.source && width > 30) {
        return (
          <WaveformRenderer
            source={audioItem.source}
            resourceId={audioItem.resourceId || item.id}
            width={Math.max(0, width - 16)}
            height={height - 8}
            startFrame={item.start}
            endFrame={item.end}
            fps={fps}
            offsetL={item.offsetL}
          />
        );
      }
      // 降级：显示预生成的波形图
      if (audioItem.waveform) {
        return (
          <div className="clipWaveform">
            <img src={`koma-local:///${audioItem.waveform.replace(/\\/g, '/')}`} alt="" />
          </div>
        );
      }
    }

    // 文本/字幕片段
    if (item.type === 'text' || item.type === 'subtitle') {
      return (
        <div className="clipTextPreview">
          {(item as any).content?.slice(0, 50)}
        </div>
      );
    }

    return null;
  };

  // 渲染关键帧标记
  const renderKeyframes = () => {
    const keyframes = (item as any).keyframes as TrackKeyframe[] | undefined;
    if (!keyframes || keyframes.length === 0) return null;

    const itemDuration = item.end - item.start;

    return (
      <div className="clipKeyframes">
        {keyframes.map((kf) => (
          <KeyframeMarker
            key={kf.id}
            keyframe={kf}
            scale={scale}
            itemStart={item.start}
            itemDuration={itemDuration}
            selected={selectedKeyframeId === kf.id}
            onSelect={() => onKeyframeSelect?.(kf.id)}
            onTimeChange={(newTime) => onKeyframeTimeChange?.(kf.id, newTime)}
            onContextMenu={(e) => {
              setContextMenu({ x: e.clientX, y: e.clientY, keyframe: kf });
            }}
          />
        ))}
      </div>
    );
  };

  // 关闭右键菜单
  const handleCloseContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect();
  }, [onSelect]);

  const handleMoveStart = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onDragStart('move', e);
  }, [onDragStart]);

  const handleTrimStartStart = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onDragStart('trim-start', e);
  }, [onDragStart]);

  const handleTrimEndStart = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onDragStart('trim-end', e);
  }, [onDragStart]);

  return (
    <div
      className={`clipItem ${getClipClass()} ${selected ? 'selected' : ''}`}
      style={{ left, width }}
      onClick={handleClick}
    >
      {/* 左侧裁剪手柄 */}
      <div
        className="clipTrimHandle left"
        onMouseDown={handleTrimStartStart}
      />

      {/* 内容区域 */}
      <div className="clipContent" onMouseDown={handleMoveStart}>
        {renderPreview()}
        <span className="clipName">{item.name}</span>
        {renderKeyframes()}
      </div>

      {/* 右侧裁剪手柄 */}
      <div
        className="clipTrimHandle right"
        onMouseDown={handleTrimEndStart}
      />

      {/* 关键帧右键菜单 */}
      {contextMenu && (
        <KeyframeContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          keyframeTime={contextMenu.keyframe.time}
          currentEasing={contextMenu.keyframe.easing}
          onDelete={() => onKeyframeDelete?.(contextMenu.keyframe.id)}
          onCopy={() => onKeyframeCopy?.(contextMenu.keyframe.id)}
          onEasingChange={(easing) => onKeyframeEasingChange?.(contextMenu.keyframe.id, easing)}
          onClose={handleCloseContextMenu}
        />
      )}
    </div>
  );
}, arePropsEqual);

export default ClipItem;

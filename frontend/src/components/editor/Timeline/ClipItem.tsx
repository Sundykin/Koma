/**
 * 片段项组件
 */
import React, { useCallback, useMemo, memo } from 'react';
import type { TrackItem, TrackKeyframe, VideoTrackItem, AudioTrackItem } from '../../../types/track';
import FilmstripRenderer from './FilmstripRenderer';
import WaveformRenderer from './WaveformRenderer';

interface ClipItemProps {
  item: TrackItem;
  scale: number;          // 像素/帧
  selected: boolean;
  fps: number;            // 帧率
  onSelect: () => void;
  onDragStart: (type: 'move' | 'trim-start' | 'trim-end', e: React.MouseEvent) => void;
}

// 比较函数，只有关键属性变化才重渲染
function arePropsEqual(prevProps: ClipItemProps, nextProps: ClipItemProps): boolean {
  return (
    prevProps.item === nextProps.item &&
    prevProps.scale === nextProps.scale &&
    prevProps.selected === nextProps.selected &&
    prevProps.fps === nextProps.fps
  );
}

export const ClipItem = memo(function ClipItem({
  item,
  scale,
  selected,
  fps,
  onSelect,
  onDragStart,
}: ClipItemProps) {
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

    return (
      <div className="clipKeyframes">
        {keyframes.map((kf) => (
          <div
            key={kf.id}
            className="keyframeMark"
            style={{ left: (kf.time - item.start) * scale }}
            title={`关键帧 @ ${kf.time}`}
          />
        ))}
      </div>
    );
  };

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
    </div>
  );
}, arePropsEqual);

export default ClipItem;

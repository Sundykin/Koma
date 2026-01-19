/**
 * 时间线编辑组件
 * 多轨道拖拽编辑、缩放、吸附
 */
import React, { useRef, useState, useCallback, useEffect } from 'react';
import { Button, Tooltip, Dropdown } from 'antd';
import {
  PlusOutlined,
  LockOutlined,
  UnlockOutlined,
  EyeOutlined,
  EyeInvisibleOutlined,
  SoundOutlined,
  AudioMutedOutlined,
  ZoomInOutlined,
  ZoomOutOutlined,
  ScissorOutlined,
  DeleteOutlined,
} from '@ant-design/icons';
import type { Timeline as TimelineType, Track, Clip } from '../../types';
import './TimelineEditor.css';

interface TimelineProps {
  timeline: TimelineType | null;
  currentTime: number;
  selectedClipId: string | null;
  onTimelineChange: (timeline: TimelineType) => void;
  onTimeChange: (time: number) => void;
  onClipSelect: (clipId: string | null) => void;
}

const TRACK_HEIGHT = 60;
const MIN_SCALE = 0.1;  // 1px = 100ms
const MAX_SCALE = 10;   // 1px = 1ms
const SNAP_THRESHOLD = 10; // 吸附阈值（像素）

export function Timeline({
  timeline,
  currentTime,
  selectedClipId,
  onTimelineChange,
  onTimeChange,
  onClipSelect,
}: TimelineProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.1); // ms per pixel
  const [scrollLeft, setScrollLeft] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [dragType, setDragType] = useState<'move' | 'trim-start' | 'trim-end' | null>(null);
  const [dragClip, setDragClip] = useState<{ clip: Clip; originalStart: number; originalDuration: number } | null>(null);
  const [dragStartX, setDragStartX] = useState(0);

  // 时间 <-> 像素转换
  const timeToPixel = useCallback((time: number) => time * scale, [scale]);
  const pixelToTime = useCallback((pixel: number) => pixel / scale, [scale]);

  // 缩放控制
  const handleZoom = useCallback((delta: number) => {
    setScale((prev) => Math.max(MIN_SCALE, Math.min(MAX_SCALE, prev + delta)));
  }, []);

  // 滚轮缩放
  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      handleZoom(e.deltaY > 0 ? -0.01 : 0.01);
    }
  }, [handleZoom]);

  // 点击时间标尺跳转
  const handleRulerClick = useCallback((e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left + scrollLeft;
    onTimeChange(pixelToTime(x));
  }, [scrollLeft, pixelToTime, onTimeChange]);

  // 轨道操作
  const toggleTrackMute = useCallback((trackId: string) => {
    if (!timeline) return;
    const newTracks = timeline.tracks.map((t) =>
      t.id === trackId ? { ...t, muted: !t.muted } : t
    );
    onTimelineChange({ ...timeline, tracks: newTracks });
  }, [timeline, onTimelineChange]);

  const toggleTrackLock = useCallback((trackId: string) => {
    if (!timeline) return;
    const newTracks = timeline.tracks.map((t) =>
      t.id === trackId ? { ...t, locked: !t.locked } : t
    );
    onTimelineChange({ ...timeline, tracks: newTracks });
  }, [timeline, onTimelineChange]);

  const toggleTrackVisible = useCallback((trackId: string) => {
    if (!timeline) return;
    const newTracks = timeline.tracks.map((t) =>
      t.id === trackId ? { ...t, visible: !t.visible } : t
    );
    onTimelineChange({ ...timeline, tracks: newTracks });
  }, [timeline, onTimelineChange]);

  // 添加轨道
  const addTrack = useCallback((type: Track['type']) => {
    if (!timeline) return;
    const newTrack: Track = {
      id: `track-${Date.now()}`,
      name: `${type === 'video' ? '视频' : type === 'audio' ? '音频' : '字幕'}轨道`,
      type,
      muted: false,
      locked: false,
      visible: true,
      height: TRACK_HEIGHT,
      clips: [],
    };
    onTimelineChange({ ...timeline, tracks: [...timeline.tracks, newTrack] });
  }, [timeline, onTimelineChange]);

  // Clip 拖拽
  const handleClipMouseDown = useCallback((e: React.MouseEvent, clip: Clip, type: 'move' | 'trim-start' | 'trim-end') => {
    e.stopPropagation();
    const track = timeline?.tracks.find((t) => t.id === clip.trackId);
    if (track?.locked) return;

    setIsDragging(true);
    setDragType(type);
    setDragClip({ clip, originalStart: clip.startTime, originalDuration: clip.duration });
    setDragStartX(e.clientX);
    onClipSelect(clip.id);
  }, [timeline, onClipSelect]);

  // 拖拽移动
  useEffect(() => {
    if (!isDragging || !dragClip || !timeline) return;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - dragStartX;
      const deltaTime = pixelToTime(deltaX);

      const newTracks = timeline.tracks.map((track) => {
        if (track.id !== dragClip.clip.trackId) return track;
        return {
          ...track,
          clips: track.clips.map((c) => {
            if (c.id !== dragClip.clip.id) return c;
            if (dragType === 'move') {
              return { ...c, startTime: Math.max(0, dragClip.originalStart + deltaTime) };
            } else if (dragType === 'trim-start') {
              const newStart = Math.max(0, dragClip.originalStart + deltaTime);
              const newDuration = dragClip.originalDuration - (newStart - dragClip.originalStart);
              if (newDuration < 100) return c;
              return { ...c, startTime: newStart, duration: newDuration };
            } else if (dragType === 'trim-end') {
              const newDuration = Math.max(100, dragClip.originalDuration + deltaTime);
              return { ...c, duration: newDuration };
            }
            return c;
          }),
        };
      });
      onTimelineChange({ ...timeline, tracks: newTracks });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      setDragType(null);
      setDragClip(null);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragClip, dragType, dragStartX, timeline, pixelToTime, onTimelineChange]);

  // 删除选中的 Clip
  const deleteSelectedClip = useCallback(() => {
    if (!timeline || !selectedClipId) return;
    const newTracks = timeline.tracks.map((track) => ({
      ...track,
      clips: track.clips.filter((c) => c.id !== selectedClipId),
    }));
    onTimelineChange({ ...timeline, tracks: newTracks });
    onClipSelect(null);
  }, [timeline, selectedClipId, onTimelineChange, onClipSelect]);

  // 键盘快捷键
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        deleteSelectedClip();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [deleteSelectedClip]);

  if (!timeline) {
    return (
      <div className="timelineEmpty">
        <p>请先加载项目</p>
      </div>
    );
  }

  const timelineWidth = Math.max(timeToPixel(timeline.duration), 2000);
  const playheadPosition = timeToPixel(currentTime) - scrollLeft;

  return (
    <div className="timelineContainer">
      {/* 工具栏 */}
      <div className="timelineToolbar">
        <Dropdown
          menu={{
            items: [
              { key: 'video', label: '视频轨道', onClick: () => addTrack('video') },
              { key: 'audio', label: '音频轨道', onClick: () => addTrack('audio') },
              { key: 'subtitle', label: '字幕轨道', onClick: () => addTrack('subtitle') },
            ],
          }}
        >
          <Button icon={<PlusOutlined />} size="small">添加轨道</Button>
        </Dropdown>
        <div className="timelineSpacer" />
        <Tooltip title="剪切">
          <Button icon={<ScissorOutlined />} size="small" disabled={!selectedClipId} />
        </Tooltip>
        <Tooltip title="删除">
          <Button icon={<DeleteOutlined />} size="small" danger disabled={!selectedClipId} onClick={deleteSelectedClip} />
        </Tooltip>
        <div className="timelineSpacer" />
        <Button icon={<ZoomOutOutlined />} size="small" onClick={() => handleZoom(-0.02)} />
        <span className="timelineScaleLabel">{Math.round(scale * 1000)}%</span>
        <Button icon={<ZoomInOutlined />} size="small" onClick={() => handleZoom(0.02)} />
      </div>

      {/* 时间线主体 */}
      <div className="timelineBody" onWheel={handleWheel}>
        {/* 轨道头部 */}
        <div className="trackHeaders">
          {timeline.tracks.map((track) => (
            <div key={track.id} className="trackHeader" style={{ height: track.height }}>
              <span className="trackName">{track.name}</span>
              <div className="trackControls">
                <Tooltip title={track.muted ? '取消静音' : '静音'}>
                  <Button
                    type="text"
                    size="small"
                    icon={track.muted ? <AudioMutedOutlined /> : <SoundOutlined />}
                    onClick={() => toggleTrackMute(track.id)}
                  />
                </Tooltip>
                <Tooltip title={track.visible ? '隐藏' : '显示'}>
                  <Button
                    type="text"
                    size="small"
                    icon={track.visible ? <EyeOutlined /> : <EyeInvisibleOutlined />}
                    onClick={() => toggleTrackVisible(track.id)}
                  />
                </Tooltip>
                <Tooltip title={track.locked ? '解锁' : '锁定'}>
                  <Button
                    type="text"
                    size="small"
                    icon={track.locked ? <LockOutlined /> : <UnlockOutlined />}
                    onClick={() => toggleTrackLock(track.id)}
                  />
                </Tooltip>
              </div>
            </div>
          ))}
        </div>

        {/* 时间线区域 */}
        <div
          ref={containerRef}
          className="timelineArea"
          onScroll={(e) => setScrollLeft((e.target as HTMLDivElement).scrollLeft)}
        >
          {/* 时间标尺 */}
          <div className="timelineRuler" style={{ width: timelineWidth }} onClick={handleRulerClick}>
            {Array.from({ length: Math.ceil(timeline.duration / 1000) + 1 }).map((_, i) => (
              <div key={i} className="rulerMark" style={{ left: timeToPixel(i * 1000) }}>
                {i}s
              </div>
            ))}
          </div>

          {/* 轨道内容 */}
          <div className="timelineTracks" style={{ width: timelineWidth }}>
            {timeline.tracks.map((track) => (
              <div
                key={track.id}
                className={`timelineTrack ${!track.visible ? 'trackHidden' : ''} ${track.locked ? 'trackLocked' : ''}`}
                style={{ height: track.height }}
              >
                {track.clips.map((clip) => (
                  <div
                    key={clip.id}
                    className={`timelineClip ${getClipClass(clip.type)} ${clip.id === selectedClipId ? 'selected' : ''}`}
                    style={{
                      left: timeToPixel(clip.startTime),
                      width: timeToPixel(clip.duration),
                    }}
                    onClick={(e) => { e.stopPropagation(); onClipSelect(clip.id); }}
                  >
                    <div
                      className="clipTrimHandle"
                      onMouseDown={(e) => handleClipMouseDown(e, clip, 'trim-start')}
                    />
                    <div
                      className="clipContent"
                      onMouseDown={(e) => handleClipMouseDown(e, clip, 'move')}
                    >
                      <span className="clipName">{clip.name}</span>
                    </div>
                    <div
                      className="clipTrimHandle right"
                      onMouseDown={(e) => handleClipMouseDown(e, clip, 'trim-end')}
                    />
                  </div>
                ))}
              </div>
            ))}
          </div>

          {/* 播放头 */}
          <div className="timelinePlayhead" style={{ left: playheadPosition }} />
        </div>
      </div>
    </div>
  );
}

function getClipClass(type: string): string {
  switch (type) {
    case 'video': return 'clipVideo';
    case 'audio': return 'clipAudio';
    case 'image': return 'clipImage';
    case 'subtitle': return 'clipSubtitle';
    default: return '';
  }
}

export default Timeline;

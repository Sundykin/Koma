/**
 * 简洁版时间线组件
 * 迁移自 electron-egg，高性能拖拽
 */
import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { Track, Clip, Asset, MediaType, Keyframe, EasingType, InsertPosition } from '../../types/editor';
import { toKomaLocalUrl } from '../../utils/urlUtils';
import { useVideoFramesBatch } from './useVideoFrames';
import {
  Play, Pause, Film, Music, Type, Trash2, Copy, ZoomIn, ZoomOut, Magnet,
  Volume2, VolumeX, Eye, EyeOff, Pencil, Check, X
} from 'lucide-react';

interface TimelineProps {
  tracks: Track[];
  currentTime: number;
  duration: number;
  onSeek: (time: number) => void;
  selectedClipId: string | null;
  onSelectClip: (id: string | null) => void;
  onUpdateClip: (clipId: string, updates: Partial<Clip>) => void;
  onMoveClip: (clipId: string, newTime: number, newTrackId: string) => void;
  onAssetDrop: (asset: Asset, time: number, trackId?: string) => void;
  onDeleteClip?: (clipId: string) => void;
  onAddKeyframe?: (clipId: string, clipLocalTime: number) => void;
  onSelectKeyframe?: (clipId: string, keyframeId: string | null) => void;
  onDeleteKeyframe?: (clipId: string, keyframeId: string) => void;
  onDuplicateClip?: (clipId: string) => void;
  onUpdateKeyframeEasing?: (clipId: string, keyframeId: string, easing: EasingType) => void;
  selectedKeyframeId?: string | null;
  isPlaying: boolean;
  togglePlay: () => void;
  onDeleteTrack: (trackId: string) => void;
  draggingAsset: Asset | null;
  onExport?: () => void;
}

// 缓动选项
const EASING_OPTIONS: { value: EasingType; label: string }[] = [
  { value: EasingType.LINEAR, label: '线性' },
  { value: EasingType.EASE_IN, label: '缓入' },
  { value: EasingType.EASE_OUT, label: '缓出' },
  { value: EasingType.EASE_IN_OUT, label: '缓入缓出' },
  { value: EasingType.EASE_IN_CUBIC, label: '三次缓入' },
  { value: EasingType.EASE_OUT_CUBIC, label: '三次缓出' },
  { value: EasingType.EASE_IN_OUT_CUBIC, label: '三次缓入缓出' },
];

// 右键菜单状态
interface ContextMenuState {
  type: 'clip' | 'keyframe';
  x: number;
  y: number;
  clipId: string;
  keyframeId?: string;
  clipLocalTime?: number;
}

// 基础常量
const BASE_PIXELS_PER_SECOND = 20;
const TRACK_HEIGHT = 80;
const CLIP_HEIGHT = 64;
const RULER_HEIGHT = 32;
const HEADER_WIDTH = 200;
const DRAG_THRESHOLD = 5;

// 缩放配置
const ZOOM_MIN = 0.1;
const ZOOM_MAX = 5;
const ZOOM_STEP = 0.1;
const ZOOM_PRESETS = [0.25, 0.5, 1, 2, 3];

// 吸附配置
const SNAP_THRESHOLD = 8; // 像素距离阈值
const SNAP_TARGETS = ['playhead', 'clipStart', 'clipEnd'] as const;
type SnapTarget = typeof SNAP_TARGETS[number];

// 计算动态刻度间隔
const getMarkerInterval = (pixelsPerSecond: number): number => {
  // 根据缩放级别自动调整刻度间隔
  if (pixelsPerSecond >= 100) return 1;    // 每秒一个
  if (pixelsPerSecond >= 50) return 2;     // 每2秒
  if (pixelsPerSecond >= 20) return 5;     // 每5秒
  if (pixelsPerSecond >= 10) return 10;    // 每10秒
  if (pixelsPerSecond >= 5) return 30;     // 每30秒
  return 60;                                // 每分钟
};

const formatTime = (seconds: number): string => {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 100);
  return `${m}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
};

// Filmstrip 组件
const Filmstrip: React.FC<{ clip: Clip; frames?: string[]; pixelsPerSecond: number }> = ({ clip, frames, pixelsPerSecond }) => {
  if (clip.type === MediaType.TEXT) {
    return (
      <div className="w-full h-full flex items-center px-2 pointer-events-none overflow-hidden bg-purple-900/40">
        <span className="text-[10px] text-zinc-200 truncate">{clip.name}</span>
      </div>
    );
  }

  if (clip.type === MediaType.AUDIO) {
    return (
      <div className="w-full h-full flex items-center overflow-hidden bg-green-900/40 pointer-events-none px-1">
        <div className="flex gap-0.5 h-1/2 w-full items-center">
          {Array.from({ length: Math.ceil(clip.duration * 5) }).map((_, i) => (
            <div key={i} className="w-1 bg-green-400/50 rounded-full flex-shrink-0" style={{ height: `${20 + Math.random() * 80}%` }} />
          ))}
        </div>
        <span className="absolute left-2 text-[10px] text-zinc-300 drop-shadow truncate">{clip.name}</span>
      </div>
    );
  }

  const frameAspectRatio = 16 / 9;
  const frameWidth = CLIP_HEIGHT * frameAspectRatio;
  const totalWidth = clip.duration * pixelsPerSecond;
  const frameCount = Math.max(1, Math.ceil(totalWidth / frameWidth));

  const hasFrames = frames && frames.length > 0;
  const fallbackSrc = toKomaLocalUrl(clip.src);

  // 帧提取的帧率（与 useVideoFrames 中一致，默认 1fps）
  const extractFps = 1;
  // 每个显示格子对应的时间跨度（秒）
  const timePerFrame = frameWidth / pixelsPerSecond;

  return (
    <div className="flex h-full w-full pointer-events-none select-none overflow-hidden bg-blue-900/20">
      {Array.from({ length: frameCount }).map((_, i) => {
        // 计算该位置对应的片段内时间（秒）
        const positionTime = i * timePerFrame;
        // 根据时间计算应显示的帧索引
        let frameIndex = Math.floor(positionTime * extractFps);
        // 确保不越界
        if (hasFrames) {
          frameIndex = Math.min(frameIndex, frames.length - 1);
        }
        const frameSrc = hasFrames ? frames[frameIndex] : fallbackSrc;

        return (
          <div key={i} className="flex-shrink-0 h-full border-r border-white/20 relative bg-zinc-800" style={{ width: frameWidth }}>
            <img
              src={frameSrc}
              className="w-full h-full object-cover opacity-90"
              alt=""
              draggable={false}
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                target.style.opacity = '0';
              }}
            />
            <div className="absolute inset-0 bg-gradient-to-br from-blue-900/30 to-blue-800/20 -z-10" />
          </div>
        );
      })}
      <span className="absolute top-1 left-2 text-[10px] text-white font-medium truncate px-1 drop-shadow-md z-10 bg-black/40 rounded">
        {clip.name}
      </span>
    </div>
  );
};

export const SimpleTimeline: React.FC<TimelineProps> = ({
  tracks,
  currentTime,
  duration,
  onSeek,
  selectedClipId,
  onSelectClip,
  onUpdateClip,
  onMoveClip,
  onAssetDrop,
  onDeleteClip,
  onAddKeyframe,
  onSelectKeyframe,
  onDeleteKeyframe,
  onDuplicateClip,
  onUpdateKeyframeEasing,
  selectedKeyframeId,
  isPlaying,
  togglePlay,
  onDeleteTrack,
  draggingAsset,
  onExport
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const rulerRef = useRef<HTMLDivElement>(null);

  // 缩放与吸附状态
  const [zoom, setZoom] = useState(1);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [snapLine, setSnapLine] = useState<{ x: number; type: SnapTarget } | null>(null);

  // 动态计算每秒像素数
  const pixelsPerSecond = BASE_PIXELS_PER_SECOND * zoom;
  const markerInterval = getMarkerInterval(pixelsPerSecond);

  const [isDraggingPlayhead, setIsDraggingPlayhead] = useState(false);
  const playheadDragStart = useRef<{ startX: number; startTime: number } | null>(null);
  const [highlightedTrackId, setHighlightedTrackId] = useState<string | null>(null);
  const [mousePos, setMousePos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  // 片段拖拽状态
  const [dragState, setDragState] = useState<{
    clipId: string;
    clip: Clip;
    startX: number;
    startY: number;
    originalStart: number;
    originalTrackId: string;
    currentX: number;
    currentY: number;
    isDragging: boolean;
    currentTrackId: string | null;
  } | null>(null);

  // 片段缩放状态
  const [resizeState, setResizeState] = useState<{
    clipId: string;
    edge: 'start' | 'end';
    startX: number;
    originalStart: number;
    originalDuration: number;
    originalOffset: number;
    sourceDuration: number; // 源素材总时长，用于边界限制
    clipType: MediaType;    // 片段类型
  } | null>(null);

  // 计算时间轴总长度
  const maxClipEndTime = tracks.reduce((max, track) => {
    const trackMax = track.clips.reduce((tMax, clip) => Math.max(tMax, clip.start + clip.duration), 0);
    return Math.max(max, trackMax);
  }, 0);
  const totalSeconds = Math.max(duration, maxClipEndTime + 10, 60);
  const totalWidth = totalSeconds * pixelsPerSecond;

  // 收集所有吸附点（用于拖拽时的吸附）
  const snapPoints = useMemo(() => {
    const points: Array<{ time: number; type: SnapTarget }> = [];
    // 播放头位置
    points.push({ time: currentTime, type: 'playhead' });
    // 所有片段的起止点
    tracks.forEach(track => {
      track.clips.forEach(clip => {
        points.push({ time: clip.start, type: 'clipStart' });
        points.push({ time: clip.start + clip.duration, type: 'clipEnd' });
      });
    });
    return points;
  }, [tracks, currentTime]);

  // 收集所有视频片段用于帧提取
  const videoClips = useMemo(() => {
    const clips: Array<{ id: string; src: string; type: string }> = [];
    for (const track of tracks) {
      for (const clip of track.clips) {
        if (clip.type === MediaType.VIDEO || clip.type === MediaType.IMAGE) {
          clips.push({ id: clip.id, src: clip.src, type: clip.type === MediaType.VIDEO ? 'video' : 'image' });
        }
      }
    }
    return clips;
  }, [tracks]);

  // 批量获取视频帧
  const frameMap = useVideoFramesBatch(videoClips);

  // 播放头位置 - 用 ref 避免状态更新循环
  const playheadPositionRef = useRef({ viewportX: 0, lineTop: 0 });
  const [, forceUpdate] = useState(0);

  // 更新播放头位置 (只在滚动/resize时更新state，播放时用CSS)
  const updatePlayheadRef = useCallback(() => {
    if (!containerRef.current || !rulerRef.current) return;
    const containerRect = containerRef.current.getBoundingClientRect();
    const rulerRect = rulerRef.current.getBoundingClientRect();
    playheadPositionRef.current = {
      viewportX: containerRect.left + HEADER_WIDTH,
      lineTop: rulerRect.bottom
    };
  }, []);

  useEffect(() => {
    updatePlayheadRef();
    const container = containerRef.current;
    if (!container) return;

    const handleScroll = () => {
      updatePlayheadRef();
      forceUpdate(n => n + 1);
    };

    container.addEventListener('scroll', handleScroll);
    window.addEventListener('resize', handleScroll);

    return () => {
      container.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleScroll);
    };
  }, [updatePlayheadRef]);

  // 计算实际的播放头 X 坐标
  const scrollLeft = containerRef.current?.scrollLeft || 0;
  const playheadX = playheadPositionRef.current.viewportX + currentTime * pixelsPerSecond - scrollLeft;

  // 吸附检测函数
  const findSnapPoint = useCallback((time: number, excludeClipId?: string): { time: number; type: SnapTarget } | null => {
    if (!snapEnabled) return null;

    for (const point of snapPoints) {
      const pixelDiff = Math.abs((point.time - time) * pixelsPerSecond);
      if (pixelDiff < SNAP_THRESHOLD) {
        return point;
      }
    }
    return null;
  }, [snapEnabled, snapPoints, pixelsPerSecond]);

  // 缩放控制
  const handleZoomIn = useCallback(() => {
    setZoom(z => Math.min(ZOOM_MAX, z + ZOOM_STEP));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom(z => Math.max(ZOOM_MIN, z - ZOOM_STEP));
  }, []);

  const handleZoomPreset = useCallback((preset: number) => {
    setZoom(preset);
  }, []);

  // Ctrl+滚轮缩放
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
        setZoom(z => Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z + delta)));
      }
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, []);

  // 播放头拖拽
  const handlePlayheadMouseDown = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setIsDraggingPlayhead(true);
    playheadDragStart.current = { startX: e.clientX, startTime: currentTime };
  }, [currentTime]);

  useEffect(() => {
    if (!isDraggingPlayhead) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!playheadDragStart.current) return;
      const deltaX = e.clientX - playheadDragStart.current.startX;
      const deltaSeconds = deltaX / pixelsPerSecond;
      const newTime = Math.max(0, Math.min(totalSeconds, playheadDragStart.current.startTime + deltaSeconds));
      onSeek(newTime);
    };

    const handleMouseUp = () => {
      setIsDraggingPlayhead(false);
      playheadDragStart.current = null;
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDraggingPlayhead, onSeek, totalSeconds, pixelsPerSecond]);

  // 片段拖拽/缩放
  useEffect(() => {
    if (dragState) {
      const handleMouseMove = (e: MouseEvent) => {
        const deltaX = e.clientX - dragState.startX;
        const deltaY = e.clientY - dragState.startY;
        const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
        const shouldDrag = distance >= DRAG_THRESHOLD;

        const elements = document.elementsFromPoint(e.clientX, e.clientY);
        let foundTrackId: string | null = null;

        for (const el of elements) {
          if (el instanceof HTMLElement && el.dataset.trackId) {
            foundTrackId = el.dataset.trackId;
            if (shouldDrag) setHighlightedTrackId(foundTrackId);
            break;
          }
        }

        setDragState(prev => prev ? {
          ...prev,
          currentX: e.clientX,
          currentY: e.clientY,
          isDragging: shouldDrag,
          currentTrackId: foundTrackId
        } : null);

        if (shouldDrag && foundTrackId) {
          const deltaSeconds = deltaX / pixelsPerSecond;
          let newStart = Math.max(0, dragState.originalStart + deltaSeconds);

          // 吸附检测
          if (snapEnabled) {
            const clipEnd = newStart + dragState.clip.duration;

            // 检查片段起点吸附
            const startSnap = findSnapPoint(newStart, dragState.clipId);
            if (startSnap) {
              newStart = startSnap.time;
              setSnapLine({ x: newStart * pixelsPerSecond, type: startSnap.type });
            } else {
              // 检查片段终点吸附
              const endSnap = findSnapPoint(clipEnd, dragState.clipId);
              if (endSnap) {
                newStart = endSnap.time - dragState.clip.duration;
                setSnapLine({ x: endSnap.time * pixelsPerSecond, type: endSnap.type });
              } else {
                setSnapLine(null);
              }
            }
          }

          onMoveClip(dragState.clipId, newStart, foundTrackId);
        }
      };

      const handleMouseUp = () => {
        setDragState(null);
        setHighlightedTrackId(null);
        setSnapLine(null);
      };

      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }

    if (resizeState) {
      const handleResizeMove = (e: MouseEvent) => {
        const deltaX = e.clientX - resizeState.startX;
        const deltaSeconds = deltaX / pixelsPerSecond;

        // 图片/文本类型可以无限拉长，视频/音频受源素材时长限制
        const hasSourceLimit = resizeState.clipType === MediaType.VIDEO || resizeState.clipType === MediaType.AUDIO;
        const maxAvailable = hasSourceLimit ? resizeState.sourceDuration : Infinity;

        if (resizeState.edge === 'end') {
          // 向右拉长：检查不超过源素材剩余长度
          // 可用的最大时长 = sourceDuration - offset
          const maxDuration = hasSourceLimit
            ? maxAvailable - resizeState.originalOffset
            : Infinity;
          const newDuration = Math.max(0.1, Math.min(maxDuration, resizeState.originalDuration + deltaSeconds));
          onUpdateClip(resizeState.clipId, { duration: newDuration });
        } else {
          // 向左拉长：检查不超过 offset（不能小于 0）
          let newStart = resizeState.originalStart + deltaSeconds;
          const endTime = resizeState.originalStart + resizeState.originalDuration;

          // 计算对应的新 offset
          const newOffset = resizeState.originalOffset + (newStart - resizeState.originalStart);

          // 边界检查
          if (newStart < 0) newStart = 0;
          if (newStart > endTime - 0.1) newStart = endTime - 0.1;

          // 对于视频/音频，检查 offset 不能小于 0
          if (hasSourceLimit && newOffset < 0) {
            // 限制 newStart，使 offset 刚好为 0
            newStart = resizeState.originalStart - resizeState.originalOffset;
          }

          const newDuration = endTime - newStart;
          const finalOffset = Math.max(0, resizeState.originalOffset + (newStart - resizeState.originalStart));
          onUpdateClip(resizeState.clipId, { start: newStart, duration: newDuration, offset: finalOffset });
        }
      };
      const handleResizeUp = () => setResizeState(null);

      window.addEventListener('mousemove', handleResizeMove);
      window.addEventListener('mouseup', handleResizeUp);
      return () => {
        window.removeEventListener('mousemove', handleResizeMove);
        window.removeEventListener('mouseup', handleResizeUp);
      };
    }
  }, [dragState, resizeState, onUpdateClip, onMoveClip, pixelsPerSecond, snapEnabled, findSnapPoint]);

  const handleClipMouseDown = (e: React.MouseEvent, clip: Clip) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest('[class*="cursor-w-resize"]') || target.closest('[class*="cursor-e-resize"]')) return;

    e.stopPropagation();
    onSelectClip(clip.id);
    setDragState({
      clipId: clip.id,
      clip,
      startX: e.clientX,
      startY: e.clientY,
      originalStart: clip.start,
      originalTrackId: clip.trackId,
      currentX: e.clientX,
      currentY: e.clientY,
      isDragging: false,
      currentTrackId: clip.trackId
    });
  };

  const handleResizeMouseDown = (e: React.MouseEvent, clip: Clip, edge: 'start' | 'end') => {
    e.stopPropagation();
    // 获取源素材时长：优先使用 clip.sourceDuration，否则用当前 duration + offset 作为估算
    const sourceDuration = clip.sourceDuration ?? (clip.duration + clip.offset);
    console.log('[Resize] 开始:', {
      clipId: clip.id,
      type: clip.type,
      duration: clip.duration,
      offset: clip.offset,
      sourceDuration,
      edge
    });
    setResizeState({
      clipId: clip.id,
      edge,
      startX: e.clientX,
      originalStart: clip.start,
      originalDuration: clip.duration,
      originalOffset: clip.offset,
      sourceDuration,
      clipType: clip.type
    });
  };

  const handleDragOver = (e: React.DragEvent, trackId?: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setMousePos({ x: e.clientX, y: e.clientY });
    if (trackId) setHighlightedTrackId(trackId);
  };

  const handleDrop = (e: React.DragEvent, trackId?: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (!containerRef.current) return;

    const json = e.dataTransfer.getData('application/json');
    if (!json) return;

    try {
      const asset = JSON.parse(json) as Asset;
      const containerRect = containerRef.current.getBoundingClientRect();
      const dropX = e.clientX - containerRect.left + containerRef.current.scrollLeft - HEADER_WIDTH;
      const time = Math.max(0, dropX / pixelsPerSecond);
      onAssetDrop(asset, time, trackId);
    } catch (err) {
      console.error("Drop failed", err);
    } finally {
      setHighlightedTrackId(null);
    }
  };

  // 关闭右键菜单
  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  // 片段右键菜单
  const handleClipContextMenu = useCallback((e: React.MouseEvent, clip: Clip) => {
    e.preventDefault();
    e.stopPropagation();

    // 计算片段内的本地时间
    const containerRect = containerRef.current?.getBoundingClientRect();
    if (!containerRect) return;

    const scrollLeft = containerRef.current?.scrollLeft || 0;
    const clickX = e.clientX - containerRect.left + scrollLeft - HEADER_WIDTH;
    const clickTime = clickX / pixelsPerSecond;
    const clipLocalTime = Math.max(0, Math.min(clip.duration, clickTime - clip.start));

    onSelectClip(clip.id);
    setContextMenu({
      type: 'clip',
      x: e.clientX,
      y: e.clientY,
      clipId: clip.id,
      clipLocalTime
    });
  }, [onSelectClip, pixelsPerSecond]);

  // 关键帧右键菜单
  const handleKeyframeContextMenu = useCallback((e: React.MouseEvent, clipId: string, keyframe: Keyframe) => {
    e.preventDefault();
    e.stopPropagation();

    onSelectKeyframe?.(clipId, keyframe.id);
    setContextMenu({
      type: 'keyframe',
      x: e.clientX,
      y: e.clientY,
      clipId,
      keyframeId: keyframe.id
    });
  }, [onSelectKeyframe]);

  // 全局点击关闭菜单
  useEffect(() => {
    if (!contextMenu) return;
    const handleClick = () => closeContextMenu();
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, [contextMenu, closeContextMenu]);

  // 生成刻度（动态间隔）
  const markers = useMemo(() => {
    const result = [];
    for (let i = 0; i < totalSeconds; i += markerInterval) {
      result.push(
        <div key={i} className="absolute top-0 h-full flex flex-col justify-end pb-1 select-none pointer-events-none" style={{ left: i * pixelsPerSecond }}>
          <div className="h-3 border-l border-zinc-500" />
          <span className="text-[10px] text-zinc-500 pl-1 whitespace-nowrap">{formatTime(i)}</span>
        </div>
      );
      // 添加中间小刻度
      if (markerInterval >= 5) {
        for (let j = 1; j < markerInterval && i + j < totalSeconds; j++) {
          if (j === markerInterval / 2) {
            result.push(
              <div key={`${i}-${j}`} className="absolute top-0 h-full flex flex-col justify-end pb-1 select-none pointer-events-none" style={{ left: (i + j) * pixelsPerSecond }}>
                <div className="h-2 border-l border-zinc-700" />
              </div>
            );
          }
        }
      }
    }
    return result;
  }, [totalSeconds, markerInterval, pixelsPerSecond]);

  return (
    <div className="flex flex-col h-full bg-[#18181b] border-t border-[#27272a] select-none">
      {/* 工具栏 */}
      <div className="h-10 border-b border-[#27272a] flex items-center px-4 justify-between bg-[#18181b] flex-shrink-0 z-50">
        <div className="flex items-center gap-4">
          <button onClick={togglePlay} className="text-zinc-300 hover:text-white transition-colors">
            {isPlaying ? <Pause size={18} /> : <Play size={18} />}
          </button>
          <span className="text-xs font-mono text-cyan-400">{formatTime(currentTime)}</span>
          <span className="text-xs text-zinc-600">/</span>
          <span className="text-xs font-mono text-zinc-500">{formatTime(duration)}</span>
        </div>

        {/* 缩放和吸附控件 */}
        <div className="flex items-center gap-3">
          {/* 吸附开关 */}
          <button
            onClick={() => setSnapEnabled(!snapEnabled)}
            className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs transition-colors ${
              snapEnabled
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/50'
                : 'bg-zinc-800 text-zinc-500 hover:text-zinc-300'
            }`}
            title="吸附对齐"
          >
            <Magnet size={12} />
            <span>吸附</span>
          </button>

          {/* 缩放控件 */}
          <div className="flex items-center gap-1 bg-zinc-800 rounded px-1">
            <button
              onClick={handleZoomOut}
              className="p-1 text-zinc-400 hover:text-white transition-colors"
              title="缩小"
            >
              <ZoomOut size={14} />
            </button>

            {/* 缩放滑块 */}
            <input
              type="range"
              min={ZOOM_MIN}
              max={ZOOM_MAX}
              step={ZOOM_STEP}
              value={zoom}
              onChange={(e) => setZoom(parseFloat(e.target.value))}
              className="w-20 h-1 accent-cyan-500 cursor-pointer"
            />

            <button
              onClick={handleZoomIn}
              className="p-1 text-zinc-400 hover:text-white transition-colors"
              title="放大"
            >
              <ZoomIn size={14} />
            </button>

            <span className="text-xs text-zinc-400 w-10 text-center">{Math.round(zoom * 100)}%</span>
          </div>

          {/* 缩放预设 */}
          <div className="flex gap-0.5">
            {ZOOM_PRESETS.map(preset => (
              <button
                key={preset}
                onClick={() => handleZoomPreset(preset)}
                className={`px-1.5 py-0.5 text-[10px] rounded transition-colors ${
                  Math.abs(zoom - preset) < 0.05
                    ? 'bg-cyan-500/30 text-cyan-300'
                    : 'bg-zinc-800 text-zinc-500 hover:text-zinc-300'
                }`}
              >
                {preset}x
              </button>
            ))}
          </div>

          <span className="text-xs text-zinc-400">{tracks.length} 轨道</span>

          {/* 导出按钮 */}
          {onExport && (
            <button
              onClick={onExport}
              className="ml-2 px-3 py-1 bg-cyan-600 hover:bg-cyan-500 text-white text-xs rounded transition-colors"
            >
              导出
            </button>
          )}
        </div>
      </div>

      {/* 滚动区域 */}
      <div
        className="flex-1 overflow-auto bg-[#09090b] relative"
        ref={containerRef}
        onDragOver={(e) => handleDragOver(e)}
        onDrop={(e) => handleDrop(e)}
      >
        <div className="min-w-max pb-32" style={{ minWidth: totalWidth + HEADER_WIDTH }}>
          {/* 时间标尺 */}
          <div ref={rulerRef} className="sticky top-0 z-30 flex bg-[#0f0f10] border-b border-zinc-800" style={{ height: RULER_HEIGHT }}>
            <div className="sticky left-0 w-[200px] flex-shrink-0 bg-[#18181b] border-r border-[#27272a] z-40" />
            <div className="relative flex-1 h-full" style={{ width: totalWidth }}>
              {markers}
              {/* 播放头手柄 */}
              <div className="absolute top-0 z-50" style={{ left: currentTime * pixelsPerSecond }}>
                <div
                  className={`absolute top-0 left-0 -translate-x-1/2 transition-transform ${isDraggingPlayhead ? 'scale-110 cursor-grabbing' : 'hover:scale-105 cursor-grab'}`}
                  onMouseDown={handlePlayheadMouseDown}
                >
                  <svg width="12" height="16" viewBox="0 0 12 16">
                    <path d="M1 1C1 0.447715 1.44772 0 2 0H10C10.5523 0 11 0.447715 11 1V11.382C11 11.7607 10.786 12.107 10.4472 12.2764L6.44721 14.2764C6.16569 14.4172 5.83431 14.4172 5.55279 14.2764L1.55279 12.2764C1.214 12.107 1 11.7607 1 11.382V1Z" fill="#22d3ee" />
                  </svg>
                </div>
              </div>
            </div>
          </div>

          {/* 轨道列表 */}
          {tracks.map((track, index) => (
            <div
              key={track.id}
              data-track-id={track.id}
              className={`flex border-b border-[#27272a]/30 group/track relative transition-all ${
                highlightedTrackId === track.id ? 'bg-cyan-500/20 ring-1 ring-cyan-500/50' : 'bg-zinc-900/20 hover:bg-zinc-900/40'
              } ${track.isMainTrack ? 'border-l-4 border-l-blue-500' : ''}`}
              style={{ height: TRACK_HEIGHT }}
              onDragOver={(e) => handleDragOver(e, track.id)}
              onDrop={(e) => handleDrop(e, track.id)}
            >
              {/* 轨道头部 */}
              <div className="sticky left-0 w-[200px] flex-shrink-0 bg-[#18181b] border-r border-[#27272a] z-20 flex flex-col justify-center px-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-zinc-400 text-xs font-medium">
                    {track.type === 'video' && <Film size={14} className="text-blue-400" />}
                    {track.type === 'audio' && <Music size={14} className="text-green-400" />}
                    {track.type === 'text' && <Type size={14} className="text-purple-400" />}
                    <span className="truncate">{track.isMainTrack ? '主轨道' : `${track.type.toUpperCase()} ${index + 1}`}</span>
                  </div>
                  {!track.isMainTrack && (
                    <button
                      onClick={() => onDeleteTrack(track.id)}
                      className="opacity-0 group-hover/track:opacity-100 text-red-400 hover:text-red-300 p-1 rounded"
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
              </div>

              {/* 轨道内容 */}
              <div className="relative flex-1 h-full" style={{ width: totalWidth }}>
                {track.clips.map(clip => (
                  <div
                    key={clip.id}
                    onMouseDown={(e) => handleClipMouseDown(e, clip)}
                    onContextMenu={(e) => handleClipContextMenu(e, clip)}
                    className={`absolute top-2 bottom-2 rounded-md overflow-hidden transition-shadow border shadow-sm group/clip select-none
                      ${selectedClipId === clip.id ? 'border-cyan-400 ring-2 ring-cyan-500/20 z-10' : 'border-transparent hover:border-zinc-500 z-0'}
                      ${dragState?.clipId === clip.id ? 'cursor-grabbing opacity-90 shadow-xl' : 'cursor-grab'}
                    `}
                    style={{ left: clip.start * pixelsPerSecond, width: clip.duration * pixelsPerSecond }}
                  >
                    <Filmstrip clip={clip} frames={frameMap.get(clip.id)?.frames} pixelsPerSecond={pixelsPerSecond} />

                    {/* 关键帧标记 */}
                    {clip.keyframes?.map(kf => (
                      <div
                        key={kf.id}
                        className={`absolute top-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 cursor-pointer z-30 ${selectedKeyframeId === kf.id ? 'scale-125' : 'hover:scale-110'}`}
                        style={{ left: kf.time * pixelsPerSecond }}
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectKeyframe?.(clip.id, kf.id);
                          onSeek(clip.start + kf.time);
                        }}
                        onContextMenu={(e) => handleKeyframeContextMenu(e, clip.id, kf)}
                      >
                        <svg viewBox="0 0 12 12" className="w-full h-full drop-shadow">
                          <path d="M6 0L12 6L6 12L0 6Z" fill={selectedKeyframeId === kf.id ? '#22d3ee' : '#facc15'} stroke={selectedKeyframeId === kf.id ? '#0891b2' : '#ca8a04'} strokeWidth="1" />
                        </svg>
                      </div>
                    ))}

                    {selectedClipId === clip.id && (
                      <>
                        <div className="absolute left-0 top-0 bottom-0 w-3 cursor-w-resize hover:bg-cyan-400/50 z-20 flex items-center justify-center" onMouseDown={(e) => handleResizeMouseDown(e, clip, 'start')}>
                          <div className="w-1 h-4 bg-white/80 rounded-full" />
                        </div>
                        <div className="absolute right-0 top-0 bottom-0 w-3 cursor-e-resize hover:bg-cyan-400/50 z-20 flex items-center justify-center" onMouseDown={(e) => handleResizeMouseDown(e, clip, 'end')}>
                          <div className="w-1 h-4 bg-white/80 rounded-full" />
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}

          {/* 新建轨道区域 */}
          <div className="flex h-24 group" onDragOver={(e) => handleDragOver(e)} onDrop={(e) => handleDrop(e)}>
            <div className="sticky left-0 w-[200px] flex-shrink-0 bg-[#18181b] border-r border-[#27272a] z-20" />
            <div className="flex-1 border-t-2 border-dashed border-zinc-800 m-2 rounded flex items-center justify-center text-zinc-700 transition-colors group-hover:border-zinc-600">
              拖入素材创建新轨道
            </div>
          </div>
        </div>
      </div>

      {/* 播放头竖线 */}
      {playheadX > 0 && playheadPositionRef.current.lineTop > 0 && (
        <div
          className="fixed bg-cyan-400 pointer-events-none z-20"
          style={{
            left: playheadX,
            top: playheadPositionRef.current.lineTop,
            bottom: 0,
            width: 1,
            transform: 'translateX(-50%)',
          }}
        />
      )}

      {/* 吸附对齐线 */}
      {snapLine && playheadPositionRef.current.lineTop > 0 && (
        <div
          className="fixed pointer-events-none z-30"
          style={{
            left: playheadPositionRef.current.viewportX + snapLine.x - (containerRef.current?.scrollLeft || 0),
            top: playheadPositionRef.current.lineTop,
            bottom: 0,
            width: 2,
            transform: 'translateX(-50%)',
            background: snapLine.type === 'playhead'
              ? 'linear-gradient(to bottom, #22d3ee, #22d3ee 4px, transparent 4px, transparent 8px)'
              : 'linear-gradient(to bottom, #a855f7, #a855f7 4px, transparent 4px, transparent 8px)',
            backgroundSize: '2px 8px',
          }}
        />
      )}

      {/* 素材拖拽预览 */}
      {draggingAsset && (
        <div className="fixed pointer-events-none z-[9999] transform -translate-x-1/2 -translate-y-1/2" style={{ left: mousePos.x, top: mousePos.y }}>
          <div className="bg-cyan-500/90 text-white text-xs px-3 py-2 rounded-lg shadow-xl flex items-center gap-2 whitespace-nowrap">
            {(draggingAsset.type === MediaType.VIDEO || draggingAsset.type === MediaType.IMAGE) && <Film size={14} />}
            {draggingAsset.type === MediaType.AUDIO && <Music size={14} />}
            {draggingAsset.type === MediaType.TEXT && <Type size={14} />}
            <span className="font-medium">{draggingAsset.name}</span>
          </div>
        </div>
      )}

      {/* 右键菜单 */}
      {contextMenu && (
        <div
          className="fixed z-[10000] bg-zinc-900 border border-zinc-700 rounded-lg shadow-2xl py-1 min-w-[160px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          {contextMenu.type === 'clip' && (
            <>
              {/* 添加关键帧 */}
              {onAddKeyframe && contextMenu.clipLocalTime !== undefined && (
                <button
                  className="w-full px-3 py-1.5 text-left text-xs text-zinc-200 hover:bg-zinc-800 flex items-center gap-2"
                  onClick={() => {
                    onAddKeyframe(contextMenu.clipId, contextMenu.clipLocalTime!);
                    closeContextMenu();
                  }}
                >
                  <svg viewBox="0 0 12 12" className="w-3 h-3">
                    <path d="M6 0L12 6L6 12L0 6Z" fill="#facc15" />
                  </svg>
                  添加关键帧
                </button>
              )}

              {/* 复制片段 */}
              {onDuplicateClip && (
                <button
                  className="w-full px-3 py-1.5 text-left text-xs text-zinc-200 hover:bg-zinc-800 flex items-center gap-2"
                  onClick={() => {
                    onDuplicateClip(contextMenu.clipId);
                    closeContextMenu();
                  }}
                >
                  <Copy size={12} />
                  复制片段
                </button>
              )}

              <div className="my-1 border-t border-zinc-800" />

              {/* 删除片段 */}
              {onDeleteClip && (
                <button
                  className="w-full px-3 py-1.5 text-left text-xs text-red-400 hover:bg-red-900/30 flex items-center gap-2"
                  onClick={() => {
                    onDeleteClip(contextMenu.clipId);
                    closeContextMenu();
                  }}
                >
                  <Trash2 size={12} />
                  删除片段
                </button>
              )}
            </>
          )}

          {contextMenu.type === 'keyframe' && contextMenu.keyframeId && (
            <>
              {/* 缓动类型 */}
              <div className="px-3 py-1 text-[10px] text-zinc-500 uppercase tracking-wider">缓动类型</div>
              {EASING_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  className="w-full px-3 py-1.5 text-left text-xs text-zinc-200 hover:bg-zinc-800"
                  onClick={() => {
                    onUpdateKeyframeEasing?.(contextMenu.clipId, contextMenu.keyframeId!, opt.value);
                    closeContextMenu();
                  }}
                >
                  {opt.label}
                </button>
              ))}

              <div className="my-1 border-t border-zinc-800" />

              {/* 删除关键帧 */}
              {onDeleteKeyframe && (
                <button
                  className="w-full px-3 py-1.5 text-left text-xs text-red-400 hover:bg-red-900/30 flex items-center gap-2"
                  onClick={() => {
                    onDeleteKeyframe(contextMenu.clipId, contextMenu.keyframeId!);
                    closeContextMenu();
                  }}
                >
                  <Trash2 size={12} />
                  删除关键帧
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default SimpleTimeline;

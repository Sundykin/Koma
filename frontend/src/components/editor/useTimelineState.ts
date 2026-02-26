/**
 * SimpleTimeline 状态与逻辑 hook
 * 从 SimpleTimeline.tsx 拆分，保持组件为纯渲染层
 */
import { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { Track, Clip, Asset, MediaType, Keyframe } from '../../types/editor';
import { useVideoFramesBatch } from './useVideoFrames';
import { hasCollision } from '../../utils/trackCollision';

// 基础常量
export const BASE_PIXELS_PER_SECOND = 20;
export const TRACK_HEIGHT = 80;
export const CLIP_HEIGHT = 64;
export const RULER_HEIGHT = 32;
export const HEADER_WIDTH = 200;
const DRAG_THRESHOLD = 5;

// 缩放配置
export const ZOOM_MIN = 0.1;
export const ZOOM_MAX = 5;
export const ZOOM_STEP = 0.1;
export const ZOOM_PRESETS = [0.25, 0.5, 1, 2, 3];

// 吸附配置
const SNAP_THRESHOLD = 8;
const SNAP_TARGETS = ['playhead', 'clipStart', 'clipEnd'] as const;
export type SnapTarget = typeof SNAP_TARGETS[number];

// 右键菜单状态
export interface ContextMenuState {
  type: 'clip' | 'keyframe';
  x: number;
  y: number;
  clipId: string;
  keyframeId?: string;
  clipLocalTime?: number;
}

// 片段拖拽状态
export interface DragState {
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
  hasCollision: boolean;
}

// 片段缩放状态
export interface ResizeState {
  clipId: string;
  edge: 'start' | 'end';
  startX: number;
  originalStart: number;
  originalDuration: number;
  originalOffset: number;
  sourceDuration: number;
  clipType: MediaType;
}

export interface TimelineProps {
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
  onUpdateKeyframeEasing?: (clipId: string, keyframeId: string, easing: any) => void;
  selectedKeyframeId?: string | null;
  isPlaying: boolean;
  togglePlay: () => void;
  onDeleteTrack: (trackId: string) => void;
  onUpdateTrack?: (trackId: string, updates: Partial<Track>) => void;
  draggingAsset: Asset | null;
  onExport?: () => void;
}

// 计算动态刻度间隔
export const getMarkerInterval = (pixelsPerSecond: number): number => {
  if (pixelsPerSecond >= 100) return 1;
  if (pixelsPerSecond >= 50) return 2;
  if (pixelsPerSecond >= 20) return 5;
  if (pixelsPerSecond >= 10) return 10;
  if (pixelsPerSecond >= 5) return 30;
  return 60;
};

export const formatTime = (seconds: number): string => {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 100);
  return `${m}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
};

export function useTimelineState(props: TimelineProps) {
  const {
    tracks, currentTime, duration, onSeek, onSelectClip,
    onUpdateClip, onMoveClip, onAssetDrop, pixelsPerSecond: _,
    ...rest
  } = props as any;

  const containerRef = useRef<HTMLDivElement>(null);
  const rulerRef = useRef<HTMLDivElement>(null);

  // 缩放与吸附状态
  const [zoom, setZoom] = useState(1);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [snapLine, setSnapLine] = useState<{ x: number; type: SnapTarget } | null>(null);

  const pixelsPerSecond = BASE_PIXELS_PER_SECOND * zoom;
  const markerInterval = getMarkerInterval(pixelsPerSecond);

  const [isDraggingPlayhead, setIsDraggingPlayhead] = useState(false);
  const playheadDragStart = useRef<{ startX: number; startTime: number } | null>(null);
  const [highlightedTrackId, setHighlightedTrackId] = useState<string | null>(null);
  const [mousePos, setMousePos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [editingTrackId, setEditingTrackId] = useState<string | null>(null);
  const [editingTrackName, setEditingTrackName] = useState('');
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [resizeState, setResizeState] = useState<ResizeState | null>(null);

  // 计算时间轴总长度
  const maxClipEndTime = tracks.reduce((max: number, track: Track) => {
    const trackMax = track.clips.reduce((tMax: number, clip: Clip) => Math.max(tMax, clip.start + clip.duration), 0);
    return Math.max(max, trackMax);
  }, 0);
  const totalSeconds = Math.max(duration, maxClipEndTime + 10, 60);
  const totalWidth = totalSeconds * pixelsPerSecond;

  // 吸附点
  const snapPoints = useMemo(() => {
    const points: Array<{ time: number; type: SnapTarget }> = [];
    points.push({ time: currentTime, type: 'playhead' });
    tracks.forEach((track: Track) => {
      track.clips.forEach((clip: Clip) => {
        points.push({ time: clip.start, type: 'clipStart' });
        points.push({ time: clip.start + clip.duration, type: 'clipEnd' });
      });
    });
    return points;
  }, [tracks, currentTime]);

  // 视频帧
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

  const frameMap = useVideoFramesBatch(videoClips);

  // 播放头位置
  const playheadPositionRef = useRef({ viewportX: 0, lineTop: 0 });
  const [, forceUpdate] = useState(0);

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
    const handleScroll = () => { updatePlayheadRef(); forceUpdate(n => n + 1); };
    container.addEventListener('scroll', handleScroll);
    window.addEventListener('resize', handleScroll);
    return () => { container.removeEventListener('scroll', handleScroll); window.removeEventListener('resize', handleScroll); };
  }, [updatePlayheadRef]);

  const scrollLeft = containerRef.current?.scrollLeft || 0;
  const playheadX = playheadPositionRef.current.viewportX + currentTime * pixelsPerSecond - scrollLeft;

  // 吸附检测
  const findSnapPoint = useCallback((time: number, _excludeClipId?: string): { time: number; type: SnapTarget } | null => {
    if (!snapEnabled) return null;
    for (const point of snapPoints) {
      const pixelDiff = Math.abs((point.time - time) * pixelsPerSecond);
      if (pixelDiff < SNAP_THRESHOLD) return point;
    }
    return null;
  }, [snapEnabled, snapPoints, pixelsPerSecond]);

  // 缩放控制
  const handleZoomIn = useCallback(() => setZoom(z => Math.min(ZOOM_MAX, z + ZOOM_STEP)), []);
  const handleZoomOut = useCallback(() => setZoom(z => Math.max(ZOOM_MIN, z - ZOOM_STEP)), []);
  const handleZoomPreset = useCallback((preset: number) => setZoom(preset), []);

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
    const handleMouseUp = () => { setIsDraggingPlayhead(false); playheadDragStart.current = null; };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => { window.removeEventListener('mousemove', handleMouseMove); window.removeEventListener('mouseup', handleMouseUp); };
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

        if (shouldDrag && foundTrackId) {
          const deltaSeconds = deltaX / pixelsPerSecond;
          let newStart = Math.max(0, dragState.originalStart + deltaSeconds);

          if (snapEnabled) {
            const startSnap = findSnapPoint(newStart, dragState.clipId);
            if (startSnap) {
              newStart = startSnap.time;
              setSnapLine({ x: newStart * pixelsPerSecond, type: startSnap.type });
            } else {
              const clipEnd = newStart + dragState.clip.duration;
              const endSnap = findSnapPoint(clipEnd, dragState.clipId);
              if (endSnap) {
                newStart = endSnap.time - dragState.clip.duration;
                setSnapLine({ x: endSnap.time * pixelsPerSecond, type: endSnap.type });
              } else {
                setSnapLine(null);
              }
            }
          }

          const targetTrack = tracks.find((t: Track) => t.id === foundTrackId);
          const targetClips = targetTrack?.clips.filter((c: Clip) => c.id !== dragState.clipId) || [];
          const tempClip = { id: dragState.clipId, start: newStart, duration: dragState.clip.duration };
          const collision = hasCollision(tempClip, targetClips);

          setDragState(prev => prev ? {
            ...prev, currentX: e.clientX, currentY: e.clientY,
            isDragging: shouldDrag, currentTrackId: foundTrackId, hasCollision: collision
          } : null);

          onMoveClip(dragState.clipId, newStart, foundTrackId);
        } else {
          setDragState(prev => prev ? {
            ...prev, currentX: e.clientX, currentY: e.clientY,
            isDragging: shouldDrag, currentTrackId: foundTrackId
          } : null);
        }
      };

      const handleMouseUp = () => {
        if (dragState.hasCollision && dragState.isDragging) {
          onMoveClip(dragState.clipId, dragState.originalStart, dragState.originalTrackId);
        }
        setDragState(null);
        setHighlightedTrackId(null);
        setSnapLine(null);
      };

      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => { window.removeEventListener('mousemove', handleMouseMove); window.removeEventListener('mouseup', handleMouseUp); };
    }

    if (resizeState) {
      const handleResizeMove = (e: MouseEvent) => {
        const deltaX = e.clientX - resizeState.startX;
        const deltaSeconds = deltaX / pixelsPerSecond;
        const hasSourceLimit = resizeState.clipType === MediaType.VIDEO || resizeState.clipType === MediaType.AUDIO;
        const maxAvailable = hasSourceLimit ? resizeState.sourceDuration : Infinity;

        if (resizeState.edge === 'end') {
          const maxDuration = hasSourceLimit ? maxAvailable - resizeState.originalOffset : Infinity;
          const newDuration = Math.max(0.1, Math.min(maxDuration, resizeState.originalDuration + deltaSeconds));
          onUpdateClip(resizeState.clipId, { duration: newDuration });
        } else {
          let newStart = resizeState.originalStart + deltaSeconds;
          const endTime = resizeState.originalStart + resizeState.originalDuration;
          const newOffset = resizeState.originalOffset + (newStart - resizeState.originalStart);

          if (newStart < 0) newStart = 0;
          if (newStart > endTime - 0.1) newStart = endTime - 0.1;
          if (hasSourceLimit && newOffset < 0) {
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
      return () => { window.removeEventListener('mousemove', handleResizeMove); window.removeEventListener('mouseup', handleResizeUp); };
    }
  }, [dragState, resizeState, onUpdateClip, onMoveClip, pixelsPerSecond, snapEnabled, findSnapPoint, tracks]);

  const handleClipMouseDown = useCallback((e: React.MouseEvent, clip: Clip) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest('[class*="cursor-w-resize"]') || target.closest('[class*="cursor-e-resize"]')) return;
    e.stopPropagation();
    onSelectClip(clip.id);
    setDragState({
      clipId: clip.id, clip, startX: e.clientX, startY: e.clientY,
      originalStart: clip.start, originalTrackId: clip.trackId,
      currentX: e.clientX, currentY: e.clientY,
      isDragging: false, currentTrackId: clip.trackId, hasCollision: false
    });
  }, [onSelectClip]);

  const handleResizeMouseDown = useCallback((e: React.MouseEvent, clip: Clip, edge: 'start' | 'end') => {
    e.stopPropagation();
    const sourceDuration = clip.sourceDuration ?? (clip.duration + clip.offset);
    setResizeState({
      clipId: clip.id, edge, startX: e.clientX,
      originalStart: clip.start, originalDuration: clip.duration,
      originalOffset: clip.offset, sourceDuration, clipType: clip.type
    });
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, trackId?: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setMousePos({ x: e.clientX, y: e.clientY });
    if (trackId) setHighlightedTrackId(trackId);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, trackId?: string) => {
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
  }, [pixelsPerSecond, onAssetDrop]);

  const closeContextMenu = useCallback(() => setContextMenu(null), []);

  const handleClipContextMenu = useCallback((e: React.MouseEvent, clip: Clip) => {
    e.preventDefault();
    e.stopPropagation();
    const containerRect = containerRef.current?.getBoundingClientRect();
    if (!containerRect) return;
    const sl = containerRef.current?.scrollLeft || 0;
    const clickX = e.clientX - containerRect.left + sl - HEADER_WIDTH;
    const clickTime = clickX / pixelsPerSecond;
    const clipLocalTime = Math.max(0, Math.min(clip.duration, clickTime - clip.start));
    onSelectClip(clip.id);
    setContextMenu({ type: 'clip', x: e.clientX, y: e.clientY, clipId: clip.id, clipLocalTime });
  }, [onSelectClip, pixelsPerSecond]);

  const handleKeyframeContextMenu = useCallback((e: React.MouseEvent, clipId: string, keyframe: Keyframe) => {
    e.preventDefault();
    e.stopPropagation();
    props.onSelectKeyframe?.(clipId, keyframe.id);
    setContextMenu({ type: 'keyframe', x: e.clientX, y: e.clientY, clipId, keyframeId: keyframe.id });
  }, [props.onSelectKeyframe]);

  // 全局点击关闭菜单
  useEffect(() => {
    if (!contextMenu) return;
    const handleClick = () => closeContextMenu();
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, [contextMenu, closeContextMenu]);

  // 生成刻度
  const markers = useMemo(() => {
    const result: Array<{ key: string; left: number; isMain: boolean; label?: string }> = [];
    for (let i = 0; i < totalSeconds; i += markerInterval) {
      result.push({ key: String(i), left: i * pixelsPerSecond, isMain: true, label: formatTime(i) });
      if (markerInterval >= 5) {
        for (let j = 1; j < markerInterval && i + j < totalSeconds; j++) {
          if (j === markerInterval / 2) {
            result.push({ key: `${i}-${j}`, left: (i + j) * pixelsPerSecond, isMain: false });
          }
        }
      }
    }
    return result;
  }, [totalSeconds, markerInterval, pixelsPerSecond]);

  return {
    // refs
    containerRef, rulerRef,
    // zoom & snap
    zoom, setZoom, snapEnabled, setSnapEnabled, snapLine,
    pixelsPerSecond, markerInterval,
    // playhead
    isDraggingPlayhead, playheadPositionRef, playheadX,
    handlePlayheadMouseDown,
    // layout
    totalSeconds, totalWidth, highlightedTrackId, mousePos,
    // drag & resize
    dragState, resizeState,
    handleClipMouseDown, handleResizeMouseDown,
    // drop
    handleDragOver, handleDrop,
    // context menu
    contextMenu, closeContextMenu,
    handleClipContextMenu, handleKeyframeContextMenu,
    // track editing
    editingTrackId, setEditingTrackId, editingTrackName, setEditingTrackName,
    // zoom controls
    handleZoomIn, handleZoomOut, handleZoomPreset,
    // video frames
    frameMap,
    // markers data
    markers,
  };
}

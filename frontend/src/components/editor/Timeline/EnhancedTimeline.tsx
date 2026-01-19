/**
 * 增强版时间线组件
 * 基于 trackStore 的多轨道编辑器
 * 性能优化：使用 selector 精确订阅状态，避免不必要的重渲染
 */
import React, { useRef, useState, useCallback, useEffect, useMemo } from 'react';
import { Button, Tooltip, Dropdown, message } from 'antd';
import {
  PlusOutlined,
  ZoomInOutlined,
  ZoomOutOutlined,
  ScissorOutlined,
  DeleteOutlined,
  FullscreenOutlined,
} from '@ant-design/icons';
import { useTrackStore } from '../../../store/trackStore';
import { snapEngine } from '../../../engine/SnapEngine';
import type { TrackType, TrackItem, EasingType, TrackLine } from '../../../types/track';
import type { Resource } from '../../../types/resource';
import TimelineRuler from './TimelineRuler';
import TrackHeader from './TrackHeader';
import TrackRow from './TrackRow';
import Playhead from './Playhead';
import '../TimelineEditor.css';

interface EnhancedTimelineProps {
  onTimeChange?: (time: number) => void;
  // 拖拽中的资源
  draggingResource?: Resource | null;
}

const MIN_SCALE = 0.5;   // 最小缩放：0.5 像素/帧
const MAX_SCALE = 20;    // 最大缩放：20 像素/帧
const DEFAULT_TRACK_HEIGHT = 60;
const DRAG_THRESHOLD = 5; // 拖拽阈值：5像素

// 浅比较轨道数组（只比较 id 和 items 长度）
const tracksShallowEqual = (a: TrackLine[], b: TrackLine[]) => {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].id !== b[i].id || a[i].items.length !== b[i].items.length) return false;
  }
  return true;
};

export function EnhancedTimeline({ onTimeChange, draggingResource }: EnhancedTimelineProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const trackAreaRef = useRef<HTMLDivElement>(null);

  // 使用 selector 精确订阅状态，避免不必要的重渲染
  const config = useTrackStore(state => state.config);
  const tracks = useTrackStore(state => state.tracks);
  const selectedTrackId = useTrackStore(state => state.selectedTrackId);
  const selectedItemId = useTrackStore(state => state.selectedItemId);
  const currentTime = useTrackStore(state => state.currentTime);
  const scale = useTrackStore(state => state.scale);
  const scrollLeft = useTrackStore(state => state.scrollLeft);
  const isPlaying = useTrackStore(state => state.isPlaying);
  const snapEnabled = useTrackStore(state => state.snapEnabled);

  // 方法只获取一次（不会触发重渲染）
  const storeActions = useRef(useTrackStore.getState());

  // 缓存排序后的轨道
  const sortedTracks = useMemo(() => {
    return [...tracks].sort((a, b) => b.order - a.order);
  }, [tracks]);

  // 缓存总时长
  const duration = useMemo(() => {
    let maxEnd = 0;
    for (const track of tracks) {
      for (const item of track.items) {
        if (item.end > maxEnd) {
          maxEnd = item.end;
        }
      }
    }
    return maxEnd;
  }, [tracks]);

  // 本地状态
  const [containerWidth, setContainerWidth] = useState(800);
  const [selectedKeyframeId, setSelectedKeyframeId] = useState<string | null>(null);
  const [dragState, setDragState] = useState<{
    trackId: string;
    itemId: string;
    type: 'move' | 'trim-start' | 'trim-end';
    startX: number;
    startY: number;
    startFrame: number;
    originalStart: number;
    originalEnd: number;
    isDragging: boolean;  // 超过阈值才为 true
    // 边界限制（在拖拽开始时计算）
    minStart: number;     // trim-start 时的最小值
    maxEnd: number;       // trim-end 时的最大值
  } | null>(null);
  // 裁剪时间提示
  const [trimTooltip, setTrimTooltip] = useState<{
    visible: boolean;
    x: number;
    y: number;
    time: string;
  }>({ visible: false, x: 0, y: 0, time: '' });
  // 吸附线指示
  const [snapLine, setSnapLine] = useState<{
    visible: boolean;
    position: number;  // 帧位置
    type: string;
  } | null>(null);
  // 拖拽预览状态
  const [dropPreview, setDropPreview] = useState<{
    visible: boolean;
    trackId: string;
    startFrame: number;
    duration: number;   // 预估时长（帧数）
    type: string;
  } | null>(null);

  // 计算时间线宽度
  const timelineWidth = Math.max(duration * scale, containerWidth);

  // 帧 <-> 像素转换
  const frameToPixel = useCallback((frame: number) => frame * scale, [scale]);
  const pixelToFrame = useCallback((pixel: number) => Math.round(pixel / scale), [scale]);

  // 格式化帧数为时间字符串
  const formatFrameTime = useCallback((frame: number): string => {
    const totalSeconds = frame / config.fps;
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = Math.floor(totalSeconds % 60);
    const frames = frame % config.fps;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}:${frames.toString().padStart(2, '0')}`;
  }, [config.fps]);

  // 容器尺寸监听
  useEffect(() => {
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => observer.disconnect();
  }, []);

  // 更新吸附点（只在 tracks 结构变化时重算，移除 currentTime 依赖）
  useEffect(() => {
    storeActions.current.updateSnapPoints();
    snapEngine.setOptions({ scale, enabled: snapEnabled });
  }, [tracks.length, scale, snapEnabled]);

  // 缩放控制
  const handleZoom = useCallback((delta: number) => {
    storeActions.current.setScale(Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale + delta)));
  }, [scale]);

  // 滚轮缩放
  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      handleZoom(e.deltaY > 0 ? -0.5 : 0.5);
    }
  }, [handleZoom]);

  // 时间标尺点击
  const handleRulerClick = useCallback((time: number) => {
    const frame = Math.round(time / (1000 / config.fps));
    storeActions.current.setCurrentTime(frame);
    onTimeChange?.(time);
  }, [config.fps, onTimeChange]);

  // 添加轨道
  const handleAddTrack = useCallback((type: TrackType) => {
    storeActions.current.addTrack(type);
    message.success(`已添加${type === 'video' ? '视频' : type === 'audio' ? '音频' : '文本'}轨道`);
  }, []);

  // 删除轨道
  const handleDeleteTrack = useCallback((trackId: string) => {
    storeActions.current.removeTrack(trackId);
  }, []);

  // 切换轨道静音
  const handleToggleMute = useCallback((trackId: string) => {
    const track = tracks.find(t => t.id === trackId);
    if (track) {
      storeActions.current.updateTrack(trackId, { muted: !track.muted });
    }
  }, [tracks]);

  // 切换轨道锁定
  const handleToggleLock = useCallback((trackId: string) => {
    const track = tracks.find(t => t.id === trackId);
    if (track) {
      storeActions.current.updateTrack(trackId, { locked: !track.locked });
    }
  }, [tracks]);

  // 切换轨道可见性
  const handleToggleVisible = useCallback((trackId: string) => {
    const track = tracks.find(t => t.id === trackId);
    if (track) {
      storeActions.current.updateTrack(trackId, { visible: !track.visible });
    }
  }, [tracks]);

  // 选择轨道项
  const handleItemSelect = useCallback((trackId: string, itemId: string) => {
    storeActions.current.selectItem(trackId, itemId);
  }, []);

  // 处理资源拖放到轨道
  const handleTrackDrop = useCallback((trackId: string, e: React.DragEvent) => {
    e.preventDefault();

    // 获取放置位置
    const trackAreaRect = trackAreaRef.current?.getBoundingClientRect();
    if (!trackAreaRect) return;

    const dropX = e.clientX - trackAreaRect.left + scrollLeft;
    const dropFrame = pixelToFrame(dropX);

    // 尝试从 dataTransfer 获取资源信息
    let resourceData: any = null;
    try {
      const jsonData = e.dataTransfer.getData('application/json');
      if (jsonData) {
        resourceData = JSON.parse(jsonData);
      }
    } catch {
      // ignore
    }

    // 如果没有从 dataTransfer 获取到，使用 draggingResource
    if (!resourceData && draggingResource) {
      resourceData = draggingResource;
    }

    if (!resourceData) {
      console.warn('[EnhancedTimeline] No resource data in drop event');
      return;
    }

    // 验证轨道类型是否匹配
    const track = tracks.find(t => t.id === trackId);
    if (!track) return;

    // 视频资源可以放到视频/图片轨道
    // 音频资源只能放到音频轨道
    // 图片资源可以放到视频/图片轨道
    const typeMap: Record<string, string[]> = {
      video: ['video', 'image'],
      audio: ['audio'],
      image: ['video', 'image'],
    };

    const allowedTrackTypes = typeMap[resourceData.type] || [];
    if (!allowedTrackTypes.includes(track.type)) {
      message.warning(`${resourceData.type} 类型资源不能放入 ${track.type} 轨道`);
      return;
    }

    // 创建轨道项
    const item = storeActions.current.addItemFromResource(
      trackId,
      {
        id: resourceData.id,
        type: resourceData.type,
        name: resourceData.name,
        path: resourceData.path,
        duration: resourceData.duration,
        width: resourceData.width,
        height: resourceData.height,
        thumbnailPath: resourceData.thumbnailPath,
        waveformPath: resourceData.waveformPath,
      },
      Math.max(0, dropFrame)
    );

    if (item) {
      storeActions.current.selectItem(trackId, item.id);
      message.success(`已添加: ${resourceData.name}`);
    }

    // 清除预览
    setDropPreview(null);
  }, [tracks, scrollLeft, pixelToFrame, draggingResource]);

  // 处理拖拽经过轨道（显示预览）
  const handleTrackDragOver = useCallback((trackId: string, e: React.DragEvent) => {
    const trackAreaRect = trackAreaRef.current?.getBoundingClientRect();
    if (!trackAreaRect) return;

    const dropX = e.clientX - trackAreaRect.left + scrollLeft;
    const dropFrame = Math.max(0, pixelToFrame(dropX));

    // 尝试从 dataTransfer 获取资源信息
    let resourceData: any = null;
    try {
      const jsonData = e.dataTransfer.getData('application/json');
      if (jsonData) {
        resourceData = JSON.parse(jsonData);
      }
    } catch {
      // 在 dragover 期间可能无法读取 dataTransfer
    }

    // 使用 draggingResource 或默认值
    if (!resourceData && draggingResource) {
      resourceData = draggingResource;
    }

    // 计算预估时长（默认 3 秒）
    let estimatedDuration = config.fps * 3;
    if (resourceData?.duration) {
      estimatedDuration = Math.round(resourceData.duration / 1000 * config.fps);
    }

    setDropPreview({
      visible: true,
      trackId,
      startFrame: dropFrame,
      duration: estimatedDuration,
      type: resourceData?.type || 'video',
    });
  }, [scrollLeft, pixelToFrame, config.fps, draggingResource]);

  // 处理拖拽离开轨道
  const handleTrackDragLeave = useCallback((trackId: string, e: React.DragEvent) => {
    // 检查是否真的离开了轨道（而不是进入子元素）
    const relatedTarget = e.relatedTarget as HTMLElement;
    const trackRow = (e.target as HTMLElement).closest('.trackRow');
    if (trackRow && !trackRow.contains(relatedTarget)) {
      if (dropPreview?.trackId === trackId) {
        setDropPreview(null);
      }
    }
  }, [dropPreview]);

  // 开始拖拽（初始化 isDragging 为 false）
  const handleItemDragStart = useCallback((
    trackId: string,
    itemId: string,
    type: 'move' | 'trim-start' | 'trim-end',
    e: React.MouseEvent
  ) => {
    const track = tracks.find(t => t.id === trackId);
    if (track?.locked) return;

    const item = track?.items.find(i => i.id === itemId);
    if (!item) return;

    // 在拖拽开始时计算边界限制
    let minStart = 0;
    let maxEnd = Infinity;

    if (item.type === 'video' || item.type === 'audio') {
      // trim-start: 最小 start = 当前 start - offsetL（恢复到 offsetL=0）
      minStart = item.start - item.offsetL;
      // trim-end: 最大 end = start + (frameCount - offsetL)
      // 即：显示的部分最多是 frameCount - offsetL 帧
      maxEnd = item.start + (item.frameCount - item.offsetL);
    }

    console.log('[Trim] 边界计算:', {
      type: item.type,
      frameCount: item.frameCount,
      offsetL: item.offsetL,
      offsetR: item.offsetR,
      start: item.start,
      end: item.end,
      minStart,
      maxEnd,
    });

    setDragState({
      trackId,
      itemId,
      type,
      startX: e.clientX,
      startY: e.clientY,
      startFrame: currentTime,
      originalStart: item.start,
      originalEnd: item.end,
      isDragging: false,
      minStart,
      maxEnd,
    });

    storeActions.current.selectItem(trackId, itemId);
  }, [tracks, currentTime]);

  // 拖拽处理（使用 requestAnimationFrame 节流）
  // 依赖只使用 dragState?.itemId 避免频繁重绑定
  useEffect(() => {
    if (!dragState) return;

    let rafId: number | null = null;
    let latestMouseEvent: MouseEvent | null = null;
    let currentDragState = dragState;

    const performDrag = () => {
      if (!latestMouseEvent || !currentDragState) return;

      const e = latestMouseEvent;
      const dx = e.clientX - currentDragState.startX;
      const dy = e.clientY - currentDragState.startY;
      const distance = Math.sqrt(dx * dx + dy * dy);

      // 检测是否超过拖拽阈值
      if (!currentDragState.isDragging && distance >= DRAG_THRESHOLD) {
        currentDragState = { ...currentDragState, isDragging: true };
        setDragState(currentDragState);
      }

      // 只在 isDragging 为 true 时执行拖拽逻辑
      if (!currentDragState.isDragging) {
        rafId = null;
        return;
      }

      const deltaX = e.clientX - currentDragState.startX;
      const deltaFrames = Math.round(deltaX / scale);

      if (currentDragState.type === 'move') {
        const newStart = Math.max(0, currentDragState.originalStart + deltaFrames);
        // 尝试吸附
        const snapResult = snapEngine.findSnapPosition(newStart, currentDragState.itemId);
        storeActions.current.moveItem(currentDragState.trackId, currentDragState.itemId, snapResult.snapped ? snapResult.position : newStart);

        // 显示吸附线
        if (snapResult.snapped && snapResult.snapPoint) {
          setSnapLine({
            visible: true,
            position: snapResult.snapPoint.time,
            type: snapResult.snapPoint.type,
          });
        } else {
          setSnapLine(null);
        }
      } else if (currentDragState.type === 'trim-start') {
        // 使用拖拽开始时计算的 minStart 边界
        const rawNewStart = currentDragState.originalStart + deltaFrames;
        const newStart = Math.max(currentDragState.minStart, Math.max(0, rawNewStart));
        if (newStart < currentDragState.originalEnd - 1) {
          storeActions.current.trimItemStart(currentDragState.trackId, currentDragState.itemId, newStart);
          setTrimTooltip({
            visible: true,
            x: e.clientX,
            y: e.clientY - 30,
            time: formatFrameTime(newStart),
          });
        }
      } else if (currentDragState.type === 'trim-end') {
        // 使用拖拽开始时计算的 maxEnd 边界
        const rawNewEnd = currentDragState.originalEnd + deltaFrames;
        const newEnd = Math.min(currentDragState.maxEnd, rawNewEnd);
        if (newEnd > currentDragState.originalStart + 1) {
          storeActions.current.trimItemEnd(currentDragState.trackId, currentDragState.itemId, newEnd);
          setTrimTooltip({
            visible: true,
            x: e.clientX,
            y: e.clientY - 30,
            time: formatFrameTime(newEnd),
          });
        }
      }

      rafId = null;
    };

    const handleMouseMove = (e: MouseEvent) => {
      latestMouseEvent = e;
      if (rafId === null) {
        rafId = requestAnimationFrame(performDrag);
      }
    };

    const handleMouseUp = () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
      setDragState(null);
      setTrimTooltip({ visible: false, x: 0, y: 0, time: '' });
      setSnapLine(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragState?.itemId, scale, formatFrameTime]);

  // 删除选中的片段
  const handleDeleteSelected = useCallback(() => {
    if (selectedTrackId && selectedItemId) {
      storeActions.current.removeItem(selectedTrackId, selectedItemId);
    }
  }, [selectedTrackId, selectedItemId]);

  // 分割选中的片段
  const handleSplitSelected = useCallback(() => {
    if (selectedTrackId && selectedItemId) {
      storeActions.current.splitItem(selectedTrackId, selectedItemId, currentTime);
    }
  }, [selectedTrackId, selectedItemId, currentTime]);

  // 播放头拖拽
  const handlePlayheadDrag = useCallback((deltaX: number) => {
    const deltaFrames = pixelToFrame(deltaX);
    storeActions.current.setCurrentTime(Math.max(0, currentTime + deltaFrames));
  }, [currentTime, pixelToFrame]);

  // 关键帧选择
  const handleKeyframeSelect = useCallback((itemId: string, keyframeId: string) => {
    setSelectedKeyframeId(keyframeId);
  }, []);

  // 关键帧时间变更
  const handleKeyframeTimeChange = useCallback((itemId: string, keyframeId: string, newTime: number) => {
    if (selectedTrackId) {
      storeActions.current.updateKeyframeTimeInItem(selectedTrackId, itemId, keyframeId, newTime);
    }
  }, [selectedTrackId]);

  // 关键帧删除
  const handleKeyframeDelete = useCallback((itemId: string, keyframeId: string) => {
    if (selectedTrackId) {
      storeActions.current.removeKeyframeFromItem(selectedTrackId, itemId, keyframeId);
      if (selectedKeyframeId === keyframeId) {
        setSelectedKeyframeId(null);
      }
    }
  }, [selectedTrackId, selectedKeyframeId]);

  // 关键帧复制（暂时只打印）
  const handleKeyframeCopy = useCallback((itemId: string, keyframeId: string) => {
    // TODO: 实现关键帧复制到剪贴板
    message.info('关键帧复制功能开发中');
  }, []);

  // 关键帧缓动变更
  const handleKeyframeEasingChange = useCallback((itemId: string, keyframeId: string, easing: EasingType) => {
    if (selectedTrackId) {
      storeActions.current.updateKeyframeEasingInItem(selectedTrackId, itemId, keyframeId, easing);
    }
  }, [selectedTrackId]);

  // 键盘快捷键
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      switch (e.key) {
        case 'Delete':
        case 'Backspace':
          handleDeleteSelected();
          break;
        case 's':
        case 'S':
          if (!e.ctrlKey && !e.metaKey) {
            handleSplitSelected();
          }
          break;
        case '=':
        case '+':
          handleZoom(1);
          break;
        case '-':
          handleZoom(-1);
          break;
        case 'ArrowLeft':
          storeActions.current.setCurrentTime(Math.max(0, currentTime - 1));
          break;
        case 'ArrowRight':
          storeActions.current.setCurrentTime(currentTime + 1);
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleDeleteSelected, handleSplitSelected, handleZoom, currentTime]);

  // 计算轨道总高度
  const totalTrackHeight = sortedTracks.reduce((sum, t) => sum + t.height, 0);
  const playheadPosition = frameToPixel(currentTime) - scrollLeft;

  return (
    <div className="enhancedTimeline" ref={containerRef}>
      {/* 工具栏 */}
      <div className="timelineToolbar">
        <Dropdown
          menu={{
            items: [
              { key: 'video', label: '视频轨道', onClick: () => handleAddTrack('video') },
              { key: 'audio', label: '音频轨道', onClick: () => handleAddTrack('audio') },
              { key: 'text', label: '文本轨道', onClick: () => handleAddTrack('text') },
              { key: 'image', label: '图片轨道', onClick: () => handleAddTrack('image') },
            ],
          }}
        >
          <Button icon={<PlusOutlined />} size="small">添加轨道</Button>
        </Dropdown>

        <div className="toolbarSpacer" />

        <Tooltip title="分割 (S)">
          <Button
            icon={<ScissorOutlined />}
            size="small"
            disabled={!selectedItemId}
            onClick={handleSplitSelected}
          />
        </Tooltip>
        <Tooltip title="删除 (Delete)">
          <Button
            icon={<DeleteOutlined />}
            size="small"
            danger
            disabled={!selectedItemId}
            onClick={handleDeleteSelected}
          />
        </Tooltip>

        <div className="toolbarSpacer" />

        <Button icon={<ZoomOutOutlined />} size="small" onClick={() => handleZoom(-1)} />
        <span className="scaleLabel">{Math.round(scale * 10) / 10}x</span>
        <Button icon={<ZoomInOutlined />} size="small" onClick={() => handleZoom(1)} />

        <Tooltip title="适应窗口">
          <Button
            icon={<FullscreenOutlined />}
            size="small"
            onClick={() => {
              if (duration > 0) {
                storeActions.current.setScale(containerWidth / duration);
              }
            }}
          />
        </Tooltip>
      </div>

      {/* 时间线主体 */}
      <div className="timelineBody" onWheel={handleWheel}>
        {/* 轨道头部区域 */}
        <div className="trackHeadersArea">
          <div className="rulerCorner" />
          {sortedTracks.map((track) => (
            <TrackHeader
              key={track.id}
              track={track}
              selected={track.id === selectedTrackId}
              onSelect={() => storeActions.current.selectTrack(track.id)}
              onToggleMute={() => handleToggleMute(track.id)}
              onToggleLock={() => handleToggleLock(track.id)}
              onToggleVisible={() => handleToggleVisible(track.id)}
              onDelete={() => handleDeleteTrack(track.id)}
            />
          ))}
        </div>

        {/* 时间线滚动区域 */}
        <div
          ref={trackAreaRef}
          className="timelineScrollArea"
          onScroll={(e) => storeActions.current.setScrollLeft((e.target as HTMLDivElement).scrollLeft)}
        >
          {/* 时间刻度尺 */}
          <TimelineRuler
            duration={duration * (1000 / config.fps)}
            scale={scale / (1000 / config.fps)}
            scrollLeft={scrollLeft}
            width={containerWidth - 150}
            onClick={handleRulerClick}
          />

          {/* 轨道内容区域 */}
          <div className="tracksContainer" style={{ width: timelineWidth }}>
            {sortedTracks.map((track) => (
              <TrackRow
                key={track.id}
                track={track}
                scale={scale}
                fps={config.fps}
                width={timelineWidth}
                selectedItemId={selectedItemId}
                selectedKeyframeId={track.id === selectedTrackId ? selectedKeyframeId : null}
                onItemSelect={(itemId) => handleItemSelect(track.id, itemId)}
                onItemDragStart={(trackId, itemId, type, e) => handleItemDragStart(trackId, itemId, type, e)}
                onKeyframeSelect={handleKeyframeSelect}
                onKeyframeTimeChange={handleKeyframeTimeChange}
                onKeyframeDelete={handleKeyframeDelete}
                onKeyframeCopy={handleKeyframeCopy}
                onKeyframeEasingChange={handleKeyframeEasingChange}
                onDrop={(e) => handleTrackDrop(track.id, e)}
                onDragOver={(e) => handleTrackDragOver(track.id, e)}
                onDragLeave={(e) => handleTrackDragLeave(track.id, e)}
                dropPreview={dropPreview?.trackId === track.id ? dropPreview : null}
              />
            ))}

            {/* 吸附线 */}
            {snapLine && snapLine.visible && (
              <div
                className={`snapLine ${snapLine.type === 'playhead' ? 'snapLinePlayhead' : ''}`}
                style={{
                  left: frameToPixel(snapLine.position) - scrollLeft,
                  height: totalTrackHeight,
                }}
              />
            )}
          </div>

          {/* 播放头 */}
          <Playhead
            position={playheadPosition}
            height={totalTrackHeight + 30}
            onDrag={handlePlayheadDrag}
          />
        </div>
      </div>

      {/* 空状态 */}
      {sortedTracks.length === 0 && (
        <div className="timelineEmpty">
          <p>点击「添加轨道」开始编辑</p>
        </div>
      )}

      {/* 裁剪时间提示 */}
      {trimTooltip.visible && (
        <div
          className="trimTooltip"
          style={{
            position: 'fixed',
            left: trimTooltip.x,
            top: trimTooltip.y,
            transform: 'translateX(-50%)',
          }}
        >
          {trimTooltip.time}
        </div>
      )}
    </div>
  );
}

export default EnhancedTimeline;

/**
 * 简洁版播放器组件
 * 迁移自 electron-egg，高性能渲染
 * 支持素材变换控制和比例选择
 */
import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import { Track, Clip, MediaType } from '../../types/editor';
import { SimpleMediaEngine, SimpleVideoRenderer, SimpleAudioController } from '../../engine/simpleEngine';
import { getAnimatedProperties, hasKeyframes } from '../../engine/simpleKeyframe';
import { TransformControl } from './TransformControl';
import { Maximize2 } from 'lucide-react';

// 预设比例
export type AspectRatio = '16:9' | '9:16' | '4:3' | '1:1';
export const ASPECT_RATIOS: { label: string; value: AspectRatio; ratio: number }[] = [
  { label: '16:9', value: '16:9', ratio: 16 / 9 },
  { label: '9:16', value: '9:16', ratio: 9 / 16 },
  { label: '4:3', value: '4:3', ratio: 4 / 3 },
  { label: '1:1', value: '1:1', ratio: 1 },
];

// 根据比例计算画布尺寸
export function getCanvasSize(aspectRatio: AspectRatio): { width: number; height: number } {
  const ratio = ASPECT_RATIOS.find(r => r.value === aspectRatio)?.ratio || 16 / 9;
  if (ratio >= 1) {
    return { width: 1920, height: Math.round(1920 / ratio) };
  } else {
    return { width: Math.round(1080 * ratio), height: 1080 };
  }
}

interface PlayerProps {
  tracks: Track[];
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  selectedClipId: string | null;
  onTimeUpdate: (time: number) => void;
  onUpdateClip?: (clipId: string, updates: Partial<Clip>) => void;
  onAutoKeyframe?: (clipId: string, clipLocalTime: number, updates: Partial<Clip>) => void;
  aspectRatio: AspectRatio;
  onAspectRatioChange: (ratio: AspectRatio) => void;
}

export const SimplePlayer: React.FC<PlayerProps> = ({
  tracks,
  currentTime,
  duration,
  isPlaying,
  selectedClipId,
  onTimeUpdate,
  onUpdateClip,
  onAutoKeyframe,
  aspectRatio,
  onAspectRatioChange,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<SimpleMediaEngine | null>(null);
  const rendererRef = useRef<SimpleVideoRenderer | null>(null);
  const audioRef = useRef<SimpleAudioController | null>(null);
  const isInternalUpdate = useRef(false);
  const lastUpdateTime = useRef(0);
  const onTimeUpdateRef = useRef(onTimeUpdate);
  onTimeUpdateRef.current = onTimeUpdate;

  // 用 ref 存储回调依赖，避免无限循环
  const onUpdateClipRef = useRef(onUpdateClip);
  onUpdateClipRef.current = onUpdateClip;
  const onAutoKeyframeRef = useRef(onAutoKeyframe);
  onAutoKeyframeRef.current = onAutoKeyframe;
  const currentTimeRef = useRef(currentTime);
  currentTimeRef.current = currentTime;

  // 拖动过程中的临时值，用于拖动结束时打帧
  const pendingTransformRef = useRef<{ clipId: string; clipLocalTime: number; updates: Partial<Clip> } | null>(null);

  const [previewSize, setPreviewSize] = useState({ width: 0, height: 0 });
  const previewSizeRef = useRef(previewSize);
  previewSizeRef.current = previewSize;
  const canvasSizeRef = useRef({ width: 1920, height: 1080 });

  // 画布尺寸（使用 props 的 aspectRatio）
  const canvasSize = useMemo(() => getCanvasSize(aspectRatio), [aspectRatio]);

  // 同步 canvasSize 到 ref
  useEffect(() => {
    canvasSizeRef.current = canvasSize;
  }, [canvasSize]);

  // 获取选中的可视素材
  const selectedClip = useMemo(() => {
    if (!selectedClipId) return null;
    for (const track of tracks) {
      const clip = track.clips.find(c => c.id === selectedClipId);
      if (clip && (clip.type === MediaType.VIDEO || clip.type === MediaType.IMAGE)) {
        // 检查是否在当前时间可见
        if (currentTime >= clip.start && currentTime < clip.start + clip.duration) {
          return clip;
        }
      }
    }
    return null;
  }, [tracks, selectedClipId, currentTime]);

  // 用 ref 存储 selectedClip，避免回调依赖变化
  const selectedClipRef = useRef<Clip | null>(null);
  selectedClipRef.current = selectedClip;

  // 计算插值后的属性（用于控制框同步）
  const animatedProps = useMemo(() => {
    if (!selectedClip) return null;
    const clipLocalTime = currentTime - selectedClip.start;
    return getAnimatedProperties(selectedClip, clipLocalTime);
  }, [selectedClip, currentTime]);

  // 初始化引擎
  useEffect(() => {
    if (!canvasRef.current) return;

    const engine = new SimpleMediaEngine(duration);
    engineRef.current = engine;

    const audioController = new SimpleAudioController(engine);
    audioRef.current = audioController;

    const renderer = new SimpleVideoRenderer(engine, canvasRef.current);
    renderer.setAudioController(audioController); // 建立连接
    rendererRef.current = renderer;

    engine.on('timeUpdate', (e) => {
      const now = performance.now();
      if (now - lastUpdateTime.current > 50) {
        lastUpdateTime.current = now;
        isInternalUpdate.current = true;
        onTimeUpdateRef.current(e.time);
        requestAnimationFrame(() => {
          isInternalUpdate.current = false;
        });
      }
    });

    engine.on('pause', () => {
      isInternalUpdate.current = true;
      onTimeUpdateRef.current(engine.time);
      requestAnimationFrame(() => {
        isInternalUpdate.current = false;
      });
    });

    engine.on('ended', () => {
      isInternalUpdate.current = true;
      onTimeUpdateRef.current(engine.time);
      requestAnimationFrame(() => {
        isInternalUpdate.current = false;
      });
    });

    return () => {
      engine.destroy();
      renderer.destroy();
      audioController.destroy();
      engineRef.current = null;
      rendererRef.current = null;
      audioRef.current = null;
    };
  }, []);

  // 更新画布尺寸
  useEffect(() => {
    if (canvasRef.current) {
      canvasRef.current.width = canvasSize.width;
      canvasRef.current.height = canvasSize.height;
      rendererRef.current?.renderFrame();
    }
  }, [canvasSize]);

  // 监听预览区域尺寸
  useEffect(() => {
    if (!previewRef.current) return;

    const updateSize = () => {
      if (previewRef.current) {
        const rect = previewRef.current.getBoundingClientRect();
        setPreviewSize({ width: rect.width, height: rect.height });
      }
    };

    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(previewRef.current);
    return () => observer.disconnect();
  }, []);

  // 更新 duration
  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.duration = duration;
    }
  }, [duration]);

  // 同步轨道数据
  useEffect(() => {
    if (!rendererRef.current || !audioRef.current) return;

    // 设置轨道到渲染器
    rendererRef.current.setTracks(tracks);
    // 设置轨道到音频控制器（用于静音等功能）
    audioRef.current.setTracks(tracks);

    // 加载音频片段
    tracks.forEach(track => {
      track.clips.forEach(clip => {
        if (clip.type === MediaType.AUDIO) {
          audioRef.current?.loadClip(clip);
        }
      });
    });
  }, [tracks]);

  // 同步播放状态
  useEffect(() => {
    if (!engineRef.current) return;

    if (isPlaying && !engineRef.current.isPlaying) {
      engineRef.current.play();
    } else if (!isPlaying && engineRef.current.isPlaying) {
      engineRef.current.pause();
    }
  }, [isPlaying]);

  // 同步外部时间变化
  useEffect(() => {
    if (!engineRef.current || isInternalUpdate.current) return;

    if (Math.abs(engineRef.current.time - currentTime) > 0.05) {
      engineRef.current.seek(currentTime);
    }
  }, [currentTime]);

  // 变换控制回调 - 使用 ref 避免依赖变化导致无限循环
  // 拖动过程中只更新属性，拖动结束时才自动打帧
  const handleMove = useCallback((screenDeltaX: number, screenDeltaY: number, initialX: number, initialY: number) => {
    const clip = selectedClipRef.current;
    const updateClip = onUpdateClipRef.current;
    const preview = previewSizeRef.current;
    const canvas = canvasSizeRef.current;
    const time = currentTimeRef.current;
    if (!clip || !updateClip || preview.width === 0) return;

    // 屏幕像素 -> 画布坐标
    const canvasDeltaX = screenDeltaX * (canvas.width / preview.width);
    const canvasDeltaY = screenDeltaY * (canvas.height / preview.height);
    const newX = initialX + canvasDeltaX;
    const newY = initialY + canvasDeltaY;

    // 拖动时直接更新属性
    updateClip(clip.id, { x: newX, y: newY });

    // 如果有关键帧，记录待打帧的值
    if (hasKeyframes(clip)) {
      const clipLocalTime = time - clip.start;
      pendingTransformRef.current = {
        clipId: clip.id,
        clipLocalTime,
        updates: { ...pendingTransformRef.current?.updates, x: newX, y: newY }
      };
    }
  }, []);

  const handleScale = useCallback((newScale: number) => {
    const clip = selectedClipRef.current;
    const updateClip = onUpdateClipRef.current;
    const time = currentTimeRef.current;
    if (!clip || !updateClip) return;

    updateClip(clip.id, { scale: newScale });

    if (hasKeyframes(clip)) {
      const clipLocalTime = time - clip.start;
      pendingTransformRef.current = {
        clipId: clip.id,
        clipLocalTime,
        updates: { ...pendingTransformRef.current?.updates, scale: newScale }
      };
    }
  }, []);

  const handleRotate = useCallback((newRotation: number) => {
    const clip = selectedClipRef.current;
    const updateClip = onUpdateClipRef.current;
    const time = currentTimeRef.current;
    if (!clip || !updateClip) return;

    updateClip(clip.id, { rotation: newRotation });

    if (hasKeyframes(clip)) {
      const clipLocalTime = time - clip.start;
      pendingTransformRef.current = {
        clipId: clip.id,
        clipLocalTime,
        updates: { ...pendingTransformRef.current?.updates, rotation: newRotation }
      };
    }
  }, []);

  const handleTransformEnd = useCallback(() => {
    // 拖动结束时，如果有待打帧的值，自动打帧
    const pending = pendingTransformRef.current;
    const autoKeyframe = onAutoKeyframeRef.current;
    if (pending && autoKeyframe) {
      autoKeyframe(pending.clipId, pending.clipLocalTime, pending.updates);
    }
    pendingTransformRef.current = null;
  }, []);

  return (
    <div
      ref={containerRef}
      className="flex-1 bg-[#09090b] flex flex-col relative overflow-hidden"
    >
      {/* 工具栏 */}
      <div className="h-10 border-b border-[#27272a] flex items-center px-4 justify-between bg-[#18181b] flex-shrink-0">
        <div className="flex items-center gap-2">
          <Maximize2 size={14} className="text-zinc-500" />
          <select
            value={aspectRatio}
            onChange={(e) => onAspectRatioChange(e.target.value as AspectRatio)}
            className="bg-zinc-800 text-zinc-300 text-xs px-2 py-1 rounded border border-zinc-700 focus:outline-none focus:border-cyan-500"
          >
            {ASPECT_RATIOS.map(r => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
        </div>
        <div className="text-xs text-zinc-500">
          {canvasSize.width} × {canvasSize.height}
        </div>
      </div>

      {/* 预览区域 */}
      <div className="flex-1 flex items-center justify-center p-4 relative overflow-hidden">
        <div
          ref={previewRef}
          className="relative bg-black shadow-2xl border border-[#27272a] overflow-hidden rounded-lg"
          style={{
            aspectRatio: `${canvasSize.width} / ${canvasSize.height}`,
            maxWidth: '100%',
            maxHeight: '100%',
          }}
        >
          <canvas
            ref={canvasRef}
            className="w-full h-full object-contain"
            style={{ imageRendering: 'auto' }}
          />

          {/* 变换控制框 - 使用插值后的属性 */}
          {selectedClip && animatedProps && previewSize.width > 0 && onUpdateClip && (
            <TransformControl
              x={animatedProps.x}
              y={animatedProps.y}
              scale={animatedProps.scale}
              rotation={animatedProps.rotation}
              previewWidth={previewSize.width}
              previewHeight={previewSize.height}
              canvasWidth={canvasSize.width}
              canvasHeight={canvasSize.height}
              onMove={handleMove}
              onScale={handleScale}
              onRotate={handleRotate}
              onTransformEnd={handleTransformEnd}
            />
          )}

          {tracks.every(t => t.clips.length === 0) && (
            <div className="absolute inset-0 flex items-center justify-center text-zinc-600 pointer-events-none">
              <div className="text-center">
                <div className="text-4xl mb-2">🎬</div>
                <span className="text-sm tracking-widest uppercase">拖入素材开始编辑</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SimplePlayer;

/**
 * 简洁版播放器组件
 * 迁移自 electron-egg，高性能渲染
 * 支持素材变换控制和比例选择
 */
import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import { Track, Clip, MediaType } from '../../types/editor';
import { SimpleMediaEngine, SimpleVideoRenderer, SimpleAudioController } from '../../engine/simpleEngine';
import { TransformControl } from './TransformControl';
import { Maximize2 } from 'lucide-react';

// 预设比例
type AspectRatio = '16:9' | '9:16' | '4:3' | '1:1';
const ASPECT_RATIOS: { label: string; value: AspectRatio; ratio: number }[] = [
  { label: '16:9', value: '16:9', ratio: 16 / 9 },
  { label: '9:16', value: '9:16', ratio: 9 / 16 },
  { label: '4:3', value: '4:3', ratio: 4 / 3 },
  { label: '1:1', value: '1:1', ratio: 1 },
];

interface PlayerProps {
  tracks: Track[];
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  selectedClipId: string | null;
  onTimeUpdate: (time: number) => void;
  onUpdateClip?: (clipId: string, updates: Partial<Clip>) => void;
}

export const SimplePlayer: React.FC<PlayerProps> = ({
  tracks,
  currentTime,
  duration,
  isPlaying,
  selectedClipId,
  onTimeUpdate,
  onUpdateClip,
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

  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('16:9');
  const [previewSize, setPreviewSize] = useState({ width: 0, height: 0 });

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

  // 画布尺寸
  const canvasSize = useMemo(() => {
    const ratio = ASPECT_RATIOS.find(r => r.value === aspectRatio)?.ratio || 16 / 9;
    // 基于 1080p
    if (ratio >= 1) {
      return { width: 1920, height: Math.round(1920 / ratio) };
    } else {
      return { width: Math.round(1080 * ratio), height: 1080 };
    }
  }, [aspectRatio]);

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

  // 变换控制回调
  const handleMove = useCallback((deltaX: number, deltaY: number) => {
    if (!selectedClip || !onUpdateClip) return;
    // 计算画布到预览的缩放比例
    const scaleX = canvasSize.width / previewSize.width;
    const scaleY = canvasSize.height / previewSize.height;
    onUpdateClip(selectedClip.id, {
      x: selectedClip.x + deltaX * scaleX,
      y: selectedClip.y + deltaY * scaleY,
    });
  }, [selectedClip, onUpdateClip, canvasSize, previewSize]);

  const handleScale = useCallback((newScale: number) => {
    if (!selectedClip || !onUpdateClip) return;
    onUpdateClip(selectedClip.id, { scale: newScale });
  }, [selectedClip, onUpdateClip]);

  const handleRotate = useCallback((newRotation: number) => {
    if (!selectedClip || !onUpdateClip) return;
    onUpdateClip(selectedClip.id, { rotation: newRotation });
  }, [selectedClip, onUpdateClip]);

  const handleTransformEnd = useCallback(() => {
    // 变换结束时可以触发保存
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
            onChange={(e) => setAspectRatio(e.target.value as AspectRatio)}
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

          {/* 变换控制框 */}
          {selectedClip && previewSize.width > 0 && onUpdateClip && (
            <TransformControl
              x={selectedClip.x * previewSize.width / canvasSize.width}
              y={selectedClip.y * previewSize.height / canvasSize.height}
              scale={selectedClip.scale}
              rotation={selectedClip.rotation}
              canvasWidth={previewSize.width}
              canvasHeight={previewSize.height}
              mediaWidth={canvasSize.width}
              mediaHeight={canvasSize.height}
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

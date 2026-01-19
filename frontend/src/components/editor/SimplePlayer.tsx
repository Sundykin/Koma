/**
 * 简洁版播放器组件
 * 迁移自 electron-egg，高性能渲染
 */
import React, { useRef, useEffect } from 'react';
import { Track, MediaType } from '../../types/editor';
import { SimpleMediaEngine, SimpleVideoRenderer, SimpleAudioController } from '../../engine/simpleEngine';

interface PlayerProps {
  tracks: Track[];
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  onTimeUpdate: (time: number) => void;
}

export const SimplePlayer: React.FC<PlayerProps> = ({
  tracks,
  currentTime,
  duration,
  isPlaying,
  onTimeUpdate,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<SimpleMediaEngine | null>(null);
  const rendererRef = useRef<SimpleVideoRenderer | null>(null);
  const audioRef = useRef<SimpleAudioController | null>(null);
  const isInternalUpdate = useRef(false);
  const lastUpdateTime = useRef(0);
  const onTimeUpdateRef = useRef(onTimeUpdate);
  onTimeUpdateRef.current = onTimeUpdate;

  // 初始化引擎
  useEffect(() => {
    if (!canvasRef.current) return;

    const engine = new SimpleMediaEngine(duration);
    engineRef.current = engine;

    const renderer = new SimpleVideoRenderer(engine, canvasRef.current);
    rendererRef.current = renderer;

    const audioController = new SimpleAudioController(engine);
    audioRef.current = audioController;

    // 节流时间更新，避免过于频繁的状态更新
    engine.on('timeUpdate', (e) => {
      const now = performance.now();
      // 每 50ms 更新一次父组件状态
      if (now - lastUpdateTime.current > 50) {
        lastUpdateTime.current = now;
        isInternalUpdate.current = true;
        onTimeUpdateRef.current(e.time);
        requestAnimationFrame(() => {
          isInternalUpdate.current = false;
        });
      }
    });

    // 暂停和结束时立即同步
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

  // 更新 duration
  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.duration = duration;
    }
  }, [duration]);

  // 同步轨道数据
  useEffect(() => {
    if (!rendererRef.current || !audioRef.current) return;

    rendererRef.current.setTracks(tracks);

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

  return (
    <div
      ref={containerRef}
      className="flex-1 bg-[#09090b] flex items-center justify-center p-4 relative overflow-hidden"
    >
      <div className="relative aspect-video w-full max-w-4xl max-h-full bg-black shadow-2xl border border-[#27272a] overflow-hidden rounded-lg">
        <canvas
          ref={canvasRef}
          className="w-full h-full object-contain"
          style={{ imageRendering: 'auto' }}
        />

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
  );
};

export default SimplePlayer;

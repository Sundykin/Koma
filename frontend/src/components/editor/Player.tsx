/**
 * 视频播放器组件
 * 基于 Canvas 渲染，与 MediaEngine 集成
 * 性能优化：使用 ref 存储实时状态，RAF 批量更新 UI
 */
import React, { useRef, useEffect, useCallback, useState, memo } from 'react';
import { Slider, Button, Space, Tooltip } from 'antd';
import {
  PlayCircleOutlined,
  PauseCircleOutlined,
  StepBackwardOutlined,
  StepForwardOutlined,
  FullscreenOutlined,
  SoundOutlined,
} from '@ant-design/icons';
import type { Timeline as TimelineType } from '../../types';
import type { PlaybackState } from '../../engine/MediaEngine';
import { MediaEngine } from '../../engine/MediaEngine';

interface PlayerProps {
  timeline: TimelineType | null;
  onTimeChange?: (time: number) => void;
  onPlayStateChange?: (isPlaying: boolean) => void;
}

// 时间显示组件 - 独立更新避免整体重渲染
const TimeDisplay = memo(({ time, fps }: { time: number; fps: number }) => {
  const totalSeconds = Math.floor(time / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const frames = Math.floor((time % 1000) / (1000 / fps));
  return (
    <span style={styles.time}>
      {minutes.toString().padStart(2, '0')}:{seconds.toString().padStart(2, '0')}:{frames.toString().padStart(2, '0')}
    </span>
  );
});

export function Player({ timeline, onTimeChange, onPlayStateChange }: PlayerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<MediaEngine | null>(null);

  // 实时状态存储在 ref 中，避免每帧触发渲染
  const stateRef = useRef<PlaybackState>({
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    fps: 30,
  });

  // UI 状态 - 仅在需要时更新
  const [displayState, setDisplayState] = useState<PlaybackState>({
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    fps: 30,
  });
  const [volume, setVolume] = useState(1);

  // RAF 更新控制
  const rafIdRef = useRef<number | null>(null);
  const lastUIUpdateRef = useRef(0);
  const lastTimeChangeRef = useRef(0);
  const lastPlayStateRef = useRef(false);

  // UI 更新间隔 (ms)
  const UI_UPDATE_INTERVAL = 33;  // ~30fps 的 UI 更新
  const TIME_CHANGE_INTERVAL = 100;  // 外部回调节流

  // 初始化引擎
  useEffect(() => {
    if (!canvasRef.current) return;

    const engine = new MediaEngine();
    engine.bindCanvas(canvasRef.current);

    // RAF 批量更新 UI
    const updateUI = () => {
      const now = performance.now();
      const state = stateRef.current;

      // UI 更新节流
      if (now - lastUIUpdateRef.current >= UI_UPDATE_INTERVAL) {
        lastUIUpdateRef.current = now;
        setDisplayState({ ...state });
      }

      // onTimeChange 节流
      if (onTimeChange && now - lastTimeChangeRef.current >= TIME_CHANGE_INTERVAL) {
        lastTimeChangeRef.current = now;
        onTimeChange(state.currentTime);
      }

      // onPlayStateChange 仅状态变化时触发
      if (onPlayStateChange && state.isPlaying !== lastPlayStateRef.current) {
        lastPlayStateRef.current = state.isPlaying;
        onPlayStateChange(state.isPlaying);
      }

      if (stateRef.current.isPlaying) {
        rafIdRef.current = requestAnimationFrame(updateUI);
      }
    };

    engine.onUpdate((state) => {
      stateRef.current = state;

      // 播放状态变化时立即更新 UI
      if (state.isPlaying !== lastPlayStateRef.current) {
        setDisplayState({ ...state });
        lastPlayStateRef.current = state.isPlaying;
        onPlayStateChange?.(state.isPlaying);
      }

      // 播放时启动 RAF 更新循环
      if (state.isPlaying && rafIdRef.current === null) {
        rafIdRef.current = requestAnimationFrame(updateUI);
      }

      // 暂停时取消 RAF 并立即更新
      if (!state.isPlaying) {
        if (rafIdRef.current !== null) {
          cancelAnimationFrame(rafIdRef.current);
          rafIdRef.current = null;
        }
        setDisplayState({ ...state });
        onTimeChange?.(state.currentTime);
      }
    });
    engineRef.current = engine;

    return () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
      }
      engine.dispose();
    };
  }, [onTimeChange, onPlayStateChange]);

  // 加载时间线（使用 ref 追踪上一次的 timeline id，避免重复加载）
  const lastTimelineIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (timeline && engineRef.current) {
      // 总是更新 timeline 数据（用于渲染），但 loadTimeline 内部会智能判断是否需要重新加载媒体
      engineRef.current.loadTimeline(timeline);
      lastTimelineIdRef.current = timeline.id;
    }
  }, [timeline]);

  // 播放/暂停
  const handleTogglePlay = useCallback(() => {
    engineRef.current?.togglePlay();
  }, []);

  // 跳转
  const handleSeek = useCallback((value: number) => {
    engineRef.current?.seek(value);
  }, []);

  // 上一帧/下一帧 - 使用 ref 获取最新状态
  const handleStepFrame = useCallback((direction: 1 | -1) => {
    if (!engineRef.current) return;
    const state = stateRef.current;
    const frameDuration = 1000 / state.fps;
    const newTime = state.currentTime + direction * frameDuration;
    engineRef.current.seek(Math.max(0, Math.min(newTime, state.duration)));
  }, []);

  // 音量控制
  const handleVolumeChange = useCallback((value: number) => {
    setVolume(value);
    engineRef.current?.setVolume(value);
  }, []);

  // 全屏
  const handleFullscreen = useCallback(() => {
    containerRef.current?.requestFullscreen?.();
  }, []);

  const canvasWidth = timeline?.resolution.width || 1920;
  const canvasHeight = timeline?.resolution.height || 1080;

  return (
    <div ref={containerRef} style={styles.container}>
      <div style={styles.canvasWrapper}>
        <canvas
          ref={canvasRef}
          width={canvasWidth}
          height={canvasHeight}
          style={styles.canvas}
        />
      </div>

      <div style={styles.controls}>
        <div style={styles.timeline}>
          <TimeDisplay time={displayState.currentTime} fps={displayState.fps} />
          <Slider
            min={0}
            max={displayState.duration || 100}
            value={displayState.currentTime}
            onChange={handleSeek}
            tooltip={{ formatter: (v) => {
              const ms = v || 0;
              const totalSeconds = Math.floor(ms / 1000);
              const minutes = Math.floor(totalSeconds / 60);
              const seconds = totalSeconds % 60;
              const frames = Math.floor((ms % 1000) / (1000 / displayState.fps));
              return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}:${frames.toString().padStart(2, '0')}`;
            }}}
            style={{ flex: 1, margin: '0 12px' }}
          />
          <TimeDisplay time={displayState.duration} fps={displayState.fps} />
        </div>

        <div style={styles.buttons}>
          <Space>
            <Tooltip title="上一帧">
              <Button
                type="text"
                icon={<StepBackwardOutlined />}
                onClick={() => handleStepFrame(-1)}
              />
            </Tooltip>
            <Button
              type="primary"
              shape="circle"
              size="large"
              icon={displayState.isPlaying ? <PauseCircleOutlined /> : <PlayCircleOutlined />}
              onClick={handleTogglePlay}
            />
            <Tooltip title="下一帧">
              <Button
                type="text"
                icon={<StepForwardOutlined />}
                onClick={() => handleStepFrame(1)}
              />
            </Tooltip>
          </Space>

          <Space style={{ marginLeft: 24 }}>
            <SoundOutlined style={{ color: '#a1a1aa' }} />
            <Slider
              min={0}
              max={1}
              step={0.01}
              value={volume}
              onChange={handleVolumeChange}
              style={{ width: 80 }}
            />
            <Tooltip title="全屏">
              <Button
                type="text"
                icon={<FullscreenOutlined />}
                onClick={handleFullscreen}
              />
            </Tooltip>
          </Space>
        </div>
      </div>
    </div>
  );
}

const styles: React.CSSProperties & Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    background: '#0a0a0a',
    borderRadius: 8,
    overflow: 'hidden',
  },
  canvasWrapper: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#000',
    minHeight: 300,
  },
  canvas: {
    maxWidth: '100%',
    maxHeight: '100%',
    objectFit: 'contain',
  },
  controls: {
    padding: '12px 16px',
    background: '#18181b',
  },
  timeline: {
    display: 'flex',
    alignItems: 'center',
    marginBottom: 8,
  },
  time: {
    fontFamily: 'monospace',
    fontSize: 12,
    color: '#a1a1aa',
    minWidth: 70,
  },
  buttons: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
};

export default Player;

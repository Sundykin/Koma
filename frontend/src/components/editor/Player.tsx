/**
 * 视频播放器组件
 * 基于 Canvas 渲染，与 MediaEngine 集成
 */
import { useRef, useEffect, useCallback } from 'react';
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

export function Player({ timeline, onTimeChange, onPlayStateChange }: PlayerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<MediaEngine | null>(null);
  const [playbackState, setPlaybackState] = React.useState<PlaybackState>({
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    fps: 30,
  });
  const [volume, setVolume] = React.useState(1);

  // 初始化引擎
  useEffect(() => {
    if (!canvasRef.current) return;

    const engine = new MediaEngine();
    engine.bindCanvas(canvasRef.current);
    engine.onUpdate((state) => {
      setPlaybackState(state);
      onTimeChange?.(state.currentTime);
      onPlayStateChange?.(state.isPlaying);
    });
    engineRef.current = engine;

    return () => {
      engine.dispose();
    };
  }, []);

  // 加载时间线
  useEffect(() => {
    if (timeline && engineRef.current) {
      engineRef.current.loadTimeline(timeline);
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

  // 上一帧/下一帧
  const handleStepFrame = useCallback((direction: 1 | -1) => {
    if (!engineRef.current) return;
    const frameDuration = 1000 / playbackState.fps;
    const newTime = playbackState.currentTime + direction * frameDuration;
    engineRef.current.seek(Math.max(0, Math.min(newTime, playbackState.duration)));
  }, [playbackState]);

  // 音量控制
  const handleVolumeChange = useCallback((value: number) => {
    setVolume(value);
    engineRef.current?.setVolume(value);
  }, []);

  // 全屏
  const handleFullscreen = useCallback(() => {
    containerRef.current?.requestFullscreen?.();
  }, []);

  // 格式化时间
  const formatTime = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const frames = Math.floor((ms % 1000) / (1000 / playbackState.fps));
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}:${frames.toString().padStart(2, '0')}`;
  };

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
          <span style={styles.time}>{formatTime(playbackState.currentTime)}</span>
          <Slider
            min={0}
            max={playbackState.duration || 100}
            value={playbackState.currentTime}
            onChange={handleSeek}
            tooltip={{ formatter: (v) => formatTime(v || 0) }}
            style={{ flex: 1, margin: '0 12px' }}
          />
          <span style={styles.time}>{formatTime(playbackState.duration)}</span>
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
              icon={playbackState.isPlaying ? <PauseCircleOutlined /> : <PlayCircleOutlined />}
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

import React from 'react';

const styles: Record<string, React.CSSProperties> = {
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

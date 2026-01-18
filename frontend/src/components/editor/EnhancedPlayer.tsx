/**
 * 增强版播放器组件
 * 基于 PlaybackEngine 和 trackStore
 */
import React, { useRef, useEffect, useCallback, useState } from 'react';
import { Slider, Button, Space, Tooltip } from 'antd';
import {
  PlayCircleOutlined,
  PauseCircleOutlined,
  StepBackwardOutlined,
  StepForwardOutlined,
  FullscreenOutlined,
  SoundOutlined,
} from '@ant-design/icons';
import { useTrackStore } from '../../store/trackStore';
import { PlaybackEngine, PlaybackState } from '../../engine/PlaybackEngine';

interface EnhancedPlayerProps {
  onTimeChange?: (frame: number) => void;
  onPlayStateChange?: (isPlaying: boolean) => void;
}

export function EnhancedPlayer({
  onTimeChange,
  onPlayStateChange,
}: EnhancedPlayerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<PlaybackEngine | null>(null);

  const {
    config,
    tracks,
    currentTime,
    isPlaying,
    setCurrentTime,
    setPlaying,
  } = useTrackStore();

  const [playbackState, setPlaybackState] = useState<PlaybackState>({
    isPlaying: false,
    currentFrame: 0,
    currentTime: 0,
    duration: 0,
    durationMs: 0,
    fps: config.fps,
  });

  const [volume, setVolume] = useState(1);

  // 初始化引擎
  useEffect(() => {
    if (!canvasRef.current) return;

    const engine = new PlaybackEngine();
    engine.bindCanvas(canvasRef.current);
    engine.setConfig({
      fps: config.fps,
      width: config.width,
      height: config.height,
    });

    engine.onUpdate((state) => {
      setPlaybackState(state);
      setCurrentTime(state.currentFrame);
      setPlaying(state.isPlaying);
      onTimeChange?.(state.currentFrame);
      onPlayStateChange?.(state.isPlaying);
    });

    engineRef.current = engine;

    return () => {
      engine.dispose();
    };
  }, [config.fps, config.width, config.height]);

  // 加载轨道
  useEffect(() => {
    if (engineRef.current && tracks.length > 0) {
      engineRef.current.loadTracks(tracks);
    }
  }, [tracks]);

  // 同步外部时间变化
  useEffect(() => {
    if (engineRef.current && !isPlaying) {
      engineRef.current.seekFrame(currentTime);
    }
  }, [currentTime, isPlaying]);

  // 播放/暂停
  const handleTogglePlay = useCallback(() => {
    engineRef.current?.togglePlay();
  }, []);

  // 跳转
  const handleSeek = useCallback((value: number) => {
    engineRef.current?.seekFrame(value);
  }, []);

  // 上一帧/下一帧
  const handleStepFrame = useCallback((direction: 1 | -1) => {
    if (!engineRef.current) return;
    const newFrame = playbackState.currentFrame + direction;
    engineRef.current.seekFrame(Math.max(0, Math.min(newFrame, playbackState.duration)));
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

  // 格式化时间码
  const formatTimecode = (frame: number, fps: number) => {
    const totalSeconds = Math.floor(frame / fps);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const frames = frame % fps;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}:${frames.toString().padStart(2, '0')}`;
  };

  return (
    <div ref={containerRef} style={styles.container}>
      <div style={styles.canvasWrapper}>
        <canvas
          ref={canvasRef}
          width={config.width}
          height={config.height}
          style={styles.canvas}
        />
      </div>

      <div style={styles.controls}>
        <div style={styles.timeline}>
          <span style={styles.time}>
            {formatTimecode(playbackState.currentFrame, playbackState.fps)}
          </span>
          <Slider
            min={0}
            max={playbackState.duration || 1}
            value={playbackState.currentFrame}
            onChange={handleSeek}
            tooltip={{
              formatter: (v) => formatTimecode(v || 0, playbackState.fps),
            }}
            style={{ flex: 1, margin: '0 12px' }}
          />
          <span style={styles.time}>
            {formatTimecode(playbackState.duration, playbackState.fps)}
          </span>
        </div>

        <div style={styles.buttons}>
          <Space>
            <Tooltip title="上一帧 (←)">
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
              icon={
                playbackState.isPlaying ? (
                  <PauseCircleOutlined />
                ) : (
                  <PlayCircleOutlined />
                )
              }
              onClick={handleTogglePlay}
            />
            <Tooltip title="下一帧 (→)">
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

export default EnhancedPlayer;

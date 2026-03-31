/**
 * StagePlayer - 分镜舞台视频播放器
 * 基于 xgplayer 封装，支持 Electron 本地文件
 */
import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import Player from 'xgplayer';
import 'xgplayer/dist/index.min.css';
import { electronService } from '../../services/electronService';
import { Button, Empty, Typography } from 'antd';
import { PlayCircleOutlined } from '@ant-design/icons';
import { createLogger } from '../../store/logger';

const logger = createLogger('StagePlayer');

const { Text } = Typography;

function resolveMediaSource(source?: string): string {
  if (!source) return '';
  if (
    source.startsWith('http://') ||
    source.startsWith('https://') ||
    source.startsWith('data:') ||
    source.startsWith('blob:') ||
    source.startsWith('koma-local://')
  ) {
    return source;
  }
  return electronService.fs.toLocalUrl(source);
}

export interface StagePlayerProps {
  source?: string;
  videoPath?: string;
  videoUrl?: string;
  poster?: string;
  className?: string;
  style?: React.CSSProperties;
  onTimeUpdate?: (currentTime: number) => void;
  onEnded?: () => void;
  autoPlay?: boolean;
  emptyDescription?: React.ReactNode;
  showStopButton?: boolean;
  stopButtonLabel?: React.ReactNode;
}

export const StagePlayer: React.FC<StagePlayerProps> = ({
  source,
  videoPath,
  videoUrl,
  poster,
  className,
  style,
  onTimeUpdate,
  onEnded,
  autoPlay = false,
  emptyDescription,
  showStopButton = false,
  stopButtonLabel = '停止',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<Player | null>(null);
  const [error, setError] = useState<string | null>(null);
  const resolvedSrc = useMemo(
    () => resolveMediaSource(source || videoUrl || videoPath),
    [source, videoPath, videoUrl],
  );
  const resolvedPoster = useMemo(() => resolveMediaSource(poster), [poster]);

  // 初始化播放器
  useEffect(() => {
    if (!containerRef.current || !resolvedSrc) {
      return;
    }

    setError(null);

    // 销毁旧实例
    if (playerRef.current) {
      playerRef.current.destroy();
      playerRef.current = null;
    }

    try {
      playerRef.current = new Player({
        el: containerRef.current,
        url: resolvedSrc,
        poster: resolvedPoster || undefined,
        width: '100%',
        height: '100%',
        autoplay: autoPlay,
        playbackRate: [0.5, 0.75, 1, 1.25, 1.5, 2],
        pip: true,
        cssFullscreen: true,
        lang: 'zh-cn',
        controls: true,
        videoInit: true,
      });

      // 事件监听
      if (onTimeUpdate) {
        playerRef.current.on('timeupdate', () => {
          if (playerRef.current) {
            onTimeUpdate(playerRef.current.currentTime);
          }
        });
      }

      if (onEnded) {
        playerRef.current.on('ended', onEnded);
      }

      playerRef.current.on('error', (err: unknown) => {
        logger.error('播放错误', err);
        setError('视频加载失败');
      });
    } catch (err: unknown) {
      logger.error('初始化失败', err);
      setError(err instanceof Error ? err.message : '播放器初始化失败');
    }

    return () => {
      if (playerRef.current) {
        playerRef.current.destroy();
        playerRef.current = null;
      }
    };
  }, [autoPlay, onEnded, onTimeUpdate, resolvedPoster, resolvedSrc]);

  const handleStop = useCallback(() => {
    const player = playerRef.current;
    if (!player) {
      return;
    }

    try {
      player.pause();
      player.currentTime = 0;
    } catch (err: unknown) {
      logger.warn('停止播放失败', err);
    }
  }, []);

  const hasVideo = Boolean(resolvedSrc);

  return (
    <div
      className={`stagePlayer ${className || ''}`}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        background: '#09090b',
        borderRadius: 8,
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        ...style,
      }}
    >
      {error ? (
        <div style={{ textAlign: 'center', color: '#ef4444' }}>
          <Text type="danger">{error}</Text>
        </div>
      ) : hasVideo ? (
        <>
          <div
            ref={containerRef}
            style={{ width: '100%', height: '100%' }}
          />
          {showStopButton ? (
            <div
              style={{
                position: 'absolute',
                right: 12,
                top: 12,
                zIndex: 2,
              }}
            >
              <Button size="small" onClick={handleStop}>
                {stopButtonLabel}
              </Button>
            </div>
          ) : null}
        </>
      ) : (
        <Empty
          image={<PlayCircleOutlined style={{ fontSize: 48, color: '#3f3f46' }} />}
          description={
            emptyDescription || <Text type="secondary">选择分镜以预览视频</Text>
          }
          style={{ margin: 0 }}
        />
      )}
    </div>
  );
};

export default StagePlayer;

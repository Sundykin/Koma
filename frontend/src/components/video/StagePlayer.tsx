/**
 * StagePlayer - 分镜舞台视频播放器
 * 基于 xgplayer 封装，支持 Electron 本地文件
 */
import React, { useEffect, useRef, useCallback, useState } from 'react';
import Player from 'xgplayer';
import 'xgplayer/dist/index.min.css';
import { electronService } from '../../services/electronService';
import { Typography, Empty } from 'antd';
import { PlayCircleOutlined } from '@ant-design/icons';
import { createLogger } from '../../store/logger';

const logger = createLogger('StagePlayer');

const { Text } = Typography;

interface StagePlayerProps {
  videoPath?: string;
  videoUrl?: string;
  poster?: string;
  className?: string;
  style?: React.CSSProperties;
  onTimeUpdate?: (currentTime: number) => void;
  onEnded?: () => void;
  autoPlay?: boolean;
}

export const StagePlayer: React.FC<StagePlayerProps> = ({
  videoPath,
  videoUrl,
  poster,
  className,
  style,
  onTimeUpdate,
  onEnded,
  autoPlay = false,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<Player | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 获取视频 URL
  const getVideoSrc = useCallback(() => {
    if (videoUrl) return videoUrl;
    if (videoPath) return electronService.fs.toLocalUrl(videoPath);
    return '';
  }, [videoPath, videoUrl]);

  // 初始化播放器
  useEffect(() => {
    const src = getVideoSrc();
    if (!containerRef.current || !src) {
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
        url: src,
        poster: poster ? electronService.fs.toLocalUrl(poster) : undefined,
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
  }, [getVideoSrc, poster, autoPlay, onTimeUpdate, onEnded]);

  // 更新视频源
  useEffect(() => {
    const src = getVideoSrc();
    if (playerRef.current && src && playerRef.current.src !== src) {
      playerRef.current.src = src;
    }
  }, [getVideoSrc]);

  const hasVideo = videoPath || videoUrl;

  return (
    <div
      className={`stagePlayer ${className || ''}`}
      style={{
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
        <div
          ref={containerRef}
          style={{ width: '100%', height: '100%' }}
        />
      ) : (
        <Empty
          image={<PlayCircleOutlined style={{ fontSize: 48, color: '#3f3f46' }} />}
          description={
            <Text type="secondary">选择分镜以预览视频</Text>
          }
          style={{ margin: 0 }}
        />
      )}
    </div>
  );
};

export default StagePlayer;

/**
 * 视频编辑器主组件
 * 整合 EnhancedPlayer、EnhancedTimeline、Sidebar 实现完整编辑流程
 */
import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { message } from 'antd';
import type { Shot, Asset, MediaType, Clip, Timeline as TimelineType, Track } from '../../types';
import type { Resource } from '../../types/resource';
import { Player } from './Player';
import { EnhancedTimeline } from './Timeline/EnhancedTimeline';
import { Sidebar } from './Sidebar';
import { useTrackStore } from '../../store/trackStore';
import { useResourceStore } from '../../store/resourceStore';
import { getProjectPath } from '../../store/projectStore';

interface VideoEditorProps {
  projectId?: string;
  shots: Shot[];
  onShotsChange?: (shots: Shot[]) => void;
}

export const VideoEditor: React.FC<VideoEditorProps> = ({ projectId, shots }) => {
  const [initialized, setInitialized] = useState(false);
  const [draggingResource, setDraggingResource] = useState<Resource | null>(null);
  const initRef = useRef(false);
  const shotsRef = useRef(shots);
  shotsRef.current = shots;

  // Track store - 使用 selector 避免不必要的重渲染
  const config = useTrackStore(state => state.config);
  const tracks = useTrackStore(state => state.tracks);
  const currentTime = useTrackStore(state => state.currentTime);
  const setCurrentTime = useTrackStore(state => state.setCurrentTime);
  const setPlaying = useTrackStore(state => state.setPlaying);
  const getDuration = useTrackStore(state => state.getDuration);

  // Resource store
  const initResourceStore = useResourceStore(state => state.init);

  // 初始化
  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;

    const initStores = async () => {
      console.log('[VideoEditor] Initializing stores...');

      // 获取 store 方法
      const trackStore = useTrackStore.getState();

      // 初始化 track store
      trackStore.init({ fps: 30, width: 1920, height: 1080 });

      // 初始化 resource store（需要项目路径）
      if (projectId) {
        try {
          const projectPath = await getProjectPath(projectId);
          initResourceStore(projectId, projectPath);
          console.log('[VideoEditor] Resource store initialized with path:', projectPath);
        } catch (err) {
          console.warn('[VideoEditor] Failed to get project path:', err);
        }
      }

      // 添加默认轨道
      const videoTrack = trackStore.addTrack('video', '视频轨道');
      const audioTrack = trackStore.addTrack('audio', '音频轨道');
      const textTrack = trackStore.addTrack('text', '字幕轨道');

      console.log('[VideoEditor] Created tracks:', { videoTrack: videoTrack?.id, audioTrack: audioTrack?.id, textTrack: textTrack?.id });

      // 导入 shots 中的视频素材
      const currentShots = shotsRef.current;
      if (currentShots.length > 0 && videoTrack) {
        console.log('[VideoEditor] Importing', currentShots.length, 'shots to timeline');

        let currentFrame = 0;
        const fps = 30;

        for (const shot of currentShots) {
          const duration = shot.duration * 1000;
          const durationFrames = Math.round(duration / (1000 / fps));

          // 获取视频路径
          const currentVideo = shot.videos?.[shot.currentVideoIndex || 0];
          const mediaPath = currentVideo?.path || shot.imagePath || shot.imageUrl;
          const mediaType = currentVideo?.path ? 'video' : 'image';

          console.log('[VideoEditor] Shot', shot.id, ':', { mediaPath, mediaType, duration });

          if (mediaPath) {
            trackStore.addItemFromResource(
              videoTrack.id,
              {
                id: `shot-${shot.id}`,
                type: mediaType,
                name: shot.scriptContent?.slice(0, 20) || `镜头 ${shot.id}`,
                path: mediaPath,
                duration,
                thumbnailPath: currentVideo?.thumbnailPath || shot.imagePath || shot.imageUrl,
              },
              currentFrame
            );
          }

          if (shot.dialogue && textTrack) {
            trackStore.addItemFromResource(
              textTrack.id,
              {
                id: `subtitle-${shot.id}`,
                type: 'text',
                name: shot.dialogue.slice(0, 10),
                path: '',
                duration,
              },
              currentFrame
            );
          }

          currentFrame += durationFrames;
        }

        console.log('[VideoEditor] Import complete, total frames:', currentFrame);
      } else {
        console.log('[VideoEditor] No shots to import or no video track');
      }

      setInitialized(true);
    };

    initStores();
  }, [projectId, initResourceStore]);

  // 从 shots 生成素材列表（兼容旧 API）
  const assets = useMemo((): Asset[] => {
    return shots.map((shot) => {
      const currentVideo = shot.videos?.[shot.currentVideoIndex || 0];
      const mediaPath = currentVideo?.path || shot.imagePath || shot.imageUrl;
      return {
        id: `asset-${shot.id}`,
        name: shot.scriptContent?.slice(0, 20) || `镜头素材`,
        type: (currentVideo?.path ? 'video' : 'image') as MediaType,
        path: mediaPath || `https://picsum.photos/seed/${shot.id}/800/450`,
        thumbnailPath: currentVideo?.thumbnailPath || shot.imagePath || shot.imageUrl || `https://picsum.photos/seed/${shot.id}/160/90`,
        duration: shot.duration * 1000,
        size: 0,
        createdAt: Date.now(),
        refCount: 0,
      };
    });
  }, [shots]);

  // 创建兼容的 Timeline 对象（用于 Player）
  const timeline = useMemo((): TimelineType => {
    const duration = getDuration();
    const durationMs = duration * (1000 / config.fps);

    return {
      id: 'timeline-main',
      duration: durationMs || 30000,
      tracks: tracks.map(track => ({
        id: track.id,
        name: track.name,
        type: track.type === 'text' ? 'subtitle' : track.type,
        muted: track.muted,
        locked: track.locked,
        visible: track.visible,
        height: track.height,
        clips: track.items.map(item => {
          const sourcePath = 'source' in item ? (item as any).source : '';
          const hasTransform = item.type === 'video' || item.type === 'image';
          const x = hasTransform ? (item as any).x || 0 : 0;
          const y = hasTransform ? (item as any).y || 0 : 0;
          const scale = hasTransform ? (item as any).scale || 1 : 1;
          const rotation = hasTransform ? (item as any).rotation || 0 : 0;
          const opacity = hasTransform ? ((item as any).opacity ?? 1) : 1;
          const keyframes = 'keyframes' in item ? (item as any).keyframes : [];

          return {
            id: item.id,
            trackId: track.id,
            type: (item.type === 'text' ? 'subtitle' : item.type) as MediaType,
            name: item.name,
            startTime: item.start * (1000 / config.fps),
            duration: (item.end - item.start) * (1000 / config.fps),
            sourcePath,
            position: { x, y },
            scale,
            rotation,
            opacity,
            keyframes: keyframes?.map((kf: any) => ({
              id: kf.id,
              time: kf.time,
              property: Object.keys(kf).find(k => !['id', 'time', 'easing'].includes(k)) || 'opacity',
              value: kf.opacity ?? kf.scale ?? kf.x ?? kf.y ?? kf.rotation ?? 1,
              easing: kf.easing,
            })) || [],
            text: item.type === 'text' ? (item as any).content : undefined,
            fontSize: item.type === 'text' ? (item as any).fontSize : undefined,
            fontColor: item.type === 'text' ? (item as any).fontColor : undefined,
          };
        }),
      })) as Track[],
      fps: config.fps,
      resolution: { width: config.width, height: config.height },
    };
  }, [tracks, config, getDuration]);

  // 当前选中的 Clip（用于 Sidebar）
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const selectedClip = useMemo(() => {
    if (!selectedClipId) return null;
    for (const track of timeline.tracks) {
      const clip = track.clips.find((c) => c.id === selectedClipId);
      if (clip) return clip;
    }
    return null;
  }, [selectedClipId, timeline]);

  // 更新 Clip（兼容旧 API）
  const handleClipChange = useCallback((updatedClip: Clip) => {
    const trackStore = useTrackStore.getState();
    const track = tracks.find(t => t.items.some(i => i.id === updatedClip.id));
    if (track) {
      trackStore.updateItem(track.id, updatedClip.id, {
        x: updatedClip.position.x,
        y: updatedClip.position.y,
        scale: updatedClip.scale,
        rotation: updatedClip.rotation,
        opacity: updatedClip.opacity,
      });
    }
  }, [tracks]);

  // 素材拖拽开始（旧 API）
  const handleAssetDragStart = useCallback((asset: Asset) => {
    console.log('[VideoEditor] Legacy drag start:', asset.name);
  }, []);

  // 资源拖拽开始（新 API）
  const handleResourceDragStart = useCallback((resource: Resource) => {
    console.log('[VideoEditor] Resource drag start:', resource.name);
    setDraggingResource(resource);
  }, []);

  // 播放时间变化
  const handleTimeChange = useCallback((time: number) => {
    const frame = Math.round(time / (1000 / config.fps));
    setCurrentTime(frame);
  }, [config.fps, setCurrentTime]);

  // 播放状态变化
  const handlePlayStateChange = useCallback((playing: boolean) => {
    setPlaying(playing);
  }, [setPlaying]);

  return (
    <div style={styles.container}>
      {/* 上半部分：播放器 + 侧边栏 */}
      <div style={styles.upper}>
        <div style={styles.playerArea}>
          <Player
            timeline={timeline}
            onTimeChange={handleTimeChange}
            onPlayStateChange={handlePlayStateChange}
          />
        </div>
        <Sidebar
          assets={assets}
          selectedClip={selectedClip}
          timeline={timeline}
          onClipChange={handleClipChange}
          onAssetDragStart={handleAssetDragStart}
          onResourceDragStart={handleResourceDragStart}
        />
      </div>

      {/* 下半部分：增强版时间线 */}
      <div style={styles.lower}>
        <EnhancedTimeline
          onTimeChange={handleTimeChange}
          draggingResource={draggingResource}
        />
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    background: '#0f0f0f',
  },
  upper: {
    flex: 1,
    display: 'flex',
    minHeight: 0,
    borderBottom: '1px solid #27272a',
  },
  playerArea: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    padding: 16,
  },
  lower: {
    height: 300,
    minHeight: 200,
  },
};

export default VideoEditor;

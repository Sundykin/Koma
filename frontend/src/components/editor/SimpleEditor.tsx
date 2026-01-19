/**
 * 简洁版视频编辑器
 * 迁移自 electron-egg，完整功能版
 */
import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { message } from 'antd';
import { Track, Clip, Asset, MediaType, EasingType, Keyframe } from '../../types/editor';
import { SimpleTimeline } from './SimpleTimeline';
import { SimplePlayer } from './SimplePlayer';
import { SimplePropertiesPanel } from './SimplePropertiesPanel';
import { SimpleAssetPanel } from './SimpleAssetPanel';
import { useAssets } from './useAssets';
import { addKeyframe, updateKeyframe, removeKeyframe } from '../../engine/simpleKeyframe';
import { findNextAvailablePosition } from '../../utils/trackCollision';
import { electronService } from '../../services/electronService';
import { saveEpisodeTimeline } from '../../store/projectStore';
import type { Shot } from '../../types';

interface SimpleEditorProps {
  shots?: Shot[];
  onShotsChange?: (shots: Shot[]) => void;
  projectId?: string;
  episodeId?: string;
}

const generateId = () => `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

// Shot 转换为 Tracks
function shotsToTracks(shots: Shot[]): Track[] {
  const videoTrack: Track = { id: 'video-main', type: 'video', clips: [], order: 0, isMainTrack: true };
  const audioTrack: Track = { id: 'audio-main', type: 'audio', clips: [], order: -1 };
  const textTrack: Track = { id: 'text-main', type: 'text', clips: [], order: 1 };

  let currentTime = 0;

  for (const shot of shots) {
    const shotDuration = shot.duration || 3;
    const currentVideo = shot.videos?.[shot.currentVideoIndex || 0];
    const mediaPath = currentVideo?.path || shot.imagePath || shot.imageUrl;
    const mediaType = currentVideo?.path ? MediaType.VIDEO : MediaType.IMAGE;

    if (mediaPath) {
      videoTrack.clips.push({
        id: `clip-${shot.id}`,
        assetId: `asset-${shot.id}`,
        trackId: videoTrack.id,
        start: currentTime,
        duration: shotDuration,
        offset: 0,
        sourceDuration: shotDuration, // 源素材时长
        name: shot.scriptContent?.slice(0, 20) || `镜头 ${shot.id}`,
        type: mediaType,
        src: mediaPath,
        x: 0, y: 0, scale: 1, rotation: 0, opacity: 1,
      });
    }

    if (shot.dialogue) {
      textTrack.clips.push({
        id: `text-${shot.id}`,
        assetId: `text-asset-${shot.id}`,
        trackId: textTrack.id,
        start: currentTime,
        duration: shotDuration,
        offset: 0,
        name: shot.dialogue.slice(0, 10),
        type: MediaType.TEXT,
        src: shot.dialogue,
        x: 0, y: 0, scale: 1, rotation: 0, opacity: 1,
      });
    }

    currentTime += shotDuration;
  }

  return [videoTrack, audioTrack, textTrack].filter(t => t.clips.length > 0 || t.isMainTrack);
}

export const SimpleEditor: React.FC<SimpleEditorProps> = ({ shots = [], projectId, episodeId }) => {
  const [tracks, setTracks] = useState<Track[]>(() => shotsToTracks(shots));
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [selectedKeyframeId, setSelectedKeyframeId] = useState<string | null>(null);
  const [draggingAsset, setDraggingAsset] = useState<Asset | null>(null);

  // 素材库
  const { assets: assetItems } = useAssets({
    projectId: projectId || '',
    episodeId: episodeId || '',
  });

  // 获取选中的 Clip
  const selectedClip = useMemo(() => {
    if (!selectedClipId) return null;
    for (const track of tracks) {
      const clip = track.clips.find(c => c.id === selectedClipId);
      if (clip) return clip;
    }
    return null;
  }, [tracks, selectedClipId]);

  // 计算总时长（基于实际内容）
  const duration = useMemo(() => {
    let maxEnd = 0;
    let hasClips = false;
    for (const track of tracks) {
      for (const clip of track.clips) {
        hasClips = true;
        maxEnd = Math.max(maxEnd, clip.start + clip.duration);
      }
    }
    // 没有素材时返回最小时长，有素材时返回实际内容时长
    return hasClips ? maxEnd : 1;
  }, [tracks]);

  // 自动保存（防抖 1 秒）
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isFirstRender = useRef(true);

  useEffect(() => {
    // 跳过首次渲染
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    // 没有 projectId 或 episodeId 时不保存
    if (!projectId || !episodeId) return;

    // 清除之前的定时器
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    // 设置防抖保存
    saveTimeoutRef.current = setTimeout(async () => {
      try {
        await saveEpisodeTimeline(projectId, episodeId, {
          tracks,
          duration,
        });
        console.log('[SimpleEditor] 自动保存成功');
      } catch (err) {
        console.error('[SimpleEditor] 自动保存失败:', err);
      }
    }, 1000);

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [tracks, duration, projectId, episodeId]);

  // 当 shots 变化时更新轨道
  useEffect(() => {
    if (shots.length > 0) {
      setTracks(shotsToTracks(shots));
    }
  }, [shots]);

  const togglePlay = useCallback(() => {
    setIsPlaying(prev => !prev);
  }, []);

  const handleSeek = useCallback((time: number) => {
    // 限制 seek 不超过内容时长
    setCurrentTime(Math.min(Math.max(0, time), duration));
  }, [duration]);

  const handleTimeUpdate = useCallback((time: number) => {
    // 播放到末尾时停止
    if (time >= duration) {
      setCurrentTime(duration);
      setIsPlaying(false);
    } else {
      setCurrentTime(time);
    }
  }, [duration]);

  const handleSelectClip = useCallback((id: string | null) => {
    setSelectedClipId(id);
    setSelectedKeyframeId(null);
  }, []);

  const handleUpdateClip = useCallback((clipId: string, updates: Partial<Clip>) => {
    setTracks(prev => prev.map(track => ({
      ...track,
      clips: track.clips.map(clip =>
        clip.id === clipId ? { ...clip, ...updates } : clip
      )
    })));
  }, []);

  const handleMoveClip = useCallback((clipId: string, newStart: number, newTrackId: string) => {
    setTracks(prev => {
      let movedClip: Clip | null = null;
      const tracksWithoutClip = prev.map(track => {
        const clipIndex = track.clips.findIndex(c => c.id === clipId);
        if (clipIndex >= 0) {
          movedClip = { ...track.clips[clipIndex], start: newStart, trackId: newTrackId };
          return { ...track, clips: track.clips.filter(c => c.id !== clipId) };
        }
        return track;
      });

      if (!movedClip) return prev;

      return tracksWithoutClip.map(track =>
        track.id === newTrackId
          ? { ...track, clips: [...track.clips, movedClip!] }
          : track
      );
    });
  }, []);

  const handleAssetDrop = useCallback((asset: Asset, time: number, trackId?: string) => {
    setTracks(prev => {
      // 找到目标轨道
      let targetTrack = trackId ? prev.find(t => t.id === trackId) : null;
      const trackType = asset.type === MediaType.AUDIO ? 'audio' : asset.type === MediaType.TEXT ? 'text' : 'video';

      // 使用碰撞检测找到安全的起始位置
      const existingClips = targetTrack?.clips || [];
      const safeStart = findNextAvailablePosition(existingClips, asset.duration, Math.max(0, time));

      const newClip: Clip = {
        id: generateId(),
        assetId: asset.id,
        trackId: trackId || '',
        start: safeStart,
        duration: asset.duration,
        offset: 0,
        sourceDuration: asset.duration, // 设置源素材时长
        name: asset.name,
        type: asset.type,
        src: asset.src,
        x: 0, y: 0, scale: 1, rotation: 0, opacity: 1,
      };

      if (trackId && targetTrack) {
        return prev.map(track =>
          track.id === trackId
            ? { ...track, clips: [...track.clips, { ...newClip, trackId }] }
            : track
        );
      }

      // 创建新轨道
      const newTrackId = generateId();
      const newTrack: Track = {
        id: newTrackId,
        type: trackType,
        clips: [{ ...newClip, trackId: newTrackId }],
        order: prev.length,
      };
      return [...prev, newTrack];
    });

    message.success(`已添加: ${asset.name}`);
  }, []);

  const handleDeleteClip = useCallback((clipId?: string) => {
    const targetId = clipId || selectedClipId;
    if (!targetId) return;

    setTracks(prev => prev.map(track => ({
      ...track,
      clips: track.clips.filter(c => c.id !== targetId)
    })));
    if (selectedClipId === targetId) {
      setSelectedClipId(null);
    }
  }, [selectedClipId]);

  const handleDeleteTrack = useCallback((trackId: string) => {
    setTracks(prev => prev.filter(t => t.id !== trackId));
  }, []);

  // 添加关键帧
  const handleAddKeyframe = useCallback((clipId: string, clipLocalTime: number) => {
    setTracks(prev => prev.map(track => ({
      ...track,
      clips: track.clips.map(clip => {
        if (clip.id !== clipId) return clip;
        return addKeyframe(clip, clipLocalTime, undefined, EasingType.EASE_IN_OUT);
      })
    })));
    message.success('已添加关键帧');
  }, []);

  // 更新关键帧
  const handleUpdateKeyframe = useCallback((clipId: string, keyframeId: string, updates: Partial<Keyframe>) => {
    setTracks(prev => prev.map(track => ({
      ...track,
      clips: track.clips.map(clip => {
        if (clip.id !== clipId) return clip;
        return updateKeyframe(clip, keyframeId, updates);
      })
    })));
  }, []);

  // 选择关键帧
  const handleSelectKeyframe = useCallback((clipId: string, keyframeId: string | null) => {
    setSelectedKeyframeId(keyframeId);
  }, []);

  // 删除关键帧
  const handleDeleteKeyframe = useCallback((clipId: string, keyframeId: string) => {
    setTracks(prev => prev.map(track => ({
      ...track,
      clips: track.clips.map(clip => {
        if (clip.id !== clipId) return clip;
        return removeKeyframe(clip, keyframeId);
      })
    })));
    if (selectedKeyframeId === keyframeId) {
      setSelectedKeyframeId(null);
    }
  }, [selectedKeyframeId]);

  // 复制片段
  const handleDuplicateClip = useCallback((clipId: string) => {
    setTracks(prev => prev.map(track => {
      const clipIndex = track.clips.findIndex(c => c.id === clipId);
      if (clipIndex < 0) return track;

      const clip = track.clips[clipIndex];
      const newClip: Clip = {
        ...clip,
        id: generateId(),
        start: clip.start + clip.duration,
        keyframes: clip.keyframes ? clip.keyframes.map(kf => ({ ...kf, id: generateId() })) : undefined,
      };

      return { ...track, clips: [...track.clips, newClip] };
    }));
    message.success('已复制片段');
  }, []);

  // 更新关键帧缓动
  const handleUpdateKeyframeEasing = useCallback((clipId: string, keyframeId: string, easing: EasingType) => {
    handleUpdateKeyframe(clipId, keyframeId, { easing });
  }, [handleUpdateKeyframe]);

  return (
    <div style={styles.container}>
      {/* 上半部分：素材面板 + 播放器 + 属性面板 */}
      <div style={styles.upper}>
        {/* 素材面板 */}
        <div style={styles.assetPanel}>
          <SimpleAssetPanel
            assets={assetItems}
            onDragStart={setDraggingAsset}
            onDragEnd={() => setDraggingAsset(null)}
          />
        </div>
        <SimplePlayer
          tracks={tracks}
          currentTime={currentTime}
          duration={duration}
          isPlaying={isPlaying}
          onTimeUpdate={handleTimeUpdate}
        />
        <SimplePropertiesPanel
          selectedClip={selectedClip}
          selectedKeyframeId={selectedKeyframeId}
          currentTime={currentTime}
          onUpdateClip={handleUpdateClip}
          onDeleteClip={() => handleDeleteClip()}
          onAddKeyframe={handleAddKeyframe}
          onUpdateKeyframe={handleUpdateKeyframe}
        />
      </div>

      {/* 下半部分：时间线 */}
      <div style={styles.lower}>
        <SimpleTimeline
          tracks={tracks}
          currentTime={currentTime}
          duration={duration}
          onSeek={handleSeek}
          selectedClipId={selectedClipId}
          onSelectClip={handleSelectClip}
          onUpdateClip={handleUpdateClip}
          onMoveClip={handleMoveClip}
          onAssetDrop={handleAssetDrop}
          onDeleteClip={handleDeleteClip}
          onAddKeyframe={handleAddKeyframe}
          onSelectKeyframe={handleSelectKeyframe}
          onDeleteKeyframe={handleDeleteKeyframe}
          onDuplicateClip={handleDuplicateClip}
          onUpdateKeyframeEasing={handleUpdateKeyframeEasing}
          selectedKeyframeId={selectedKeyframeId}
          isPlaying={isPlaying}
          togglePlay={togglePlay}
          onDeleteTrack={handleDeleteTrack}
          draggingAsset={draggingAsset}
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
  assetPanel: {
    width: 280,
    minWidth: 220,
    borderRight: '1px solid #27272a',
    overflow: 'hidden',
  },
  lower: {
    height: 300,
    minHeight: 200,
  },
};

export default SimpleEditor;

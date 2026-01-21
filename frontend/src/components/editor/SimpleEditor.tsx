/**
 * 简洁版视频编辑器
 * 迁移自 electron-egg，完整功能版
 */
import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { App } from 'antd';
import { Track, Clip, Asset, MediaType, EasingType, Keyframe } from '../../types/editor';
import { SimpleTimeline } from './SimpleTimeline';
import { SimplePlayer, AspectRatio, getCanvasSize } from './SimplePlayer';
import { SimplePropertiesPanel } from './SimplePropertiesPanel';
import { SimpleAssetPanel } from './SimpleAssetPanel';
import { SimpleExportDialog } from './SimpleExportDialog';
import { useAssets } from './useAssets';
import { addKeyframe, updateKeyframe, removeKeyframe, getKeyframeAtTime, getAnimatedProperties } from '../../engine/simpleKeyframe';
import { findNextAvailablePosition } from '../../utils/trackCollision';
import { electronService } from '../../services/electronService';
import { saveEpisodeTimeline, loadEpisodeTimeline } from '../../store/projectStore';
import { uploadFiles } from '../../services/uploadService';
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
  const { message } = App.useApp();
  const [tracks, setTracks] = useState<Track[]>([]);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [selectedKeyframeId, setSelectedKeyframeId] = useState<string | null>(null);
  const [draggingAsset, setDraggingAsset] = useState<Asset | null>(null);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('16:9');
  const [isLoadingTimeline, setIsLoadingTimeline] = useState(true);
  const timelineCreatedAtRef = useRef<number>(Date.now());

  // 素材库
  const { assets: assetItems, addUploadedAsset } = useAssets({
    projectId: projectId || '',
    episodeId: episodeId || '',
  });

  // 处理文件上传
  const handleUpload = useCallback(async (files: File[]) => {
    if (!projectId) {
      message.warning('请先创建项目');
      return;
    }

    message.loading({ content: `正在上传 ${files.length} 个文件...`, key: 'upload' });

    try {
      const results = await uploadFiles(files, projectId, episodeId, (current, total) => {
        message.loading({ content: `上传中 ${current}/${total}...`, key: 'upload' });
      });

      let successCount = 0;
      let failCount = 0;

      for (const result of results) {
        if (result.success && result.asset) {
          addUploadedAsset(result.asset);
          successCount++;
        } else {
          failCount++;
          console.warn('[Upload] 上传失败:', result.error);
        }
      }

      if (successCount > 0 && failCount === 0) {
        message.success({ content: `成功上传 ${successCount} 个文件`, key: 'upload' });
      } else if (successCount > 0 && failCount > 0) {
        message.warning({ content: `上传完成：${successCount} 成功，${failCount} 失败`, key: 'upload' });
      } else {
        message.error({ content: '上传失败', key: 'upload' });
      }
    } catch (err) {
      console.error('[Upload] 上传出错:', err);
      message.error({ content: '上传出错', key: 'upload' });
    }
  }, [projectId, episodeId, addUploadedAsset]);

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

  // 加载已保存的时间线
  useEffect(() => {
    const loadTimeline = async () => {
      if (!projectId || !episodeId) {
        // 没有 projectId 或 episodeId，使用 shots 初始化
        if (shots.length > 0) {
          setTracks(shotsToTracks(shots));
        }
        setIsLoadingTimeline(false);
        return;
      }

      setIsLoadingTimeline(true);
      try {
        const savedData = await loadEpisodeTimeline(projectId, episodeId);
        if (savedData && savedData.tracks && savedData.tracks.length > 0) {
          setTracks(savedData.tracks);
          timelineCreatedAtRef.current = savedData.createdAt || Date.now();
          console.log('[SimpleEditor] 已加载保存的时间线');
        } else if (shots.length > 0) {
          // 没有已保存的数据，使用 shots 初始化
          setTracks(shotsToTracks(shots));
          timelineCreatedAtRef.current = Date.now();
        }
      } catch (err) {
        console.error('[SimpleEditor] 加载时间线失败:', err);
        if (shots.length > 0) {
          setTracks(shotsToTracks(shots));
        }
      } finally {
        setIsLoadingTimeline(false);
      }
    };

    loadTimeline();
  }, [projectId, episodeId]); // 仅在 projectId/episodeId 变化时加载

  // 自动保存（防抖 1 秒）
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isFirstRender = useRef(true);

  useEffect(() => {
    // 跳过首次渲染和加载中状态
    if (isFirstRender.current || isLoadingTimeline) {
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
          version: 1,
          tracks,
          createdAt: timelineCreatedAtRef.current,
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
  }, [tracks, projectId, episodeId, isLoadingTimeline]);

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

  const handleUpdateTrack = useCallback((trackId: string, updates: Partial<Track>) => {
    setTracks(prev => prev.map(track =>
      track.id === trackId ? { ...track, ...updates } : track
    ));
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
        sourceDuration: asset.duration,
        sourceWidth: asset.width,
        sourceHeight: asset.height,
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

  // 自动打帧（画布变换时调用）
  const handleAutoKeyframe = useCallback((clipId: string, clipLocalTime: number, updates: Partial<Clip>) => {
    setTracks(prev => prev.map(track => ({
      ...track,
      clips: track.clips.map(clip => {
        if (clip.id !== clipId) return clip;

        // 检查当前时间是否已有关键帧
        const existingKf = getKeyframeAtTime(clip, clipLocalTime, 0.01);
        if (existingKf) {
          // 更新已有关键帧
          return updateKeyframe(clip, existingKf.id, updates);
        } else {
          // 创建新关键帧，使用当前插值属性作为基础
          const currentProps = getAnimatedProperties(clip, clipLocalTime);
          return addKeyframe(clip, clipLocalTime, { ...currentProps, ...updates });
        }
      })
    })));
  }, []);

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
            onUpload={handleUpload}
          />
        </div>
        <SimplePlayer
          tracks={tracks}
          currentTime={currentTime}
          duration={duration}
          isPlaying={isPlaying}
          selectedClipId={selectedClipId}
          onTimeUpdate={handleTimeUpdate}
          onUpdateClip={handleUpdateClip}
          onAutoKeyframe={handleAutoKeyframe}
          aspectRatio={aspectRatio}
          onAspectRatioChange={setAspectRatio}
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
          onUpdateTrack={handleUpdateTrack}
          draggingAsset={draggingAsset}
          onExport={() => setExportDialogOpen(true)}
        />
      </div>

      {/* 导出对话框 */}
      <SimpleExportDialog
        open={exportDialogOpen}
        onClose={() => setExportDialogOpen(false)}
        tracks={tracks}
        duration={duration}
        canvasSize={getCanvasSize(aspectRatio)}
      />
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

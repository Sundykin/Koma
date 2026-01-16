/**
 * 视频编辑器主组件
 * 整合 Player、Timeline、Sidebar 实现完整编辑流程
 */
import React, { useState, useCallback, useMemo } from 'react';
import { Shot, Timeline as TimelineType, Track, Clip, Asset, MediaType, Keyframe } from '../../types';
import { Player } from './Player';
import { Timeline } from './Timeline';
import { Sidebar } from './Sidebar';
import { v4 as uuid } from 'uuid';

interface VideoEditorProps {
  shots: Shot[];
}

export const VideoEditor: React.FC<VideoEditorProps> = ({ shots }) => {
  // 从 shots 转换为 Timeline 数据结构
  const initialTimeline = useMemo((): TimelineType => {
    // 创建视频轨道
    const videoTrack: Track = {
      id: 'video-main',
      name: '视频轨道',
      type: 'video',
      muted: false,
      locked: false,
      visible: true,
      height: 60,
      clips: shots.map((shot, idx) => {
        const startTime = shots.slice(0, idx).reduce((acc, s) => acc + s.duration * 1000, 0);
        return {
          id: `clip-${shot.id}`,
          trackId: 'video-main',
          type: 'video' as MediaType,
          name: `镜头 ${idx + 1}`,
          startTime,
          duration: shot.duration * 1000,
          sourcePath: shot.imageUrl || `https://picsum.photos/seed/${shot.id}/800/450`,
          position: { x: 0, y: 0 },
          scale: 1,
          rotation: 0,
          opacity: 1,
          keyframes: [],
        };
      }),
    };

    // 创建音频轨道（带台词的 shot）
    const audioClips: Clip[] = shots
      .filter((shot) => shot.dialogue)
      .map((shot, idx) => {
        const startTime = shots.slice(0, shots.indexOf(shot)).reduce((acc, s) => acc + s.duration * 1000, 0);
        return {
          id: `audio-${shot.id}`,
          trackId: 'audio-main',
          type: 'audio' as MediaType,
          name: shot.dialogue?.slice(0, 10) || `音频 ${idx + 1}`,
          startTime,
          duration: shot.duration * 1000,
          sourcePath: '',
          position: { x: 0, y: 0 },
          scale: 1,
          rotation: 0,
          opacity: 1,
          keyframes: [],
        };
      });

    const audioTrack: Track = {
      id: 'audio-main',
      name: '音频轨道',
      type: 'audio',
      muted: false,
      locked: false,
      visible: true,
      height: 40,
      clips: audioClips,
    };

    // 字幕轨道
    const subtitleClips: Clip[] = shots
      .filter((shot) => shot.dialogue)
      .map((shot, idx) => {
        const startTime = shots.slice(0, shots.indexOf(shot)).reduce((acc, s) => acc + s.duration * 1000, 0);
        return {
          id: `subtitle-${shot.id}`,
          trackId: 'subtitle-main',
          type: 'subtitle' as MediaType,
          name: shot.dialogue?.slice(0, 10) || '',
          startTime,
          duration: shot.duration * 1000,
          sourcePath: '',
          text: shot.dialogue,
          fontSize: 32,
          fontColor: '#ffffff',
          position: { x: 0, y: 0 },
          scale: 1,
          rotation: 0,
          opacity: 1,
          keyframes: [],
        };
      });

    const subtitleTrack: Track = {
      id: 'subtitle-main',
      name: '字幕轨道',
      type: 'subtitle',
      muted: false,
      locked: false,
      visible: true,
      height: 40,
      clips: subtitleClips,
    };

    const totalDuration = shots.reduce((acc, shot) => acc + shot.duration * 1000, 0);

    return {
      id: 'timeline-main',
      duration: totalDuration || 30000,
      tracks: [videoTrack, audioTrack, subtitleTrack],
      fps: 30,
      resolution: { width: 1920, height: 1080 },
    };
  }, [shots]);

  const [timeline, setTimeline] = useState<TimelineType>(initialTimeline);
  const [currentTime, setCurrentTime] = useState(0);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  // 从 shots 生成素材列表
  const assets = useMemo((): Asset[] => {
    return shots.map((shot) => ({
      id: `asset-${shot.id}`,
      name: shot.scriptContent.slice(0, 20) || `镜头素材`,
      type: 'video' as MediaType,
      path: shot.imageUrl || `https://picsum.photos/seed/${shot.id}/800/450`,
      thumbnailPath: shot.imageUrl || `https://picsum.photos/seed/${shot.id}/160/90`,
      duration: shot.duration * 1000,
      size: 0,
      createdAt: Date.now(),
      refCount: 0,
    }));
  }, [shots]);

  // 获取选中的 Clip
  const selectedClip = useMemo(() => {
    if (!selectedClipId) return null;
    for (const track of timeline.tracks) {
      const clip = track.clips.find((c) => c.id === selectedClipId);
      if (clip) return clip;
    }
    return null;
  }, [selectedClipId, timeline]);

  // 更新 Clip
  const handleClipChange = useCallback((updatedClip: Clip) => {
    setTimeline((prev) => ({
      ...prev,
      tracks: prev.tracks.map((track) => ({
        ...track,
        clips: track.clips.map((c) => (c.id === updatedClip.id ? updatedClip : c)),
      })),
    }));
  }, []);

  // 添加 Clip 到指定轨道
  const handleAddClip = useCallback((trackId: string, clip: Omit<Clip, 'id' | 'trackId'>) => {
    const newClip: Clip = {
      ...clip,
      id: uuid(),
      trackId,
    };
    setTimeline((prev) => ({
      ...prev,
      tracks: prev.tracks.map((track) =>
        track.id === trackId
          ? { ...track, clips: [...track.clips, newClip].sort((a, b) => a.startTime - b.startTime) }
          : track
      ),
    }));
    return newClip.id;
  }, []);

  // 移动 Clip（修改起始时间或移动到其他轨道）
  const handleMoveClip = useCallback((clipId: string, newStartTime: number, newTrackId?: string) => {
    setTimeline((prev) => {
      let movedClip: Clip | null = null;
      // 先找到并移除 clip
      const tracksWithoutClip = prev.tracks.map((track) => {
        const clip = track.clips.find((c) => c.id === clipId);
        if (clip) {
          movedClip = { ...clip, startTime: newStartTime, trackId: newTrackId || clip.trackId };
          return { ...track, clips: track.clips.filter((c) => c.id !== clipId) };
        }
        return track;
      });
      if (!movedClip) return prev;
      // 添加到目标轨道
      const targetTrackId = newTrackId || movedClip.trackId;
      return {
        ...prev,
        tracks: tracksWithoutClip.map((track) =>
          track.id === targetTrackId
            ? { ...track, clips: [...track.clips, movedClip!].sort((a, b) => a.startTime - b.startTime) }
            : track
        ),
      };
    });
  }, []);

  // 删除 Clip
  const handleDeleteClip = useCallback((clipId: string) => {
    setTimeline((prev) => ({
      ...prev,
      tracks: prev.tracks.map((track) => ({
        ...track,
        clips: track.clips.filter((c) => c.id !== clipId),
      })),
    }));
    if (selectedClipId === clipId) {
      setSelectedClipId(null);
    }
  }, [selectedClipId]);

  // 添加关键帧
  const handleAddKeyframe = useCallback((clipId: string, keyframe: Omit<Keyframe, 'id'>) => {
    const newKeyframe: Keyframe = { ...keyframe, id: uuid() };
    setTimeline((prev) => ({
      ...prev,
      tracks: prev.tracks.map((track) => ({
        ...track,
        clips: track.clips.map((c) =>
          c.id === clipId
            ? { ...c, keyframes: [...c.keyframes, newKeyframe].sort((a, b) => a.time - b.time) }
            : c
        ),
      })),
    }));
    return newKeyframe.id;
  }, []);

  // 更新关键帧
  const handleUpdateKeyframe = useCallback((clipId: string, keyframeId: string, updates: Partial<Keyframe>) => {
    setTimeline((prev) => ({
      ...prev,
      tracks: prev.tracks.map((track) => ({
        ...track,
        clips: track.clips.map((c) =>
          c.id === clipId
            ? {
                ...c,
                keyframes: c.keyframes.map((kf) =>
                  kf.id === keyframeId ? { ...kf, ...updates } : kf
                ),
              }
            : c
        ),
      })),
    }));
  }, []);

  // 删除关键帧
  const handleDeleteKeyframe = useCallback((clipId: string, keyframeId: string) => {
    setTimeline((prev) => ({
      ...prev,
      tracks: prev.tracks.map((track) => ({
        ...track,
        clips: track.clips.map((c) =>
          c.id === clipId
            ? { ...c, keyframes: c.keyframes.filter((kf) => kf.id !== keyframeId) }
            : c
        ),
      })),
    }));
  }, []);

  // 插入轨道
  const handleInsertTrack = useCallback((track: Omit<Track, 'id' | 'clips'>, index?: number) => {
    const newTrack: Track = { ...track, id: uuid(), clips: [] };
    setTimeline((prev) => {
      const newTracks = [...prev.tracks];
      if (index !== undefined && index >= 0 && index <= newTracks.length) {
        newTracks.splice(index, 0, newTrack);
      } else {
        newTracks.push(newTrack);
      }
      return { ...prev, tracks: newTracks };
    });
    return newTrack.id;
  }, []);

  // 删除轨道
  const handleDeleteTrack = useCallback((trackId: string) => {
    setTimeline((prev) => ({
      ...prev,
      tracks: prev.tracks.filter((t) => t.id !== trackId),
    }));
  }, []);

  // 更新轨道属性
  const handleUpdateTrack = useCallback((trackId: string, updates: Partial<Track>) => {
    setTimeline((prev) => ({
      ...prev,
      tracks: prev.tracks.map((t) => (t.id === trackId ? { ...t, ...updates } : t)),
    }));
  }, []);

  // 导出入口
  const handleExport = useCallback(() => {
    // TODO: 实现导出逻辑，将 timeline 数据传递给导出模块
    console.log('导出工程:', timeline);
  }, [timeline]);

  // 素材拖拽开始
  const handleAssetDragStart = useCallback((asset: Asset) => {
    // 实际应用中应实现拖拽放入轨道逻辑
    console.log('拖拽素材:', asset.name);
  }, []);

  // 播放时间变化
  const handleTimeChange = useCallback((time: number) => {
    setCurrentTime(time);
  }, []);

  // 播放状态变化
  const handlePlayStateChange = useCallback((playing: boolean) => {
    setIsPlaying(playing);
  }, []);

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
        />
      </div>

      {/* 下半部分：时间线 */}
      <div style={styles.lower}>
        <Timeline
          timeline={timeline}
          currentTime={currentTime}
          selectedClipId={selectedClipId}
          onTimelineChange={setTimeline}
          onTimeChange={handleTimeChange}
          onClipSelect={setSelectedClipId}
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
    height: 280,
    minHeight: 200,
  },
};

export default VideoEditor;

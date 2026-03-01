/**
 * Novel Promotion Workspace 容器
 * 主工作区组件
 */

import React, { useState, useCallback, useEffect } from 'react';
import { StageNavigation } from './components/StageNavigation';
import { EpisodeManager } from './components/EpisodeManager';
import { ConfigStage } from './ConfigStage';
import { ScriptStage } from './ScriptStage';
import { StoryboardStage } from './StoryboardStage';
import { VideoStage } from './VideoStage';
import { AssetLibrary } from './AssetLibrary';
import { useStageNavigation } from './hooks/useStageNavigation';
import { useEpisodeData } from './hooks/useEpisodeData';
import { episodeAPI, characterAPI, locationAPI, workflowAPI } from '../../services/novelPromotionService';
import { taskQueueService } from '../../services/taskQueueService';
import type { Episode, Character, Location, Stage } from './types';
import './NovelPromotionWorkspace.css';

interface NovelPromotionWorkspaceProps {
  projectId: string;
}

export function NovelPromotionWorkspace({ projectId }: NovelPromotionWorkspaceProps) {
  const [currentEpisodeId, setCurrentEpisodeId] = useState<string | null>(null);
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [isAssetLibraryOpen, setIsAssetLibraryOpen] = useState(false);
  const [runningStages, setRunningStages] = useState<Stage[]>([]);
  const [errorStages, setErrorStages] = useState<Stage[]>([]);

  const {
    episode,
    clips,
    storyboards,
    characters,
    locations,
    loading,
    error,
    refetch,
  } = useEpisodeData(projectId, currentEpisodeId);

  // 加载 Episodes 列表
  useEffect(() => {
    const loadEpisodes = async () => {
      try {
        const data = await episodeAPI.list(projectId);
        setEpisodes(data);
      } catch (err) {
        console.error('Failed to load episodes:', err);
      }
    };
    void loadEpisodes();
  }, [projectId]);

  const {
    currentStage,
    stageNavItems,
    handleStageChange,
  } = useStageNavigation({
    episodeData: {
      novelText: episode?.novelText,
      clips,
      storyboards,
    },
    runtimeSignals: {
      runningStages,
      errorStages,
    },
  });

  const markStageRunning = useCallback((stage: Stage) => {
    setRunningStages(prev => prev.includes(stage) ? prev : [...prev, stage]);
    setErrorStages(prev => prev.filter(s => s !== stage));
  }, []);

  const clearStageRunning = useCallback((stage: Stage) => {
    setRunningStages(prev => prev.filter(s => s !== stage));
  }, []);

  const markStageError = useCallback((stage: Stage) => {
    setRunningStages(prev => prev.filter(s => s !== stage));
    setErrorStages(prev => prev.includes(stage) ? prev : [...prev, stage]);
  }, []);

  const clearStageError = useCallback((stage: Stage) => {
    setErrorStages(prev => prev.filter(s => s !== stage));
  }, []);

  const handleEpisodeCreate = useCallback(async (name: string) => {
    try {
      const { id } = await episodeAPI.create(projectId, name);
      const newEpisode: Episode = {
        id,
        projectId,
        name,
        novelText: '',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      setEpisodes(prev => [...prev, newEpisode]);
      setCurrentEpisodeId(id);
    } catch (err) {
      console.error('Failed to create episode:', err);
    }
  }, [projectId]);

  const handleEpisodeRename = useCallback(async (episodeId: string, name: string) => {
    try {
      await episodeAPI.update(episodeId, { name });
      setEpisodes(prev =>
        prev.map(ep => ep.id === episodeId ? { ...ep, name, updatedAt: Date.now() } : ep)
      );
    } catch (err) {
      console.error('Failed to rename episode:', err);
    }
  }, []);

  const handleEpisodeDelete = useCallback(async (episodeId: string) => {
    try {
      await episodeAPI.delete(episodeId);
      setEpisodes(prev => prev.filter(ep => ep.id !== episodeId));
      if (currentEpisodeId === episodeId) {
        setCurrentEpisodeId(episodes[0]?.id || null);
      }
    } catch (err) {
      console.error('Failed to delete episode:', err);
    }
  }, [currentEpisodeId, episodes]);

  const handleEpisodeUpdate = useCallback(async (updates: Partial<Episode>) => {
    if (!episode) return;
    try {
      await episodeAPI.update(episode.id, updates);
      setEpisodes(prev =>
        prev.map(ep => ep.id === episode.id ? { ...ep, ...updates, updatedAt: Date.now() } : ep)
      );
      await refetch();
    } catch (err) {
      console.error('Failed to update episode:', err);
    }
  }, [episode, refetch]);

  const handleGenerateScript = useCallback(async (params: {
    novelText: string;
    theme?: string;
    videoRatio?: string;
  }) => {
    if (!episode) return;

    const stage: Stage = 'script';
    markStageRunning(stage);

    try {
      const { taskId } = await workflowAPI.storyToScript({
        projectId,
        episodeId: episode.id,
        novelText: params.novelText,
        theme: params.theme,
        videoRatio: params.videoRatio,
      });

      await new Promise<void>((resolve, reject) => {
        const unsubscribe = taskQueueService.subscribe(taskId, async (task) => {
          if (task.status === 'completed') {
            unsubscribe();
            await refetch();
            clearStageError(stage);
            clearStageRunning(stage);
            handleStageChange('script');
            resolve();
          } else if (task.status === 'failed') {
            unsubscribe();
            markStageError(stage);
            reject(new Error(task.error || '生成剧本失败'));
          }
        });
      });
    } catch (error) {
      markStageError(stage);
      throw error;
    }
  }, [episode, projectId, handleStageChange, refetch, markStageRunning, clearStageRunning, markStageError, clearStageError]);

  const handleGenerateStoryboard = useCallback(async () => {
    if (!episode || clips.length === 0) {
      throw new Error('请先准备至少一个 Clip');
    }

    const stage: Stage = 'storyboard';
    markStageRunning(stage);

    const firstClip = clips[0];
    const characterDetails = characters
      .filter(char => firstClip.characters.includes(char.name))
      .map(char => ({ name: char.name, description: char.description || '' }));

    try {
      const { taskId } = await workflowAPI.scriptToStoryboard({
        projectId,
        episodeId: episode.id,
        clipId: firstClip.id,
        clipContent: firstClip.content,
        characters: characterDetails,
        location: firstClip.location || '',
      });

      await new Promise<void>((resolve, reject) => {
        const unsubscribe = taskQueueService.subscribe(taskId, async (task) => {
          if (task.status === 'completed') {
            unsubscribe();
            await refetch();
            clearStageError(stage);
            clearStageRunning(stage);
            handleStageChange('storyboard');
            resolve();
          } else if (task.status === 'failed') {
            unsubscribe();
            markStageError(stage);
            reject(new Error(task.error || '生成分镜失败'));
          }
        });
      });
    } catch (error) {
      markStageError(stage);
      throw error;
    }
  }, [episode, clips, characters, projectId, handleStageChange, refetch, markStageRunning, clearStageRunning, markStageError, clearStageError]);

  const handleGenerateVideos = useCallback(async () => {
    if (!episode) return;

    const stage: Stage = 'video';
    clearStageError(stage);

    // P0/P1-1: 暂无后端视频任务，保留手动切换
    handleStageChange('video');
  }, [episode, handleStageChange, clearStageError]);

  const handleGeneratePanelVideo = useCallback(async (panelId: string) => {
    // TODO: 实现单个 Panel 的视频生成
    console.log('Generate video for panel:', panelId);
  }, []);

  // Asset Library 管理
  const handleCharacterCreate = useCallback(async () => {
    try {
      const { id } = await characterAPI.create(projectId, {
        name: '新角色',
        description: '',
        appearance: '',
        personality: '',
      });
      await refetch();
    } catch (err) {
      console.error('Failed to create character:', err);
    }
  }, [projectId, refetch]);

  const handleCharacterUpdate = useCallback(async (characterId: string, updates: Partial<Character>) => {
    try {
      await characterAPI.update(characterId, updates);
      await refetch();
    } catch (err) {
      console.error('Failed to update character:', err);
    }
  }, [refetch]);

  const handleCharacterDelete = useCallback(async (characterId: string) => {
    try {
      await characterAPI.delete(characterId);
      await refetch();
    } catch (err) {
      console.error('Failed to delete character:', err);
    }
  }, [refetch]);

  const handleLocationCreate = useCallback(async () => {
    try {
      const { id } = await locationAPI.create(projectId, {
        name: '新场景',
        description: '',
      });
      await refetch();
    } catch (err) {
      console.error('Failed to create location:', err);
    }
  }, [projectId, refetch]);

  const handleLocationUpdate = useCallback(async (locationId: string, updates: Partial<Location>) => {
    try {
      await locationAPI.update(locationId, updates);
      await refetch();
    } catch (err) {
      console.error('Failed to update location:', err);
    }
  }, [refetch]);

  const handleLocationDelete = useCallback(async (locationId: string) => {
    try {
      await locationAPI.delete(locationId);
      await refetch();
    } catch (err) {
      console.error('Failed to delete location:', err);
    }
  }, [refetch]);

  const handleGenerateAssetImage = useCallback((type: 'character' | 'location', id: string) => {
    // TODO: 实现资源图片生成
    console.log('Generate image for', type, id);
  }, []);

  return (
    <div className="novel-promotion-workspace">
      {/* Asset Library Button */}
      <button
        className="asset-library-trigger"
        onClick={() => setIsAssetLibraryOpen(true)}
      >
        📁 资源库
      </button>

      <EpisodeManager
        projectId={projectId}
        episodes={episodes}
        currentEpisodeId={currentEpisodeId}
        onEpisodeSelect={setCurrentEpisodeId}
        onEpisodeCreate={handleEpisodeCreate}
        onEpisodeRename={handleEpisodeRename}
        onEpisodeDelete={handleEpisodeDelete}
      />

      <StageNavigation
        currentStage={currentStage}
        items={stageNavItems}
        onStageChange={handleStageChange}
      />

      <div className="stage-content" data-testid="workspace-ready">
        {loading && (
          <div className="loading-state">
            <div className="spinner">⟳</div>
            <p>加载中...</p>
          </div>
        )}

        {error && (
          <div className="error-state">
            <p>加载失败: {error}</p>
          </div>
        )}

        {!loading && !error && !currentEpisodeId && (
          <div className="empty-state">
            <p>请先创建一个 Episode</p>
          </div>
        )}

        {!loading && !error && currentEpisodeId && (
          <>
            {currentStage === 'config' && (
              <ConfigStage
                projectId={projectId}
                episode={episode}
                onEpisodeUpdate={handleEpisodeUpdate}
                onGenerateScript={handleGenerateScript}
              />
            )}

            {currentStage === 'script' && (
              <ScriptStage
                projectId={projectId}
                clips={clips}
                characters={characters}
                locations={locations}
                onGenerateStoryboard={handleGenerateStoryboard}
              />
            )}

            {currentStage === 'storyboard' && (
              <StoryboardStage
                projectId={projectId}
                storyboards={storyboards}
                clips={clips}
                onGenerateVideos={handleGenerateVideos}
              />
            )}

            {currentStage === 'video' && (
              <VideoStage
                projectId={projectId}
                storyboards={storyboards}
                onPanelGenerateVideo={handleGeneratePanelVideo}
                onBatchGenerateVideos={handleGenerateVideos}
              />
            )}

            {currentStage === 'editor' && (
              <div className="stage-placeholder">
                <h2>Editor Stage</h2>
                <p>编辑器（即将推出）</p>
              </div>
            )}
          </>
        )}
      </div>

      {/* Asset Library Modal */}
      {isAssetLibraryOpen && (
        <div className="asset-library-modal">
          <div className="modal-overlay" onClick={() => setIsAssetLibraryOpen(false)} />
          <div className="modal-content">
            <div className="modal-header">
              <h2>资源库</h2>
              <button className="close-button" onClick={() => setIsAssetLibraryOpen(false)}>
                ✕
              </button>
            </div>
            <div className="modal-body">
              <AssetLibrary
                projectId={projectId}
                characters={characters}
                locations={locations}
                onCharacterCreate={handleCharacterCreate}
                onCharacterUpdate={handleCharacterUpdate}
                onCharacterDelete={handleCharacterDelete}
                onLocationCreate={handleLocationCreate}
                onLocationUpdate={handleLocationUpdate}
                onLocationDelete={handleLocationDelete}
                onGenerateImage={handleGenerateAssetImage}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

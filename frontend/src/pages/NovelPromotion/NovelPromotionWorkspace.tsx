/**
 * Novel Promotion Workspace 容器
 * 主工作区组件
 */

import React, { useState, useCallback } from 'react';
import { StageNavigation } from './components/StageNavigation';
import { EpisodeManager } from './components/EpisodeManager';
import { ConfigStage } from './ConfigStage';
import { useStageNavigation } from './hooks/useStageNavigation';
import { useEpisodeData } from './hooks/useEpisodeData';
import type { Episode } from './types';
import './NovelPromotionWorkspace.css';

interface NovelPromotionWorkspaceProps {
  projectId: string;
}

export function NovelPromotionWorkspace({ projectId }: NovelPromotionWorkspaceProps) {
  const [currentEpisodeId, setCurrentEpisodeId] = useState<string | null>(null);
  const [episodes, setEpisodes] = useState<Episode[]>([]);

  const {
    episode,
    clips,
    storyboards,
    loading,
    error,
  } = useEpisodeData(projectId, currentEpisodeId);

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
  });

  // Episode 管理
  const handleEpisodeCreate = useCallback(async (name: string) => {
    // TODO: 实现实际的创建逻辑
    const newEpisode: Episode = {
      id: `ep_${Date.now()}`,
      projectId,
      name,
      novelText: '',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    setEpisodes(prev => [...prev, newEpisode]);
    setCurrentEpisodeId(newEpisode.id);
  }, [projectId]);

  const handleEpisodeRename = useCallback(async (episodeId: string, name: string) => {
    // TODO: 实现实际的重命名逻辑
    setEpisodes(prev =>
      prev.map(ep => ep.id === episodeId ? { ...ep, name, updatedAt: Date.now() } : ep)
    );
  }, []);

  const handleEpisodeDelete = useCallback(async (episodeId: string) => {
    // TODO: 实现实际的删除逻辑
    setEpisodes(prev => prev.filter(ep => ep.id !== episodeId));
    if (currentEpisodeId === episodeId) {
      setCurrentEpisodeId(episodes[0]?.id || null);
    }
  }, [currentEpisodeId, episodes]);

  const handleEpisodeUpdate = useCallback(async (updates: Partial<Episode>) => {
    if (!episode) return;
    // TODO: 实现实际的更新逻辑
    setEpisodes(prev =>
      prev.map(ep => ep.id === episode.id ? { ...ep, ...updates, updatedAt: Date.now() } : ep)
    );
  }, [episode]);

  const handleGenerateScript = useCallback(async (params: {
    novelText: string;
    theme?: string;
    videoRatio?: string;
  }) => {
    if (!episode) return;

    // TODO: 实现实际的 Story-to-Script 工作流调用
    console.log('Generate script:', params);

    // 模拟异步操作
    await new Promise(resolve => setTimeout(resolve, 2000));

    // 切换到 Script Stage
    handleStageChange('script');
  }, [episode, handleStageChange]);

  return (
    <div className="novel-promotion-workspace">
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

      <div className="stage-content">
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
              <div className="stage-placeholder">
                <h2>Script Stage</h2>
                <p>Clip 编辑器（待实现）</p>
              </div>
            )}

            {currentStage === 'storyboard' && (
              <div className="stage-placeholder">
                <h2>Storyboard Stage</h2>
                <p>Panel 编辑器（待实现）</p>
              </div>
            )}

            {currentStage === 'video' && (
              <div className="stage-placeholder">
                <h2>Video Stage</h2>
                <p>视频生成界面（待实现）</p>
              </div>
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
    </div>
  );
}

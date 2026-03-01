/**
 * Storyboard Stage 组件
 * 分镜编辑器 - 展示和编辑 Panels
 */

import React, { useState, useCallback } from 'react';
import { StoryboardGroup } from './StoryboardGroup';
import type { Storyboard, Clip, Panel } from '../types';
import './StoryboardStage.css';

interface StoryboardStageProps {
  projectId: string;
  storyboards: Storyboard[];
  clips: Clip[];
  onPanelUpdate?: (panelId: string, updates: Partial<Panel>) => Promise<void>;
  onPanelGenerateImage?: (panelId: string) => Promise<void>;
  onGenerateVideos?: () => Promise<void>;
}

export function StoryboardStage({
  projectId,
  storyboards,
  clips,
  onPanelUpdate,
  onPanelGenerateImage,
  onGenerateVideos,
}: StoryboardStageProps) {
  const [isGenerating, setIsGenerating] = useState(false);

  const handlePanelEdit = useCallback((panel: Panel) => {
    // TODO: 打开 Panel 编辑弹窗
    console.log('[StoryboardStage] Edit panel:', panel);
  }, []);

  const handlePanelGenerateImage = useCallback(async (panel: Panel) => {
    try {
      await onPanelGenerateImage?.(panel.id);
    } catch (error) {
      console.error('[StoryboardStage] Generate image failed:', error);
      alert('生成图片失败');
    }
  }, [onPanelGenerateImage]);

  const handlePanelSelectImage = useCallback((panel: Panel) => {
    // TODO: 打开图片选择弹窗
    console.log('[StoryboardStage] Select image:', panel);
  }, []);

  const handleGenerateVideos = async () => {
    if (storyboards.length === 0) {
      alert('请先生成分镜');
      return;
    }

    // 检查是否所有 Panel 都有图片
    const panelsWithoutImage = storyboards.flatMap(sb =>
      sb.panels.filter(p => !p.imageUrl)
    );

    if (panelsWithoutImage.length > 0) {
      const confirm = window.confirm(
        `还有 ${panelsWithoutImage.length} 个分镜没有图片，是否继续生成视频？`
      );
      if (!confirm) return;
    }

    setIsGenerating(true);
    try {
      await onGenerateVideos?.();
    } catch (error) {
      console.error('[StoryboardStage] Generate videos failed:', error);
      alert('生成视频失败');
    } finally {
      setIsGenerating(false);
    }
  };

  // 统计信息
  const totalPanels = storyboards.reduce((sum, sb) => sum + sb.panels.length, 0);
  const panelsWithImage = storyboards.reduce(
    (sum, sb) => sum + sb.panels.filter(p => p.imageUrl).length,
    0
  );

  return (
    <div className="storyboard-stage">
      <div className="storyboard-header">
        <div className="header-info">
          <h2>分镜编辑</h2>
          <p className="header-subtitle">
            编辑分镜描述，生成分镜图片
          </p>
        </div>

        <div className="header-stats">
          <div className="stat-item">
            <span className="stat-label">总分镜:</span>
            <span className="stat-value">{totalPanels}</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">已生成图片:</span>
            <span className="stat-value">
              {panelsWithImage} / {totalPanels}
            </span>
          </div>
        </div>

        <button
          className="btn-generate-videos"
          onClick={handleGenerateVideos}
          disabled={storyboards.length === 0 || isGenerating}
        >
          {isGenerating ? (
            <>
              <span className="spinner">⟳</span>
              生成中...
            </>
          ) : (
            <>
              <span className="icon">🎬</span>
              生成视频
            </>
          )}
        </button>
      </div>

      <div className="storyboard-content">
        {storyboards.length === 0 ? (
          <div className="storyboard-empty">
            <div className="empty-icon">📋</div>
            <p>暂无分镜</p>
            <span className="empty-hint">请先在 Script Stage 生成分镜</span>
          </div>
        ) : (
          <div className="storyboard-list">
            {storyboards.map((storyboard) => {
              const clip = clips.find(c => c.id === storyboard.clipId);
              if (!clip) return null;

              return (
                <StoryboardGroup
                  key={storyboard.id}
                  storyboard={storyboard}
                  clip={clip}
                  onPanelEdit={handlePanelEdit}
                  onPanelGenerateImage={handlePanelGenerateImage}
                  onPanelSelectImage={handlePanelSelectImage}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

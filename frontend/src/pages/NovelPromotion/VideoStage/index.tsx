/**
 * Video Stage 组件
 * 视频生成界面 - Timeline + 视频卡片列表
 */

import React, { useState, useCallback } from 'react';
import { VideoTimeline } from './VideoTimeline';
import { VideoPanelCard } from './VideoPanelCard';
import type { Storyboard, Panel } from '../types';
import './VideoStage.css';

interface VideoStageProps {
  projectId: string;
  storyboards: Storyboard[];
  onPanelGenerateVideo?: (panelId: string) => Promise<void>;
  onPanelEditPrompt?: (panelId: string) => void;
  onBatchGenerateVideos?: () => Promise<void>;
}

export function VideoStage({
  projectId,
  storyboards,
  onPanelGenerateVideo,
  onPanelEditPrompt,
  onBatchGenerateVideos,
}: VideoStageProps) {
  const [currentPanelId, setCurrentPanelId] = useState<string | null>(null);
  const [isBatchGenerating, setIsBatchGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 获取所有 Panels
  const allPanels = storyboards.flatMap(sb => sb.panels);

  // 统计信息
  const totalPanels = allPanels.length;
  const completedVideos = allPanels.filter(p => p.videoStatus === 'completed').length;
  const processingVideos = allPanels.filter(p => p.videoStatus === 'processing').length;

  const handlePanelGenerateVideo = useCallback(async (panel: Panel) => {
    try {
      setError(null);
      await onPanelGenerateVideo?.(panel.id);
    } catch (error) {
      console.error('[VideoStage] Generate video failed:', error);
      setError(error instanceof Error ? error.message : '生成视频失败');
    }
  }, [onPanelGenerateVideo]);

  const handlePanelEditPrompt = useCallback((panel: Panel) => {
    onPanelEditPrompt?.(panel.id);
  }, [onPanelEditPrompt]);

  const handleBatchGenerate = async () => {
    if (allPanels.length === 0) {
      setError('没有可生成的分镜');
      return;
    }

    // 检查是否所有 Panel 都有图片
    const panelsWithoutImage = allPanels.filter(p => !p.imageUrl);
    if (panelsWithoutImage.length > 0) {
      setError(`还有 ${panelsWithoutImage.length} 个分镜没有图片，请先生成图片`);
      return;
    }

    // 检查未完成的视频
    const pendingPanels = allPanels.filter(
      p => !p.videoStatus || p.videoStatus === 'pending' || p.videoStatus === 'failed'
    );

    if (pendingPanels.length === 0) {
      setError('所有视频已生成完成');
      return;
    }

    setIsBatchGenerating(true);
    setError(null);
    try {
      await onBatchGenerateVideos?.();
    } catch (error) {
      console.error('[VideoStage] Batch generate failed:', error);
      setError(error instanceof Error ? error.message : '批量生成失败');
    } finally {
      setIsBatchGenerating(false);
    }
  };

  return (
    <div className="video-stage">
      <div className="video-header">
        <div className="header-info">
          <h2>视频生成</h2>
          <p className="header-subtitle">
            为每个分镜生成视频
          </p>
          {error && (
            <div className="error-message" data-testid="error-banner-video">
              {error}
            </div>
          )}
        </div>

        <div className="header-stats">
          <div className="stat-item">
            <span className="stat-label">总分镜:</span>
            <span className="stat-value">{totalPanels}</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">已完成:</span>
            <span className="stat-value">
              {completedVideos} / {totalPanels}
            </span>
          </div>
          {processingVideos > 0 && (
            <div className="stat-item">
              <span className="stat-label">生成中:</span>
              <span className="stat-value processing">{processingVideos}</span>
            </div>
          )}
        </div>

        <button
          className="btn-batch-generate"
          onClick={handleBatchGenerate}
          disabled={allPanels.length === 0 || isBatchGenerating}
          data-testid="action-batch-generate-videos"
          data-task-status={isBatchGenerating ? 'processing' : 'idle'}
        >
          {isBatchGenerating ? (
            <>
              <span className="spinner">⟳</span>
              批量生成中...
            </>
          ) : (
            <>
              <span className="icon">🎬</span>
              批量生成全部视频
            </>
          )}
        </button>
      </div>

      {allPanels.length === 0 ? (
        <div className="video-empty">
          <div className="empty-icon">🎬</div>
          <p>暂无分镜</p>
          <span className="empty-hint">请先在 Storyboard Stage 生成分镜</span>
        </div>
      ) : (
        <>
          <VideoTimeline
            panels={allPanels}
            currentPanelId={currentPanelId}
            onPanelSelect={setCurrentPanelId}
          />

          <div className="video-content">
            <div className="video-panels-grid">
              {allPanels.map((panel, index) => (
                <VideoPanelCard
                  key={panel.id}
                  panel={panel}
                  index={index}
                  onGenerateVideo={() => handlePanelGenerateVideo(panel)}
                  onEditPrompt={() => handlePanelEditPrompt(panel)}
                />
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

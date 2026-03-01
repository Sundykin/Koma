/**
 * Video Panel Card 组件
 * 视频生成卡片 - 显示 Panel 图片和视频生成状态
 */

import React, { useState } from 'react';
import type { Panel } from '../types';
import './VideoPanelCard.css';

interface VideoPanelCardProps {
  panel: Panel;
  index: number;
  onGenerateVideo?: () => void;
  onEditPrompt?: () => void;
}

export function VideoPanelCard({
  panel,
  index,
  onGenerateVideo,
  onEditPrompt,
}: VideoPanelCardProps) {
  const [isPlaying, setIsPlaying] = useState(false);

  const hasVideo = panel.videoStatus === 'completed' && panel.videoUrl;
  const isGenerating = panel.videoStatus === 'processing';
  const hasFailed = panel.videoStatus === 'failed';

  return (
    <div className="video-panel-card" data-testid={`video-panel-${panel.id}`} data-video-status={panel.videoStatus || 'pending'}>
      <div className="video-panel-header">
        <span className="panel-number">Panel {panel.panelNumber}</span>
        <span className={`status-badge ${panel.videoStatus || 'pending'}`}>
          {panel.videoStatus === 'completed' && '✓ 已完成'}
          {panel.videoStatus === 'processing' && '⟳ 生成中'}
          {panel.videoStatus === 'failed' && '✗ 失败'}
          {!panel.videoStatus && '待生成'}
        </span>
      </div>

      <div className="video-panel-content">
        <div className="video-preview-section">
          {hasVideo ? (
            <div className="video-player">
              <video
                src={panel.videoUrl}
                controls
                loop
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
              />
              {!isPlaying && (
                <div className="play-overlay">
                  <span className="play-icon">▶</span>
                </div>
              )}
            </div>
          ) : (
            <div className="image-preview">
              {panel.imageUrl ? (
                <img src={panel.imageUrl} alt={`Panel ${panel.panelNumber}`} />
              ) : (
                <div className="no-image-placeholder">
                  <span className="placeholder-icon">🖼️</span>
                  <span className="placeholder-text">无图片</span>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="video-info">
          <div className="panel-description">{panel.description}</div>

          {panel.location && (
            <div className="info-item">
              <span className="info-icon">📍</span>
              <span className="info-text">{panel.location}</span>
            </div>
          )}

          {panel.characters.length > 0 && (
            <div className="info-item">
              <span className="info-icon">👤</span>
              <span className="info-text">{panel.characters.join(', ')}</span>
            </div>
          )}
        </div>
      </div>

      <div className="video-panel-actions">
        {!hasVideo && !isGenerating && (
          <>
            <button
              className="btn-generate-video"
              onClick={onGenerateVideo}
              disabled={!panel.imageUrl}
              data-testid={`action-generate-video-${panel.id}`}
              data-task-status={isGenerating ? 'processing' : hasFailed ? 'failed' : hasVideo ? 'completed' : 'idle'}
            >
              <span className="icon">🎬</span>
              生成视频
            </button>
            <button
              className="btn-edit-prompt"
              onClick={onEditPrompt}
            >
              编辑 Prompt
            </button>
          </>
        )}

        {isGenerating && (
          <div className="generating-status">
            <span className="spinner">⟳</span>
            <span>正在生成视频...</span>
          </div>
        )}

        {hasFailed && (
          <button
            className="btn-retry"
            onClick={onGenerateVideo}
            data-testid={`retry-video-${panel.id}`}
          >
            <span className="icon">🔄</span>
            重试
          </button>
        )}
      </div>
    </div>
  );
}

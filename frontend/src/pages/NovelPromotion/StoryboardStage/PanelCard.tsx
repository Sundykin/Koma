/**
 * Panel Card 组件
 * 分镜卡片 - 显示单个 Panel 的信息
 */

import React from 'react';
import type { Panel } from '../types';
import './PanelCard.css';

interface PanelCardProps {
  panel: Panel;
  onEdit?: () => void;
  onGenerateImage?: () => void;
  onSelectImage?: () => void;
}

export function PanelCard({
  panel,
  onEdit,
  onGenerateImage,
  onSelectImage,
}: PanelCardProps) {
  const hasImage = !!panel.imageUrl;
  const hasCandidates = panel.imageCandidates && panel.imageCandidates.length > 0;

  return (
    <div className="panel-card">
      <div className="panel-header">
        <span className="panel-number">Panel {panel.panelNumber}</span>
        <button className="btn-edit" onClick={onEdit}>
          编辑
        </button>
      </div>

      <div className="panel-image-section">
        {hasImage ? (
          <div className="panel-image">
            <img src={panel.imageUrl} alt={`Panel ${panel.panelNumber}`} />
            {hasCandidates && (
              <button className="btn-image-overlay" onClick={onSelectImage}>
                切换图片 ({panel.imageCandidates!.length})
              </button>
            )}
          </div>
        ) : (
          <div className="panel-image-placeholder">
            <span className="placeholder-icon">🖼️</span>
            <span className="placeholder-text">无图片</span>
          </div>
        )}
      </div>

      <div className="panel-content">
        <div className="panel-description">{panel.description}</div>

        <div className="panel-meta">
          {panel.location && (
            <div className="meta-item">
              <span className="meta-icon">📍</span>
              <span className="meta-text">{panel.location}</span>
            </div>
          )}
          {panel.characters.length > 0 && (
            <div className="meta-item">
              <span className="meta-icon">👤</span>
              <span className="meta-text">{panel.characters.join(', ')}</span>
            </div>
          )}
        </div>

        {panel.photographyPlan && (
          <div className="panel-photography">
            <div className="photography-title">摄影规则</div>
            <div className="photography-items">
              {panel.photographyPlan.composition && (
                <div className="photography-item">
                  <span className="item-label">构图:</span>
                  <span className="item-value">{panel.photographyPlan.composition}</span>
                </div>
              )}
              {panel.photographyPlan.lighting && (
                <div className="photography-item">
                  <span className="item-label">光线:</span>
                  <span className="item-value">{panel.photographyPlan.lighting}</span>
                </div>
              )}
              {panel.photographyPlan.atmosphere && (
                <div className="photography-item">
                  <span className="item-label">氛围:</span>
                  <span className="item-value">{panel.photographyPlan.atmosphere}</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="panel-actions">
        {!hasImage && (
          <button className="btn-generate-image" onClick={onGenerateImage}>
            <span className="icon">🎨</span>
            生成图片
          </button>
        )}
      </div>
    </div>
  );
}

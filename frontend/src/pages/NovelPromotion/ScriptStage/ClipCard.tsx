/**
 * Clip Card 组件
 * 显示单个 Clip 的信息卡片
 */

import React from 'react';
import type { Clip } from '../types';
import './ClipCard.css';

interface ClipCardProps {
  clip: Clip;
  index: number;
  isSelected?: boolean;
  onSelect?: () => void;
  onEdit?: () => void;
}

export function ClipCard({
  clip,
  index,
  isSelected = false,
  onSelect,
  onEdit,
}: ClipCardProps) {
  return (
    <div
      className={`clip-card ${isSelected ? 'selected' : ''}`}
      onClick={onSelect}
    >
      <div className="clip-header">
        <span className="clip-number">#{index + 1}</span>
        <button
          className="clip-edit-btn"
          onClick={(e) => {
            e.stopPropagation();
            onEdit?.();
          }}
        >
          编辑
        </button>
      </div>

      <div className="clip-summary">{clip.summary || '无摘要'}</div>

      <div className="clip-meta">
        {clip.characters.length > 0 && (
          <div className="clip-meta-item">
            <span className="meta-label">角色:</span>
            <span className="meta-value">{clip.characters.join(', ')}</span>
          </div>
        )}
        {clip.location && (
          <div className="clip-meta-item">
            <span className="meta-label">场景:</span>
            <span className="meta-value">{clip.location}</span>
          </div>
        )}
      </div>

      {clip.content && (
        <div className="clip-content-preview">
          {clip.content.substring(0, 100)}
          {clip.content.length > 100 && '...'}
        </div>
      )}
    </div>
  );
}

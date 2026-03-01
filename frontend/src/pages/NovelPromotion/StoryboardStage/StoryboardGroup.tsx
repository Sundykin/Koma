/**
 * Storyboard Group 组件
 * 按 Clip 分组展示 Panels
 */

import React from 'react';
import { PanelCard } from './PanelCard';
import type { Storyboard, Clip, Panel } from '../types';
import './StoryboardGroup.css';

interface StoryboardGroupProps {
  storyboard: Storyboard;
  clip: Clip;
  onPanelEdit?: (panel: Panel) => void;
  onPanelGenerateImage?: (panel: Panel) => void;
  onPanelSelectImage?: (panel: Panel) => void;
}

export function StoryboardGroup({
  storyboard,
  clip,
  onPanelEdit,
  onPanelGenerateImage,
  onPanelSelectImage,
}: StoryboardGroupProps) {
  return (
    <div className="storyboard-group">
      <div className="group-header">
        <div className="group-title">
          <h3>Clip: {clip.summary}</h3>
          <span className="panel-count">{storyboard.panels.length} 个分镜</span>
        </div>
        {clip.location && (
          <div className="group-meta">
            <span className="meta-icon">📍</span>
            <span>{clip.location}</span>
          </div>
        )}
      </div>

      <div className="panels-grid">
        {storyboard.panels.map((panel) => (
          <PanelCard
            key={panel.id}
            panel={panel}
            onEdit={() => onPanelEdit?.(panel)}
            onGenerateImage={() => onPanelGenerateImage?.(panel)}
            onSelectImage={() => onPanelSelectImage?.(panel)}
          />
        ))}
      </div>
    </div>
  );
}

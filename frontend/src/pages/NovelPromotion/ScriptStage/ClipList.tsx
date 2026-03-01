/**
 * Clip List 组件
 * Clip 列表展示
 */

import React from 'react';
import { ClipCard } from './ClipCard';
import type { Clip } from '../types';
import './ClipList.css';

interface ClipListProps {
  clips: Clip[];
  selectedClipId?: string | null;
  onClipSelect?: (clipId: string) => void;
  onClipEdit?: (clip: Clip) => void;
}

export function ClipList({
  clips,
  selectedClipId,
  onClipSelect,
  onClipEdit,
}: ClipListProps) {
  if (clips.length === 0) {
    return (
      <div className="clip-list-empty">
        <div className="empty-icon">📝</div>
        <p>暂无 Clip</p>
        <span className="empty-hint">请先在 Config Stage 生成剧本</span>
      </div>
    );
  }

  return (
    <div className="clip-list">
      <div className="clip-list-header">
        <h3>Clip 列表</h3>
        <span className="clip-count">{clips.length} 个片段</span>
      </div>

      <div className="clip-list-content">
        {clips.map((clip, index) => (
          <ClipCard
            key={clip.id}
            clip={clip}
            index={index}
            isSelected={clip.id === selectedClipId}
            onSelect={() => onClipSelect?.(clip.id)}
            onEdit={() => onClipEdit?.(clip)}
          />
        ))}
      </div>
    </div>
  );
}

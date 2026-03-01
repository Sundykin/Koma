/**
 * Video Timeline 组件
 * 视频时间轴 - 显示所有 Panel 的缩略图
 */

import React from 'react';
import type { Panel } from '../types';
import './VideoTimeline.css';

interface VideoTimelineProps {
  panels: Panel[];
  currentPanelId?: string | null;
  onPanelSelect?: (panelId: string) => void;
}

export function VideoTimeline({
  panels,
  currentPanelId,
  onPanelSelect,
}: VideoTimelineProps) {
  return (
    <div className="video-timeline">
      <div className="timeline-header">
        <h3>时间轴</h3>
        <span className="timeline-count">{panels.length} 个分镜</span>
      </div>

      <div className="timeline-track">
        {panels.map((panel, index) => (
          <div
            key={panel.id}
            className={`timeline-item ${panel.id === currentPanelId ? 'active' : ''} ${panel.videoStatus || 'pending'}`}
            onClick={() => onPanelSelect?.(panel.id)}
            title={`Panel ${panel.panelNumber}`}
          >
            <div className="timeline-thumbnail">
              {panel.videoUrl ? (
                <video src={panel.videoUrl} />
              ) : panel.imageUrl ? (
                <img src={panel.imageUrl} alt={`Panel ${panel.panelNumber}`} />
              ) : (
                <div className="timeline-placeholder">
                  <span>{panel.panelNumber}</span>
                </div>
              )}
            </div>

            <div className="timeline-status">
              {panel.videoStatus === 'completed' && <span className="status-icon">✓</span>}
              {panel.videoStatus === 'processing' && <span className="status-icon spinning">⟳</span>}
              {panel.videoStatus === 'failed' && <span className="status-icon">✗</span>}
            </div>

            <div className="timeline-number">P{panel.panelNumber}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

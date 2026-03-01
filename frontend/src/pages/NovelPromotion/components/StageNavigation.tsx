/**
 * Stage Navigation 组件
 * 阶段导航胶囊按钮
 */

import React from 'react';
import type { Stage, StageNavItem } from '../types';
import './StageNavigation.css';

interface StageNavigationProps {
  currentStage: Stage;
  items: StageNavItem[];
  onStageChange: (stage: Stage) => void;
}

export function StageNavigation({
  currentStage,
  items,
  onStageChange,
}: StageNavigationProps) {
  return (
    <div className="stage-navigation">
      {items.map((item) => (
        <button
          key={item.id}
          className={`stage-nav-button ${currentStage === item.id ? 'active' : ''} ${item.status}`}
          onClick={() => !item.disabled && onStageChange(item.id)}
          disabled={item.disabled}
          title={item.disabledLabel || item.label}
        >
          <span className="stage-icon">{item.icon}</span>
          <span className="stage-label">{item.label}</span>
          {item.status === 'processing' && (
            <span className="stage-spinner">⟳</span>
          )}
        </button>
      ))}
    </div>
  );
}

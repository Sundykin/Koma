/**
 * StoryboardStudio - 分镜工作室壳层
 * 提供导航区、舞台区和检视器的稳定布局。
 */
import React from 'react';

interface StoryboardStudioProps {
  navigator?: React.ReactNode;
  stage?: React.ReactNode;
  inspector?: React.ReactNode;
  children?: React.ReactNode;
}

export const StoryboardStudio: React.FC<StoryboardStudioProps> = ({
  navigator,
  stage,
  inspector,
  children,
}) => {
  if (navigator || stage || inspector) {
    return (
      <div
        className="storyboardStudio"
        style={{
          display: 'grid',
          gridTemplateColumns: 'clamp(240px, 22vw, 320px) minmax(0, 1fr) clamp(360px, 28vw, 460px)',
          width: '100%',
          height: '100%',
          background: '#09090b',
          overflow: 'hidden',
        }}
      >
        <div style={{ minWidth: 0, minHeight: 0 }}>
          {navigator}
        </div>
        <div style={{ minWidth: 0, minHeight: 0 }}>
          {stage}
        </div>
        <div style={{ minWidth: 0, minHeight: 0 }}>
          {inspector}
        </div>
      </div>
    );
  }

  return (
    <div
      className="storyboardStudio"
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        background: '#09090b',
        overflow: 'hidden',
      }}
    >
      <div
        className="timelineArea"
        style={{
          flex: 1,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {children}
      </div>
    </div>
  );
};

export default StoryboardStudio;

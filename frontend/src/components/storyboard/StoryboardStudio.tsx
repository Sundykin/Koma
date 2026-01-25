/**
 * StoryboardStudio - 分镜工作室
 * 简化版：移除舞台区域，仅作为容器
 */
import React from 'react';

interface StoryboardStudioProps {
  children: React.ReactNode;
}

export const StoryboardStudio: React.FC<StoryboardStudioProps> = ({
  children,
}) => {
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
      {/* 分镜列表区域 - 占满全部空间 */}
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

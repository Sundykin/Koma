/**
 * 5阶段胶囊导航
 * 显示当前阶段和各阶段状态（empty/active/processing/ready）
 */
import React from 'react';
import { Tooltip } from 'antd';
import {
  BookOpen,
  FileText,
  Clapperboard,
  Film,
  Scissors,
} from 'lucide-react';

export type WorkspaceStage = 'story' | 'script' | 'storyboard' | 'video' | 'edit';
export type StageStatus = 'empty' | 'active' | 'processing' | 'ready';

interface StageItem {
  id: WorkspaceStage;
  label: string;
  icon: React.ReactNode;
  description: string;
}

const STAGES: StageItem[] = [
  { id: 'story', label: '故事', icon: <BookOpen size={16} />, description: '输入故事文本，AI智能分集' },
  { id: 'script', label: '剧本', icon: <FileText size={16} />, description: '编辑剧本，管理角色/场景资产' },
  { id: 'storyboard', label: '分镜', icon: <Clapperboard size={16} />, description: '生成分镜，AI绘制画面' },
  { id: 'video', label: '视频', icon: <Film size={16} />, description: '生成视频片段' },
  { id: 'edit', label: '剪辑', icon: <Scissors size={16} />, description: '时间线剪辑，导出成片' },
];

interface StageNavigationProps {
  currentStage: WorkspaceStage;
  statuses: Record<WorkspaceStage, StageStatus>;
  onStageChange: (stage: WorkspaceStage) => void;
}

const statusColors: Record<StageStatus, string> = {
  empty: 'bg-zinc-600',
  active: 'bg-amber-500',
  processing: 'bg-blue-500 animate-pulse',
  ready: 'bg-emerald-500',
};

export const StageNavigation: React.FC<StageNavigationProps> = ({
  currentStage,
  statuses,
  onStageChange,
}) => {
  return (
    <div className="flex items-center justify-center py-2 px-4 bg-zinc-900/80 backdrop-blur-xl border-b border-zinc-800/60">
      <div className="flex items-center gap-1 bg-zinc-800/60 rounded-full px-2 py-1">
        {STAGES.map((stage, index) => {
          const isActive = currentStage === stage.id;
          const status = statuses[stage.id];

          return (
            <React.Fragment key={stage.id}>
              {index > 0 && (
                <div className="w-6 h-px bg-zinc-700 mx-0.5" />
              )}
              <Tooltip title={stage.description} placement="bottom">
                <button
                  onClick={() => onStageChange(stage.id)}
                  className={`
                    flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium
                    transition-all duration-200 cursor-pointer
                    ${isActive
                      ? 'bg-emerald-600/20 text-emerald-400 ring-1 ring-emerald-500/30'
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700/50'
                    }
                  `}
                >
                  {stage.icon}
                  <span>{stage.label}</span>
                  {/* 状态指示点 */}
                  <span className={`w-1.5 h-1.5 rounded-full ${statusColors[status]}`} />
                </button>
              </Tooltip>
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};

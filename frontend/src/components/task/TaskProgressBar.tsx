import React from 'react';
import { Progress } from 'antd';
import type { TaskStatus } from '../../services/taskQueueService';

interface TaskProgressBarProps {
  status: TaskStatus;
  progress: number;
  phase?: string | null;
  showLabel?: boolean;
  size?: 'small' | 'default';
}

const phaseColors: Record<string, string> = {
  prepare: '#3b82f6',   // 蓝色
  execute: '#8b5cf6',   // 紫色
  persist: '#10b981',   // 绿色
};

const statusColors: Record<TaskStatus, string> = {
  queued: '#6b7280',
  processing: '#3b82f6',
  completed: '#10b981',
  failed: '#ef4444',
};

export function TaskProgressBar({
  status,
  progress,
  phase,
  showLabel = true,
  size = 'default',
}: TaskProgressBarProps) {
  const getColor = () => {
    if (status === 'failed') return statusColors.failed;
    if (status === 'completed') return statusColors.completed;
    if (phase && phaseColors[phase]) return phaseColors[phase];
    return statusColors[status];
  };

  const getLabel = () => {
    if (status === 'queued') return '排队中';
    if (status === 'failed') return '失败';
    if (status === 'completed') return '完成';
    if (phase === 'prepare') return '准备中';
    if (phase === 'execute') return '执行中';
    if (phase === 'persist') return '保存中';
    return '处理中';
  };

  return (
    <div className="w-full">
      <Progress
        percent={progress}
        status={status === 'failed' ? 'exception' : status === 'completed' ? 'success' : 'active'}
        strokeColor={getColor()}
        size={size}
        format={() => (showLabel ? getLabel() : `${progress}%`)}
      />
    </div>
  );
}

import React from 'react';
import { Tag, Space, Tooltip } from 'antd';
import {
  ClockCircleOutlined,
  LoadingOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
} from '@ant-design/icons';
import type { TaskStatus } from '../../services/taskQueueService';

interface TaskStatusInlineProps {
  status: TaskStatus;
  progress?: number;
  phase?: string | null;
  error?: string | null;
  showProgress?: boolean;
}

const statusConfig: Record<
  TaskStatus,
  { color: string; icon: React.ReactNode; label: string }
> = {
  queued: {
    color: 'default',
    icon: <ClockCircleOutlined />,
    label: '排队中',
  },
  processing: {
    color: 'processing',
    icon: <LoadingOutlined />,
    label: '处理中',
  },
  completed: {
    color: 'success',
    icon: <CheckCircleOutlined />,
    label: '已完成',
  },
  failed: {
    color: 'error',
    icon: <CloseCircleOutlined />,
    label: '失败',
  },
};

const phaseLabels: Record<string, string> = {
  prepare: '准备',
  execute: '执行',
  persist: '保存',
};

export function TaskStatusInline({
  status,
  progress = 0,
  phase,
  error,
  showProgress = true,
}: TaskStatusInlineProps) {
  const config = statusConfig[status];

  const getLabel = () => {
    if (status === 'processing' && phase && phaseLabels[phase]) {
      return `${phaseLabels[phase]}中`;
    }
    return config.label;
  };

  const content = (
    <Space size="small">
      <Tag color={config.color} icon={config.icon}>
        {getLabel()}
      </Tag>
      {showProgress && status === 'processing' && progress > 0 && (
        <span className="text-xs text-gray-500">{progress}%</span>
      )}
    </Space>
  );

  if (error && status === 'failed') {
    return (
      <Tooltip title={error} placement="top">
        {content}
      </Tooltip>
    );
  }

  return content;
}

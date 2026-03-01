import React from 'react';
import { Steps } from 'antd';
import { LoadingOutlined, CheckOutlined, CloseOutlined } from '@ant-design/icons';
import type { TaskStatus } from '../../services/taskQueueService';

interface TaskPhaseIndicatorProps {
  status: TaskStatus;
  phase: string | null;
  size?: 'small' | 'default';
}

const phases = [
  { key: 'prepare', title: '准备' },
  { key: 'execute', title: '执行' },
  { key: 'persist', title: '保存' },
];

export function TaskPhaseIndicator({ status, phase, size = 'default' }: TaskPhaseIndicatorProps) {
  const getCurrentStep = () => {
    if (status === 'completed') return 3;
    if (status === 'failed') return phases.findIndex((p) => p.key === phase);
    if (!phase) return 0;
    return phases.findIndex((p) => p.key === phase);
  };

  const getStepStatus = (index: number) => {
    const current = getCurrentStep();
    if (status === 'failed' && index === current) return 'error';
    if (index < current) return 'finish';
    if (index === current) return 'process';
    return 'wait';
  };

  return (
    <Steps
      current={getCurrentStep()}
      size={size}
      items={phases.map((p, index) => ({
        title: p.title,
        status: getStepStatus(index),
        icon:
          status === 'failed' && index === getCurrentStep() ? (
            <CloseOutlined />
          ) : index < getCurrentStep() ? (
            <CheckOutlined />
          ) : index === getCurrentStep() && status === 'processing' ? (
            <LoadingOutlined />
          ) : undefined,
      }))}
    />
  );
}

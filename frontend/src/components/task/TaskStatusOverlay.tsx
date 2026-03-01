import React from 'react';
import { Spin, Alert } from 'antd';
import { LoadingOutlined, CheckCircleOutlined, CloseCircleOutlined } from '@ant-design/icons';
import type { TaskStatus } from '../../services/taskQueueService';

interface TaskStatusOverlayProps {
  status: TaskStatus | null;
  progress?: number;
  phase?: string | null;
  error?: string | null;
  className?: string;
}

const phaseLabels: Record<string, string> = {
  prepare: '准备阶段',
  execute: '执行阶段',
  persist: '保存阶段',
};

export function TaskStatusOverlay({
  status,
  progress = 0,
  phase,
  error,
  className = '',
}: TaskStatusOverlayProps) {
  if (!status || status === 'completed') return null;

  const isProcessing = status === 'processing';
  const isFailed = status === 'failed';
  const isQueued = status === 'queued';

  return (
    <div
      className={`absolute inset-0 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm z-10 ${className}`}
    >
      <div className="flex flex-col items-center gap-3 p-6 bg-white/10 rounded-lg">
        {isFailed ? (
          <>
            <CloseCircleOutlined className="text-4xl text-red-500" />
            <span className="text-sm text-white">生成失败</span>
            {error && (
              <div className="max-w-xs">
                <Alert
                  message="错误信息"
                  description={error}
                  type="error"
                  showIcon
                  className="text-xs"
                />
              </div>
            )}
          </>
        ) : isQueued ? (
          <>
            <Spin indicator={<LoadingOutlined className="text-4xl text-blue-400" spin />} />
            <span className="text-sm text-white">排队中...</span>
          </>
        ) : isProcessing ? (
          <>
            <Spin indicator={<LoadingOutlined className="text-4xl text-blue-400" spin />} />
            <div className="flex flex-col items-center gap-2">
              <span className="text-sm text-white">
                {phase && phaseLabels[phase] ? phaseLabels[phase] : '处理中...'}
              </span>
              {progress > 0 && (
                <div className="flex items-center gap-2">
                  <div className="w-32 h-2 bg-white/20 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-400 transition-all duration-300"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <span className="text-xs text-white/80">{progress}%</span>
                </div>
              )}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

import React from 'react';
import { Alert, Button, Space } from 'antd';
import { ReloadOutlined, CloseOutlined } from '@ant-design/icons';

interface TaskErrorDisplayProps {
  error: string;
  onRetry?: () => void;
  onDismiss?: () => void;
  showActions?: boolean;
}

const errorMessages: Record<string, string> = {
  'ITV provider not found': '未配置视频生成服务，请在设置中配置',
  'TTS provider not found': '未配置语音合成服务，请在设置中配置',
  'Network error': '网络连接失败，请检查网络设置',
  'Insufficient balance': '余额不足，请充值后重试',
  'Task cancelled': '任务已取消',
};

function getErrorMessage(error: string): string {
  for (const [key, message] of Object.entries(errorMessages)) {
    if (error.includes(key)) {
      return message;
    }
  }
  return error;
}

function getErrorType(error: string): 'error' | 'warning' | 'info' {
  if (error.includes('cancelled')) return 'info';
  if (error.includes('provider not found') || error.includes('balance')) return 'warning';
  return 'error';
}

export function TaskErrorDisplay({
  error,
  onRetry,
  onDismiss,
  showActions = true,
}: TaskErrorDisplayProps) {
  const message = getErrorMessage(error);
  const type = getErrorType(error);

  return (
    <Alert
      message="任务失败"
      description={
        <div className="flex flex-col gap-2">
          <span>{message}</span>
          {showActions && (onRetry || onDismiss) && (
            <Space>
              {onRetry && (
                <Button size="small" type="primary" icon={<ReloadOutlined />} onClick={onRetry}>
                  重试
                </Button>
              )}
              {onDismiss && (
                <Button size="small" icon={<CloseOutlined />} onClick={onDismiss}>
                  关闭
                </Button>
              )}
            </Space>
          )}
        </div>
      }
      type={type}
      showIcon
      closable={!!onDismiss}
      onClose={onDismiss}
    />
  );
}

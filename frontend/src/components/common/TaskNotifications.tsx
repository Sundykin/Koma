/**
 * 任务通知组件
 * 显示任务状态通知
 */
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useTaskNotifications, type TaskNotification } from '../../hooks/useTaskNotifications';

interface NotificationItemProps {
  notification: TaskNotification;
  onClose: () => void;
  onNavigate?: (notification: TaskNotification) => void;
}

const NotificationItem: React.FC<NotificationItemProps> = ({ notification, onClose, onNavigate }) => {
  const { t } = useTranslation('common');
  const [retrying, setRetrying] = useState(false);
  const isClickable = !!(notification.onClick || notification.targetId);
  const hasRetry = notification.type === 'error' && !!notification.onRetry;

  const getBackgroundColor = () => {
    switch (notification.type) {
      case 'success':
        return '#e8f5e9';
      case 'error':
        return '#ffebee';
      case 'warning':
        return '#fff3e0';
      case 'info':
      default:
        return '#e3f2fd';
    }
  };

  const getBorderColor = () => {
    switch (notification.type) {
      case 'success':
        return '#4caf50';
      case 'error':
        return '#f44336';
      case 'warning':
        return '#ff9800';
      case 'info':
      default:
        return '#2196f3';
    }
  };

  const getIcon = () => {
    switch (notification.type) {
      case 'success':
        return '✓';
      case 'error':
        return '✕';
      case 'warning':
        return '!';
      case 'info':
      default:
        return 'i';
    }
  };

  const handleClick = () => {
    if (notification.onClick) {
      notification.onClick();
      onClose();
    } else if (onNavigate && notification.targetId) {
      onNavigate(notification);
      onClose();
    }
  };

  const handleRetry = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!notification.onRetry || retrying) return;

    setRetrying(true);
    try {
      await notification.onRetry();
      onClose();
    } catch {
      // 重试失败，保持通知可见
    } finally {
      setRetrying(false);
    }
  };

  const itemStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'flex-start',
    padding: '12px 16px',
    marginBottom: '8px',
    backgroundColor: getBackgroundColor(),
    borderLeft: `4px solid ${getBorderColor()}`,
    borderRadius: '4px',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
    animation: 'slideIn 0.3s ease',
    cursor: isClickable ? 'pointer' : 'default',
    transition: 'transform 0.2s',
  };

  const iconStyle: React.CSSProperties = {
    width: '20px',
    height: '20px',
    borderRadius: '50%',
    backgroundColor: getBorderColor(),
    color: 'white',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '12px',
    fontWeight: 'bold',
    marginRight: '12px',
    flexShrink: 0,
  };

  const contentStyle: React.CSSProperties = {
    flex: 1,
    fontSize: '14px',
    lineHeight: '1.4',
  };

  const messageStyle: React.CSSProperties = {
    marginBottom: isClickable ? '4px' : 0,
  };

  const hintStyle: React.CSSProperties = {
    fontSize: '12px',
    color: '#666',
  };

  const retryButtonStyle: React.CSSProperties = {
    marginTop: '8px',
    padding: '4px 12px',
    fontSize: '12px',
    backgroundColor: '#f44336',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: retrying ? 'not-allowed' : 'pointer',
    opacity: retrying ? 0.7 : 1,
  };

  const closeStyle: React.CSSProperties = {
    marginLeft: '12px',
    cursor: 'pointer',
    color: '#999',
    fontSize: '16px',
    lineHeight: 1,
    padding: '2px',
  };

  return (
    <div
      style={itemStyle}
      onClick={isClickable ? handleClick : undefined}
      onMouseEnter={(e) => {
        if (isClickable) {
          (e.currentTarget as HTMLElement).style.transform = 'translateX(-4px)';
        }
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.transform = 'translateX(0)';
      }}
    >
      <div style={iconStyle}>{getIcon()}</div>
      <div style={contentStyle}>
        <div style={messageStyle}>{notification.message}</div>
        {isClickable && (
          <div style={hintStyle}>{t('notification.clickForDetails')}</div>
        )}
        {hasRetry && (
          <button
            style={retryButtonStyle}
            onClick={handleRetry}
            disabled={retrying}
          >
            {retrying ? t('notification.retrying') : t('retry')}
          </button>
        )}
      </div>
      <span
        style={closeStyle}
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
      >
        ×
      </span>
    </div>
  );
};

interface TaskNotificationsProps {
  className?: string;
  onNavigate?: (notification: TaskNotification) => void;
}

export const TaskNotifications: React.FC<TaskNotificationsProps> = ({ className, onNavigate }) => {
  const { notifications, removeNotification } = useTaskNotifications();

  if (notifications.length === 0) {
    return null;
  }

  const containerStyle: React.CSSProperties = {
    position: 'fixed',
    top: '16px',
    right: '16px',
    width: '320px',
    maxHeight: '400px',
    overflowY: 'auto',
    zIndex: 1000,
  };

  return (
    <div style={containerStyle} className={className}>
      <style>
        {`
          @keyframes slideIn {
            from {
              opacity: 0;
              transform: translateX(100%);
            }
            to {
              opacity: 1;
              transform: translateX(0);
            }
          }
        `}
      </style>
      {notifications.map(notification => (
        <NotificationItem
          key={notification.id}
          notification={notification}
          onClose={() => removeNotification(notification.id)}
          onNavigate={onNavigate}
        />
      ))}
    </div>
  );
};

export default TaskNotifications;

/**
 * 保存状态指示器
 */
import React from 'react';
import { useSaveStatus } from '../hooks/useTaskNotifications';
import { saveProjectNow } from '../store/autoSaveService';

interface SaveStatusIndicatorProps {
  projectId: string;
  className?: string;
}

export const SaveStatusIndicator: React.FC<SaveStatusIndicatorProps> = ({
  projectId,
  className = '',
}) => {
  const saveState = useSaveStatus(projectId);

  const handleClick = async () => {
    if (saveState.status === 'dirty' || saveState.status === 'error') {
      await saveProjectNow(projectId);
    }
  };

  const getStatusIcon = () => {
    switch (saveState.status) {
      case 'saved':
        return '✓';
      case 'saving':
        return '...';
      case 'dirty':
        return '•';
      case 'error':
        return '!';
      default:
        return '';
    }
  };

  const getStatusText = () => {
    switch (saveState.status) {
      case 'saved':
        return '已保存';
      case 'saving':
        return '保存中...';
      case 'dirty':
        return '未保存';
      case 'error':
        return saveState.error || '保存失败';
      default:
        return '';
    }
  };

  const getStatusColor = () => {
    switch (saveState.status) {
      case 'saved':
        return 'var(--color-success, #4caf50)';
      case 'saving':
        return 'var(--color-info, #2196f3)';
      case 'dirty':
        return 'var(--color-warning, #ff9800)';
      case 'error':
        return 'var(--color-error, #f44336)';
      default:
        return 'inherit';
    }
  };

  const containerStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    padding: '4px 8px',
    fontSize: '12px',
    color: getStatusColor(),
    cursor: saveState.status === 'dirty' || saveState.status === 'error' ? 'pointer' : 'default',
    borderRadius: '4px',
    transition: 'background-color 0.2s',
  };

  const iconStyle: React.CSSProperties = {
    fontSize: '14px',
    fontWeight: 'bold',
  };

  return (
    <div
      className={className}
      style={containerStyle}
      onClick={handleClick}
      title={saveState.status === 'dirty' ? '点击保存 (Ctrl+S)' : getStatusText()}
    >
      <span style={iconStyle}>{getStatusIcon()}</span>
      <span>{getStatusText()}</span>
    </div>
  );
};

export default SaveStatusIndicator;

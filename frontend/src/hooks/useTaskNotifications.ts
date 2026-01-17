/**
 * 任务通知 Hook
 * 显示任务状态通知
 */
import { useEffect, useState, useCallback } from 'react';
import { onTaskRecovery } from '../store/projectOpenService';
import { subscribeSaveState } from '../store/autoSaveService';
import type { ProjectSaveState } from '../types';

export interface TaskNotification {
  id: string;
  type: 'info' | 'success' | 'error' | 'warning';
  message: string;
  timestamp: number;
}

/**
 * 任务通知 Hook
 */
export function useTaskNotifications() {
  const [notifications, setNotifications] = useState<TaskNotification[]>([]);
  const [saveState, setSaveState] = useState<ProjectSaveState | null>(null);

  // 添加通知
  const addNotification = useCallback((type: TaskNotification['type'], message: string) => {
    const notification: TaskNotification = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      type,
      message,
      timestamp: Date.now(),
    };
    setNotifications(prev => [...prev, notification]);

    // 5 秒后自动移除
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== notification.id));
    }, 5000);
  }, []);

  // 移除通知
  const removeNotification = useCallback((id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  }, []);

  // 清除所有通知
  const clearNotifications = useCallback(() => {
    setNotifications([]);
  }, []);

  // 监听任务恢复结果
  useEffect(() => {
    const unsubscribe = onTaskRecovery(result => {
      if (result.recovered > 0) {
        addNotification('success', `已恢复 ${result.recovered} 个未完成任务`);
      }
      if (result.failed > 0) {
        addNotification('error', `${result.failed} 个任务恢复失败`);
      }
    });
    return unsubscribe;
  }, [addNotification]);

  // 监听保存状态
  useEffect(() => {
    const unsubscribe = subscribeSaveState(state => {
      setSaveState(state);
      if (state.status === 'error' && state.error) {
        addNotification('error', `保存失败: ${state.error}`);
      }
    });
    return unsubscribe;
  }, [addNotification]);

  return {
    notifications,
    saveState,
    addNotification,
    removeNotification,
    clearNotifications,
  };
}

/**
 * 保存状态 Hook
 */
export function useSaveStatus(projectId?: string) {
  const [status, setStatus] = useState<ProjectSaveState>({
    projectId: projectId || '',
    status: 'saved',
  });

  useEffect(() => {
    const unsubscribe = subscribeSaveState(state => {
      if (!projectId || state.projectId === projectId) {
        setStatus(state);
      }
    });
    return unsubscribe;
  }, [projectId]);

  return status;
}

export default {
  useTaskNotifications,
  useSaveStatus,
};

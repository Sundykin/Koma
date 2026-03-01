/**
 * ShotCard 任务状态增强包装器
 * 为 ShotCard 添加实时任务状态显示
 */
import React from 'react';
import { ShotCard, type ShotCardProps } from './ShotCard';
import { TaskStatusOverlay } from '../task/TaskStatusOverlay';
import { TaskStatusInline } from '../task/TaskStatusInline';
import { useTaskStatus } from '../../hooks/useTaskStatus';

export interface ShotCardWithTaskProps extends ShotCardProps {
  showTaskStatus?: boolean;
  taskDisplayMode?: 'overlay' | 'inline' | 'both';
}

export const ShotCardWithTask: React.FC<ShotCardWithTaskProps> = ({
  shot,
  showTaskStatus = true,
  taskDisplayMode = 'both',
  ...restProps
}) => {
  // 订阅任务状态
  const { status: taskStatus } = useTaskStatus(shot.taskId);

  // 如果有任务状态，更新 shot 对象
  const enhancedShot = React.useMemo(() => {
    if (!taskStatus) return shot;

    return {
      ...shot,
      taskStatus: taskStatus.status,
      taskProgress: taskStatus.progress,
      taskError: taskStatus.error,
    };
  }, [shot, taskStatus]);

  return (
    <div className="relative">
      <ShotCard shot={enhancedShot} {...restProps} />

      {/* 覆盖层状态显示 */}
      {showTaskStatus && (taskDisplayMode === 'overlay' || taskDisplayMode === 'both') && (
        <TaskStatusOverlay
          status={taskStatus?.status || null}
          progress={taskStatus?.progress}
          phase={null}
          error={taskStatus?.error}
        />
      )}

      {/* 行内状态显示 */}
      {showTaskStatus &&
        (taskDisplayMode === 'inline' || taskDisplayMode === 'both') &&
        taskStatus &&
        taskStatus.status !== 'completed' && (
          <div className="absolute top-2 right-2 z-20">
            <TaskStatusInline
              status={taskStatus.status}
              progress={taskStatus.progress}
              phase={null}
              error={taskStatus.error}
            />
          </div>
        )}
    </div>
  );
};

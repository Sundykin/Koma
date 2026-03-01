/**
 * 队列状态面板
 * 显示当前队列的统计信息和工作线程状态
 */
import React from 'react';
import { Card, Statistic, Row, Col, Progress, Space, Badge } from 'antd';
import {
  ClockCircleOutlined,
  LoadingOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
} from '@ant-design/icons';
import { useTaskList } from '../../hooks/useTaskStatus';

export const QueueStatusPanel: React.FC<{ projectId?: string }> = ({ projectId }) => {
  const { tasks } = useTaskList({ projectId });

  const stats = React.useMemo(() => {
    const queued = tasks.filter((t) => t.status === 'queued').length;
    const processing = tasks.filter((t) => t.status === 'processing').length;
    const completed = tasks.filter((t) => t.status === 'completed').length;
    const failed = tasks.filter((t) => t.status === 'failed').length;

    return { queued, processing, completed, failed, total: tasks.length };
  }, [tasks]);

  const processingTasks = React.useMemo(
    () => tasks.filter((t) => t.status === 'processing'),
    [tasks]
  );

  return (
    <Card title="队列状态" size="small">
      <Row gutter={16} className="mb-4">
        <Col span={6}>
          <Statistic
            title="排队中"
            value={stats.queued}
            prefix={<ClockCircleOutlined />}
            valueStyle={{ color: '#6b7280' }}
          />
        </Col>
        <Col span={6}>
          <Statistic
            title="处理中"
            value={stats.processing}
            prefix={<LoadingOutlined />}
            valueStyle={{ color: '#3b82f6' }}
          />
        </Col>
        <Col span={6}>
          <Statistic
            title="已完成"
            value={stats.completed}
            prefix={<CheckCircleOutlined />}
            valueStyle={{ color: '#10b981' }}
          />
        </Col>
        <Col span={6}>
          <Statistic
            title="失败"
            value={stats.failed}
            prefix={<CloseCircleOutlined />}
            valueStyle={{ color: '#ef4444' }}
          />
        </Col>
      </Row>

      {processingTasks.length > 0 && (
        <div>
          <div className="text-sm font-semibold mb-2">正在处理的任务</div>
          <Space direction="vertical" className="w-full">
            {processingTasks.slice(0, 3).map((task) => {
              const payload = task.payload as any;
              const shotId = payload?.shot?.id || task.taskId;
              return (
                <div key={task.taskId} className="flex items-center gap-2">
                  <Badge status="processing" />
                  <span className="text-xs font-mono flex-shrink-0">
                    {shotId.slice(0, 8)}...
                  </span>
                  <Progress
                    percent={task.progress}
                    size="small"
                    status="active"
                    className="flex-1"
                  />
                </div>
              );
            })}
            {processingTasks.length > 3 && (
              <div className="text-xs text-gray-500">还有 {processingTasks.length - 3} 个任务...</div>
            )}
          </Space>
        </div>
      )}

      {stats.total === 0 && (
        <div className="text-center text-gray-400 py-4">暂无任务</div>
      )}
    </Card>
  );
};

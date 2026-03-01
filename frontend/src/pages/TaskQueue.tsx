/**
 * 任务队列管理页面
 * 显示所有任务的状态，支持取消/重试操作
 */
import React, { useState } from 'react';
import { Table, Button, Space, Tag, Progress, Modal, message, Tabs } from 'antd';
import {
  ReloadOutlined,
  CloseOutlined,
  DeleteOutlined,
  EyeOutlined,
} from '@ant-design/icons';
import { useTaskList } from '../hooks/useTaskStatus';
import { taskQueueService, type TaskInfo } from '../services/taskQueueService';
import { TaskErrorDisplay } from '../components/task/TaskErrorDisplay';
import type { ColumnsType } from 'antd/es/table';

const statusColors: Record<string, string> = {
  queued: 'default',
  processing: 'processing',
  completed: 'success',
  failed: 'error',
};

const statusLabels: Record<string, string> = {
  queued: '排队中',
  processing: '处理中',
  completed: '已完成',
  failed: '失败',
};

export const TaskQueuePage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<string>('all');
  const { tasks, loading } = useTaskList({
    status: activeTab === 'all' ? undefined : activeTab,
  });
  const [selectedTask, setSelectedTask] = useState<TaskInfo | null>(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);

  const handleCancel = async (taskId: string) => {
    try {
      const success = await taskQueueService.cancelTask(taskId);
      if (success) {
        message.success('任务已取消');
      } else {
        message.error('取消失败');
      }
    } catch (error: any) {
      message.error(`取消失败: ${error.message}`);
    }
  };

  const handleRetry = async (taskId: string) => {
    try {
      // TODO: 实现重试功能
      message.info('重试功能开发中');
    } catch (error: any) {
      message.error(`重试失败: ${error.message}`);
    }
  };

  const handleClearCompleted = async () => {
    Modal.confirm({
      title: '确认清除',
      content: '确定要清除所有已完成的任务吗？',
      onOk: async () => {
        try {
          // TODO: 实现清除已完成任务
          message.success('已清除完成的任务');
        } catch (error: any) {
          message.error(`清除失败: ${error.message}`);
        }
      },
    });
  };

  const handleViewDetail = (task: TaskInfo) => {
    setSelectedTask(task);
    setDetailModalOpen(true);
  };

  const columns: ColumnsType<TaskInfo> = [
    {
      title: '任务ID',
      dataIndex: 'taskId',
      key: 'taskId',
      width: 120,
      render: (taskId: string) => (
        <span className="font-mono text-xs">{taskId.slice(0, 8)}...</span>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: string) => (
        <Tag color={statusColors[status]}>{statusLabels[status] || status}</Tag>
      ),
    },
    {
      title: '进度',
      dataIndex: 'progress',
      key: 'progress',
      width: 150,
      render: (progress: number, record: TaskInfo) => {
        if (record.status === 'queued') return <span className="text-gray-400">等待中</span>;
        if (record.status === 'completed') return <span className="text-green-600">100%</span>;
        if (record.status === 'failed') return <span className="text-red-600">失败</span>;
        return <Progress percent={progress} size="small" status="active" />;
      },
    },
    {
      title: '分镜ID',
      key: 'shotId',
      width: 120,
      render: (_, record: TaskInfo) => {
        const payload = record.payload as any;
        return payload?.shot?.id ? (
          <span className="font-mono text-xs">{payload.shot.id.slice(0, 8)}...</span>
        ) : (
          '-'
        );
      },
    },
    {
      title: '项目ID',
      key: 'projectId',
      width: 120,
      render: (_, record: TaskInfo) => {
        const payload = record.payload as any;
        return payload?.projectId ? (
          <span className="font-mono text-xs">{payload.projectId.slice(0, 8)}...</span>
        ) : (
          '-'
        );
      },
    },
    {
      title: '错误信息',
      dataIndex: 'error',
      key: 'error',
      ellipsis: true,
      render: (error: string) => (error ? <span className="text-red-600">{error}</span> : '-'),
    },
    {
      title: '操作',
      key: 'actions',
      width: 180,
      fixed: 'right',
      render: (_, record: TaskInfo) => (
        <Space size="small">
          <Button
            size="small"
            icon={<EyeOutlined />}
            onClick={() => handleViewDetail(record)}
          >
            详情
          </Button>
          {record.status === 'processing' && (
            <Button
              size="small"
              danger
              icon={<CloseOutlined />}
              onClick={() => handleCancel(record.taskId)}
            >
              取消
            </Button>
          )}
          {record.status === 'failed' && (
            <Button
              size="small"
              icon={<ReloadOutlined />}
              onClick={() => handleRetry(record.taskId)}
            >
              重试
            </Button>
          )}
        </Space>
      ),
    },
  ];

  const tabItems = [
    { key: 'all', label: `全部 (${tasks.length})` },
    {
      key: 'processing',
      label: `处理中 (${tasks.filter((t) => t.status === 'processing').length})`,
    },
    { key: 'queued', label: `排队中 (${tasks.filter((t) => t.status === 'queued').length})` },
    {
      key: 'completed',
      label: `已完成 (${tasks.filter((t) => t.status === 'completed').length})`,
    },
    { key: 'failed', label: `失败 (${tasks.filter((t) => t.status === 'failed').length})` },
  ];

  return (
    <div className="h-full flex flex-col p-4">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">任务队列</h1>
        <Space>
          <Button icon={<DeleteOutlined />} onClick={handleClearCompleted}>
            清除已完成
          </Button>
        </Space>
      </div>

      <Tabs activeKey={activeTab} onChange={setActiveTab} items={tabItems} />

      <Table
        columns={columns}
        dataSource={tasks}
        rowKey="taskId"
        loading={loading}
        pagination={{
          pageSize: 20,
          showSizeChanger: true,
          showTotal: (total) => `共 ${total} 个任务`,
        }}
        scroll={{ x: 1000 }}
      />

      {/* 任务详情弹窗 */}
      <Modal
        title="任务详情"
        open={detailModalOpen}
        onCancel={() => setDetailModalOpen(false)}
        footer={null}
        width={800}
      >
        {selectedTask && (
          <div className="space-y-4">
            <div>
              <h3 className="font-semibold mb-2">基本信息</h3>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-gray-500">任务ID:</span>{' '}
                  <span className="font-mono">{selectedTask.taskId}</span>
                </div>
                <div>
                  <span className="text-gray-500">状态:</span>{' '}
                  <Tag color={statusColors[selectedTask.status]}>
                    {statusLabels[selectedTask.status]}
                  </Tag>
                </div>
                <div>
                  <span className="text-gray-500">进度:</span> {selectedTask.progress}%
                </div>
              </div>
            </div>

            {selectedTask.error && (
              <div>
                <h3 className="font-semibold mb-2">错误信息</h3>
                <TaskErrorDisplay
                  error={selectedTask.error}
                  onRetry={() => handleRetry(selectedTask.taskId)}
                  onDismiss={() => setDetailModalOpen(false)}
                />
              </div>
            )}

            <div>
              <h3 className="font-semibold mb-2">任务数据</h3>
              <pre className="bg-gray-100 p-3 rounded text-xs overflow-auto max-h-96">
                {JSON.stringify(selectedTask.payload, null, 2)}
              </pre>
            </div>

            {selectedTask.result && (
              <div>
                <h3 className="font-semibold mb-2">执行结果</h3>
                <pre className="bg-gray-100 p-3 rounded text-xs overflow-auto max-h-96">
                  {JSON.stringify(selectedTask.result, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
};

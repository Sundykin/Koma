/**
 * 任务状态条组件
 * 显示当前运行中的后台任务进度
 */
import React, { useState, useEffect } from 'react';
import { Progress, Space, Typography, Collapse, Tag, Button, Empty } from 'antd';
import {
  LoadingOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  DownOutlined,
  UpOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import { Loader2, CheckCircle2, XCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { TaskManager, Task, TaskStatus, TaskType } from '../../services/TaskManager';

const { Text } = Typography;

interface TaskStatusBarProps {
  projectId: string;
  onRetry?: (task: Task) => void;
}

const getTaskTypeLabel = (type: TaskType): string => {
  switch (type) {
    case 'script-analysis':
      return '剧本解析';
    case 'asset-generation':
      return '资产生成';
    case 'shot-render':
      return '分镜渲染';
    default:
      return '任务';
  }
};

const getStatusIcon = (status: TaskStatus) => {
  switch (status) {
    case 'pending':
    case 'running':
      return <Loader2 className="w-4 h-4 animate-spin text-blue-400" />;
    case 'completed':
      return <CheckCircle2 className="w-4 h-4 text-emerald-500" />;
    case 'failed':
      return <XCircle className="w-4 h-4 text-red-500" />;
  }
};

const getStatusColor = (status: TaskStatus): string => {
  switch (status) {
    case 'pending':
      return 'default';
    case 'running':
      return 'processing';
    case 'completed':
      return 'success';
    case 'failed':
      return 'error';
  }
};

export const TaskStatusBar: React.FC<TaskStatusBarProps> = ({
  projectId,
  onRetry,
}) => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    // 初始加载
    const loadTasks = () => {
      const allTasks = TaskManager.getProjectTasks(projectId);
      // 只显示最近的任务（最多10个）
      setTasks(allTasks.slice(0, 10));
    };

    loadTasks();

    // 监听任务变更
    const unsubscribe = TaskManager.addListener((task) => {
      if (task.projectId === projectId) {
        loadTasks();
      }
    });

    return () => {
      unsubscribe();
    };
  }, [projectId]);

  const runningTasks = tasks.filter(t => t.status === 'pending' || t.status === 'running');
  const recentTasks = tasks.filter(t => t.status === 'completed' || t.status === 'failed').slice(0, 5);

  // 没有任务时不显示
  if (tasks.length === 0) {
    return null;
  }

  // 主任务（第一个运行中的任务）
  const mainTask = runningTasks[0];

  return (
    <div className="bg-zinc-900 border-b border-zinc-800">
      {/* 主状态条 */}
      {mainTask ? (
        <div
          className="px-4 py-2 flex items-center justify-between cursor-pointer hover:bg-zinc-800"
          onClick={() => setExpanded(!expanded)}
        >
          <div className="flex items-center gap-3 flex-1 min-w-0">
            {getStatusIcon(mainTask.status)}
            <Text className="text-zinc-300 truncate">
              {getTaskTypeLabel(mainTask.type)}
              {mainTask.targetName && `: ${mainTask.targetName}`}
            </Text>
            <Progress
              percent={mainTask.progress}
              size="small"
              status={mainTask.status === 'failed' ? 'exception' : 'active'}
              showInfo={false}
              className="flex-1 max-w-[200px]"
              strokeColor="#10b981"
            />
            <Text className="text-zinc-500 text-xs">{mainTask.progress}%</Text>
          </div>
          <div className="flex items-center gap-2">
            {runningTasks.length > 1 && (
              <Tag color="blue">+{runningTasks.length - 1} 任务</Tag>
            )}
            {expanded ? (
              <ChevronUp className="w-4 h-4 text-zinc-500" />
            ) : (
              <ChevronDown className="w-4 h-4 text-zinc-500" />
            )}
          </div>
        </div>
      ) : recentTasks.length > 0 ? (
        <div
          className="px-4 py-2 flex items-center justify-between cursor-pointer hover:bg-zinc-800"
          onClick={() => setExpanded(!expanded)}
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            <Text className="text-zinc-400 text-sm">
              最近完成 {recentTasks.length} 个任务
            </Text>
          </div>
          {expanded ? (
            <ChevronUp className="w-4 h-4 text-zinc-500" />
          ) : (
            <ChevronDown className="w-4 h-4 text-zinc-500" />
          )}
        </div>
      ) : null}

      {/* 展开的任务列表 */}
      {expanded && (
        <div className="px-4 py-2 border-t border-zinc-800 max-h-[200px] overflow-y-auto">
          {runningTasks.length > 0 && (
            <div className="mb-3">
              <Text className="text-xs text-zinc-500 uppercase">运行中</Text>
              <div className="mt-1 space-y-2">
                {runningTasks.map(task => (
                  <div key={task.id} className="flex items-center gap-2 py-1">
                    {getStatusIcon(task.status)}
                    <Text className="text-zinc-300 text-sm flex-1 truncate">
                      {getTaskTypeLabel(task.type)}
                      {task.targetName && `: ${task.targetName}`}
                    </Text>
                    <Progress
                      percent={task.progress}
                      size="small"
                      showInfo={false}
                      className="w-20"
                      strokeColor="#10b981"
                    />
                    <Text className="text-zinc-500 text-xs w-8">{task.progress}%</Text>
                  </div>
                ))}
              </div>
            </div>
          )}

          {recentTasks.length > 0 && (
            <div>
              <Text className="text-xs text-zinc-500 uppercase">最近完成</Text>
              <div className="mt-1 space-y-1">
                {recentTasks.map(task => (
                  <div key={task.id} className="flex items-center gap-2 py-1">
                    {getStatusIcon(task.status)}
                    <Text className={`text-sm flex-1 truncate ${task.status === 'failed' ? 'text-red-400' : 'text-zinc-400'}`}>
                      {getTaskTypeLabel(task.type)}
                      {task.targetName && `: ${task.targetName}`}
                    </Text>
                    {task.status === 'failed' && onRetry && (
                      <Button
                        type="link"
                        size="small"
                        icon={<ReloadOutlined />}
                        onClick={(e) => {
                          e.stopPropagation();
                          onRetry(task);
                        }}
                      >
                        重试
                      </Button>
                    )}
                    {task.error && (
                      <Text className="text-red-400 text-xs truncate max-w-[150px]">
                        {task.error}
                      </Text>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {tasks.length === 0 && (
            <Empty description="暂无任务" className="py-4" />
          )}
        </div>
      )}
    </div>
  );
};

export default TaskStatusBar;

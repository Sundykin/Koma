/**
 * 任务状态条组件
 * 显示当前运行中的后台任务进度
 * v2: 支持 category/subType 分类，任务恢复状态显示
 */
import React, { useState, useEffect, useMemo } from 'react';
import { Progress, Typography, Tag, Button, Empty, Tabs, Tooltip } from 'antd';
import { ReloadOutlined, DeleteOutlined, StopOutlined } from '@ant-design/icons';
import { Loader2, CheckCircle2, XCircle, ChevronDown, ChevronUp, Image, Video, FileText, Cpu, Box, Download } from 'lucide-react';
import { TaskManager, Task, TaskStatus, TaskCategory, TaskSubType } from '../../services/TaskManager';

const { Text } = Typography;

interface TaskStatusBarProps {
  projectId: string;
  onRetry?: (task: Task) => void;
  onCancel?: (task: Task) => void;
}

// 分类标签配置
const CATEGORY_CONFIG: Record<TaskCategory, { label: string; icon: React.ReactNode; color: string }> = {
  prompt: { label: '提示词', icon: <FileText className="w-3 h-3" />, color: 'purple' },
  media: { label: '媒体', icon: <Video className="w-3 h-3" />, color: 'blue' },
  analysis: { label: '分析', icon: <Cpu className="w-3 h-3" />, color: 'cyan' },
  asset: { label: '资产', icon: <Box className="w-3 h-3" />, color: 'orange' },
  script: { label: '剧本', icon: <FileText className="w-3 h-3" />, color: 'green' },
  export: { label: '导出', icon: <Download className="w-3 h-3" />, color: 'gold' },
};

// 子类型标签
const getSubTypeLabel = (subType?: TaskSubType): string => {
  const labels: Record<string, string> = {
    image: '图片',
    video: '视频',
    tti: '文生图',
    itv: '图生视频',
    tts: '文字转语音',
    'shot-analysis': 'AI 分镜',
    'shot-generation': '分镜生成',
    'script-analysis': '剧本解析',
    'asset-generation': '资产生成',
    'character-extraction': '角色提取',
    'prompt-generation': '生成提示词',
    'prompt-optimization': '优化提示词',
  };
  return labels[subType || ''] || subType || '';
};

// 旧版类型标签（兼容）
const getLegacyTypeLabel = (type: string): string => {
  const labels: Record<string, string> = {
    'script-analysis': '剧本解析',
    'asset-generation': '资产生成',
    'shot-render': '分镜渲染',
    'shot-generation': '分镜生成',
    'shot-analysis': 'AI 分镜',
    'prompt-generation:image': '图片提示词',
    'prompt-generation:video': '视频提示词',
    'prompt-optimization:image': '优化图片提示词',
    'prompt-optimization:video': '优化视频提示词',
  };
  return labels[type] || type;
};

// 获取任务标签
const getTaskLabel = (task: Task): string => {
  if (task.category && task.subType) {
    return `${CATEGORY_CONFIG[task.category]?.label || task.category} - ${getSubTypeLabel(task.subType)}`;
  }
  return getLegacyTypeLabel(task.type);
};

const getStatusIcon = (status: TaskStatus) => {
  switch (status) {
    case 'pending':
    case 'running':
    case 'processing':
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
    case 'processing':
      return 'processing';
    case 'completed':
      return 'success';
    case 'failed':
      return 'error';
    default:
      return 'default';
  }
};

// 格式化时间
const formatTime = (timestamp?: number): string => {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
};

// 计算耗时
const formatDuration = (startedAt?: number, completedAt?: number): string => {
  if (!startedAt) return '';
  const end = completedAt || Date.now();
  const seconds = Math.floor((end - startedAt) / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${minutes}m ${secs}s`;
};

export const TaskStatusBar: React.FC<TaskStatusBarProps> = ({
  projectId,
  onRetry,
  onCancel,
}) => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<string>('all');

  useEffect(() => {
    const loadTasks = () => {
      const allTasks = TaskManager.getProjectTasks(projectId);
      setTasks(allTasks.slice(0, 20));
    };

    loadTasks();

    const unsubscribe = TaskManager.addListener((task) => {
      if (task.projectId === projectId) {
        loadTasks();
      }
    });

    return () => unsubscribe();
  }, [projectId]);

  // 分类任务
  const { runningTasks, completedTasks, failedTasks, allFilteredTasks } = useMemo(() => {
    const running = tasks.filter(t => t.status === 'pending' || t.status === 'running' || t.status === 'processing');
    const completed = tasks.filter(t => t.status === 'completed');
    const failed = tasks.filter(t => t.status === 'failed');

    let filtered: Task[];
    switch (activeTab) {
      case 'running':
        filtered = running;
        break;
      case 'completed':
        filtered = completed;
        break;
      case 'failed':
        filtered = failed;
        break;
      default:
        filtered = tasks;
    }

    return { runningTasks: running, completedTasks: completed, failedTasks: failed, allFilteredTasks: filtered };
  }, [tasks, activeTab]);

  // 没有任务时不显示
  if (tasks.length === 0) {
    return null;
  }

  const mainTask = runningTasks[0];

  // 任务项渲染
  const renderTaskItem = (task: Task) => (
    <div key={task.id} className="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-zinc-800/50">
      {getStatusIcon(task.status)}
      <div className="flex flex-col flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          {task.category && CATEGORY_CONFIG[task.category] && (
            <Tag
              color={CATEGORY_CONFIG[task.category].color}
              className="text-[10px] px-1 py-0 leading-tight"
            >
              {CATEGORY_CONFIG[task.category].icon}
              <span className="ml-0.5">{getSubTypeLabel(task.subType)}</span>
            </Tag>
          )}
          <Text className="text-zinc-300 text-sm truncate">
            {task.targetName || getTaskLabel(task)}
          </Text>
        </div>
        {task.result?.stageMessage && (
          <Text className="text-zinc-500 text-xs truncate">
            {task.result.stageMessage}
          </Text>
        )}
        {task.error && (
          <Text className="text-red-400 text-xs truncate">
            {task.error}
          </Text>
        )}
      </div>

      {/* 进度 */}
      {(task.status === 'running' || task.status === 'processing') && (
        <>
          <Progress
            percent={task.progress}
            size="small"
            showInfo={false}
            className="w-16"
            strokeColor="#10b981"
          />
          <Text className="text-zinc-500 text-xs w-8">{task.progress}%</Text>
        </>
      )}

      {/* 耗时 */}
      {task.startedAt && (
        <Text className="text-zinc-600 text-xs">
          {formatDuration(task.startedAt, task.completedAt)}
        </Text>
      )}

      {/* 恢复标记 */}
      {task.recoverable && task.attempt && task.attempt > 0 && (
        <Tooltip title={`重试次数: ${task.attempt}/${task.maxRetries}`}>
          <Tag color="warning" className="text-[10px] px-1 py-0">
            重试 {task.attempt}
          </Tag>
        </Tooltip>
      )}

      {/* 操作按钮 */}
      <div className="flex items-center gap-1 ml-1">
        {task.status === 'failed' && onRetry && (
          <Button
            type="text"
            size="small"
            icon={<ReloadOutlined />}
            className="text-zinc-500 hover:text-blue-400"
            onClick={(e) => {
              e.stopPropagation();
              onRetry(task);
            }}
          />
        )}
        {(task.status === 'running' || task.status === 'pending') && onCancel && (
          <Button
            type="text"
            size="small"
            icon={<StopOutlined />}
            className="text-zinc-500 hover:text-red-400"
            onClick={(e) => {
              e.stopPropagation();
              onCancel(task);
            }}
          />
        )}
      </div>
    </div>
  );

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
            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-1.5">
                {mainTask.category && CATEGORY_CONFIG[mainTask.category] && (
                  <Tag
                    color={CATEGORY_CONFIG[mainTask.category].color}
                    className="text-[10px] px-1 py-0 leading-tight"
                  >
                    {getSubTypeLabel(mainTask.subType)}
                  </Tag>
                )}
                <Text className="text-zinc-300 truncate">
                  {mainTask.targetName || getTaskLabel(mainTask)}
                </Text>
              </div>
              {mainTask.result?.stageMessage && (
                <Text className="text-zinc-500 text-xs truncate">
                  {mainTask.result.stageMessage}
                </Text>
              )}
            </div>
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
            {failedTasks.length > 0 && (
              <Tag color="error">{failedTasks.length} 失败</Tag>
            )}
            {expanded ? (
              <ChevronUp className="w-4 h-4 text-zinc-500" />
            ) : (
              <ChevronDown className="w-4 h-4 text-zinc-500" />
            )}
          </div>
        </div>
      ) : tasks.length > 0 ? (
        <div
          className="px-4 py-2 flex items-center justify-between cursor-pointer hover:bg-zinc-800"
          onClick={() => setExpanded(!expanded)}
        >
          <div className="flex items-center gap-2">
            {failedTasks.length > 0 ? (
              <>
                <XCircle className="w-4 h-4 text-red-500" />
                <Text className="text-zinc-400 text-sm">
                  {failedTasks.length} 个任务失败
                </Text>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                <Text className="text-zinc-400 text-sm">
                  {completedTasks.length} 个任务已完成
                </Text>
              </>
            )}
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
        <div className="border-t border-zinc-800">
          {/* Tab 切换 */}
          <div className="px-4 pt-2">
            <Tabs
              size="small"
              activeKey={activeTab}
              onChange={setActiveTab}
              items={[
                { key: 'all', label: `全部 (${tasks.length})` },
                { key: 'running', label: `运行中 (${runningTasks.length})` },
                { key: 'completed', label: `已完成 (${completedTasks.length})` },
                { key: 'failed', label: `失败 (${failedTasks.length})` },
              ]}
              className="task-status-tabs"
            />
          </div>

          {/* 任务列表 */}
          <div className="px-2 pb-2 max-h-[250px] overflow-y-auto custom-scrollbar">
            {allFilteredTasks.length > 0 ? (
              <div className="space-y-0.5">
                {allFilteredTasks.map(renderTaskItem)}
              </div>
            ) : (
              <Empty description="暂无任务" className="py-4" />
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default TaskStatusBar;

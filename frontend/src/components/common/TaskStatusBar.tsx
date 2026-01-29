/**
 * 任务状态悬浮通知组件
 * 右下角悬浮显示当前运行中的后台任务进度
 */
import React, { useState, useEffect, useMemo } from 'react';
import { Progress, Typography, Tag, Button, Empty, Tabs, Tooltip } from 'antd';
import { ReloadOutlined, StopOutlined } from '@ant-design/icons';
import { Loader2, CheckCircle2, XCircle, ChevronDown, ChevronUp, FileText, Video, Cpu, Box, Download, X } from 'lucide-react';
import { TaskManager, Task, TaskStatus, TaskCategory, TaskSubType } from '../../services/TaskManager';

const { Text } = Typography;

interface TaskStatusBarProps {
  projectId: string;
  onRetry?: (task: Task) => void;
  onCancel?: (task: Task) => void;
}

const CATEGORY_CONFIG: Record<TaskCategory, { label: string; icon: React.ReactNode; color: string }> = {
  prompt: { label: '提示词', icon: <FileText className="w-3 h-3" />, color: 'purple' },
  media: { label: '媒体', icon: <Video className="w-3 h-3" />, color: 'blue' },
  analysis: { label: '分析', icon: <Cpu className="w-3 h-3" />, color: 'cyan' },
  asset: { label: '资产', icon: <Box className="w-3 h-3" />, color: 'orange' },
  script: { label: '剧本', icon: <FileText className="w-3 h-3" />, color: 'green' },
  export: { label: '导出', icon: <Download className="w-3 h-3" />, color: 'gold' },
};

const getSubTypeLabel = (subType?: TaskSubType): string => {
  const labels: Record<string, string> = {
    image: '图片', video: '视频', tti: '文生图', itv: '图生视频',
    tts: '文字转语音', 'shot-analysis': 'AI 分镜', 'shot-generation': '分镜生成',
    'script-analysis': '剧本解析', 'asset-generation': '资产生成',
    'character-extraction': '角色提取', 'prompt-generation': '生成提示词',
    'prompt-optimization': '优化提示词',
  };
  return labels[subType || ''] || subType || '';
};

const getLegacyTypeLabel = (type: string): string => {
  const labels: Record<string, string> = {
    'script-analysis': '剧本解析', 'asset-generation': '资产生成',
    'shot-render': '分镜渲染', 'shot-generation': '分镜生成',
    'shot-analysis': 'AI 分镜', 'prompt-generation:image': '图片提示词',
    'prompt-generation:video': '视频提示词', 'prompt-optimization:image': '优化图片提示词',
    'prompt-optimization:video': '优化视频提示词',
  };
  return labels[type] || type;
};

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
      return <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />;
    case 'completed':
      return <CheckCircle2 className="w-4 h-4 text-emerald-500" />;
    case 'failed':
      return <XCircle className="w-4 h-4 text-red-500" />;
  }
};

const formatDuration = (startedAt?: number, completedAt?: number): string => {
  if (!startedAt) return '';
  const end = completedAt || Date.now();
  const seconds = Math.floor((end - startedAt) / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${seconds % 60}s`;
};

export const TaskStatusBar: React.FC<TaskStatusBarProps> = ({ projectId, onRetry, onCancel }) => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<string>('all');
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const loadTasks = () => {
      const allTasks = TaskManager.getProjectTasks(projectId);
      setTasks(allTasks.slice(0, 20));
      // 有新运行任务时自动显示
      if (allTasks.some(t => t.status === 'running' || t.status === 'pending')) {
        setDismissed(false);
      }
    };
    loadTasks();
    const unsubscribe = TaskManager.addListener((task) => {
      if (task.projectId === projectId) loadTasks();
    });
    return () => unsubscribe();
  }, [projectId]);

  const { runningTasks, completedTasks, failedTasks, allFilteredTasks } = useMemo(() => {
    const running = tasks.filter(t => t.status === 'pending' || t.status === 'running' || t.status === 'processing');
    const completed = tasks.filter(t => t.status === 'completed');
    const failed = tasks.filter(t => t.status === 'failed');
    let filtered: Task[];
    switch (activeTab) {
      case 'running': filtered = running; break;
      case 'completed': filtered = completed; break;
      case 'failed': filtered = failed; break;
      default: filtered = tasks;
    }
    return { runningTasks: running, completedTasks: completed, failedTasks: failed, allFilteredTasks: filtered };
  }, [tasks, activeTab]);

  // 无任务或已关闭时隐藏
  if (tasks.length === 0 || dismissed) return null;

  const mainTask = runningTasks[0];

  const renderTaskItem = (task: Task) => (
    <div key={task.id} className="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-zinc-800/50">
      {getStatusIcon(task.status)}
      <div className="flex flex-col flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          {task.category && CATEGORY_CONFIG[task.category] && (
            <Tag color={CATEGORY_CONFIG[task.category].color} className="text-[10px] px-1 py-0 leading-tight">
              {CATEGORY_CONFIG[task.category].icon}
              <span className="ml-0.5">{getSubTypeLabel(task.subType)}</span>
            </Tag>
          )}
          <Text className="text-zinc-300 text-sm truncate">
            {task.targetName || getTaskLabel(task)}
          </Text>
        </div>
        {task.result?.stageMessage && (
          <Text className="text-zinc-500 text-xs truncate">{task.result.stageMessage}</Text>
        )}
        {task.error && (
          <Text className="text-red-400 text-xs truncate">{task.error}</Text>
        )}
      </div>
      {(task.status === 'running' || task.status === 'processing') && (
        <>
          <Progress percent={task.progress} size="small" showInfo={false} className="w-14" strokeColor="#10b981" />
          <Text className="text-zinc-500 text-xs w-7">{task.progress}%</Text>
        </>
      )}
      {task.startedAt && (
        <Text className="text-zinc-600 text-xs">{formatDuration(task.startedAt, task.completedAt)}</Text>
      )}
      {task.recoverable && task.attempt && task.attempt > 0 && (
        <Tooltip title={`重试: ${task.attempt}/${task.maxRetries}`}>
          <Tag color="warning" className="text-[10px] px-1 py-0">#{task.attempt}</Tag>
        </Tooltip>
      )}
      <div className="flex items-center gap-1 ml-1">
        {task.status === 'failed' && onRetry && (
          <Button type="text" size="small" icon={<ReloadOutlined />}
            className="text-zinc-500 hover:text-blue-400"
            onClick={(e) => { e.stopPropagation(); onRetry(task); }}
          />
        )}
        {(task.status === 'running' || task.status === 'pending') && onCancel && (
          <Button type="text" size="small" icon={<StopOutlined />}
            className="text-zinc-500 hover:text-red-400"
            onClick={(e) => { e.stopPropagation(); onCancel(task); }}
          />
        )}
      </div>
    </div>
  );

  return (
    <div className="fixed bottom-4 right-4 z-50 w-80 bg-zinc-900/95 backdrop-blur border border-zinc-700 rounded-lg shadow-2xl overflow-hidden">
      {/* 悬浮主状态 */}
      {mainTask ? (
        <div
          className="px-3 py-2.5 flex items-center gap-2 cursor-pointer hover:bg-zinc-800/50"
          onClick={() => setExpanded(!expanded)}
        >
          {getStatusIcon(mainTask.status)}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              {mainTask.category && CATEGORY_CONFIG[mainTask.category] && (
                <Tag color={CATEGORY_CONFIG[mainTask.category].color} className="text-[10px] px-1 py-0">
                  {getSubTypeLabel(mainTask.subType)}
                </Tag>
              )}
              <Text className="text-zinc-300 text-sm truncate">
                {mainTask.targetName || getTaskLabel(mainTask)}
              </Text>
            </div>
            <div className="flex items-center gap-2 mt-1">
              <Progress percent={mainTask.progress} size="small" showInfo={false}
                className="flex-1" strokeColor="#10b981" trailColor="#3f3f46" />
              <Text className="text-zinc-500 text-xs">{mainTask.progress}%</Text>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {runningTasks.length > 1 && (
              <Tag color="blue" className="text-xs">+{runningTasks.length - 1}</Tag>
            )}
            {expanded ? <ChevronDown className="w-4 h-4 text-zinc-500" /> : <ChevronUp className="w-4 h-4 text-zinc-500" />}
          </div>
          <Button type="text" size="small" icon={<X className="w-3.5 h-3.5" />}
            className="text-zinc-500 hover:text-zinc-300 ml-1"
            onClick={(e) => { e.stopPropagation(); setDismissed(true); }}
          />
        </div>
      ) : tasks.length > 0 ? (
        <div
          className="px-3 py-2.5 flex items-center justify-between cursor-pointer hover:bg-zinc-800/50"
          onClick={() => setExpanded(!expanded)}
        >
          <div className="flex items-center gap-2">
            {failedTasks.length > 0 ? (
              <>
                <XCircle className="w-4 h-4 text-red-500" />
                <Text className="text-zinc-400 text-sm">{failedTasks.length} 个失败</Text>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                <Text className="text-zinc-400 text-sm">{completedTasks.length} 个完成</Text>
              </>
            )}
          </div>
          <div className="flex items-center gap-1">
            {expanded ? <ChevronDown className="w-4 h-4 text-zinc-500" /> : <ChevronUp className="w-4 h-4 text-zinc-500" />}
            <Button type="text" size="small" icon={<X className="w-3.5 h-3.5" />}
              className="text-zinc-500 hover:text-zinc-300"
              onClick={(e) => { e.stopPropagation(); setDismissed(true); }}
            />
          </div>
        </div>
      ) : null}

      {/* 展开任务列表 */}
      {expanded && (
        <div className="border-t border-zinc-700">
          <div className="px-2 pt-2">
            <Tabs size="small" activeKey={activeTab} onChange={setActiveTab}
              items={[
                { key: 'all', label: `全部 (${tasks.length})` },
                { key: 'running', label: `进行 (${runningTasks.length})` },
                { key: 'completed', label: `完成 (${completedTasks.length})` },
                { key: 'failed', label: `失败 (${failedTasks.length})` },
              ]}
              className="task-status-tabs [&_.ant-tabs-nav]:!mb-0"
            />
          </div>
          <div className="px-1 pb-2 max-h-[200px] overflow-y-auto custom-scrollbar">
            {allFilteredTasks.length > 0 ? (
              <div className="space-y-0.5">{allFilteredTasks.map(renderTaskItem)}</div>
            ) : (
              <Empty description="暂无任务" className="py-3" imageStyle={{ height: 40 }} />
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default TaskStatusBar;

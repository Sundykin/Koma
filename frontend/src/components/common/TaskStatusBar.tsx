/**
 * 任务状态悬浮通知组件
 * 右下角悬浮显示当前运行中的后台任务进度
 */
import React, { useState, useEffect, useMemo } from 'react';
import { Progress, Typography, Tag, Button, Empty, Tabs, Tooltip } from 'antd';
import { ReloadOutlined, StopOutlined } from '@ant-design/icons';
import { Loader2, CheckCircle2, XCircle, ChevronDown, ChevronUp, FileText, Video, Cpu, Box, Download, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { TaskManager, Task, TaskStatus, TaskCategory, TaskSubType } from '../../services/TaskManager';

const { Text } = Typography;

interface TaskStatusBarProps {
  projectId: string;
  onRetry?: (task: Task) => void;
  onCancel?: (task: Task) => void;
}

const useCategoryConfig = () => {
  const { t } = useTranslation();
  return {
    prompt: { label: t('task.scriptAnalysis'), icon: <FileText className="w-3 h-3" />, color: 'purple' },
    media: { label: t('video.title'), icon: <Video className="w-3 h-3" />, color: 'blue' },
    analysis: { label: t('project.scriptAnalysis'), icon: <Cpu className="w-3 h-3" />, color: 'cyan' },
    asset: { label: t('asset.title'), icon: <Box className="w-3 h-3" />, color: 'orange' },
    script: { label: t('project.scriptAnalysis'), icon: <FileText className="w-3 h-3" />, color: 'green' },
    export: { label: t('common.export'), icon: <Download className="w-3 h-3" />, color: 'gold' },
  } as Record<TaskCategory, { label: string; icon: React.ReactNode; color: string }>;
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
  const { t } = useTranslation();
  const CATEGORY_CONFIG = useCategoryConfig();

  const [tasks, setTasks] = useState<Task[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<string>('all');
  const [dismissed, setDismissed] = useState(false);

  const getSubTypeLabel = (subType?: TaskSubType): string => {
    const labels: Record<string, string> = {
      image: t('storyboard.generateImage'),
      video: t('storyboard.generateVideo'),
      tti: t('settings.tti'),
      itv: t('settings.itv'),
      tts: t('settings.tts'),
      'shot-analysis': t('storyboard.title'),
      'shot-generation': t('storyboard.generateImage'),
      'script-analysis': t('task.scriptAnalysis'),
      'asset-generation': t('task.imageGeneration'),
      'character-extraction': t('asset.character'),
      'prompt-generation': t('storyboard.imagePrompt'),
      'prompt-optimization': t('storyboard.imagePrompt'),
    };
    return labels[subType || ''] || subType || '';
  };

  const getLegacyTypeLabel = (type: string): string => {
    const labels: Record<string, string> = {
      'script-analysis': t('task.scriptAnalysis'),
      'asset-generation': t('task.imageGeneration'),
      'shot-render': t('storyboard.generateImage'),
      'shot-generation': t('storyboard.generateImage'),
      'shot-analysis': t('storyboard.title'),
      'prompt-generation:image': t('storyboard.imagePrompt'),
      'prompt-generation:video': t('storyboard.videoPrompt'),
      'prompt-optimization:image': t('storyboard.imagePrompt'),
      'prompt-optimization:video': t('storyboard.videoPrompt'),
    };
    return labels[type] || type;
  };

  const getTaskLabel = (task: Task): string => {
    if (task.category && task.subType) {
      return `${CATEGORY_CONFIG[task.category]?.label || task.category} - ${getSubTypeLabel(task.subType)}`;
    }
    return getLegacyTypeLabel(task.type);
  };

  useEffect(() => {
    const loadTasks = () => {
      const allTasks = TaskManager.getProjectTasks(projectId);
      setTasks(allTasks.slice(0, 20));
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

  if (tasks.length === 0 || dismissed) return null;

  const mainTask = runningTasks[0];

  const isRunning = (s: TaskStatus) => s === 'running' || s === 'processing' || s === 'pending';

  const renderTaskItem = (task: Task) => (
    <div key={task.id} className="py-1.5 px-2 rounded hover:bg-zinc-800/50">
      {/* 第一行：图标 + 标签 + 名称 + 时间/操作 */}
      <div className="flex items-center gap-2">
        {getStatusIcon(task.status)}
        {task.category && CATEGORY_CONFIG[task.category] && (
          <Tag color={CATEGORY_CONFIG[task.category].color} className="text-[10px] px-1 py-0 leading-tight shrink-0">
            {CATEGORY_CONFIG[task.category].icon}
            <span className="ml-0.5">{getSubTypeLabel(task.subType)}</span>
          </Tag>
        )}
        <Text className="text-zinc-300 text-sm truncate flex-1 min-w-0">
          {task.targetName || getTaskLabel(task)}
        </Text>
        {task.recoverable && task.attempt && task.attempt > 0 && (
          <Tooltip title={`${t('common.retry')}: ${task.attempt}/${task.maxRetries}`}>
            <Tag color="warning" className="text-[10px] px-1 py-0 shrink-0">#{task.attempt}</Tag>
          </Tooltip>
        )}
        {task.startedAt && (
          <Text className="text-zinc-600 text-xs shrink-0 tabular-nums">
            {formatDuration(task.startedAt, task.completedAt)}
          </Text>
        )}
        {task.status === 'failed' && onRetry && (
          <Button type="text" size="small" icon={<ReloadOutlined />}
            className="text-zinc-500 hover:text-blue-400 shrink-0 !w-6 !h-6"
            onClick={(e) => { e.stopPropagation(); onRetry(task); }}
          />
        )}
        {isRunning(task.status) && onCancel && (
          <Button type="text" size="small" icon={<StopOutlined />}
            className="text-zinc-500 hover:text-red-400 shrink-0 !w-6 !h-6"
            onClick={(e) => { e.stopPropagation(); onCancel(task); }}
          />
        )}
      </div>
      {/* 第二行：进度条 / 阶段信息 / 错误 */}
      {isRunning(task.status) ? (
        <div className="mt-1 ml-6 space-y-0.5">
          <div className="flex items-center gap-2">
            <Progress percent={task.progress} size="small" showInfo={false}
              className="flex-1" strokeColor="#10b981" trailColor="#3f3f46" />
            <Text className="text-zinc-500 text-xs shrink-0 tabular-nums">{task.progress}%</Text>
          </div>
          {task.result?.stageMessage && (
            <Text className="text-zinc-500 text-xs truncate block">{task.result.stageMessage}</Text>
          )}
        </div>
      ) : task.status === 'failed' && task.error ? (
        <Text className="text-red-400 text-xs truncate block mt-0.5 ml-6">{task.error}</Text>
      ) : null}
    </div>
  );

  return (
    <div className="fixed bottom-4 right-4 z-50 w-80 bg-zinc-900/95 backdrop-blur border border-zinc-700 rounded-lg shadow-2xl overflow-hidden">
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
                <Text className="text-zinc-400 text-sm">{failedTasks.length} {t('task.failed')}</Text>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                <Text className="text-zinc-400 text-sm">{completedTasks.length} {t('task.completed')}</Text>
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

      {expanded && (
        <div className="border-t border-zinc-700">
          <div className="px-2 pt-2">
            <Tabs size="small" activeKey={activeTab} onChange={setActiveTab}
              items={[
                { key: 'all', label: `${t('common.all')} (${tasks.length})` },
                { key: 'running', label: `${t('task.running')} (${runningTasks.length})` },
                { key: 'completed', label: `${t('task.completed')} (${completedTasks.length})` },
                { key: 'failed', label: `${t('task.failed')} (${failedTasks.length})` },
              ]}
              className="task-status-tabs [&_.ant-tabs-nav]:!mb-0"
            />
          </div>
          <div className="px-1 pb-2 max-h-[200px] overflow-y-auto custom-scrollbar">
            {allFilteredTasks.length > 0 ? (
              <div className="space-y-0.5">{allFilteredTasks.map(renderTaskItem)}</div>
            ) : (
              <Empty description={t('task.noTasks')} className="py-3" imageStyle={{ height: 40 }} />
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default TaskStatusBar;

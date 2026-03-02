/**
 * 任务状态悬浮通知组件
 * 右下角悬浮显示当前运行中的后台任务进度
 */
import React, { useState, useEffect, useMemo, useCallback } from 'react';
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

const CATEGORY_ICON_COLOR: Record<TaskCategory, { icon: React.ReactNode; color: string }> = {
  prompt: { icon: <FileText className="w-3 h-3" />, color: 'purple' },
  media: { icon: <Video className="w-3 h-3" />, color: 'blue' },
  analysis: { icon: <Cpu className="w-3 h-3" />, color: 'cyan' },
  asset: { icon: <Box className="w-3 h-3" />, color: 'orange' },
  script: { icon: <FileText className="w-3 h-3" />, color: 'green' },
  export: { icon: <Download className="w-3 h-3" />, color: 'gold' },
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
  const { t } = useTranslation('common');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<string>('all');
  const [dismissed, setDismissed] = useState(false);

  const getCategoryLabel = useCallback((category: TaskCategory): string => {
    return t(`task.category.${category}`);
  }, [t]);

  const getSubTypeLabel = useCallback((subType?: TaskSubType): string => {
    const keyMap: Record<string, string> = {
      image: 'image', video: 'video', tti: 'tti', itv: 'itv',
      tts: 'tts', 'shot-analysis': 'shotAnalysis', 'shot-generation': 'shotGeneration',
      'script-analysis': 'scriptAnalysis', 'asset-generation': 'assetGeneration',
      'character-extraction': 'characterExtraction', 'prompt-generation': 'promptGeneration',
      'prompt-optimization': 'promptOptimization',
    };
    const key = keyMap[subType || ''];
    return key ? t(`task.subtype.${key}`) : subType || '';
  }, [t]);

  const getLegacyTypeLabel = useCallback((type: string): string => {
    const keyMap: Record<string, string> = {
      'script-analysis': 'scriptAnalysis', 'asset-generation': 'assetGeneration',
      'shot-render': 'shotRender', 'shot-generation': 'shotGeneration',
      'shot-analysis': 'shotAnalysis', 'prompt-generation:image': 'promptImage',
      'prompt-generation:video': 'promptVideo', 'prompt-optimization:image': 'optimizePromptImage',
      'prompt-optimization:video': 'optimizePromptVideo',
    };
    const key = keyMap[type];
    return key ? t(`task.subtype.${key}`) : type;
  }, [t]);

  const getTaskLabel = useCallback((task: Task): string => {
    if (task.category && task.subType) {
      return `${getCategoryLabel(task.category)} - ${getSubTypeLabel(task.subType)}`;
    }
    return getLegacyTypeLabel(task.type);
  }, [getCategoryLabel, getSubTypeLabel, getLegacyTypeLabel]);

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
          {task.category && CATEGORY_ICON_COLOR[task.category] && (
            <Tag color={CATEGORY_ICON_COLOR[task.category].color} className="text-[10px] px-1 py-0 leading-tight">
              {CATEGORY_ICON_COLOR[task.category].icon}
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
        <Tooltip title={t('task.retryTooltip', { attempt: task.attempt, maxRetries: task.maxRetries })}>
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
              {mainTask.category && CATEGORY_ICON_COLOR[mainTask.category] && (
                <Tag color={CATEGORY_ICON_COLOR[mainTask.category].color} className="text-[10px] px-1 py-0">
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
                <Text className="text-zinc-400 text-sm">{t('task.summaryFailed', { count: failedTasks.length })}</Text>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                <Text className="text-zinc-400 text-sm">{t('task.summaryCompleted', { count: completedTasks.length })}</Text>
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
                { key: 'all', label: t('task.tabAll', { count: tasks.length }) },
                { key: 'running', label: t('task.tabRunning', { count: runningTasks.length }) },
                { key: 'completed', label: t('task.tabCompleted', { count: completedTasks.length }) },
                { key: 'failed', label: t('task.tabFailed', { count: failedTasks.length }) },
              ]}
              className="task-status-tabs [&_.ant-tabs-nav]:!mb-0"
            />
          </div>
          <div className="px-1 pb-2 max-h-[200px] overflow-y-auto custom-scrollbar">
            {allFilteredTasks.length > 0 ? (
              <div className="space-y-0.5">{allFilteredTasks.map(renderTaskItem)}</div>
            ) : (
              <Empty description={t('task.empty')} className="py-3" imageStyle={{ height: 40 }} />
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default TaskStatusBar;

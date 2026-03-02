/**
 * 工作台外壳
 * 统一的短剧制作工作台，替代原来的 ProjectOverview + EditorView
 * 包含：Header + StageNav + 5个阶段组件
 */
import React, { Suspense, useState, useCallback, useEffect, useRef } from 'react';
import { Spin, App, Modal } from 'antd';
import { WorkspaceHeader } from './WorkspaceHeader';
import { StageNavigation, type WorkspaceStage, type StageStatus } from './StageNavigation';
import { useEpisodeData } from '../../hooks/useEpisodeData';
import { useStageStatus } from '../../hooks/useStageStatus';
import { loadProject, saveProject, loadCharacters, loadScenes, loadProps, loadEpisodeShots } from '../../store/projectStore';
import { loadSettings } from '../../store/globalStore';
import { Film } from 'lucide-react';
import { TaskManager } from '../../services/TaskManager';
import { AutoGenerateWorkflow, type WorkflowProgress } from '../../workflow/autoGenerateWorkflow';

// 懒加载各阶段组件
const StoryStage = React.lazy(() => import('./stages/StoryStage'));
const ScriptStage = React.lazy(() => import('./stages/ScriptStage'));
const StoryboardStage = React.lazy(() => import('./stages/StoryboardStage'));
const VideoStage = React.lazy(() => import('./stages/VideoStage'));
const EditStage = React.lazy(() => import('./stages/EditStage'));

const StageFallback = () => (
  <div className="flex h-full items-center justify-center">
    <Spin size="large" tip="加载中..."><div className="p-12" /></Spin>
  </div>
);

interface WorkspaceShellProps {
  projectId: string;
  projectTitle: string;
  projectConfig: {
    llmConfigId?: string;
    ttiConfigId?: string;
    itvConfigId?: string;
    ttsConfigId?: string;
    theme?: string;
    stylePrompt?: string;
  };
  onBack: () => void;
  onProjectUpdate: (updates: Record<string, any>) => void;
}

export const WorkspaceShell: React.FC<WorkspaceShellProps> = ({
  projectId,
  projectTitle,
  projectConfig,
  onBack,
  onProjectUpdate,
}) => {
  const { message } = App.useApp();
  const [stage, setStage] = useState<WorkspaceStage>('story');
  const [title, setTitle] = useState(projectTitle);

  // 剧集管理
  const {
    episodes,
    currentEpisode,
    loading: episodesLoading,
    refresh: refreshEpisodes,
    selectEpisode,
    addEpisode,
    updateEpisode,
    removeEpisode,
  } = useEpisodeData(projectId);

  // 阶段状态
  const { statuses, refreshStatuses } = useStageStatus(projectId, currentEpisode);

  // 一键成片
  const [autoGenProgress, setAutoGenProgress] = useState<WorkflowProgress | null>(null);
  const autoGenRef = useRef<AutoGenerateWorkflow | null>(null);

  // 初始化 TaskManager
  useEffect(() => {
    TaskManager.initialize(projectId);
    return () => { TaskManager.dispose(); };
  }, [projectId]);

  // 自动选中第一集
  useEffect(() => {
    if (episodes.length > 0 && !currentEpisode) {
      selectEpisode(episodes[0].id);
    }
  }, [episodes, currentEpisode, selectEpisode]);

  const handleConfigChange = useCallback(async (key: string, value: string | undefined) => {
    try {
      const projectMeta = await loadProject(projectId);
      if (projectMeta) {
        (projectMeta as any)[key] = value;
        await saveProject(projectMeta);
        onProjectUpdate({ [key]: value });
      }
    } catch (err: any) {
      message.error(`更新配置失败: ${err.message}`);
    }
  }, [projectId, onProjectUpdate, message]);

  const handleTitleChange = useCallback((newTitle: string) => {
    setTitle(newTitle);
    onProjectUpdate({ title: newTitle });
  }, [onProjectUpdate]);

  const handleEpisodeCreate = useCallback(async () => {
    const nextNumber = episodes.length > 0 ? Math.max(...episodes.map(e => e.number)) + 1 : 1;
    const ep = await addEpisode({
      number: nextNumber,
      title: `第${nextNumber}集`,
    });
    if (ep) {
      selectEpisode(ep.id);
      message.success('剧集创建成功');
    }
  }, [episodes, addEpisode, selectEpisode, message]);

  const handleEpisodeDelete = useCallback(async (episodeId: string) => {
    await removeEpisode(episodeId);
    message.success('剧集已删除');
  }, [removeEpisode, message]);

  const handleAutoGenerate = useCallback(() => {
    if (!currentEpisode) {
      message.warning('请先选择一个剧集');
      return;
    }
    if (!currentEpisode.scriptText?.trim()) {
      message.warning('请先编写剧本');
      return;
    }
    const workflow = new AutoGenerateWorkflow({
      projectId,
      episodeId: currentEpisode.id,
      scriptText: currentEpisode.scriptText || '',
      projectConfigIds: {
        llmConfigId: projectConfig.llmConfigId,
        ttiConfigId: projectConfig.ttiConfigId,
        itvConfigId: projectConfig.itvConfigId,
        ttsConfigId: projectConfig.ttsConfigId,
      },
      theme: projectConfig.theme,
      stylePrompt: projectConfig.stylePrompt,
      onProgress: setAutoGenProgress,
    });
    autoGenRef.current = workflow;
    workflow.execute().then((success) => {
      if (success) {
        message.success('一键成片完成');
        refreshStatuses();
      }
      autoGenRef.current = null;
    });
  }, [projectId, currentEpisode, projectConfig, message, refreshStatuses]);

  // 阶段变更后刷新状态
  const handleStageChange = useCallback((newStage: WorkspaceStage) => {
    setStage(newStage);
    refreshStatuses();
  }, [refreshStatuses]);

  // 向下传递给阶段组件的通用 props
  const stageProps = {
    projectId,
    projectConfig,
    episode: currentEpisode,
    onEpisodeUpdate: updateEpisode,
    onRefreshStatuses: refreshStatuses,
    onStageChange: handleStageChange,
  };

  return (
    <div className="relative flex flex-col h-full bg-zinc-950">
      {/* Header */}
      <WorkspaceHeader
        projectId={projectId}
        projectTitle={title}
        projectConfig={projectConfig}
        episodes={episodes}
        currentEpisodeId={currentEpisode?.id || null}
        onTitleChange={handleTitleChange}
        onConfigChange={handleConfigChange}
        onEpisodeSelect={selectEpisode}
        onEpisodeCreate={handleEpisodeCreate}
        onEpisodeDelete={handleEpisodeDelete}
        onBack={onBack}
        onAutoGenerate={handleAutoGenerate}
        autoGenerating={!!autoGenProgress && !autoGenProgress.completed}
      />

      {/* Stage Navigation */}
      <StageNavigation
        currentStage={stage}
        statuses={statuses}
        onStageChange={handleStageChange}
      />

      {/* Stage Content */}
      <div className="flex-1 overflow-hidden">
        {!currentEpisode && episodes.length === 0 ? (
          // 零状态：引导创建第一集
          <div className="flex h-full items-center justify-center">
            <div className="text-center space-y-4">
              <div className="w-16 h-16 mx-auto rounded-2xl bg-zinc-800/80 flex items-center justify-center">
                <Film className="w-8 h-8 text-zinc-600" />
              </div>
              <h2 className="text-lg font-semibold text-zinc-200">开始创作</h2>
              <p className="text-sm text-zinc-500">创建第一个剧集，开始你的短剧制作之旅</p>
              <button
                onClick={handleEpisodeCreate}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-medium transition-colors"
              >
                创建第一集
              </button>
            </div>
          </div>
        ) : (
          <Suspense fallback={<StageFallback />}>
            {stage === 'story' && <StoryStage {...stageProps} episodes={episodes} onRefreshEpisodes={refreshEpisodes} onSelectEpisode={selectEpisode} />}
            {stage === 'script' && <ScriptStage {...stageProps} />}
            {stage === 'storyboard' && <StoryboardStage {...stageProps} />}
            {stage === 'video' && <VideoStage {...stageProps} />}
            {stage === 'edit' && <EditStage {...stageProps} />}
          </Suspense>
        )}
      </div>

      {/* 一键成片进度浮层 */}
      {autoGenProgress && (
        <div className="absolute bottom-4 right-4 w-80 bg-zinc-900 border border-zinc-700 rounded-lg p-4 shadow-xl z-50">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-zinc-200">
              {autoGenProgress.completed ? '成片完成' : '一键成片'}
            </span>
            <button
              onClick={autoGenProgress.completed
                ? () => setAutoGenProgress(null)
                : () => { autoGenRef.current?.abort(); setAutoGenProgress(null); }
              }
              className="text-xs text-zinc-500 hover:text-zinc-300"
            >
              {autoGenProgress.completed ? '关闭' : '取消'}
            </button>
          </div>
          <div className="w-full bg-zinc-800 rounded-full h-1.5 mb-1">
            <div
              className={`h-1.5 rounded-full transition-all ${autoGenProgress.error ? 'bg-red-500' : autoGenProgress.completed ? 'bg-emerald-500' : 'bg-emerald-500'}`}
              style={{ width: `${Math.round(((autoGenProgress.stepIndex + (autoGenProgress.stepProgress / 100)) / autoGenProgress.totalSteps) * 100)}%` }}
            />
          </div>
          <div className="text-xs text-zinc-400">{autoGenProgress.message}</div>
          {autoGenProgress.error && (
            <div className="text-xs text-red-400 mt-1">{autoGenProgress.error}</div>
          )}
        </div>
      )}
    </div>
  );
};

export default WorkspaceShell;

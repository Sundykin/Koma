import React, { useState, useEffect, useCallback, useMemo, useRef, Suspense, lazy } from 'react';
import { Project, ScriptAnalysisResult, EditorStep, AppSettings, Episode, EpisodeStepProgress, AsyncTask } from './types';
import { ProjectList, CreateProjectModal, ProjectSettingsModal } from './components/project';
import type { MentionItem } from './editor';
import { getCharacterCostumePhotoSource } from './utils/mediaSelectors';
import { getMediaAssetDisplaySource } from './types';
import { WindowControls } from './components/common';
import { ErrorBoundary } from './components/common';
import { TaskStatusBar } from './components/common/TaskStatusBar';
import { Sidebar } from './components/common/Sidebar';
import type { AppView } from './components/common/Sidebar';
import { useProjects } from './hooks/useProjects';
import { TaskManager } from './services/TaskManager';
import {
  deletePendingMediaTasks,
  failPendingMediaTasks,
  inspectPendingMediaTasks,
  recoverProjectPendingMediaTasks,
  setCurrentProject,
  USER_INTERRUPTED_REASON,
} from './store/projectOpenService';
import { loadCharacters, loadScenes, loadProps, loadShots, loadEpisode, loadEpisodeShots, saveEpisode } from './store/projectStore';
import { Spin, App as AntApp, Typography, Button } from 'antd';
import { LockOutlined } from '@ant-design/icons';
import {
  DEV_TEST_PROJECT,
  DEV_TEST_ANALYSIS,
  DEFAULT_SCRIPT,
  DEFAULT_SETTINGS,
  formatTimeAgo,
} from './constants/appConstants';
import { getThumbnailUrl } from './constants/dimensions';
import { createLogger } from './store/logger';
import { loadSettings } from './store/globalStore';
import { activationService, ActivationInfo } from './services/activationService';
import { resolveEpisodeEditorEntry, type EpisodeEditorEntryOptions } from './workflow/episodeEditorEntry';
import { useTranslation } from 'react-i18next';

const { Title, Paragraph, Text } = Typography;

const logger = createLogger('App');

type PendingMediaTaskPromptState = {
  projectId: string;
  tasks: AsyncTask[];
};

type PendingMediaTaskAction = 'recover' | 'fail' | 'delete';

const MEDIA_TASK_TYPE_LABELS: Record<AsyncTask['type'], string> = {
  tti: '图片生成',
  itv: '图生视频',
  tts: '语音生成',
  'character-extraction': '角色提取',
};

function buildPendingMediaTaskSignature(projectId: string, tasks: AsyncTask[]): string {
  const taskIds = tasks.map(task => task.id).sort().join(',');
  return `${projectId}:${taskIds}`;
}

function summarizePendingMediaTasks(tasks: AsyncTask[]): string {
  const counts = new Map<string, number>();
  for (const task of tasks) {
    const label = MEDIA_TASK_TYPE_LABELS[task.type] || '媒体任务';
    counts.set(label, (counts.get(label) || 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([label, count]) => `${count} 个${label}`)
    .join('、');
}

// 懒加载重型组件
const EditorView = lazy(() => import('./components/editor/EditorView').then(m => ({ default: m.EditorView })));
const SettingsPage = lazy(() => import('./components/settings').then(m => ({ default: m.SettingsPage })));
const PluginManager = lazy(() => import('./components/plugins').then(m => ({ default: m.PluginManager })));
const PluginHost = lazy(() => import('./components/plugins').then(m => ({ default: m.PluginHost })));
const ChatPage = lazy(() => import('./components/chat').then(m => ({ default: m.ChatPage })));
const ProjectOverview = lazy(() => import('./components/project/ProjectOverview').then(m => ({ default: m.ProjectOverview })));
const LinghuiPage = lazy(() => import('./components/linghui').then(m => ({ default: m.LinghuiPage })));

// 加载中占位组件
const ViewLoading: React.FC<{ tip?: string }> = ({ tip = '加载中...' }) => (
  <div className="flex h-full items-center justify-center bg-zinc-950" style={{ whiteSpace: 'nowrap' }}>
    <Spin size="large" description={tip}><div className="p-12" /></Spin>
  </div>
);

function isDisplayableProject(project: unknown): project is NonNullable<ReturnType<typeof useProjects>['projects'][number]> {
  if (!project || typeof project !== 'object') return false;
  const meta = project as { id?: unknown; title?: unknown; genre?: unknown; mode?: unknown; updatedAt?: unknown };
  return (
    typeof meta.id === 'string' &&
    meta.id.length > 0 &&
    typeof meta.title === 'string' &&
    typeof meta.genre === 'string' &&
    (meta.mode === 'drama' || meta.mode === 'narration') &&
    typeof meta.updatedAt === 'number'
  );
}

const AppContent: React.FC = () => {
  const { message } = AntApp.useApp();
  const { t } = useTranslation();

  // 开发模式检测
  const urlParams = new URLSearchParams(window.location.search);
  const devMode = urlParams.get('dev');
  const isVideoDevMode = devMode === 'video';

  // 激活状态
  const [activationInfo, setActivationInfo] = useState<ActivationInfo | null>(null);
  const [activationLoading, setActivationLoading] = useState(true);

  useEffect(() => {
    activationService.getActivationInfo()
      .then(info => setActivationInfo(info))
      .finally(() => setActivationLoading(false));
  }, []);

  const activationLocked = !activationLoading && !activationInfo;

  // 项目管理 Hook
  const {
    projects,
    loading: projectsLoading,
    createProject: createProjectAPI,
    deleteProject: deleteProjectAPI,
    updateProject: updateProjectAPI,
  } = useProjects();

  const [view, setView] = useState<AppView>(isVideoDevMode ? 'editor' : 'projects');
  const [activeProject, setActiveProject] = useState<Project | null>(isVideoDevMode ? DEV_TEST_PROJECT : null);
  const [editorStep, setEditorStep] = useState<EditorStep>(isVideoDevMode ? 'video' : 'assets');
  const [activeEpisode, setActiveEpisode] = useState<Episode | null>(null);
  const [stepProgress, setStepProgress] = useState<EpisodeStepProgress>({
    assets: 'pending', storyboard: 'pending', video: 'pending',
  });
  const [appSettings, setAppSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isProjectSettingsOpen, setIsProjectSettingsOpen] = useState(false);
  const [scriptText, setScriptText] = useState(DEFAULT_SCRIPT);
  const [analysisData, setAnalysisData] = useState<ScriptAnalysisResult | null>(isVideoDevMode ? DEV_TEST_ANALYSIS : null);
  const lastNonLinghuiViewRef = useRef<AppView>('projects');
  const promptedPendingMediaSignaturesRef = useRef<Set<string>>(new Set());
  const [pendingMediaPrompt, setPendingMediaPrompt] = useState<PendingMediaTaskPromptState | null>(null);
  const [pendingMediaAction, setPendingMediaAction] = useState<PendingMediaTaskAction | null>(null);
  const [taskStatusRefreshKey, setTaskStatusRefreshKey] = useState(0);

  const reloadSettings = useCallback(async () => {
    try {
      const nextSettings = await loadSettings();
      setAppSettings(nextSettings);
    } catch (error) {
      logger.error('加载全局设置失败', error);
    }
  }, []);

  useEffect(() => {
    void reloadSettings();
  }, [reloadSettings]);

  // 初始化 TaskManager，并同步当前项目上下文
  useEffect(() => {
    if (activeProject) {
      setCurrentProject(activeProject.id);
      TaskManager.initialize(activeProject.id).catch(err => {
        logger.error('TaskManager 初始化失败', err);
      });
    } else {
      setCurrentProject(null);
    }

    return () => {
      TaskManager.dispose();
      setCurrentProject(null);
    };
  }, [activeProject?.id]);

  // 启动/激活项目时检查未完成媒体任务，由用户决定是否恢复
  useEffect(() => {
    if (!activeProject || activationLocked) return;

    let disposed = false;
    const projectId = activeProject.id;

    inspectPendingMediaTasks(projectId)
      .then(tasks => {
        if (disposed || tasks.length === 0) return;

        const signature = buildPendingMediaTaskSignature(projectId, tasks);
        if (promptedPendingMediaSignaturesRef.current.has(signature)) return;

        promptedPendingMediaSignaturesRef.current.add(signature);
        setPendingMediaPrompt({ projectId, tasks });
      })
      .catch(err => {
        logger.error('检查未完成媒体任务失败', err);
      });

    return () => {
      disposed = true;
    };
  }, [activeProject?.id, activationLocked]);

  // 从存储加载分析数据
  const loadAnalysisData = useCallback(async (projectId: string) => {
    try {
      const [characters, scenes, props, shots] = await Promise.all([
        loadCharacters(projectId), loadScenes(projectId), loadProps(projectId), loadShots(projectId),
      ]);
      if (characters.length > 0 || scenes.length > 0 || shots.length > 0) {
        setAnalysisData({ characters, scenes, props, shots });
      }
    } catch (err) {
      logger.error('加载分析数据失败', err);
    }
  }, []);

  // mentionItems
  const mentionItems: MentionItem[] = useMemo(() => {
    const items: MentionItem[] = [];
    const characters = Array.isArray(analysisData?.characters) ? analysisData!.characters.filter(Boolean) : [];
    const scenes = Array.isArray(analysisData?.scenes) ? analysisData!.scenes.filter(Boolean) : [];
    const props = Array.isArray(analysisData?.props) ? analysisData!.props.filter(Boolean) : [];

    // 统一：编辑器里 @mention 只使用项目内资产 ID；高亮/补全覆盖角色/场景/道具。
    for (const char of characters) {
      items.push({
        id: char.id,
        type: 'char' as const,
        name: char.name,
        description: char.prompt,
        previewImage: getCharacterCostumePhotoSource(char),
      });
    }
    for (const scene of scenes) {
      items.push({
        id: scene.id,
        type: 'scene' as const,
        name: scene.name,
        description: scene.prompt,
        previewImage: getMediaAssetDisplaySource(scene.media?.previewImage),
      });
    }
    for (const prop of props) {
      items.push({
        id: prop.id,
        type: 'prop' as const,
        name: prop.name,
        description: prop.prompt,
        previewImage: getMediaAssetDisplaySource(prop.media?.previewImage),
      });
    }

    return items;
  }, [analysisData?.characters, analysisData?.scenes, analysisData?.props]);

  // 监听任务完成
  useEffect(() => {
    if (!activeProject) return;
    const unsubscribe = TaskManager.addListener((task) => {
      if (task.projectId !== activeProject.id) return;
      if (task.type === 'script-analysis' && task.status === 'completed') {
        message.success('剧本解析完成');
        loadAnalysisData(activeProject.id);
      }
    });
    return () => unsubscribe();
  }, [activeProject?.id, message, loadAnalysisData]);

  // 进入编辑器视图时加载数据
  useEffect(() => {
    if (view === 'editor' && activeProject && !isVideoDevMode) {
      loadAnalysisData(activeProject.id);
    }
  }, [view, activeProject?.id, isVideoDevMode, loadAnalysisData]);

  useEffect(() => {
    if (view !== 'linghui') {
      lastNonLinghuiViewRef.current = view;
    }
    // 锁定状态禁止留在灵绘，且关闭所有残留弹窗/任务状态
    if (activationLocked) {
      setIsCreateModalOpen(false);
      setIsProjectSettingsOpen(false);
      if (view === 'linghui') {
        setView('projects');
      }
    }
  }, [view, activationLocked]);

  // 切换到视频步骤时加载 shots
  useEffect(() => {
    if (editorStep === 'video' && activeProject && activeEpisode && !isVideoDevMode) {
      loadEpisodeShots(activeProject.id, activeEpisode.id).then(shots => {
        if (shots.length > 0) {
          setAnalysisData(prev => ({
            characters: prev?.characters || [], scenes: prev?.scenes || [],
            props: prev?.props || [], shots,
          }));
        }
      }).catch(err => {
        logger.error('加载剧集镜头失败', err);
      });
    }
  }, [editorStep, activeProject?.id, activeEpisode?.id, isVideoDevMode]);

  // 转换项目显示格式
  const displayProjects: Project[] = projects
    .filter(isDisplayableProject)
    .map(p => ({
    id: p.id, title: p.title, genre: p.genre, mode: p.mode,
    episodes: p.episodes ?? 0, lastEdited: formatTimeAgo(p.updatedAt),
    thumbnail: p.thumbnail || getThumbnailUrl(p.id),
    status: p.status || 'script',
    mediaSelections: p.mediaSelections,
    stylePresetId: p.stylePresetId,
    styleSnapshot: p.styleSnapshot,
    theme: p.theme,
    stylePrompt: p.stylePrompt,
  }));

  const handleEnterVideoTest = () => {
    setActiveProject(DEV_TEST_PROJECT);
    setAnalysisData(DEV_TEST_ANALYSIS);
    setEditorStep('video');
    setView('editor');
  };

  const handleCreateProject = async (data: { title: string; mode: 'drama' | 'narration'; stylePresetId: string }) => {
    try {
      const created = await createProjectAPI({
        title: data.title,
        mode: data.mode,
        genre: data.mode === 'drama' ? '剧情' : '解说',
        stylePresetId: data.stylePresetId,
      });
      const newProject: Project = {
        id: created.id, title: created.title, genre: created.genre, mode: created.mode,
        episodes: created.episodes || 1, lastEdited: '刚刚',
        thumbnail: created.thumbnail || getThumbnailUrl(created.id),
        status: created.status || 'script',
        stylePresetId: created.stylePresetId,
        styleSnapshot: created.styleSnapshot,
        theme: created.theme,
        stylePrompt: created.stylePrompt,
      };
      setActiveProject(newProject);
      setActiveEpisode(null);
      setView('overview');
      setScriptText('');
      setAnalysisData(null);
      setIsCreateModalOpen(false);
      message.success('项目创建成功');
    } catch (err: any) {
      message.error(err.message || '创建项目失败');
    }
  };

  const handleSelectProject = (id: string) => {
    const proj = displayProjects.find(p => p.id === id);
    if (proj) {
      setActiveProject(proj);
      setActiveEpisode(null);
      setView('overview');
      setScriptText('');
      setAnalysisData(null);
    }
  };

  const handleEnterEpisode = useCallback(async (episode: Episode, options: EpisodeEditorEntryOptions = {}) => {
    const latestEpisode = activeProject
      ? await loadEpisode(activeProject.id, episode.id).catch(err => {
        logger.error('加载最新剧集失败', err);
        return null;
      })
      : null;
    const targetEpisode = latestEpisode || episode;

    setActiveEpisode(targetEpisode);
    setView('editor');
    const entry = resolveEpisodeEditorEntry(targetEpisode.stepProgress, options);
    setStepProgress(entry.stepProgress);
    setEditorStep(entry.initialStep);
    setScriptText(targetEpisode.scriptText || '');
    setAnalysisData(null);
  }, [activeProject]);

  const markStepCompleted = useCallback((step: EditorStep) => {
    setStepProgress(prev => {
      const updated = { ...prev, [step]: 'completed' as const };
      if (activeProject && activeEpisode) {
        setActiveEpisode({ ...activeEpisode, stepProgress: updated });
        saveEpisode(activeProject.id, activeEpisode.id, { stepProgress: updated }).catch(err => logger.error('保存剧集失败', err));
      }
      return updated;
    });
  }, [activeProject, activeEpisode]);

  const handleStepChangeWithMark = useCallback((targetStep: EditorStep) => {
    const stepOrder: EditorStep[] = ['assets', 'storyboard', 'video'];
    const currentIndex = stepOrder.indexOf(editorStep);
    const targetIndex = stepOrder.indexOf(targetStep);
    if (targetIndex > currentIndex) {
      markStepCompleted(editorStep);
    }
    setEditorStep(targetStep);
  }, [editorStep, markStepCompleted]);

  const handleDeleteProject = async (id: string) => {
    try {
      await deleteProjectAPI(id);
      message.success('项目已删除');
    } catch (err: any) {
      message.error(err.message || '删除项目失败');
    }
  };

  const handleProjectSettingsSave = async (updates: Partial<Project>) => {
    if (!activeProject) return;
    try {
      await updateProjectAPI(activeProject.id, updates);
      setActiveProject({ ...activeProject, ...updates });
      message.success('项目设置已保存');
    } catch (err: any) {
      message.error(err.message || '保存失败');
    }
  };

  const refreshTaskStatusBar = useCallback(() => {
    setTaskStatusRefreshKey(key => key + 1);
  }, []);

  const handleRecoverPendingMediaTasks = useCallback(() => {
    if (!pendingMediaPrompt || pendingMediaAction) return;

    const { projectId, tasks } = pendingMediaPrompt;
    setPendingMediaAction('recover');
    setPendingMediaPrompt(null);
    setPendingMediaAction(null);
    message.loading(`正在后台恢复 ${tasks.length} 个未完成媒体任务...`);

    void recoverProjectPendingMediaTasks(projectId)
      .then(result => {
        refreshTaskStatusBar();
        if (result.recovered > 0) {
          message.success(`已恢复 ${result.recovered} 个媒体任务`);
        } else if (result.failed > 0) {
          message.warning(`媒体任务恢复完成，${result.failed} 个任务恢复失败`);
        } else {
          message.info('没有需要恢复的媒体任务');
        }
      })
      .catch(err => {
        refreshTaskStatusBar();
        logger.error('恢复未完成媒体任务失败', err);
        message.error(err?.message || '恢复未完成媒体任务失败');
      });
  }, [pendingMediaPrompt, pendingMediaAction, message, refreshTaskStatusBar]);

  const handleFailPendingMediaTasks = useCallback(async () => {
    if (!pendingMediaPrompt || pendingMediaAction) return;

    setPendingMediaAction('fail');
    try {
      const failedCount = await failPendingMediaTasks(
        pendingMediaPrompt.projectId,
        pendingMediaPrompt.tasks,
        USER_INTERRUPTED_REASON
      );
      setPendingMediaPrompt(null);
      refreshTaskStatusBar();
      message.warning(`已将 ${failedCount} 个未完成媒体任务标记为失败`);
    } catch (err: any) {
      logger.error('标记未完成媒体任务失败', err);
      message.error(err?.message || '标记任务失败失败');
    } finally {
      setPendingMediaAction(null);
    }
  }, [pendingMediaPrompt, pendingMediaAction, message, refreshTaskStatusBar]);

  const handleDeletePendingMediaTasks = useCallback(async () => {
    if (!pendingMediaPrompt || pendingMediaAction) return;

    setPendingMediaAction('delete');
    try {
      const deletedCount = await deletePendingMediaTasks(pendingMediaPrompt.projectId, pendingMediaPrompt.tasks);
      setPendingMediaPrompt(null);
      refreshTaskStatusBar();
      message.success(`已删除 ${deletedCount} 条本地任务记录；这不会取消远端生成`);
    } catch (err: any) {
      logger.error('删除未完成媒体任务记录失败', err);
      message.error(err?.message || '删除本地任务记录失败');
    } finally {
      setPendingMediaAction(null);
    }
  }, [pendingMediaPrompt, pendingMediaAction, message, refreshTaskStatusBar]);

  const pendingMediaTaskSummary = pendingMediaPrompt
    ? summarizePendingMediaTasks(pendingMediaPrompt.tasks)
    : '';
  const ActivationLockedView = (
    <div className="h-full flex flex-col items-center justify-center p-8 bg-zinc-950">
      <div className="max-w-md w-full bg-zinc-900/50 border border-zinc-800 rounded-3xl p-10 flex flex-col items-center text-center shadow-2xl">
        <div className="w-20 h-20 bg-emerald-500/10 rounded-full flex items-center justify-center mb-6">
          <LockOutlined className="text-4xl text-emerald-500" />
        </div>
        <Title level={3} className="!text-zinc-100 !mb-4">{t('activation.lockedTitle')}</Title>
        <Paragraph className="text-zinc-400 text-base leading-relaxed mb-8">
          {t('activation.lockedDescription')}
        </Paragraph>
        <div className="w-full p-5 bg-zinc-800/50 rounded-2xl border border-zinc-700/50">
          <Text className="text-zinc-500 text-sm">
            {t('activation.lockedHint')}
          </Text>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col h-screen bg-zinc-950 text-zinc-100 font-sans selection:bg-emerald-500/30">
      <WindowControls />
      <div className="flex flex-1 min-h-0">
        {(activationLocked || view !== 'linghui') && (
          <Sidebar
            view={view}
            activeProject={activeProject}
            activeEpisode={activeEpisode}
            onViewChange={setView}
            onEnterVideoTest={handleEnterVideoTest}
            onConfigChange={reloadSettings}
            activationInfo={activationInfo}
            activationLocked={activationLocked}
            onActivationChange={setActivationInfo}
          />
        )}
        <div className="flex-1 flex flex-col min-w-0 transition-all duration-300">
          <main className="flex-1 overflow-hidden relative bg-zinc-950">
            {activationLoading ? (
              <div className="flex h-full items-center justify-center">
                <Spin size="large" description="检查激活状态..."><div className="p-12" /></Spin>
              </div>
            ) : activationLocked ? (
              ActivationLockedView
            ) : (
              <>
                {view === 'projects' && (
                  projectsLoading ? (
                    <div className="flex h-full items-center justify-center">
                      <Spin size="large" description="加载项目列表..."><div className="p-12" /></Spin>
                    </div>
                  ) : (
                    <ProjectList
                      projects={displayProjects}
                      onSelectProject={handleSelectProject}
                      onCreateProject={() => setIsCreateModalOpen(true)}
                      onDeleteProject={handleDeleteProject}
                    />
                  )
                )}
                {view === 'settings' && (
                  <Suspense fallback={<ViewLoading tip="加载设置页面..." />}>
                    <SettingsPage settings={appSettings} onSave={setAppSettings} />
                  </Suspense>
                )}
                {view === 'plugins' && (
                  <Suspense fallback={<ViewLoading tip="加载插件管理..." />}>
                    <PluginManager />
                  </Suspense>
                )}
                {view === 'chat' && (
                  <Suspense fallback={<ViewLoading tip="加载对话页面..." />}>
                    <ChatPage />
                  </Suspense>
                )}
                {view === 'linghui' && (
                  <Suspense fallback={<ViewLoading tip="加载灵绘工作台..." />}>
                    <LinghuiPage
                      onExit={() => setView(lastNonLinghuiViewRef.current === 'linghui' ? 'projects' : lastNonLinghuiViewRef.current)}
                    />
                  </Suspense>
                )}
                {view.startsWith('plugin:') && (
                  <Suspense fallback={<ViewLoading tip="加载插件..." />}>
                    <PluginHost pluginId={view.replace('plugin:', '')} />
                  </Suspense>
                )}
                {view === 'overview' && activeProject && (
                  <Suspense fallback={<ViewLoading tip="加载中..." />}>
                    <ProjectOverview
                      project={activeProject}
                      onEnterEpisode={handleEnterEpisode}
                      onProjectUpdate={(updates) => setActiveProject({ ...activeProject, ...updates })}
                      onOpenProjectSettings={() => setIsProjectSettingsOpen(true)}
                    />
                  </Suspense>
                )}
                {view === 'editor' && activeProject && (
                  <Suspense fallback={<ViewLoading tip="加载中..." />}>
                    <EditorView
                      activeProject={activeProject}
                      activeEpisode={activeEpisode}
                      editorStep={editorStep}
                      stepProgress={stepProgress}
                      scriptText={scriptText}
                      analysisData={analysisData}
                      appSettings={appSettings}
                      mentionItems={mentionItems}
                      onStepChange={setEditorStep}
                      onStepChangeWithMark={handleStepChangeWithMark}
                      onViewChange={setView}
                      onOpenProjectSettings={() => setIsProjectSettingsOpen(true)}
                    />
                  </Suspense>
                )}
              </>
            )}
          </main>
        </div>
      </div>
      {!activationLocked && (
        <>
          <CreateProjectModal isOpen={isCreateModalOpen} onClose={() => setIsCreateModalOpen(false)} onCreate={handleCreateProject} />
          <ProjectSettingsModal
            project={activeProject}
            open={isProjectSettingsOpen}
            onClose={() => setIsProjectSettingsOpen(false)}
            onSave={handleProjectSettingsSave}
            onGoToGlobalSettings={() => { setIsProjectSettingsOpen(false); setView('settings'); }}
          />
          {pendingMediaPrompt && (
            <div
              role="status"
              aria-live="polite"
              className="fixed bottom-28 right-4 z-40 w-[22rem] max-w-[calc(100vw-2rem)] rounded-2xl border border-amber-400/20 bg-zinc-900/95 p-4 text-sm shadow-2xl shadow-black/30 backdrop-blur"
            >
              <div className="flex items-start gap-3">
                <div className="mt-1 h-2 w-2 shrink-0 rounded-full bg-amber-300 shadow-[0_0_12px_rgba(252,211,77,0.55)]" />
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-zinc-100">发现未完成任务</div>
                  <div className="mt-1.5 leading-5 text-zinc-300">
                    上次还有 {pendingMediaPrompt.tasks.length} 个媒体任务未完成。
                  </div>
                  {pendingMediaTaskSummary && (
                    <div className="mt-1 text-xs leading-5 text-zinc-500">
                      {pendingMediaTaskSummary}
                    </div>
                  )}
                  <div className="mt-2 text-xs leading-5 text-amber-200/80">
                    删除本地记录不会取消远端生成。
                  </div>
                  <div className="mt-3 flex flex-wrap justify-end gap-2">
                    <Button
                      size="small"
                      danger
                      loading={pendingMediaAction === 'delete'}
                      disabled={Boolean(pendingMediaAction) && pendingMediaAction !== 'delete'}
                      onClick={handleDeletePendingMediaTasks}
                    >
                      删除本地记录
                    </Button>
                    <Button
                      size="small"
                      loading={pendingMediaAction === 'fail'}
                      disabled={Boolean(pendingMediaAction) && pendingMediaAction !== 'fail'}
                      onClick={handleFailPendingMediaTasks}
                    >
                      标记失败
                    </Button>
                    <Button
                      size="small"
                      type="primary"
                      disabled={Boolean(pendingMediaAction) && pendingMediaAction !== 'recover'}
                      onClick={handleRecoverPendingMediaTasks}
                    >
                      继续恢复
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}
      {/* 全局任务状态悬浮通知 */}
      {!activationLocked && activeProject && (
        <TaskStatusBar key={`${activeProject.id}:${taskStatusRefreshKey}`} projectId={activeProject.id} />
      )}
    </div>
  );
};

const App: React.FC = () => {
  return (
    <ErrorBoundary>
      <AntApp>
        <AppContent />
      </AntApp>
    </ErrorBoundary>
  );
};

export default App;

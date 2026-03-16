import React, { useState, useEffect, useCallback, useMemo, Suspense, lazy } from 'react';
import { Project, ScriptAnalysisResult, EditorStep, AppSettings, Episode, EpisodeStepProgress } from './types';
import { ProjectList, CreateProjectModal, ProjectSettingsModal } from './components/project';
import type { MentionItem } from './editor';
import { WindowControls } from './components/common';
import { ErrorBoundary } from './components/common';
import { TaskStatusBar } from './components/common/TaskStatusBar';
import { Sidebar } from './components/common/Sidebar';
import type { AppView } from './components/common/Sidebar';
import { useProjects } from './hooks/useProjects';
import { TaskManager } from './services/TaskManager';
import { loadCharacters, loadScenes, loadProps, loadShots, loadEpisodeShots, saveEpisode } from './store/projectStore';
import { Spin, App as AntApp } from 'antd';
import {
  DEV_TEST_PROJECT,
  DEV_TEST_ANALYSIS,
  DEFAULT_SCRIPT,
  DEFAULT_SETTINGS,
  formatTimeAgo,
} from './constants/appConstants';
import { getThumbnailUrl } from './constants/dimensions';
import { createLogger } from './store/logger';

const logger = createLogger('App');

// 懒加载重型组件
const EditorView = lazy(() => import('./components/editor/EditorView').then(m => ({ default: m.EditorView })));
const SettingsPage = lazy(() => import('./components/settings').then(m => ({ default: m.SettingsPage })));
const PluginManager = lazy(() => import('./components/plugins').then(m => ({ default: m.PluginManager })));
const PluginHost = lazy(() => import('./components/plugins').then(m => ({ default: m.PluginHost })));
const ChatPage = lazy(() => import('./components/chat').then(m => ({ default: m.ChatPage })));
const ProjectOverview = lazy(() => import('./components/project/ProjectOverview').then(m => ({ default: m.ProjectOverview })));

// 加载中占位组件
const ViewLoading: React.FC<{ tip?: string }> = ({ tip = '加载中...' }) => (
  <div className="flex h-full items-center justify-center bg-zinc-950">
    <Spin size="large" tip={tip}><div className="p-12" /></Spin>
  </div>
);

const AppContent: React.FC = () => {
  const { message } = AntApp.useApp();

  // 开发模式检测
  const urlParams = new URLSearchParams(window.location.search);
  const devMode = urlParams.get('dev');
  const isVideoDevMode = devMode === 'video';

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

  // 初始化 TaskManager
  useEffect(() => {
    if (activeProject) {
      TaskManager.initialize(activeProject.id).catch(err => {
        logger.error('TaskManager 初始化失败', err);
      });
    }
    return () => { TaskManager.dispose(); };
  }, [activeProject?.id]);

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
    if (!analysisData?.characters) return [];
    return analysisData.characters.map(char => ({
      id: char.id, type: 'char' as const, name: char.name,
      description: char.description, previewImage: char.costumePhotoPath,
      sora2CharacterId: char.sora2CharacterId,
    }));
  }, [analysisData?.characters]);

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
  const displayProjects: Project[] = projects.map(p => ({
    id: p.id, title: p.title, genre: p.genre, mode: p.mode,
    episodes: p.episodes || 1, lastEdited: formatTimeAgo(p.updatedAt),
    thumbnail: p.thumbnail || getThumbnailUrl(p.id),
    status: p.status || 'script', llmConfigId: p.llmConfigId,
    ttiConfigId: p.ttiConfigId, itvConfigId: p.itvConfigId,
    ttsConfigId: p.ttsConfigId, theme: p.theme, stylePrompt: p.stylePrompt,
  }));

  const handleEnterVideoTest = () => {
    setActiveProject(DEV_TEST_PROJECT);
    setAnalysisData(DEV_TEST_ANALYSIS);
    setEditorStep('video');
    setView('editor');
  };

  const handleCreateProject = async (data: { title: string; mode: 'drama' | 'narration'; theme?: string; stylePrompt?: string }) => {
    try {
      const created = await createProjectAPI({ title: data.title, mode: data.mode, genre: data.mode === 'drama' ? '剧情' : '解说', theme: data.theme, stylePrompt: data.stylePrompt });
      const newProject: Project = {
        id: created.id, title: created.title, genre: created.genre, mode: created.mode,
        episodes: created.episodes || 1, lastEdited: '刚刚',
        thumbnail: created.thumbnail || getThumbnailUrl(created.id),
        status: created.status || 'script', theme: created.theme, stylePrompt: created.stylePrompt,
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

  const handleEnterEpisode = (episode: Episode) => {
    setActiveEpisode(episode);
    setView('editor');
    const defaultProgress: EpisodeStepProgress = { assets: 'pending', storyboard: 'pending', video: 'pending' };
    const progress = episode.stepProgress || defaultProgress;
    setStepProgress(progress);
    const steps: EditorStep[] = ['assets', 'storyboard', 'video'];
    const firstPending = steps.find(s => progress[s] === 'pending') || 'assets';
    setEditorStep(firstPending);
    setScriptText(episode.scriptText || '');
    setAnalysisData(null);
  };

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

  return (
    <div className="flex flex-col h-screen bg-zinc-950 text-zinc-100 font-sans selection:bg-emerald-500/30">
      <WindowControls />
      <div className="flex flex-1 min-h-0">
        <Sidebar
          view={view}
          activeProject={activeProject}
          activeEpisode={activeEpisode}
          onViewChange={setView}
          onEnterVideoTest={handleEnterVideoTest}
        />
        <div className="flex-1 flex flex-col min-w-0 transition-all duration-300">
          <main className="flex-1 overflow-hidden relative bg-zinc-950">
            {view === 'projects' && (
              projectsLoading ? (
                <div className="flex h-full items-center justify-center">
                  <Spin size="large" tip="加载项目列表..."><div className="p-12" /></Spin>
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
            {view.startsWith('plugin:') && (
              <Suspense fallback={<ViewLoading tip="加载插件..." />}>
                <PluginHost pluginId={view.replace('plugin:', '')} />
              </Suspense>
            )}
            {view === 'overview' && activeProject && (
              <Suspense fallback={<ViewLoading tip="加载项目概览..." />}>
                <ProjectOverview
                  project={activeProject}
                  onEnterEpisode={handleEnterEpisode}
                  onProjectUpdate={(updates) => setActiveProject({ ...activeProject, ...updates })}
                />
              </Suspense>
            )}
            {view === 'editor' && activeProject && (
              <Suspense fallback={<ViewLoading tip="加载编辑器..." />}>
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
          </main>
        </div>
      </div>
      <CreateProjectModal isOpen={isCreateModalOpen} onClose={() => setIsCreateModalOpen(false)} onCreate={handleCreateProject} />
      <ProjectSettingsModal
        project={activeProject}
        open={isProjectSettingsOpen}
        onClose={() => setIsProjectSettingsOpen(false)}
        onSave={handleProjectSettingsSave}
        onGoToGlobalSettings={() => { setIsProjectSettingsOpen(false); setView('settings'); }}
      />
      {/* 全局任务状态悬浮通知 */}
      {activeProject && <TaskStatusBar projectId={activeProject.id} />}
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

/**
 * Koma 主应用
 * 统一路由：projects | workspace | settings
 */
import React, { useState, useCallback, Suspense } from 'react';
import { Spin, App as AntApp, Button } from 'antd';
import { WindowControls } from './components/common';
import { ErrorBoundary } from './components/common';
import { TaskStatusBar } from './components/common/TaskStatusBar';
import { OnboardingTour } from './components/common/OnboardingTour';
import { Sidebar } from './components/common/Sidebar';
import { ProjectList, CreateProjectModal, ProjectSettingsModal } from './components/project';
import { useProjects } from './hooks/useProjects';
import { DEFAULT_SETTINGS } from './constants/appConstants';
import type { AppSettings } from './types';

// 懒加载
const SettingsPage = React.lazy(() => import('./components/settings').then(m => ({ default: m.SettingsPage })));
const WorkspaceShell = React.lazy(() => import('./components/workspace/WorkspaceShell'));

type AppPage = 'projects' | 'workspace' | 'settings';

const LazyFallback = () => (
  <div className="flex h-full items-center justify-center">
    <Spin size="large" tip="加载中..."><div className="p-12" /></Spin>
  </div>
);

interface ActiveProject {
  id: string;
  title: string;
  mode?: 'drama' | 'narration';
  llmConfigId?: string;
  ttiConfigId?: string;
  itvConfigId?: string;
  ttsConfigId?: string;
  theme?: string;
  stylePrompt?: string;
}

const AppContent: React.FC = () => {
  const { message } = AntApp.useApp();

  const {
    projects,
    loading: projectsLoading,
    createProject: createProjectAPI,
    deleteProject: deleteProjectAPI,
    updateProject: updateProjectAPI,
  } = useProjects();

  const [page, setPage] = useState<AppPage>('projects');
  const [activeProject, setActiveProject] = useState<ActiveProject | null>(null);
  const [appSettings, setAppSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isProjectSettingsOpen, setIsProjectSettingsOpen] = useState(false);

  // 选择项目 → 进入工作台
  const handleSelectProject = useCallback((id: string) => {
    const proj = projects.find(p => p.id === id);
    if (proj) {
      setActiveProject({
        id: proj.id,
        title: proj.title,
        mode: proj.mode,
        llmConfigId: proj.llmConfigId,
        ttiConfigId: proj.ttiConfigId,
        itvConfigId: proj.itvConfigId,
        ttsConfigId: proj.ttsConfigId,
        theme: proj.theme,
        stylePrompt: proj.stylePrompt,
      });
      setPage('workspace');
    }
  }, [projects]);

  // 创建项目
  const handleCreateProject = async (data: { title: string; mode: 'drama' | 'narration'; theme?: string; stylePrompt?: string }) => {
    try {
      const created = await createProjectAPI({
        title: data.title,
        mode: data.mode,
        genre: data.mode === 'drama' ? '剧情' : '解说',
        theme: data.theme,
        stylePrompt: data.stylePrompt,
      });
      setActiveProject({
        id: created.id,
        title: created.title,
        mode: created.mode,
        theme: created.theme,
        stylePrompt: created.stylePrompt,
      });
      setPage('workspace');
      setIsCreateModalOpen(false);
      message.success('项目创建成功');
    } catch (err: any) {
      message.error(err.message || '创建项目失败');
    }
  };

  const handleDeleteProject = async (id: string) => {
    try {
      await deleteProjectAPI(id);
      if (activeProject?.id === id) {
        setActiveProject(null);
        setPage('projects');
      }
      message.success('项目已删除');
    } catch (err: any) {
      message.error(err.message || '删除项目失败');
    }
  };

  const handleProjectUpdate = useCallback((updates: Record<string, any>) => {
    if (activeProject) {
      setActiveProject({ ...activeProject, ...updates });
      updateProjectAPI(activeProject.id, updates).catch(console.error);
    }
  }, [activeProject, updateProjectAPI]);

  const handleBack = useCallback(() => {
    setPage('projects');
  }, []);

  const handlePageChange = useCallback((nextPage: string) => {
    if (nextPage === 'workspace' && !activeProject) {
      message.warning('请先选择一个项目');
      setPage('projects');
      return;
    }
    setPage(nextPage as AppPage);
  }, [activeProject, message]);

  const handleProjectSettingsSave = async (updates: Partial<ActiveProject>) => {
    if (!activeProject) return;
    try {
      await updateProjectAPI(activeProject.id, updates);
      setActiveProject({ ...activeProject, ...updates });
      message.success('项目设置已保存');
    } catch (err: any) {
      message.error(err.message || '保存失败');
    }
  };

  // 构建项目列表显示数据
  const displayProjects = projects.map(p => ({
    id: p.id,
    title: p.title,
    genre: p.genre || (p.mode === 'drama' ? '剧情' : '解说'),
    mode: p.mode,
    episodes: p.episodes || 1,
    lastEdited: p.updatedAt ? new Date(p.updatedAt).toLocaleString() : '未知',
    thumbnail: p.thumbnail || `https://picsum.photos/seed/${p.id}/600/338`,
    status: p.status || 'script' as const,
  }));

  return (
    <div className="flex flex-col h-screen bg-zinc-950 text-zinc-100 font-sans selection:bg-emerald-500/30">
      <WindowControls />
      <div className="flex flex-1 min-h-0">
        <Sidebar
          view={page}
          onViewChange={handlePageChange}
        />
        <div className="flex-1 flex flex-col min-w-0 transition-all duration-300">
          <main className="flex-1 overflow-hidden relative bg-zinc-950">
            {page === 'projects' && (
              projectsLoading ? (
                <div className="flex h-full items-center justify-center">
                  <Spin size="large" tip="加载项目..."><div className="p-12" /></Spin>
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

            {page === 'settings' && (
              <Suspense fallback={<LazyFallback />}>
                <SettingsPage settings={appSettings} onSave={setAppSettings} />
              </Suspense>
            )}

            {page === 'workspace' && activeProject && (
              <Suspense fallback={<LazyFallback />}>
                <WorkspaceShell
                  projectId={activeProject.id}
                  projectTitle={activeProject.title}
                  projectConfig={{
                    llmConfigId: activeProject.llmConfigId,
                    ttiConfigId: activeProject.ttiConfigId,
                    itvConfigId: activeProject.itvConfigId,
                    ttsConfigId: activeProject.ttsConfigId,
                    theme: activeProject.theme,
                    stylePrompt: activeProject.stylePrompt,
                  }}
                  onBack={handleBack}
                  onProjectUpdate={handleProjectUpdate}
                />
              </Suspense>
            )}
          </main>
        </div>
      </div>

      <CreateProjectModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onCreate={handleCreateProject}
      />

      <ProjectSettingsModal
        project={activeProject}
        open={isProjectSettingsOpen}
        onClose={() => setIsProjectSettingsOpen(false)}
        onSave={handleProjectSettingsSave}
        onGoToGlobalSettings={() => { setIsProjectSettingsOpen(false); setPage('settings'); }}
      />

      {activeProject && <TaskStatusBar projectId={activeProject.id} />}
      <OnboardingTour view={page} />
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

/**
 * Koma 主应用
 * 统一路由：projects | workspace | settings | chat
 * 状态由 Zustand stores 管理（useAppStore, useSettingsStore）
 */
import React, { useCallback, useEffect, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { App as AntApp } from 'antd';
import { WindowControls, ErrorBoundary, ProjectListSkeleton, WorkspaceSkeleton, SettingsSkeleton } from './components/common';
import { TaskStatusBar } from './components/common/TaskStatusBar';
import { OnboardingTour } from './components/common/OnboardingTour';
import { Sidebar } from './components/common/Sidebar';
import { ProjectList, CreateProjectModal, ProjectSettingsModal } from './components/project';
import { useProjects } from './hooks/useProjects';
import { useAppStore } from './store/appStore';
import { useSettingsStore } from './store/settingsStore';
import { toUserMessage } from './utils/errorMessages';

// 懒加载
const SettingsPage = React.lazy(() => import('./components/settings').then(m => ({ default: m.SettingsPage })));
const WorkspaceShell = React.lazy(() => import('./components/workspace/WorkspaceShell'));
const ChatPage = React.lazy(() => import('./components/chat/ChatPage'));

const AppContent: React.FC = () => {
  const { message } = AntApp.useApp();
  const { t } = useTranslation('project');

  // Zustand stores
  const {
    page, activeProject,
    isCreateModalOpen, isProjectSettingsOpen,
    setPage, setActiveProject, updateActiveProject,
    openCreateModal, closeCreateModal,
    closeProjectSettings,
    enterWorkspace, goToProjects,
  } = useAppStore();

  const { settings, init: initSettings, replace: replaceSettings } = useSettingsStore();

  const {
    projects,
    loading: projectsLoading,
    createProject: createProjectAPI,
    deleteProject: deleteProjectAPI,
    updateProject: updateProjectAPI,
  } = useProjects();

  // Init settings once
  useEffect(() => { initSettings(); }, [initSettings]);

  // 选择项目 → 进入工作台
  const handleSelectProject = useCallback((id: string) => {
    const proj = projects.find(p => p.id === id);
    if (proj) {
      enterWorkspace({
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
    }
  }, [projects, enterWorkspace]);

  // 创建项目
  const handleCreateProject = async (data: { title: string; mode: 'drama' | 'narration'; theme?: string; stylePrompt?: string }) => {
    try {
      const created = await createProjectAPI({
        title: data.title,
        mode: data.mode,
        genre: data.mode === 'drama' ? t('genre.drama') : t('genre.narration'),
        theme: data.theme,
        stylePrompt: data.stylePrompt,
      });
      enterWorkspace({
        id: created.id,
        title: created.title,
        mode: created.mode,
        theme: created.theme,
        stylePrompt: created.stylePrompt,
      });
      closeCreateModal();
      message.success(t('message.created'));
    } catch (err: any) {
      message.error(toUserMessage(err) || t('message.createFailed'));
    }
  };

  const handleDeleteProject = async (id: string) => {
    try {
      await deleteProjectAPI(id);
      if (activeProject?.id === id) {
        setActiveProject(null);
        goToProjects();
      }
      message.success(t('message.deleted'));
    } catch (err: any) {
      message.error(toUserMessage(err) || t('message.deleteFailed'));
    }
  };

  const handleProjectUpdate = useCallback((updates: Record<string, any>) => {
    if (activeProject) {
      updateActiveProject(updates);
      updateProjectAPI(activeProject.id, updates).catch(console.error);
    }
  }, [activeProject, updateActiveProject, updateProjectAPI]);

  const handlePageChange = useCallback((nextPage: string) => {
    if (nextPage === 'workspace' && !activeProject) {
      message.warning(t('message.selectProjectFirst'));
      goToProjects();
      return;
    }
    setPage(nextPage as typeof page);
  }, [activeProject, message, t, setPage, goToProjects]);

  const handleProjectSettingsSave = async (updates: Partial<typeof activeProject>) => {
    if (!activeProject) return;
    try {
      await updateProjectAPI(activeProject.id, updates as Record<string, any>);
      updateActiveProject(updates as Record<string, any>);
      message.success(t('message.settingsSaved'));
    } catch (err: any) {
      message.error(toUserMessage(err) || t('message.saveFailed'));
    }
  };

  // 构建项目列表显示数据
  const displayProjects = projects.map(p => ({
    id: p.id,
    title: p.title,
    genre: p.genre || (p.mode === 'drama' ? t('genre.drama') : t('genre.narration')),
    mode: p.mode,
    episodes: p.episodes || 1,
    lastEdited: p.updatedAt ? new Date(p.updatedAt).toLocaleString() : t('common:unknown'),
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
                <ProjectListSkeleton />
              ) : (
                <ProjectList
                  projects={displayProjects}
                  onSelectProject={handleSelectProject}
                  onCreateProject={openCreateModal}
                  onDeleteProject={handleDeleteProject}
                />
              )
            )}

            {page === 'settings' && (
              <Suspense fallback={<SettingsSkeleton />}>
                <SettingsPage settings={settings} onSave={replaceSettings} />
              </Suspense>
            )}

            {page === 'chat' && (
              <Suspense fallback={<WorkspaceSkeleton />}>
                <ChatPage />
              </Suspense>
            )}

            {page === 'workspace' && activeProject && (
              <Suspense fallback={<WorkspaceSkeleton />}>
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
                  onBack={goToProjects}
                  onProjectUpdate={handleProjectUpdate}
                />
              </Suspense>
            )}
          </main>
        </div>
      </div>

      <CreateProjectModal
        isOpen={isCreateModalOpen}
        onClose={closeCreateModal}
        onCreate={handleCreateProject}
      />

      <ProjectSettingsModal
        project={activeProject}
        open={isProjectSettingsOpen}
        onClose={closeProjectSettings}
        onSave={handleProjectSettingsSave}
        onGoToGlobalSettings={() => { closeProjectSettings(); setPage('settings'); }}
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

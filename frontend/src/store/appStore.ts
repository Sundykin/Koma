/**
 * 应用全局状态 (Zustand)
 * 管理导航页面、当前活跃项目、模态框状态
 * 替代 App.tsx 中的 prop drilling
 */
import { create } from 'zustand';

export type AppPage = 'projects' | 'workspace' | 'settings' | 'chat';

export interface ActiveProject {
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

interface AppState {
  page: AppPage;
  activeProject: ActiveProject | null;
  isCreateModalOpen: boolean;
  isProjectSettingsOpen: boolean;

  // Actions
  setPage: (page: AppPage) => void;
  setActiveProject: (project: ActiveProject | null) => void;
  updateActiveProject: (updates: Partial<ActiveProject>) => void;
  openCreateModal: () => void;
  closeCreateModal: () => void;
  openProjectSettings: () => void;
  closeProjectSettings: () => void;

  /** Select a project and navigate to workspace */
  enterWorkspace: (project: ActiveProject) => void;
  /** Go back to project list */
  goToProjects: () => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  page: 'projects',
  activeProject: null,
  isCreateModalOpen: false,
  isProjectSettingsOpen: false,

  setPage: (page) => {
    if (page === 'workspace' && !get().activeProject) {
      // Can't navigate to workspace without a project
      set({ page: 'projects' });
      return;
    }
    set({ page });
  },

  setActiveProject: (project) => set({ activeProject: project }),

  updateActiveProject: (updates) => {
    const current = get().activeProject;
    if (current) {
      set({ activeProject: { ...current, ...updates } });
    }
  },

  openCreateModal: () => set({ isCreateModalOpen: true }),
  closeCreateModal: () => set({ isCreateModalOpen: false }),
  openProjectSettings: () => set({ isProjectSettingsOpen: true }),
  closeProjectSettings: () => set({ isProjectSettingsOpen: false }),

  enterWorkspace: (project) => set({ activeProject: project, page: 'workspace' }),
  goToProjects: () => set({ page: 'projects' }),
}));

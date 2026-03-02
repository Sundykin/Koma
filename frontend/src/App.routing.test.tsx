import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import App from './App';

const mockProject = {
  id: 'p1',
  title: '测试项目',
  genre: '剧情',
  mode: 'drama' as const,
  status: 'script' as const,
  episodes: 1,
  updatedAt: Date.now(),
};

let mockProjects = [mockProject];

vi.mock('./hooks/useProjects', () => ({
  useProjects: () => ({
    projects: mockProjects,
    loading: false,
    createProject: vi.fn(),
    deleteProject: vi.fn(),
    updateProject: vi.fn(),
  }),
}));

vi.mock('./components/project', () => ({
  ProjectList: ({ projects, onSelectProject }: any) => (
    <div>
      <button
        data-testid="select-first-project"
        onClick={() => projects[0] && onSelectProject(projects[0].id)}
      >
        select
      </button>
    </div>
  ),
  ProjectOverview: ({ onEnterEpisode }: any) => (
    <button
      data-testid="overview-enter-novel-promotion"
      onClick={() => onEnterEpisode({ id: 'ep1', scriptText: 'hello' })}
    >
      enter
    </button>
  ),
  CreateProjectModal: () => null,
  ProjectSettingsModal: () => null,
}));

vi.mock('./pages/NovelPromotion', () => ({
  NovelPromotionWorkspace: ({ projectId }: { projectId: string }) => (
    <div data-testid="workspace-ready">workspace-{projectId}</div>
  ),
}));

vi.mock('./services/taskQueueService', () => ({
  taskQueueService: {
    initialize: vi.fn(),
  },
}));

vi.mock('./services/delegateHandler', () => ({
  setupDelegateHandler: vi.fn(),
}));

vi.mock('./services/TaskManager', () => ({
  TaskManager: {
    initialize: vi.fn(),
    dispose: vi.fn(),
    addListener: vi.fn(() => () => {}),
  },
}));

vi.mock('./store/projectStore', () => ({
  loadCharacters: vi.fn(async () => []),
  loadScenes: vi.fn(async () => []),
  loadProps: vi.fn(async () => []),
  loadShots: vi.fn(async () => []),
  loadEpisodeShots: vi.fn(async () => []),
  saveEpisode: vi.fn(async () => {}),
  loadEpisode: vi.fn(async () => null),
}));

vi.mock('./services/ShotAnalysisService', () => ({
  startShotAnalysis: vi.fn(),
}));

vi.mock('./components/common/WindowControls', () => ({
  WindowControls: () => null,
}));

vi.mock('./components/common/ErrorBoundary', () => ({
  ErrorBoundary: ({ children }: any) => children,
}));

vi.mock('./components/common/TaskStatusBar', () => ({
  TaskStatusBar: () => null,
}));

vi.mock('./components/common/OnboardingTour', () => ({
  OnboardingTour: () => null,
}));

describe('App routing', () => {
  beforeEach(() => {
    mockProjects = [mockProject];
  });

  it('enters overview after selecting a project', async () => {
    render(<App />);

    fireEvent.click(screen.getByTestId('select-first-project'));

    await waitFor(() => {
      expect(screen.getByTestId('overview-enter-novel-promotion')).toBeInTheDocument();
    });

    expect(screen.getByTestId('app-main-content')).toHaveAttribute('data-current-view', 'overview');
  });

  it('navigates to overview shell from projects when active project exists', async () => {
    render(<App />);

    fireEvent.click(screen.getByTestId('select-first-project'));
    await waitFor(() => {
      expect(screen.getByTestId('overview-enter-novel-promotion')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('nav-projects'));

    await waitFor(() => {
      expect(screen.getByTestId('overview-enter-novel-promotion')).toBeInTheDocument();
    });
    expect(screen.getByTestId('app-main-content')).toHaveAttribute('data-current-view', 'overview');
  });

  it('returns to novel-promotion from overview shell action', async () => {
    render(<App />);

    fireEvent.click(screen.getByTestId('select-first-project'));
    await waitFor(() => {
      expect(screen.getByTestId('overview-enter-novel-promotion')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('nav-projects'));
    await waitFor(() => {
      expect(screen.getByTestId('overview-enter-novel-promotion')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('overview-enter-novel-promotion'));

    await waitFor(() => {
      expect(screen.getByTestId('workspace-ready')).toBeInTheDocument();
    });
    expect(screen.getByTestId('app-main-content')).toHaveAttribute('data-current-view', 'novel-promotion');
  });

  it('shows empty-state prompt when entering novel-promotion without active project', async () => {
    mockProjects = [];
    render(<App />);

    fireEvent.click(screen.getByTestId('nav-novel-promotion'));

    expect(await screen.findByText('请先选择一个项目')).toBeInTheDocument();
    expect(screen.getByTestId('app-main-content')).toHaveAttribute('data-current-view', 'novel-promotion');
  });
});

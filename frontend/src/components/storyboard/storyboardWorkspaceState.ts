import { getStoryboardWorkspaceKey } from '../../constants/storageKeys';
import type {
  StoryboardWorkflowContext,
  WorkflowPanelId,
  WorkflowPanelSessions,
} from './panels/workflowSessions';

export interface PersistedStoryboardWorkspaceState {
  activePanel: WorkflowPanelId | null;
  workflowSessions?: Partial<WorkflowPanelSessions>;
  context?: Pick<StoryboardWorkflowContext, 'activeShotId' | 'selectedShotIds'>;
  updatedAt: number;
}

export function loadStoryboardWorkspaceState(
  projectId: string,
  episodeId: string,
): PersistedStoryboardWorkspaceState | null {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(getStoryboardWorkspaceKey(projectId, episodeId));
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as PersistedStoryboardWorkspaceState;
    return {
      activePanel: parsed.activePanel ?? null,
      workflowSessions: parsed.workflowSessions,
      context: {
        activeShotId: parsed.context?.activeShotId ?? null,
        selectedShotIds: parsed.context?.selectedShotIds || [],
      },
      updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : Date.now(),
    };
  } catch {
    return null;
  }
}

export function saveStoryboardWorkspaceState(
  projectId: string,
  episodeId: string,
  state: PersistedStoryboardWorkspaceState,
): void {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return;
  }

  window.localStorage.setItem(
    getStoryboardWorkspaceKey(projectId, episodeId),
    JSON.stringify(state),
  );
}

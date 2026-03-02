import { useState, useCallback } from 'react';

export type WorkspaceStage = 'story' | 'script' | 'storyboard' | 'video' | 'edit';

export interface WorkspaceState {
  projectId: string | null;
  episodeId: string | null;
  stage: WorkspaceStage;
}

export function useWorkspace() {
  const [state, setState] = useState<WorkspaceState>({
    projectId: null,
    episodeId: null,
    stage: 'story',
  });

  const enterProject = useCallback((projectId: string) => {
    setState({ projectId, episodeId: null, stage: 'story' });
  }, []);

  const selectEpisode = useCallback((episodeId: string) => {
    setState(prev => ({ ...prev, episodeId }));
  }, []);

  const setStage = useCallback((stage: WorkspaceStage) => {
    setState(prev => ({ ...prev, stage }));
  }, []);

  const exitProject = useCallback(() => {
    setState({ projectId: null, episodeId: null, stage: 'story' });
  }, []);

  return {
    ...state,
    enterProject,
    selectEpisode,
    setStage,
    exitProject,
  };
}

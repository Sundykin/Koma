import { useCallback } from 'react';
import type { LinghuiLibraryDrawerKey } from '../../library/components/LinghuiLibraryDrawer';

export function useLinghuiPageDrawers(params: {
  activeDrawer: LinghuiLibraryDrawerKey | null;
  closeActiveDrawer: () => void;
  loadAssetLibrary: (workspaceId: string | null) => Promise<void>;
  loadHistoryLibrary: (workspaceId: string | null) => Promise<void>;
  loadWorkflowLibrary: (workspaceId: string | null) => Promise<void>;
  setActiveDrawer: (drawer: LinghuiLibraryDrawerKey) => void;
  setExecutionLogPanelOpen: (open: boolean) => void;
  setProjectPanelOpen: (open: boolean) => void;
  getActiveWorkspaceId: () => string | null;
}): {
  handleOpenDrawerFromCanvas: (drawer: LinghuiLibraryDrawerKey) => void;
  handleToggleDrawer: (drawer: LinghuiLibraryDrawerKey) => void;
} {
  const {
    activeDrawer,
    closeActiveDrawer,
    getActiveWorkspaceId,
    loadAssetLibrary,
    loadHistoryLibrary,
    loadWorkflowLibrary,
    setActiveDrawer,
    setExecutionLogPanelOpen,
    setProjectPanelOpen,
  } = params;

  const openDrawer = useCallback(async (drawer: LinghuiLibraryDrawerKey) => {
    setProjectPanelOpen(false);
    setExecutionLogPanelOpen(false);
    setActiveDrawer(drawer);

    if (drawer === 'asset') {
      await loadAssetLibrary(getActiveWorkspaceId());
      return;
    }
    if (drawer === 'workflow') {
      await loadWorkflowLibrary(getActiveWorkspaceId());
      return;
    }
    if (drawer === 'history') {
      await loadHistoryLibrary(getActiveWorkspaceId());
    }
  }, [
    getActiveWorkspaceId,
    loadAssetLibrary,
    loadHistoryLibrary,
    loadWorkflowLibrary,
    setActiveDrawer,
    setExecutionLogPanelOpen,
    setProjectPanelOpen,
  ]);

  const handleToggleDrawer = useCallback((drawer: LinghuiLibraryDrawerKey) => {
    if (activeDrawer === drawer) {
      closeActiveDrawer();
      return;
    }
    void openDrawer(drawer);
  }, [activeDrawer, closeActiveDrawer, openDrawer]);

  const handleOpenDrawerFromCanvas = useCallback((drawer: LinghuiLibraryDrawerKey) => {
    void openDrawer(drawer);
  }, [openDrawer]);

  return {
    handleOpenDrawerFromCanvas,
    handleToggleDrawer,
  };
}

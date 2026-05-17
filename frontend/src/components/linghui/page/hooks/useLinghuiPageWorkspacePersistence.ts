import { useCallback, useRef, useState } from 'react';
import type { MessageInstance } from 'antd/es/message/interface';
import {
  listLinghuiWorkspaces,
  loadLinghuiWorkspace,
  saveLinghuiWorkspace,
} from '../../../../store/linghuiStorage';
import type {
  LinghuiWorkspaceDocument,
  LinghuiWorkspaceMeta,
} from '../../../../types/linghui';
import type { LinghuiCanvasHandle } from '../../canvas/components/LinghuiCanvas';
import {
  ensureWorkspaceRuntime,
  type LinghuiWorkspaceRuntimeState,
} from '../state/linghuiPageWorkspaceRuntime';

const WORKSPACE_SAVE_DEBOUNCE_MS = 2500;

interface PendingWorkspaceSave {
  doc: LinghuiWorkspaceDocument;
  syncActiveWorkspace: boolean;
  refreshWorkspaceList: boolean;
}

interface UseLinghuiPageWorkspacePersistenceParams {
  activeWorkspaceRef: React.MutableRefObject<LinghuiWorkspaceDocument | null>;
  activateWorkspace: (workspace: LinghuiWorkspaceDocument) => void;
  canvasRef: React.RefObject<LinghuiCanvasHandle | null>;
  message: MessageInstance;
  setActiveWorkspace: React.Dispatch<React.SetStateAction<LinghuiWorkspaceDocument | null>>;
  setLastSavedAt: React.Dispatch<React.SetStateAction<number | null>>;
  setWorkspaceList: React.Dispatch<React.SetStateAction<LinghuiWorkspaceMeta[]>>;
  workspaceRuntimeRef: React.MutableRefObject<LinghuiWorkspaceRuntimeState>;
}

export function useLinghuiPageWorkspacePersistence({
  activeWorkspaceRef,
  activateWorkspace,
  canvasRef,
  message,
  setActiveWorkspace,
  setLastSavedAt,
  setWorkspaceList,
  workspaceRuntimeRef,
}: UseLinghuiPageWorkspacePersistenceParams) {
  const saveTimerRef = useRef<number | null>(null);
  const pendingSaveRef = useRef<PendingWorkspaceSave | null>(null);
  const [saving, setSaving] = useState(false);

  const refreshWorkspaceList = useCallback(async (preferredId?: string) => {
    const items = await listLinghuiWorkspaces();
    setWorkspaceList(items);

    if (!preferredId || activeWorkspaceRef.current?.id === preferredId) return;
    const preferred = items.find(item => item.id === preferredId);
    if (!preferred) return;
    const loaded = await loadLinghuiWorkspace(preferred.id);
    if (!loaded) return;
    activateWorkspace(loaded);
  }, [activeWorkspaceRef, activateWorkspace, setWorkspaceList]);

  const persistWorkspace = useCallback(async (
    doc: LinghuiWorkspaceDocument,
    options?: {
      notify?: boolean;
      syncActiveWorkspace?: boolean;
      refreshWorkspaceList?: boolean;
      showIndicator?: boolean;
    },
  ): Promise<boolean> => {
    const {
      notify = false,
      syncActiveWorkspace = true,
      refreshWorkspaceList: shouldRefreshWorkspaceList = true,
      showIndicator = false,
    } = options ?? {};

    if (showIndicator) {
      setSaving(true);
    }
    try {
      const saved = ensureWorkspaceRuntime(await saveLinghuiWorkspace(doc));
      if (syncActiveWorkspace) {
        activeWorkspaceRef.current = saved;
        workspaceRuntimeRef.current = {
          nodeRuns: saved.nodeRuns,
          executionLogs: saved.executionLogs,
        };
        setActiveWorkspace(saved);
      } else {
        const liveWorkspace = activeWorkspaceRef.current;
        if (liveWorkspace?.id === saved.id) {
          activeWorkspaceRef.current = {
            ...liveWorkspace,
            updatedAt: saved.updatedAt,
          };
        } else {
          activeWorkspaceRef.current = saved;
        }
      }
      setLastSavedAt(saved.updatedAt);
      if (shouldRefreshWorkspaceList) {
        await refreshWorkspaceList(saved.id);
      }
      if (notify) {
        message.success('灵绘工作区已保存');
      }
      return true;
    } catch (error: any) {
      message.error(error?.message || '保存灵绘工作区失败');
      return false;
    } finally {
      if (showIndicator) {
        setSaving(false);
      }
    }
  }, [activeWorkspaceRef, message, refreshWorkspaceList, setActiveWorkspace, setLastSavedAt, workspaceRuntimeRef]);

  const scheduleWorkspaceSave = useCallback((
    doc: LinghuiWorkspaceDocument,
    options?: {
      syncActiveWorkspace?: boolean;
      refreshWorkspaceList?: boolean;
    },
  ) => {
    const {
      syncActiveWorkspace = true,
      refreshWorkspaceList: shouldRefreshWorkspaceList = true,
    } = options ?? {};

    activeWorkspaceRef.current = doc;
    pendingSaveRef.current = pendingSaveRef.current
      ? {
          doc,
          syncActiveWorkspace: pendingSaveRef.current.syncActiveWorkspace || syncActiveWorkspace,
          refreshWorkspaceList: pendingSaveRef.current.refreshWorkspaceList || shouldRefreshWorkspaceList,
        }
      : {
          doc,
          syncActiveWorkspace,
          refreshWorkspaceList: shouldRefreshWorkspaceList,
        };

    if (syncActiveWorkspace) {
      setActiveWorkspace(doc);
    }

    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
    }

    saveTimerRef.current = window.setTimeout(() => {
      if (!pendingSaveRef.current) return;
      const pending = pendingSaveRef.current;
      pendingSaveRef.current = null;
      persistWorkspace(pending.doc, {
        notify: false,
        syncActiveWorkspace: pending.syncActiveWorkspace,
        refreshWorkspaceList: pending.refreshWorkspaceList,
      });
    }, WORKSPACE_SAVE_DEBOUNCE_MS);
  }, [activeWorkspaceRef, persistWorkspace, setActiveWorkspace]);

  const flushWorkspaceSave = useCallback(async (options?: {
    notify?: boolean;
    syncActiveWorkspace?: boolean;
    refreshWorkspaceList?: boolean;
    showIndicator?: boolean;
  }): Promise<boolean> => {
    canvasRef.current?.snapshotNow();

    const current = activeWorkspaceRef.current;
    if (!current) {
      return true;
    }

    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    pendingSaveRef.current = null;

    return persistWorkspace(current, {
      notify: options?.notify ?? false,
      syncActiveWorkspace: options?.syncActiveWorkspace ?? true,
      refreshWorkspaceList: options?.refreshWorkspaceList ?? true,
      showIndicator: options?.showIndicator ?? true,
    });
  }, [activeWorkspaceRef, canvasRef, persistWorkspace]);

  return {
    flushWorkspaceSave,
    pendingSaveRef,
    refreshWorkspaceList,
    saveTimerRef,
    saving,
    scheduleWorkspaceSave,
  };
}

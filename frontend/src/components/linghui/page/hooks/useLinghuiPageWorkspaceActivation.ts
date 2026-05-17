import { useCallback, useEffect, type RefObject } from 'react';
import type {
  LinghuiGraphStats,
  LinghuiWorkspaceDocument,
} from '../../../../types/linghui';
import {
  ensureWorkspaceRuntime,
  type LinghuiWorkspaceRuntimeState,
} from '../state/linghuiPageWorkspaceRuntime';

interface LinghuiPageWorkspaceActivationParams {
  activeWorkspace: LinghuiWorkspaceDocument | null;
  activeWorkspaceRef: RefObject<LinghuiWorkspaceDocument | null>;
  workspaceRuntimeRef: RefObject<LinghuiWorkspaceRuntimeState>;
  onSetActiveWorkspace: (workspace: LinghuiWorkspaceDocument) => void;
  onSetLastSavedAt: (timestamp: number | null) => void;
  onSetStats: (stats: LinghuiGraphStats) => void;
  onSetWorkspaceRuntime: (runtime: LinghuiWorkspaceRuntimeState) => void;
}

export function useLinghuiPageWorkspaceActivation({
  activeWorkspace,
  activeWorkspaceRef,
  workspaceRuntimeRef,
  onSetActiveWorkspace,
  onSetLastSavedAt,
  onSetStats,
  onSetWorkspaceRuntime,
}: LinghuiPageWorkspaceActivationParams) {
  useEffect(() => {
    activeWorkspaceRef.current = activeWorkspace
      ? {
          ...activeWorkspace,
          nodeRuns: workspaceRuntimeRef.current.nodeRuns,
          executionLogs: workspaceRuntimeRef.current.executionLogs,
        }
      : null;
  }, [activeWorkspace, activeWorkspaceRef, workspaceRuntimeRef]);

  const applyWorkspaceRuntime = useCallback((runtime: LinghuiWorkspaceRuntimeState) => {
    workspaceRuntimeRef.current = runtime;
    onSetWorkspaceRuntime(runtime);
  }, [onSetWorkspaceRuntime, workspaceRuntimeRef]);

  const activateWorkspace = useCallback((workspace: LinghuiWorkspaceDocument) => {
    const normalizedWorkspace = ensureWorkspaceRuntime(workspace, { resetInterruptedRuns: true });
    activeWorkspaceRef.current = normalizedWorkspace;
    applyWorkspaceRuntime({
      nodeRuns: normalizedWorkspace.nodeRuns,
      executionLogs: normalizedWorkspace.executionLogs,
    });
    onSetActiveWorkspace(normalizedWorkspace);
    onSetStats({
      nodeCount: normalizedWorkspace.nodeCount,
      linkCount: normalizedWorkspace.linkCount,
      groupCount: normalizedWorkspace.groupCount,
    });
    onSetLastSavedAt(normalizedWorkspace.updatedAt);
  }, [
    activeWorkspaceRef,
    applyWorkspaceRuntime,
    onSetActiveWorkspace,
    onSetLastSavedAt,
    onSetStats,
  ]);

  return {
    activateWorkspace,
    applyWorkspaceRuntime,
  };
}

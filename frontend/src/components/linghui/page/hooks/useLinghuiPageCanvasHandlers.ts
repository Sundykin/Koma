import { useCallback } from 'react';
import type { MessageInstance } from 'antd/es/message/interface';
import { loadLinghuiWorkspace } from '../../../../store/linghuiStorage';
import {
  type LinghuiExecutionLogEntry,
  type LinghuiGraphSnapshot,
  type LinghuiGraphStats,
  type LinghuiNodeRunState,
  type LinghuiViewportState,
  type LinghuiWorkspaceDocument,
} from '../../../../types/linghui';
import { createLogger } from '../../../../store/logger';
import { cloneSnapshotValue, detectCanvasMutationKind } from '../../canvas/state/linghuiCanvasShared';
import type { LinghuiWorkspaceRuntimeState } from '../state/linghuiPageWorkspaceRuntime';

const linghuiCanvasLogger = createLogger('LinghuiCanvas');

interface PendingWorkspaceSave {
  doc: LinghuiWorkspaceDocument;
  syncActiveWorkspace: boolean;
  refreshWorkspaceList: boolean;
}

interface UseLinghuiPageCanvasHandlersParams {
  activeWorkspaceRef: React.MutableRefObject<LinghuiWorkspaceDocument | null>;
  activateWorkspace: (workspace: LinghuiWorkspaceDocument) => void;
  canvasCrashedRef: React.MutableRefObject<boolean>;
  markNodesAsStale: (nodeIds: string[], reason: string) => void;
  message: MessageInstance;
  pendingSaveRef: React.MutableRefObject<PendingWorkspaceSave | null>;
  saveTimerRef: React.MutableRefObject<number | null>;
  scheduleWorkspaceSave: (
    doc: LinghuiWorkspaceDocument,
    options?: {
      syncActiveWorkspace?: boolean;
      refreshWorkspaceList?: boolean;
    },
  ) => void;
  setStats: React.Dispatch<React.SetStateAction<LinghuiGraphStats>>;
  setWorkspaceRuntime: React.Dispatch<React.SetStateAction<LinghuiWorkspaceRuntimeState>>;
  updateWorkspaceExecution: (
    nextRuns: Record<string, LinghuiNodeRunState>,
    nextLogs: LinghuiExecutionLogEntry[],
  ) => void;
  workspaceRuntimeRef: React.MutableRefObject<LinghuiWorkspaceRuntimeState>;
}

export function useLinghuiPageCanvasHandlers({
  activeWorkspaceRef,
  activateWorkspace,
  canvasCrashedRef,
  markNodesAsStale,
  message,
  pendingSaveRef,
  saveTimerRef,
  scheduleWorkspaceSave,
  setStats,
  setWorkspaceRuntime,
  updateWorkspaceExecution,
  workspaceRuntimeRef,
}: UseLinghuiPageCanvasHandlersParams) {
  const handleGraphChange = useCallback((
    graphData: LinghuiGraphSnapshot,
    viewport: LinghuiViewportState,
    nextStats: LinghuiGraphStats,
  ) => {
    const current = activeWorkspaceRef.current;
    if (!current) return;

    if (canvasCrashedRef.current) {
      const looksHealthy = graphData.nodes.length > 0
        && (graphData.nodes.length !== current.graphData.nodes.length
          || graphData.edges.length !== current.graphData.edges.length);
      if (looksHealthy) {
        canvasCrashedRef.current = false;
        linghuiCanvasLogger.info('canvas auto-recovered after non-empty graph change', {
          workspaceId: current.id,
          nodeCount: graphData.nodes.length,
        });
      } else {
        linghuiCanvasLogger.warn('graphChange suppressed during canvas crash recovery', {
          workspaceId: current.id,
        });
        return;
      }
    }

    if (
      current.graphData.nodes.length > 0 &&
      graphData.nodes.length === 0 &&
      graphData.edges.length === 0 &&
      (graphData.groups?.length ?? 0) === 0
    ) {
      linghuiCanvasLogger.warn('graphChange suppressed: empty snapshot would overwrite non-empty workspace', {
        workspaceId: current.id,
        previousNodeCount: current.graphData.nodes.length,
      });
      return;
    }

    const nextDraft = {
      ...current,
      graphData,
      viewport,
      nodeCount: nextStats.nodeCount,
      linkCount: nextStats.linkCount,
      groupCount: nextStats.groupCount,
    };
    const changeKind = detectCanvasMutationKind({
      graphData: current.graphData,
      viewport: current.viewport,
    }, {
      graphData,
      viewport,
    });

    setStats(previous => (
      previous.nodeCount === nextStats.nodeCount &&
      previous.linkCount === nextStats.linkCount &&
      previous.groupCount === nextStats.groupCount
        ? previous
        : nextStats
    ));

    activeWorkspaceRef.current = nextDraft;
    if (pendingSaveRef.current) {
      pendingSaveRef.current = {
        ...pendingSaveRef.current,
        doc: nextDraft,
      };
    }

    if (changeKind !== 'content') {
      return;
    }

    scheduleWorkspaceSave(nextDraft, {
      syncActiveWorkspace: false,
      refreshWorkspaceList: false,
    });
  }, [activeWorkspaceRef, canvasCrashedRef, pendingSaveRef, scheduleWorkspaceSave, setStats]);

  const handleNodeMutate = useCallback((nodeId: string) => {
    markNodesAsStale([nodeId], '上游节点参数已变更，请重新运行相关节点。');
  }, [markNodesAsStale]);

  const handleClearNodeRunState = useCallback((nodeId: string) => {
    const currentWorkspace = activeWorkspaceRef.current;
    const currentRuns = workspaceRuntimeRef.current.nodeRuns;
    const currentLogs = workspaceRuntimeRef.current.executionLogs;
    if (!currentWorkspace || !currentRuns[nodeId]) return;

    const nextRuns = { ...currentRuns };
    delete nextRuns[nodeId];
    updateWorkspaceExecution(nextRuns, currentLogs);
  }, [activeWorkspaceRef, updateWorkspaceExecution, workspaceRuntimeRef]);

  const handleCanvasCrash = useCallback((error: Error) => {
    canvasCrashedRef.current = true;
    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    pendingSaveRef.current = null;
    message.error({
      content: `画布异常已暂停自动保存：${error.message || '未知错误'}`,
      duration: 6,
    });
  }, [canvasCrashedRef, message, pendingSaveRef, saveTimerRef]);

  const handleCanvasRecover = useCallback(() => {
    canvasCrashedRef.current = false;
    message.success('已恢复画布自动保存');
  }, [canvasCrashedRef, message]);

  const handleCanvasReload = useCallback(() => {
    const currentId = activeWorkspaceRef.current?.id;
    canvasCrashedRef.current = false;
    if (!currentId) {
      message.info('当前没有可重新加载的工作区');
      return;
    }
    void (async () => {
      try {
        const reloaded = await loadLinghuiWorkspace(currentId);
        if (!reloaded) {
          message.error('未找到工作区记录，无法重新加载');
          return;
        }
        activateWorkspace(reloaded);
        message.success('已从磁盘重新加载最近一次保存');
      } catch (error: any) {
        message.error(error?.message || '重新加载工作区失败');
      }
    })();
  }, [activeWorkspaceRef, activateWorkspace, canvasCrashedRef, message]);

  const handleRestoreNodeRuns = useCallback((nextRuns: Record<string, LinghuiNodeRunState>) => {
    const currentLogs = workspaceRuntimeRef.current.executionLogs;
    const nextRuntime = {
      nodeRuns: cloneSnapshotValue(nextRuns),
      executionLogs: currentLogs,
    };

    workspaceRuntimeRef.current = nextRuntime;
    setWorkspaceRuntime(nextRuntime);

    if (activeWorkspaceRef.current) {
      activeWorkspaceRef.current = {
        ...activeWorkspaceRef.current,
        nodeRuns: nextRuntime.nodeRuns,
        executionLogs: nextRuntime.executionLogs,
      };
    }
  }, [activeWorkspaceRef, setWorkspaceRuntime, workspaceRuntimeRef]);

  return {
    handleCanvasCrash,
    handleCanvasRecover,
    handleCanvasReload,
    handleClearNodeRunState,
    handleGraphChange,
    handleNodeMutate,
    handleRestoreNodeRuns,
  };
}

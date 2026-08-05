import React, { useCallback, useEffect, useRef, useState } from 'react';
import { App as AntApp } from 'antd';
import type {
  LinghuiExecutionLogEntry,
  LinghuiExecutionQueueState,
  LinghuiGraphStats,
  LinghuiNodeRunState,
  LinghuiWorkspaceDocument,
  LinghuiWorkspaceMeta,
} from '../../../../types/linghui';
import type { LinghuiCanvasHandle } from '../../canvas/components/LinghuiCanvas';
import { collectLinghuiDependentNodeIds } from '../../execution/state/linghuiExecution';
import { createLogger } from '../../../../store/logger';
import { resetLinghuiCanvasStore, useLinghuiCanvasStore } from '../../canvas/state/linghuiCanvasStore';
import { LinghuiPageShell } from './LinghuiPageShell';
import { LinghuiPageOverlays } from './LinghuiPageOverlays';
import { LinghuiPageLoading } from './LinghuiPageLoading';
import { useLinghuiPageCanvasHandlers } from '../hooks/useLinghuiPageCanvasHandlers';
import { useLinghuiPageExecutionRailState } from '../hooks/useLinghuiPageExecutionRailState';
import { useLinghuiPageLibraries } from '../hooks/useLinghuiPageLibraries';
import { useLinghuiPageWorkspacePersistence } from '../hooks/useLinghuiPageWorkspacePersistence';
import { useLinghuiPageWorkspaceActions } from '../hooks/useLinghuiPageWorkspaceActions';
import { useLinghuiPageBootstrap } from '../hooks/useLinghuiPageBootstrap';
import { useLinghuiPageExportSelection } from '../hooks/useLinghuiPageExportSelection';
import { useLinghuiPageDrawers } from '../hooks/useLinghuiPageDrawers';
import { useLinghuiPageExecutionPlan } from '../hooks/useLinghuiPageExecutionPlan';
import { useLinghuiPageWorkflowRunner } from '../hooks/useLinghuiPageWorkflowRunner';
import { useLinghuiPageFloatingRail } from '../hooks/useLinghuiPageFloatingRail';
import { useLinghuiPageRunHandlers } from '../hooks/useLinghuiPageRunHandlers';
import { useLinghuiPageRailOutsideDismiss } from '../hooks/useLinghuiPageRailOutsideDismiss';
import { useLinghuiPageWorkspaceActivation } from '../hooks/useLinghuiPageWorkspaceActivation';
import {
  EMPTY_WORKSPACE_RUNTIME,
  type LinghuiWorkspaceRuntimeState,
} from '../state/linghuiPageWorkspaceRuntime';
import {
  createLinghuiPageExecutionLog,
  mergeLinghuiPageExecutionLogs,
} from '../state/linghuiPageExecutionLogs';
import { mergeLinghuiPageExecutionQueues } from '../state/linghuiPageExecutionQueue';
import '../styles/LinghuiPage.scss';

interface LinghuiPageProps { onExit?: () => void }

const workflowLogger = createLogger('LinghuiWorkflowExecution');

export const LinghuiPage: React.FC<LinghuiPageProps> = ({ onExit }) => {
  const { message, modal } = AntApp.useApp();
  const canvasRef = useRef<LinghuiCanvasHandle | null>(null);
  const railShellRef = useRef<HTMLDivElement | null>(null);
  const executionBatchesRef = useRef<Set<AbortController>>(new Set());
  const executionQueuesRef = useRef<Map<AbortController, LinghuiExecutionQueueState>>(new Map());
  const activeWorkspaceRef = useRef<LinghuiWorkspaceDocument | null>(null);
  const workspaceRuntimeRef = useRef<LinghuiWorkspaceRuntimeState>(EMPTY_WORKSPACE_RUNTIME);
  const canvasCrashedRef = useRef<boolean>(false);

  const [loading, setLoading] = useState(true);
  const [, setRunning] = useState(false);
  const [executionQueue, setExecutionQueue] = useState<LinghuiExecutionQueueState | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [workspaceList, setWorkspaceList] = useState<LinghuiWorkspaceMeta[]>([]);
  const [activeWorkspace, setActiveWorkspace] = useState<LinghuiWorkspaceDocument | null>(null);
  const [workspaceRuntime, setWorkspaceRuntime] = useState<LinghuiWorkspaceRuntimeState>(EMPTY_WORKSPACE_RUNTIME);
  const [projectPanelOpen, setProjectPanelOpen] = useState(false);
  const [executionLogPanelOpen, setExecutionLogPanelOpen] = useState(false);
  const [executionLogCollapsed, setExecutionLogCollapsed] = useState(false);
  const [, setStats] = useState<LinghuiGraphStats>({ nodeCount: 0, linkCount: 0, groupCount: 0 });
  const activeDrawer = useLinghuiCanvasStore(state => state.activeDrawer);
  const setActiveDrawer = useLinghuiCanvasStore(state => state.setActiveDrawer);
  const closeActiveDrawer = useLinghuiCanvasStore(state => state.closeActiveDrawer);
  const {
    assetFilter,
    assetLoading,
    historyLoading,
    loadAssetLibrary,
    loadHistoryLibrary,
    loadWorkflowLibrary,
    setAssetFilter,
    workspaceAssets,
    workspaceHistory,
    workflowLoading,
    workflowTemplates,
    handleAssetLibraryMutate,
    handleHistoryLibraryMutate,
    handleSendAssetToCanvas,
    handleSendHistoryToCanvas,
    handleSendWorkflowToCanvas,
    handleWorkflowTemplateMutate,
  } = useLinghuiPageLibraries({
    activeDrawer,
    activeWorkspaceId: activeWorkspace?.id ?? null,
    canvasRef,
    message,
  });

  useEffect(() => {
    resetLinghuiCanvasStore();
    return () => {
      resetLinghuiCanvasStore();
    };
  }, []);

  useLinghuiPageRailOutsideDismiss({
    executionLogPanelOpen,
    projectPanelOpen,
    railShellRef,
    onSetExecutionLogPanelOpen: setExecutionLogPanelOpen,
    onSetProjectPanelOpen: setProjectPanelOpen,
  });

  const {
    activateWorkspace,
    applyWorkspaceRuntime,
  } = useLinghuiPageWorkspaceActivation({
    activeWorkspace,
    activeWorkspaceRef,
    workspaceRuntimeRef,
    onSetActiveWorkspace: setActiveWorkspace,
    onSetLastSavedAt: setLastSavedAt,
    onSetStats: setStats,
    onSetWorkspaceRuntime: setWorkspaceRuntime,
  });

  const {
    flushWorkspaceSave,
    pendingSaveRef,
    refreshWorkspaceList,
    saveTimerRef,
    saving,
    scheduleWorkspaceSave,
  } = useLinghuiPageWorkspacePersistence({
    activeWorkspaceRef,
    activateWorkspace,
    canvasRef,
    message,
    setActiveWorkspace,
    setLastSavedAt,
    setWorkspaceList,
    workspaceRuntimeRef,
  });

  const cleanupActiveExecutions = useCallback(() => {
    for (const controller of executionBatchesRef.current) {
      if (!controller.signal.aborted) {
        controller.abort('工作区已关闭，停止当前执行');
      }
    }
    executionBatchesRef.current.clear();
    executionQueuesRef.current.clear();
  }, []);

  useLinghuiPageBootstrap({
    activateWorkspace,
    message,
    onCleanup: cleanupActiveExecutions,
    saveTimerRef,
    setLoading,
    setWorkspaceList,
  });

  useEffect(() => {
    const handler = () => {
      if (pendingSaveRef.current) {
        void flushWorkspaceSave({ notify: false, showIndicator: false, refreshWorkspaceList: false });
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [flushWorkspaceSave]);

  const updateWorkspaceExecution = useCallback((
    nextRuns: Record<string, LinghuiNodeRunState>,
    nextLogs: LinghuiExecutionLogEntry[],
  ) => {
    const current = activeWorkspaceRef.current;
    if (!current) return;

    applyWorkspaceRuntime({
      nodeRuns: nextRuns,
      executionLogs: nextLogs,
    });
    scheduleWorkspaceSave({
      ...current,
      nodeRuns: nextRuns,
      executionLogs: nextLogs,
    }, {
      syncActiveWorkspace: false,
      refreshWorkspaceList: false,
    });
  }, [applyWorkspaceRuntime, scheduleWorkspaceSave]);

  const patchWorkspaceExecution = useCallback((
    runPatches?: Record<string, LinghuiNodeRunState>,
    logEntries?: LinghuiExecutionLogEntry[],
  ): LinghuiWorkspaceRuntimeState => {
    const current = activeWorkspaceRef.current;
    const currentRuntime = workspaceRuntimeRef.current;
    if (!current) {
      return currentRuntime;
    }

    const hasRunPatches = runPatches && Object.keys(runPatches).length > 0;
    const nextRuns = hasRunPatches
      ? {
          ...currentRuntime.nodeRuns,
          ...runPatches,
        }
      : currentRuntime.nodeRuns;
    let nextLogs = currentRuntime.executionLogs;
    for (const entry of logEntries ?? []) {
      nextLogs = mergeLinghuiPageExecutionLogs(nextLogs, entry);
    }

    updateWorkspaceExecution(nextRuns, nextLogs);
    return {
      nodeRuns: nextRuns,
      executionLogs: nextLogs,
    };
  }, [updateWorkspaceExecution]);

  const markNodesAsStale = useCallback((nodeIds: string[], reason: string) => {
    const context = canvasRef.current?.getExecutionContext();
    const current = activeWorkspaceRef.current;
    if (!context || !current || nodeIds.length === 0) return;

    const affected = new Set<string>([
      ...nodeIds,
      ...collectLinghuiDependentNodeIds(context.edges, nodeIds),
    ]);
    if (affected.size === 0) return;

    const nextRuns: Record<string, LinghuiNodeRunState> = {
      ...current.nodeRuns,
    };
    let hasStateChange = false;

    for (const nodeId of affected) {
      const previous = nextRuns[nodeId];
      if (previous?.status !== 'stale' || previous?.message !== reason) {
        hasStateChange = true;
      }
      nextRuns[nodeId] = {
        ...previous,
        status: 'stale',
        message: reason,
        updatedAt: Date.now(),
      };
    }

    if (!hasStateChange) {
      return;
    }

    const nextLogs = mergeLinghuiPageExecutionLogs(
      current.executionLogs,
      createLinghuiPageExecutionLog('info', reason),
    );

    updateWorkspaceExecution(nextRuns, nextLogs);
  }, [updateWorkspaceExecution]);

  const recomputeExecutionQueue = useCallback(() => {
    setExecutionQueue(mergeLinghuiPageExecutionQueues(
      Array.from(executionQueuesRef.current.values()),
    ));
  }, []);

  const runWorkflow = useLinghuiPageWorkflowRunner({
    activeWorkspaceRef,
    canvasRef,
    executionBatchesRef,
    executionQueuesRef,
    handleHistoryLibraryMutate,
    message,
    patchWorkspaceExecution,
    recomputeExecutionQueue,
    setRunning,
    updateWorkspaceExecution,
    workflowLogger,
    workspaceRuntimeRef,
  });

  const {
    handleOpenDrawerFromCanvas,
    handleToggleDrawer,
  } = useLinghuiPageDrawers({
    activeDrawer,
    closeActiveDrawer,
    getActiveWorkspaceId: () => activeWorkspaceRef.current?.id ?? null,
    loadAssetLibrary,
    loadHistoryLibrary,
    loadWorkflowLibrary,
    setActiveDrawer,
    setExecutionLogPanelOpen,
    setProjectPanelOpen,
  });

  const {
    commitWorkspaceRename,
    handleCreateWorkspace,
    handleDeleteWorkspace,
    handleExportWorkspace,
    handleImportWorkspace,
    handleManualSave,
    handleSelectWorkspace,
    renameInputRef,
    setWorkspaceNameDraft,
    workspaceNameDraft,
  } = useLinghuiPageWorkspaceActions({
    activeWorkspace,
    activeWorkspaceRef,
    activateWorkspace,
    closeActiveDrawer,
    flushWorkspaceSave,
    message,
    modal,
    refreshWorkspaceList,
    scheduleWorkspaceSave,
    setExecutionLogPanelOpen,
    setProjectPanelOpen,
    setWorkspaceList,
    workspaceList,
  });

  const {
    handleCanvasCrash,
    handleCanvasRecover,
    handleCanvasReload,
    handleClearNodeRunState,
    handleGraphChange,
    handleNodeMutate,
    handleRestoreNodeRuns,
  } = useLinghuiPageCanvasHandlers({
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
  });

  const {
    pendingExecutionPlan,
    handleCancelExecutionPlan,
    handleConfirmExecutionPlan,
    openExecutionPlan,
  } = useLinghuiPageExecutionPlan({
    activeWorkspaceRef,
    canvasRef,
    message,
    runWorkflow,
    workflowLogger,
  });

  const nodeRuns = workspaceRuntime.nodeRuns;

  const {
    handleConnectionError,
    handleRunAll,
    handleRunSelection,
    handleRunSingleNode,
  } = useLinghuiPageRunHandlers({
    activeWorkspaceRef,
    canvasRef,
    message,
    openExecutionPlan,
    runWorkflow,
    updateWorkspaceExecution,
    workflowLogger,
    workspaceRuntimeRef,
  });

  const handleExportSelection = useLinghuiPageExportSelection({
    activeWorkspaceRef,
    canvasRef,
    message,
    workspaceRuntimeRef,
  });

  const {
    executionLogErrorCount,
    executionLogItems,
    executionLogLatest,
    handleCancelRun,
    handleFocusFailedNode,
    handleFocusLogNode,
    handleRerunAffected,
    handleRetryFailed,
  } = useLinghuiPageExecutionRailState({
    canvasRef,
    executionBatchesRef,
    message,
    nodeRuns,
    runWorkflow,
    setExecutionQueue,
    workspaceLogs: workspaceRuntime.executionLogs,
  });

  const canvasFloatingRail = useLinghuiPageFloatingRail({
    activeDrawer,
    activeWorkspaceId: activeWorkspace?.id,
    activeWorkspaceName: activeWorkspace?.name,
    executionLogCollapsed,
    executionLogErrorCount,
    executionLogItems,
    executionLogLatest,
    executionLogPanelOpen,
    lastSavedAt,
    onCloseActiveDrawer: closeActiveDrawer,
    onCommitWorkspaceRename: commitWorkspaceRename,
    onCreateWorkspace: handleCreateWorkspace,
    onDeleteWorkspace: handleDeleteWorkspace,
    onExit,
    onExportWorkspace: handleExportWorkspace,
    onFocusLogNode: handleFocusLogNode,
    onImportWorkspace: handleImportWorkspace,
    onManualSave: handleManualSave,
    onSelectWorkspace: handleSelectWorkspace,
    onSetExecutionLogCollapsed: setExecutionLogCollapsed,
    onSetExecutionLogPanelOpen: setExecutionLogPanelOpen,
    onSetProjectPanelOpen: setProjectPanelOpen,
    onSetWorkspaceNameDraft: setWorkspaceNameDraft,
    onToggleDrawer: handleToggleDrawer,
    projectPanelOpen,
    railShellRef,
    renameInputRef,
    saving,
    workspaceList,
    workspaceLogCount: workspaceRuntime.executionLogs.length,
    workspaceNameDraft,
  });

  if (loading) {
    return <LinghuiPageLoading />;
  }

  return (
    <div className="linghuiPage">
      <LinghuiPageShell
        activeWorkspace={activeWorkspace}
        canvasRef={canvasRef}
        executionQueue={executionQueue}
        nodeRuns={nodeRuns}
        projectEntry={canvasFloatingRail}
        onAssetLibraryMutate={handleAssetLibraryMutate}
        onCancelRun={handleCancelRun}
        onCanvasCrash={handleCanvasCrash}
        onCanvasRecover={handleCanvasRecover}
        onCanvasReload={handleCanvasReload}
        onClearNodeRunState={handleClearNodeRunState}
        onConnectionError={handleConnectionError}
        onExportSelection={handleExportSelection}
        onFocusFailedNode={handleFocusFailedNode}
        onGraphChange={handleGraphChange}
        onNodeMutate={handleNodeMutate}
        onOpenDrawer={handleOpenDrawerFromCanvas}
        onRestoreNodeRuns={handleRestoreNodeRuns}
        onRerunAffected={handleRerunAffected}
        onRetryFailed={handleRetryFailed}
        onRunAll={handleRunAll}
        onRunSelection={handleRunSelection}
        onRunSingleNode={handleRunSingleNode}
        onWorkflowTemplateMutate={handleWorkflowTemplateMutate}
      />

      <LinghuiPageOverlays
        activeDrawer={activeDrawer}
        activeWorkspaceId={activeWorkspace?.id}
        assetFilter={assetFilter}
        assetLoading={assetLoading}
        historyLoading={historyLoading}
        pendingExecutionPlan={pendingExecutionPlan}
        workflowLoading={workflowLoading}
        workflowTemplates={workflowTemplates}
        workspaceAssets={workspaceAssets}
        workspaceHistory={workspaceHistory}
        onAssetFilterChange={setAssetFilter}
        onCancelExecutionPlan={handleCancelExecutionPlan}
        onCloseDrawer={closeActiveDrawer}
        onConfirmExecutionPlan={handleConfirmExecutionPlan}
        onRefreshAssets={loadAssetLibrary}
        onRefreshHistory={loadHistoryLibrary}
        onRefreshWorkflows={loadWorkflowLibrary}
        onSendAssetToCanvas={handleSendAssetToCanvas}
        onSendHistoryToCanvas={handleSendHistoryToCanvas}
        onSendWorkflowToCanvas={handleSendWorkflowToCanvas}
      />
    </div>
  );
};

export default LinghuiPage;

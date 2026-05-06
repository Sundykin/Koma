import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { App as AntApp, Spin } from 'antd';
import {
  createLinghuiWorkspace,
  createLinghuiWorkspaceHistoryRecord,
  listLinghuiWorkflowTemplates,
  listLinghuiWorkspaceAssets,
  listLinghuiWorkspaceHistoryRecords,
  listLinghuiWorkspaces,
  loadLinghuiWorkspace,
  saveLinghuiWorkspace,
  type LinghuiWorkflowTemplateRecord,
  type LinghuiWorkspaceAssetRecord,
  type LinghuiWorkspaceHistoryRecord,
} from '../../../../store/linghuiStorage';
import type {
  LinghuiExecutionLogEntry,
  LinghuiExecutionQueueState,
  LinghuiGraphSnapshot,
  LinghuiGraphStats,
  LinghuiNodeRunState,
  LinghuiViewportState,
  LinghuiWorkspaceDocument,
  LinghuiWorkspaceMeta,
} from '../../../../types/linghui';
import {
  DEFAULT_LINGHUI_WORKSPACE_NAME,
  EMPTY_LINGHUI_EXECUTION_LOGS,
  EMPTY_LINGHUI_NODE_RUNS,
} from '../../../../types/linghui';
import {
  ArrowLeft,
  FolderOpen,
  History,
  Library,
  Plus,
  Save,
  Workflow,
} from 'lucide-react';
import LinghuiCanvas, {
  type LinghuiCanvasHandle,
} from '../../canvas/components/LinghuiCanvas';
import { LinghuiLibraryDrawer, type LinghuiAssetFilter, type LinghuiLibraryDrawerKey } from '../../library/components/LinghuiLibraryDrawer';
import { collectLinghuiDependentNodeIds, executeLinghuiWorkflow } from '../../execution/state/linghuiExecution';
import { buildLinghuiExecutionPlan, type LinghuiExecutionPlan } from '../../execution/state/linghuiExecutionPlan';
import { exportLinghuiNodeResults } from '../../execution/state/linghuiResultExport';
import { cloneSnapshotValue, detectCanvasMutationKind } from '../../canvas/state/linghuiCanvasShared';
import { createLogger } from '../../../../store/logger';
import { loadSettings } from '../../../../store/settings/core';
import { resetLinghuiCanvasStore, useLinghuiCanvasStore } from '../../canvas/state/linghuiCanvasStore';
import { LinghuiExecutionPlanModal } from '../../execution/components/LinghuiExecutionPlanModal';
import '../styles/LinghuiPage.scss';

function createLog(level: LinghuiExecutionLogEntry['level'], message: string, nodeId?: string): LinghuiExecutionLogEntry {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    level,
    message,
    nodeId,
    createdAt: Date.now(),
  };
}

function mergeExecutionLogs(
  currentLogs: LinghuiExecutionLogEntry[],
  entry: LinghuiExecutionLogEntry,
): LinghuiExecutionLogEntry[] {
  return [...currentLogs, entry].slice(-80);
}

interface LinghuiPageProps {
  onExit?: () => void;
}

type LinghuiWorkspaceRuntimeState = Pick<LinghuiWorkspaceDocument, 'nodeRuns' | 'executionLogs'>;

const EMPTY_WORKSPACE_RUNTIME: LinghuiWorkspaceRuntimeState = {
  nodeRuns: EMPTY_LINGHUI_NODE_RUNS,
  executionLogs: EMPTY_LINGHUI_EXECUTION_LOGS,
};
const WORKSPACE_SAVE_DEBOUNCE_MS = 2500;
const workflowLogger = createLogger('LinghuiWorkflowExecution');

interface PendingLinghuiExecutionPlanRequest {
  plan: LinghuiExecutionPlan;
  scopeLabel: string;
  targetNodeIds?: string[];
  options?: {
    resolveTargetsOnly?: boolean;
    successMessage?: string;
  };
}

export const LinghuiPage: React.FC<LinghuiPageProps> = ({ onExit }) => {
  const { message } = AntApp.useApp();
  const canvasRef = useRef<LinghuiCanvasHandle | null>(null);
  const railShellRef = useRef<HTMLDivElement | null>(null);
  const renameInputRef = useRef<HTMLInputElement | null>(null);
  const saveTimerRef = useRef<number | null>(null);
  const executionAbortControllerRef = useRef<AbortController | null>(null);
  const pendingSaveRef = useRef<{
    doc: LinghuiWorkspaceDocument;
    syncActiveWorkspace: boolean;
    refreshWorkspaceList: boolean;
  } | null>(null);
  const activeWorkspaceRef = useRef<LinghuiWorkspaceDocument | null>(null);
  const persistedWorkspaceRef = useRef<LinghuiWorkspaceDocument | null>(null);
  const workspaceRuntimeRef = useRef<LinghuiWorkspaceRuntimeState>(EMPTY_WORKSPACE_RUNTIME);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [, setRunning] = useState(false);
  const [executionQueue, setExecutionQueue] = useState<LinghuiExecutionQueueState | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [workspaceList, setWorkspaceList] = useState<LinghuiWorkspaceMeta[]>([]);
  const [activeWorkspace, setActiveWorkspace] = useState<LinghuiWorkspaceDocument | null>(null);
  const [workspaceNameDraft, setWorkspaceNameDraft] = useState(DEFAULT_LINGHUI_WORKSPACE_NAME);
  const [workspaceRuntime, setWorkspaceRuntime] = useState<LinghuiWorkspaceRuntimeState>(EMPTY_WORKSPACE_RUNTIME);
  const [assetFilter, setAssetFilter] = useState<LinghuiAssetFilter>('all');
  const [assetLoading, setAssetLoading] = useState(false);
  const [workspaceAssets, setWorkspaceAssets] = useState<LinghuiWorkspaceAssetRecord[]>([]);
  const [workflowLoading, setWorkflowLoading] = useState(false);
  const [workflowTemplates, setWorkflowTemplates] = useState<LinghuiWorkflowTemplateRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [workspaceHistory, setWorkspaceHistory] = useState<LinghuiWorkspaceHistoryRecord[]>([]);
  const [pendingExecutionPlan, setPendingExecutionPlan] = useState<PendingLinghuiExecutionPlanRequest | null>(null);
  const [projectPanelOpen, setProjectPanelOpen] = useState(false);
  const [, setStats] = useState<LinghuiGraphStats>({
    nodeCount: 0,
    linkCount: 0,
    groupCount: 0,
  });
  const activeDrawer = useLinghuiCanvasStore(state => state.activeDrawer);
  const setActiveDrawer = useLinghuiCanvasStore(state => state.setActiveDrawer);
  const closeActiveDrawer = useLinghuiCanvasStore(state => state.closeActiveDrawer);

  useEffect(() => {
    resetLinghuiCanvasStore();
    return () => {
      resetLinghuiCanvasStore();
    };
  }, []);

  useEffect(() => {
    activeWorkspaceRef.current = activeWorkspace
      ? {
          ...activeWorkspace,
          nodeRuns: workspaceRuntimeRef.current.nodeRuns,
          executionLogs: workspaceRuntimeRef.current.executionLogs,
        }
      : null;
  }, [activeWorkspace]);

  useEffect(() => {
    setWorkspaceNameDraft(activeWorkspace?.name ?? DEFAULT_LINGHUI_WORKSPACE_NAME);
  }, [activeWorkspace?.id, activeWorkspace?.name]);

  useEffect(() => {
    if (!projectPanelOpen) {
      return undefined;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (railShellRef.current && target instanceof Node && railShellRef.current.contains(target)) {
        return;
      }
      setProjectPanelOpen(false);
    };

    window.addEventListener('pointerdown', handlePointerDown, true);
    return () => window.removeEventListener('pointerdown', handlePointerDown, true);
  }, [projectPanelOpen]);

  const applyWorkspaceRuntime = useCallback((runtime: LinghuiWorkspaceRuntimeState) => {
    workspaceRuntimeRef.current = runtime;
    setWorkspaceRuntime(runtime);
  }, []);

  const activateWorkspace = useCallback((workspace: LinghuiWorkspaceDocument) => {
    activeWorkspaceRef.current = workspace;
    persistedWorkspaceRef.current = workspace;
    applyWorkspaceRuntime({
      nodeRuns: workspace.nodeRuns,
      executionLogs: workspace.executionLogs,
    });
    setActiveWorkspace(workspace);
    setStats({
      nodeCount: workspace.nodeCount,
      linkCount: workspace.linkCount,
      groupCount: workspace.groupCount,
    });
    setLastSavedAt(workspace.updatedAt);
  }, [applyWorkspaceRuntime]);

  useEffect(() => {
    let mounted = true;

    const bootstrap = async () => {
      try {
        const items = await listLinghuiWorkspaces();
        if (!mounted) return;

        setWorkspaceList(items);

        if (!items.length) {
          const workspace = await createLinghuiWorkspace(DEFAULT_LINGHUI_WORKSPACE_NAME);
          if (!mounted) return;
          setWorkspaceList([workspace]);
          activateWorkspace(workspace);
        } else {
          const latest = await loadLinghuiWorkspace(items[0].id);
          if (!mounted || !latest) return;
          activateWorkspace(latest);
        }
      } catch (error: any) {
        message.error(error?.message || '初始化灵绘工作区失败');
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    bootstrap();

    return () => {
      mounted = false;
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
      }
      executionAbortControllerRef.current?.abort('工作区已关闭，停止当前执行');
    };
  }, [activateWorkspace, message]);

  const refreshWorkspaceList = useCallback(async (preferredId?: string) => {
    const items = await listLinghuiWorkspaces();
    setWorkspaceList(items);

    if (!preferredId || activeWorkspaceRef.current?.id === preferredId) return;
    const preferred = items.find(item => item.id === preferredId);
    if (!preferred) return;
    const loaded = await loadLinghuiWorkspace(preferred.id);
    if (!loaded) return;
    activateWorkspace(loaded);
  }, [activateWorkspace]);

  const loadAssetLibrary = useCallback(async (workspaceId: string | null | undefined) => {
    if (!workspaceId) {
      setWorkspaceAssets([]);
      return;
    }

    setAssetLoading(true);
    try {
      const assets = await listLinghuiWorkspaceAssets(workspaceId);
      setWorkspaceAssets(assets);
    } catch (error: any) {
      message.error(error?.message || '读取灵绘资产库失败');
    } finally {
      setAssetLoading(false);
    }
  }, [message]);

  useEffect(() => {
    if (activeDrawer !== 'asset') return;
    void loadAssetLibrary(activeWorkspace?.id ?? null);
  }, [activeDrawer, activeWorkspace?.id, loadAssetLibrary]);

  const loadWorkflowLibrary = useCallback(async (workspaceId: string | null | undefined) => {
    if (!workspaceId) {
      setWorkflowTemplates([]);
      return;
    }

    setWorkflowLoading(true);
    try {
      const items = await listLinghuiWorkflowTemplates(workspaceId);
      setWorkflowTemplates(items);
    } catch (error: any) {
      message.error(error?.message || '读取灵绘工作流模板失败');
    } finally {
      setWorkflowLoading(false);
    }
  }, [message]);

  useEffect(() => {
    if (activeDrawer !== 'workflow') return;
    void loadWorkflowLibrary(activeWorkspace?.id ?? null);
  }, [activeDrawer, activeWorkspace?.id, loadWorkflowLibrary]);

  const loadHistoryLibrary = useCallback(async (workspaceId: string | null | undefined) => {
    if (!workspaceId) {
      setWorkspaceHistory([]);
      return;
    }

    setHistoryLoading(true);
    try {
      const items = await listLinghuiWorkspaceHistoryRecords(workspaceId);
      setWorkspaceHistory(items);
    } catch (error: any) {
      message.error(error?.message || '读取灵绘历史结果失败');
    } finally {
      setHistoryLoading(false);
    }
  }, [message]);

  useEffect(() => {
    if (activeDrawer !== 'history') return;
    void loadHistoryLibrary(activeWorkspace?.id ?? null);
  }, [activeDrawer, activeWorkspace?.id, loadHistoryLibrary]);

  const handleHistoryLibraryMutate = useCallback(() => {
    void loadHistoryLibrary(activeWorkspaceRef.current?.id ?? null);
  }, [loadHistoryLibrary]);

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
      const saved = await saveLinghuiWorkspace(doc);
      activeWorkspaceRef.current = saved;
      persistedWorkspaceRef.current = saved;
      workspaceRuntimeRef.current = {
        nodeRuns: saved.nodeRuns,
        executionLogs: saved.executionLogs,
      };
      if (syncActiveWorkspace) {
        setActiveWorkspace(saved);
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
  }, [message, refreshWorkspaceList]);

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
  }, [persistWorkspace]);

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
  }, [persistWorkspace]);

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

    const nextLogs = mergeExecutionLogs(
      current.executionLogs,
      createLog('info', reason),
    );

    updateWorkspaceExecution(nextRuns, nextLogs);
  }, [updateWorkspaceExecution]);

  const runWorkflow = useCallback(async (
    targetNodeIds?: string[],
    options?: {
      resolveTargetsOnly?: boolean;
      successMessage?: string;
    },
  ) => {
    workflowLogger.info('灵绘执行入口', {
      targetNodeIds,
      resolveTargetsOnly: options?.resolveTargetsOnly ?? false,
      hasAbortController: Boolean(executionAbortControllerRef.current),
      abortControllerAborted: executionAbortControllerRef.current?.signal.aborted ?? null,
      hasCanvasHandle: Boolean(canvasRef.current),
      hasActiveWorkspace: Boolean(activeWorkspaceRef.current),
    });

    if (executionAbortControllerRef.current && !executionAbortControllerRef.current.signal.aborted) {
      workflowLogger.warn('灵绘执行被阻止：已有执行队列', {
        targetNodeIds,
      });
      message.info('当前已有执行队列，请先等待完成或取消');
      return;
    }

    const context = canvasRef.current?.getExecutionContext();
    const current = activeWorkspaceRef.current;
    if (!context || !current) {
      workflowLogger.warn('灵绘执行被阻止：缺少执行上下文', {
        hasContext: Boolean(context),
        hasWorkspace: Boolean(current),
        targetNodeIds,
      });
      return;
    }

    try {
      context.settingsSnapshot = cloneSnapshotValue(await loadSettings());
    } catch (error: any) {
      workflowLogger.error('灵绘执行被阻止：读取 settings 快照失败', {
        targetNodeIds,
        error: error?.message || String(error),
      });
      message.error(error?.message || '读取执行配置失败');
      return;
    }

    workflowLogger.info('灵绘执行上下文已就绪', {
      targetNodeIds,
      contextNodeCount: context.nodes.length,
      contextEdgeCount: context.edges.length,
      workspaceId: current.id,
    });

    const requestedTargetNodeIds = targetNodeIds?.length ? [...new Set(targetNodeIds)] : undefined;
    const contextNodeIds = new Set(context.nodes.map(node => node.id));
    const missingTargetNodeIds = requestedTargetNodeIds?.filter(nodeId => !contextNodeIds.has(nodeId)) ?? [];
    const runnableTargetNodeIds = requestedTargetNodeIds?.filter(nodeId => contextNodeIds.has(nodeId));

    if (missingTargetNodeIds.length > 0) {
      workflowLogger.warn('灵绘执行目标节点缺失，可能尚未同步到画布', {
        requestedTargetNodeIds,
        runnableTargetNodeIds,
        missingTargetNodeIds,
        contextNodeCount: context.nodes.length,
      });
    }

    if (requestedTargetNodeIds && runnableTargetNodeIds?.length === 0) {
      workflowLogger.warn('灵绘执行被阻止：目标节点未进入执行上下文', {
        requestedTargetNodeIds,
        missingTargetNodeIds,
      });
      message.error('目标节点尚未同步到画布，请稍后重试');
      return;
    }

    let nextRuns = { ...current.nodeRuns };
    let nextLogs = [...current.executionLogs];
    const nodeSnapshotMap = new Map(context.nodes.map(node => [node.id, node]));
    const abortController = new AbortController();
    executionAbortControllerRef.current = abortController;

    setRunning(true);
    setExecutionQueue(null);

    try {
      workflowLogger.info('灵绘开始执行工作流', {
        targetNodeIds: runnableTargetNodeIds ?? targetNodeIds,
        resolveTargetsOnly: options?.resolveTargetsOnly ?? false,
      });
      const result = await executeLinghuiWorkflow({
        context,
        targetNodeIds: runnableTargetNodeIds ?? targetNodeIds,
        previousRuns: current.nodeRuns,
        resolveTargetsOnly: options?.resolveTargetsOnly,
        signal: abortController.signal,
        // workspaceId 当 projectId 兜底，节点执行会进统一任务面板
        workspaceId: activeWorkspaceRef.current?.id,
        onNodeStateChange(nodeId, nextState) {
          nextRuns = {
            ...nextRuns,
            [nodeId]: nextState,
          };
          updateWorkspaceExecution(nextRuns, nextLogs);
        },
        onLog(entry) {
          nextLogs = mergeExecutionLogs(nextLogs, entry);
          updateWorkspaceExecution(nextRuns, nextLogs);
        },
        onQueueChange(queue) {
          setExecutionQueue(queue);
        },
      });

      const finalRuns = result.runs;
      workflowLogger.info('灵绘执行工作流结束', {
        queueStatus: result.queue.status,
        completedNodeIds: result.queue.completedNodeIds,
        failedNodeIds: result.queue.failedNodeIds,
        canceledNodeIds: result.queue.canceledNodeIds,
      });
      nextRuns = finalRuns;
      updateWorkspaceExecution(nextRuns, nextLogs);

      const completedNodeIds = new Set(result.queue.completedNodeIds);
      const historyCandidates = Object.entries(finalRuns).filter(([nodeId, runState]) => (
        completedNodeIds.has(nodeId) &&
        runState.status === 'succeeded' &&
        Boolean(runState.result) &&
        (runState.updatedAt ?? 0) > (current.nodeRuns[nodeId]?.updatedAt ?? 0)
      ));

      if (current.id && historyCandidates.length > 0) {
        const historyResults = await Promise.allSettled(historyCandidates.map(async ([nodeId, runState]) => {
          const nodeSnapshot = nodeSnapshotMap.get(nodeId);
          if (!nodeSnapshot) return null;
          const result = await createLinghuiWorkspaceHistoryRecord({
            workspaceId: current.id,
            nodeId,
            nodeData: nodeSnapshot.data,
            nodeRun: runState,
          });
          return { nodeId, ...result };
        }));

        let hasHistoryMutate = false;
        let hasRunMaterialization = false;

        for (const outcome of historyResults) {
          if (outcome.status !== 'fulfilled' || !outcome.value) continue;
          hasHistoryMutate = true;
          if (outcome.value.materializedRun) {
            nextRuns = {
              ...nextRuns,
              [outcome.value.nodeId]: outcome.value.materializedRun,
            };
            hasRunMaterialization = true;
          }
        }

        if (hasHistoryMutate) {
          handleHistoryLibraryMutate();
        }
        if (hasRunMaterialization) {
          updateWorkspaceExecution(nextRuns, nextLogs);
        }
      }

      if (result.queue.status === 'canceled') {
        message.warning('已取消当前执行队列');
      } else if (result.queue.failedNodeIds.length > 0) {
        const firstFailedNodeId = result.queue.failedNodeIds[0];
        const firstFailedLabel = firstFailedNodeId
          ? nodeSnapshotMap.get(firstFailedNodeId)?.data.label
          : '';
        const firstFailedError = firstFailedNodeId
          ? finalRuns[firstFailedNodeId]?.error
          : '';
        message.warning(
          firstFailedLabel && firstFailedError
            ? `${result.queue.failedNodeIds.length} 个节点失败：${firstFailedLabel} · ${firstFailedError}`
            : `执行完成，但有 ${result.queue.failedNodeIds.length} 个节点失败`,
        );
        if (firstFailedNodeId) {
          window.setTimeout(() => {
            canvasRef.current?.focusNodes([firstFailedNodeId], { select: true });
          }, 120);
        }
      } else {
        message.success(
          options?.successMessage ||
          (targetNodeIds?.length ? '已执行选中节点' : '已执行全部工作流'),
        );
      }
    } catch (error: any) {
      workflowLogger.error('灵绘执行工作流异常', {
        targetNodeIds: runnableTargetNodeIds ?? targetNodeIds,
        error: error?.message || String(error),
      });
      const failureMessage = error?.message || '执行灵绘工作流失败';
      nextLogs = mergeExecutionLogs(nextLogs, createLog('error', failureMessage));
      updateWorkspaceExecution(nextRuns, nextLogs);
      message.error(failureMessage);
    } finally {
      if (executionAbortControllerRef.current === abortController) {
        executionAbortControllerRef.current = null;
      }
      setRunning(false);
      canvasRef.current?.notifyMutation();
    }
  }, [handleHistoryLibraryMutate, message, updateWorkspaceExecution]);

  const openDrawer = useCallback(async (drawer: LinghuiLibraryDrawerKey) => {
    setActiveDrawer(drawer);

    if (drawer === 'asset') {
      await loadAssetLibrary(activeWorkspaceRef.current?.id ?? null);
      return;
    }
    if (drawer === 'workflow') {
      await loadWorkflowLibrary(activeWorkspaceRef.current?.id ?? null);
      return;
    }
    if (drawer === 'history') {
      await loadHistoryLibrary(activeWorkspaceRef.current?.id ?? null);
    }
  }, [loadAssetLibrary, loadHistoryLibrary, loadWorkflowLibrary]);

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

  const handleAssetLibraryMutate = useCallback(() => {
    void loadAssetLibrary(activeWorkspaceRef.current?.id ?? null);
  }, [loadAssetLibrary]);

  const handleWorkflowTemplateMutate = useCallback(() => {
    void loadWorkflowLibrary(activeWorkspaceRef.current?.id ?? null);
  }, [loadWorkflowLibrary]);

  const handleSendAssetToCanvas = useCallback((asset: LinghuiWorkspaceAssetRecord) => {
    canvasRef.current?.addWorkspaceAsset(asset);
    message.success(`已将 ${asset.name} 发送到画布`);
  }, [message]);

  const handleSendWorkflowToCanvas = useCallback((template: LinghuiWorkflowTemplateRecord) => {
    canvasRef.current?.addWorkflowTemplate(template);
    message.success(`已将工作流 ${template.name} 发送到画布`);
  }, [message]);

  const handleSendHistoryToCanvas = useCallback((record: LinghuiWorkspaceHistoryRecord) => {
    canvasRef.current?.addWorkspaceAsset(record);
    message.success(`已将历史结果 ${record.name} 发送到画布`);
  }, [message]);

  const handleManualSave = useCallback(async () => {
    const success = await flushWorkspaceSave({
      notify: true,
      syncActiveWorkspace: true,
      refreshWorkspaceList: true,
      showIndicator: true,
    });
    if (success) {
      setProjectPanelOpen(false);
    }
  }, [flushWorkspaceSave]);

  const handleCreateWorkspace = useCallback(async () => {
    const flushed = await flushWorkspaceSave({
      syncActiveWorkspace: true,
      refreshWorkspaceList: true,
      showIndicator: true,
    });
    if (!flushed) {
      return;
    }

    try {
      const workspace = await createLinghuiWorkspace(DEFAULT_LINGHUI_WORKSPACE_NAME);
      activateWorkspace(workspace);
      await refreshWorkspaceList(workspace.id);
      closeActiveDrawer();
      setProjectPanelOpen(true);
      message.success('已创建新的灵绘项目');
      window.setTimeout(() => {
        renameInputRef.current?.focus();
        renameInputRef.current?.select();
      }, 0);
    } catch (error: any) {
      message.error(error?.message || '创建新的灵绘项目失败');
    }
  }, [activateWorkspace, closeActiveDrawer, flushWorkspaceSave, message, refreshWorkspaceList]);

  const handleSelectWorkspace = useCallback(async (workspaceId: string) => {
    if (!workspaceId || workspaceId === activeWorkspaceRef.current?.id) {
      setProjectPanelOpen(false);
      return;
    }

    const flushed = await flushWorkspaceSave({
      syncActiveWorkspace: false,
      refreshWorkspaceList: false,
      showIndicator: true,
    });
    if (!flushed) {
      return;
    }

    const workspace = await loadLinghuiWorkspace(workspaceId);
    if (!workspace) {
      message.error('无法加载所选灵绘项目');
      return;
    }

    activateWorkspace(workspace);
    setProjectPanelOpen(false);
  }, [activateWorkspace, flushWorkspaceSave, message]);

  const commitWorkspaceRename = useCallback((nextName?: string) => {
    const current = activeWorkspaceRef.current;
    if (!current) {
      return;
    }

    const normalizedName = (nextName ?? workspaceNameDraft).trim() || DEFAULT_LINGHUI_WORKSPACE_NAME;
    setWorkspaceNameDraft(normalizedName);

    if (current.name === normalizedName) {
      return;
    }

    scheduleWorkspaceSave({
      ...current,
      name: normalizedName,
    }, {
      syncActiveWorkspace: true,
      refreshWorkspaceList: true,
    });
  }, [scheduleWorkspaceSave, workspaceNameDraft]);

  const handleGraphChange = useCallback((
    graphData: LinghuiGraphSnapshot,
    viewport: LinghuiViewportState,
    nextStats: LinghuiGraphStats,
  ) => {
    const current = activeWorkspaceRef.current;
    if (!current) return;
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
  }, [scheduleWorkspaceSave]);

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
  }, [updateWorkspaceExecution]);

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
  }, []);

  const openExecutionPlan = useCallback(async (
    scopeLabel: string,
    targetNodeIds?: string[],
    options?: {
      resolveTargetsOnly?: boolean;
      successMessage?: string;
    },
  ) => {
    if (executionAbortControllerRef.current && !executionAbortControllerRef.current.signal.aborted) {
      message.info('当前已有执行队列，请先等待完成或取消');
      return;
    }

    const context = canvasRef.current?.getExecutionContext();
    const currentWorkspace = activeWorkspaceRef.current;
    if (!context || !currentWorkspace) {
      return;
    }

    const requestedTargetNodeIds = targetNodeIds?.length ? [...new Set(targetNodeIds)] : undefined;
    const contextNodeIds = new Set(context.nodes.map(node => node.id));
    const missingTargetNodeIds = requestedTargetNodeIds?.filter(nodeId => !contextNodeIds.has(nodeId)) ?? [];
    const runnableTargetNodeIds = requestedTargetNodeIds?.filter(nodeId => contextNodeIds.has(nodeId));

    if (missingTargetNodeIds.length > 0) {
      workflowLogger.warn('灵绘执行计划目标节点缺失，可能尚未同步到画布', {
        requestedTargetNodeIds,
        runnableTargetNodeIds,
        missingTargetNodeIds,
      });
    }

    if (requestedTargetNodeIds && runnableTargetNodeIds?.length === 0) {
      message.error('目标节点尚未同步到画布，请稍后重试');
      return;
    }

    try {
      const plan = buildLinghuiExecutionPlan({
        context,
        targetNodeIds: runnableTargetNodeIds ?? requestedTargetNodeIds,
        previousRuns: currentWorkspace.nodeRuns,
      });
      setPendingExecutionPlan({
        plan,
        scopeLabel,
        targetNodeIds: runnableTargetNodeIds ?? requestedTargetNodeIds,
        options,
      });
    } catch (error: any) {
      message.error(error?.message || '生成执行计划失败');
    }
  }, [message]);

  const handleConfirmExecutionPlan = useCallback(async () => {
    const pendingPlan = pendingExecutionPlan;
    if (!pendingPlan) {
      return;
    }
    setPendingExecutionPlan(null);
    await runWorkflow(pendingPlan.targetNodeIds, pendingPlan.options);
  }, [pendingExecutionPlan, runWorkflow]);

  const handleRunAll = useCallback(async () => {
    await openExecutionPlan('全部工作流');
  }, [openExecutionPlan]);

  const handleRunSingleNode = useCallback(async (nodeId: string) => {
    workflowLogger.info('灵绘触发单节点执行', {
      nodeId,
    });
    await runWorkflow([nodeId], {
      resolveTargetsOnly: true,
      successMessage: '已执行当前节点',
    });
  }, [runWorkflow]);

  const nodeRuns = workspaceRuntime.nodeRuns;

  const handleRunSelection = useCallback(async (selectionIds?: string[]) => {
    const rawSelectionIds = selectionIds?.length
      ? selectionIds
      : (canvasRef.current?.getSelectionIds() ?? []);
    const runnableIds = canvasRef.current?.resolveExecutionTargetIds(rawSelectionIds) ?? [];

    workflowLogger.info('灵绘触发批量执行', {
      rawSelectionIds,
      runnableIds,
    });

    if (!rawSelectionIds.length || !runnableIds.length) {
      message.info('请先选中需要执行的节点或工作流块');
      return;
    }

    const isWorkflowBlockRun = rawSelectionIds.length === 1 && runnableIds.length > 0 && rawSelectionIds[0] !== runnableIds[0];
    await openExecutionPlan(isWorkflowBlockRun ? '工作流块执行计划' : '选中节点执行计划', runnableIds, {
      successMessage: isWorkflowBlockRun ? '已执行工作流块' : '已执行选中节点',
    });
  }, [message, openExecutionPlan]);

  const handleExportSelection = useCallback(async (selectionIds?: string[]) => {
    const currentWorkspace = activeWorkspaceRef.current;
    if (!currentWorkspace) {
      message.info('请先打开一个灵绘工作区');
      return;
    }

    const rawSelectionIds = selectionIds?.length
      ? selectionIds
      : (canvasRef.current?.getSelectionIds() ?? []);
    const targetIds = canvasRef.current?.resolveExecutionTargetIds(rawSelectionIds) ?? [];

    if (!rawSelectionIds.length || !targetIds.length) {
      message.info('请先选中需要导出的节点或工作流块');
      return;
    }

    const nodeById = new Map(currentWorkspace.graphData.nodes.map(node => [node.id, node]));
    const targets = targetIds.flatMap(nodeId => {
      const node = nodeById.get(nodeId);
      return node ? [{
        node,
        runState: workspaceRuntimeRef.current.nodeRuns[nodeId],
      }] : [];
    });

    if (!targets.length) {
      message.info('当前选中的节点还没有可导出的结果');
      return;
    }

    try {
      const summary = await exportLinghuiNodeResults({
        workspaceName: currentWorkspace.name,
        targets,
      });

      if (!summary) {
        return;
      }

      if (summary.nodeCount === 0) {
        message.warning('当前选中的节点还没有可导出的结果');
        return;
      }

      const skippedCount = summary.skippedNodeIds.length;
      const summaryText = skippedCount > 0
        ? `已导出 ${summary.nodeCount} 个节点，共 ${summary.fileCount} 个文件，跳过 ${skippedCount} 个无结果节点`
        : `已导出 ${summary.nodeCount} 个节点，共 ${summary.fileCount} 个文件`;
      message.success(summaryText);
    } catch (error: any) {
      message.error(error?.message || '导出灵绘结果失败');
    }
  }, [message]);

  const failedNodeIds = useMemo(() => Object.entries(nodeRuns)
    .filter(([, item]) => item.status === 'failed')
    .sort((left, right) => (right[1].updatedAt ?? 0) - (left[1].updatedAt ?? 0))
    .map(([nodeId]) => nodeId), [nodeRuns]);

  const staleNodeIds = useMemo(() => Object.entries(nodeRuns)
    .filter(([, item]) => item.status === 'stale')
    .sort((left, right) => (right[1].updatedAt ?? 0) - (left[1].updatedAt ?? 0))
    .map(([nodeId]) => nodeId), [nodeRuns]);

  const handleFocusFailedNode = useCallback(() => {
    const targetNodeId = failedNodeIds[0];
    if (!targetNodeId) {
      message.info('当前没有失败节点');
      return;
    }
    canvasRef.current?.focusNodes([targetNodeId], { select: true });
  }, [failedNodeIds, message]);

  const handleFocusLogNode = useCallback((nodeId: string) => {
    if (!nodeId) {
      return;
    }
    canvasRef.current?.focusNodes([nodeId], { select: true });
  }, []);

  const handleRerunAffected = useCallback(async () => {
    if (staleNodeIds.length === 0) {
      message.info('当前没有待重跑节点');
      return;
    }

    await runWorkflow(staleNodeIds, {
      successMessage: '已重跑受影响节点',
    });
  }, [message, runWorkflow, staleNodeIds]);

  const handleRetryFailed = useCallback(async () => {
    if (failedNodeIds.length === 0) {
      message.info('当前没有失败节点');
      return;
    }

    await runWorkflow(failedNodeIds, {
      resolveTargetsOnly: true,
      successMessage: '已重试失败节点',
    });
  }, [failedNodeIds, message, runWorkflow]);

  const handleCancelRun = useCallback(() => {
    const controller = executionAbortControllerRef.current;
    if (!controller || controller.signal.aborted) {
      message.info('当前没有正在执行的队列');
      return;
    }

    controller.abort('用户取消了本轮灵绘执行');
    setExecutionQueue(current => current ? {
      ...current,
      status: 'canceling',
      updatedAt: Date.now(),
    } : current);
    message.info('已请求取消，当前节点结束后将停止后续队列');
  }, [message]);

  const handleConnectionError = useCallback((content: string) => {
    const currentWorkspace = activeWorkspaceRef.current;
    message.warning(content);
    if (!currentWorkspace) {
      return;
    }

    updateWorkspaceExecution(
      workspaceRuntimeRef.current.nodeRuns,
      mergeExecutionLogs(
        workspaceRuntimeRef.current.executionLogs,
        createLog('error', `连接失败：${content}`),
      ),
    );
  }, [message, updateWorkspaceExecution]);

  const canvasFloatingRail = useMemo(() => (
    <div
      ref={railShellRef}
      className={`linghuiCanvasRailShell ${projectPanelOpen ? 'isProjectPanelOpen' : ''}`}
    >
      <div className="linghuiCanvasRailGroup">
        {onExit ? (
          <button
            type="button"
            className="linghuiCanvasRailButton"
            onClick={onExit}
            title="返回上一页"
            aria-label="返回上一页"
          >
            <span className="linghuiCanvasRailIcon"><ArrowLeft size={16} /></span>
            <span className="linghuiCanvasRailLabel">返回</span>
          </button>
        ) : null}
        <button
          type="button"
          className={`linghuiCanvasRailButton ${projectPanelOpen ? 'isActive' : ''}`}
          onClick={() => {
            setProjectPanelOpen(current => !current);
          }}
          title="打开项目列表"
          aria-label="打开项目列表"
        >
          <span className="linghuiCanvasRailIcon"><FolderOpen size={16} /></span>
          <span className="linghuiCanvasRailLabel">项目列表</span>
        </button>
        <button
          type="button"
          className={`linghuiCanvasRailButton ${saving ? 'isActive' : ''}`}
          onClick={() => {
            void handleManualSave();
          }}
          title="保存当前项目"
          aria-label="保存当前项目"
          disabled={saving}
        >
          <span className="linghuiCanvasRailIcon"><Save size={16} /></span>
          <span className="linghuiCanvasRailLabel">{saving ? '保存中' : '保存'}</span>
        </button>
        <button
          type="button"
          className="linghuiCanvasRailButton"
          onClick={() => {
            void handleCreateWorkspace();
          }}
          title="创建新的灵绘项目"
          aria-label="创建新的灵绘项目"
        >
          <span className="linghuiCanvasRailIcon"><Plus size={16} /></span>
          <span className="linghuiCanvasRailLabel">新建</span>
        </button>
        <button
          type="button"
          className={`linghuiCanvasRailButton ${activeDrawer === 'workflow' ? 'isActive' : ''}`}
          onClick={() => handleToggleDrawer('workflow')}
          title="打开工作流面板"
          aria-label="打开工作流面板"
        >
          <span className="linghuiCanvasRailIcon"><Workflow size={16} /></span>
          <span className="linghuiCanvasRailLabel">工作流</span>
        </button>
        <button
          type="button"
          className={`linghuiCanvasRailButton ${activeDrawer === 'asset' ? 'isActive' : ''}`}
          onClick={() => handleToggleDrawer('asset')}
          title="打开资产面板"
          aria-label="打开资产面板"
        >
          <span className="linghuiCanvasRailIcon"><Library size={16} /></span>
          <span className="linghuiCanvasRailLabel">资产</span>
        </button>
        <button
          type="button"
          className={`linghuiCanvasRailButton ${activeDrawer === 'history' ? 'isActive' : ''}`}
          onClick={() => handleToggleDrawer('history')}
          title="打开历史面板"
          aria-label="打开历史面板"
        >
          <span className="linghuiCanvasRailIcon"><History size={16} /></span>
          <span className="linghuiCanvasRailLabel">历史</span>
        </button>
      </div>

      {projectPanelOpen ? (
        <div className="linghuiCanvasProjectPanel nopan nowheel">
          <div className="linghuiCanvasProjectPanelHeader">
            <div className="linghuiCanvasProjectPanelTitle">项目列表</div>
            <div className="linghuiCanvasProjectPanelMeta">
              {workspaceList.length} 个项目
              {lastSavedAt ? ` · 最近保存 ${new Date(lastSavedAt).toLocaleTimeString()}` : ''}
            </div>
          </div>

          <div className="linghuiCanvasProjectField">
            <label className="linghuiCanvasProjectFieldLabel" htmlFor="linghui-project-name">
              当前项目名称
            </label>
            <div className="linghuiCanvasProjectFieldRow">
              <input
                id="linghui-project-name"
                ref={renameInputRef}
                className="linghuiCanvasProjectNameInput"
                value={workspaceNameDraft}
                placeholder={DEFAULT_LINGHUI_WORKSPACE_NAME}
                onChange={event => setWorkspaceNameDraft(event.target.value)}
                onBlur={() => commitWorkspaceRename()}
                onKeyDown={event => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    commitWorkspaceRename();
                    event.currentTarget.blur();
                  } else if (event.key === 'Escape') {
                    setWorkspaceNameDraft(activeWorkspace?.name ?? DEFAULT_LINGHUI_WORKSPACE_NAME);
                    event.currentTarget.blur();
                  }
                }}
              />
              <button
                type="button"
                className="linghuiCanvasProjectActionButton isPrimary isIconOnly"
                onClick={() => {
                  void handleManualSave();
                }}
                disabled={saving}
                title={saving ? '保存中' : '保存当前项目'}
                aria-label={saving ? '保存中' : '保存当前项目'}
              >
                <Save size={14} />
              </button>
            </div>
          </div>

          <div className="linghuiCanvasProjectList">
            {workspaceList.map(workspace => (
              <button
                key={workspace.id}
                type="button"
                className={`linghuiCanvasProjectItem ${workspace.id === activeWorkspace?.id ? 'isActive' : ''}`}
                onClick={() => {
                  void handleSelectWorkspace(workspace.id);
                }}
              >
                <span className="linghuiCanvasProjectItemName">{workspace.name}</span>
                <span className="linghuiCanvasProjectItemMeta">
                  更新于 {new Date(workspace.updatedAt).toLocaleString()}
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  ), [
    activeDrawer,
    activeWorkspace?.id,
    activeWorkspace?.name,
    commitWorkspaceRename,
    handleCreateWorkspace,
    handleManualSave,
    handleSelectWorkspace,
    handleToggleDrawer,
    lastSavedAt,
    onExit,
    projectPanelOpen,
    saving,
    workspaceList,
    workspaceNameDraft,
  ]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center bg-bg-app">
        <Spin size="large" description="加载灵绘工作台..." />
      </div>
    );
  }

  return (
    <div className="linghuiPage">
      <div className="linghuiCanvasPanel">
        <div className="linghuiCanvasWorkspace">
          <LinghuiCanvas
            ref={canvasRef}
            workspace={activeWorkspace}
            projectEntry={canvasFloatingRail}
            nodeRuns={nodeRuns}
            onGraphChange={handleGraphChange}
            onNodeMutate={handleNodeMutate}
            onClearNodeRunState={handleClearNodeRunState}
            onRestoreNodeRuns={handleRestoreNodeRuns}
            onConnectionError={handleConnectionError}
            onAssetLibraryMutate={handleAssetLibraryMutate}
            onWorkflowTemplateMutate={handleWorkflowTemplateMutate}
            onRunSingleNode={handleRunSingleNode}
            onRunAll={handleRunAll}
            onRunSelection={handleRunSelection}
            executionLogs={workspaceRuntime.executionLogs}
            onFocusLogNode={handleFocusLogNode}
            onExportSelection={handleExportSelection}
            onFocusFailedNode={handleFocusFailedNode}
            onRetryFailed={handleRetryFailed}
            onRerunAffected={handleRerunAffected}
            onCancelRun={handleCancelRun}
            executionQueue={executionQueue}
            onOpenDrawer={handleOpenDrawerFromCanvas}
          />
        </div>
      </div>

      <LinghuiLibraryDrawer
        activeDrawer={activeDrawer}
        assetFilter={assetFilter}
        workflowLoading={workflowLoading}
        assetLoading={assetLoading}
        historyLoading={historyLoading}
        workflowTemplates={workflowTemplates}
        workspaceAssets={workspaceAssets}
        workspaceHistory={workspaceHistory}
        onClose={closeActiveDrawer}
        onAssetFilterChange={setAssetFilter}
        onRefreshWorkflows={() => {
          void loadWorkflowLibrary(activeWorkspace?.id ?? null);
        }}
        onSendWorkflowToCanvas={handleSendWorkflowToCanvas}
        onRefreshAssets={() => {
          void loadAssetLibrary(activeWorkspace?.id ?? null);
        }}
        onSendAssetToCanvas={handleSendAssetToCanvas}
        onRefreshHistory={() => {
          void loadHistoryLibrary(activeWorkspace?.id ?? null);
        }}
        onSendHistoryToCanvas={handleSendHistoryToCanvas}
      />

      <LinghuiExecutionPlanModal
        open={pendingExecutionPlan !== null}
        scopeLabel={pendingExecutionPlan?.scopeLabel ?? '执行计划'}
        plan={pendingExecutionPlan?.plan ?? null}
        onConfirm={() => {
          void handleConfirmExecutionPlan();
        }}
        onCancel={() => setPendingExecutionPlan(null)}
      />
    </div>
  );
};

export default LinghuiPage;

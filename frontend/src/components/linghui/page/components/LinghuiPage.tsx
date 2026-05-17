import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { App as AntApp, Spin } from 'antd';
import {
  createLinghuiWorkspace,
  createLinghuiWorkspaceHistoryRecord,
  listLinghuiWorkspaces,
  loadLinghuiWorkspace,
} from '../../../../store/linghuiStorage';
import type {
  LinghuiExecutionLogEntry,
  LinghuiExecutionQueueState,
  LinghuiGraphStats,
  LinghuiNodeRunState,
  LinghuiWorkspaceDocument,
  LinghuiWorkspaceMeta,
} from '../../../../types/linghui';
import { DEFAULT_LINGHUI_WORKSPACE_NAME } from '../../../../types/linghui';
import LinghuiCanvas, {
  type LinghuiCanvasHandle,
} from '../../canvas/components/LinghuiCanvas';
import { LinghuiCanvasErrorBoundary } from '../../canvas/components/LinghuiCanvasErrorBoundary';
import { LinghuiLibraryDrawer, type LinghuiAssetFilter, type LinghuiLibraryDrawerKey } from '../../library/components/LinghuiLibraryDrawer';
import {
  collectLinghuiDependentNodeIds,
  detectLinghuiRunningNodeBlocks,
  executeLinghuiWorkflow,
} from '../../execution/state/linghuiExecution';
import { buildLinghuiExecutionPlan, type LinghuiExecutionPlan } from '../../execution/state/linghuiExecutionPlan';
import { exportLinghuiNodeResults } from '../../execution/state/linghuiResultExport';
import { cloneSnapshotValue } from '../../canvas/state/linghuiCanvasShared';
import { createLogger } from '../../../../store/logger';
import { loadSettings } from '../../../../store/settings/core';
import { resetLinghuiCanvasStore, useLinghuiCanvasStore } from '../../canvas/state/linghuiCanvasStore';
import { LinghuiExecutionPlanModal } from '../../execution/components/LinghuiExecutionPlanModal';
import { LinghuiCanvasFloatingRail } from './LinghuiCanvasFloatingRail';
import { useLinghuiPageCanvasHandlers } from '../hooks/useLinghuiPageCanvasHandlers';
import { useLinghuiPageExecutionRailState } from '../hooks/useLinghuiPageExecutionRailState';
import { useLinghuiPageLibraries } from '../hooks/useLinghuiPageLibraries';
import { useLinghuiPageWorkspacePersistence } from '../hooks/useLinghuiPageWorkspacePersistence';
import { useLinghuiPageWorkspaceActions } from '../hooks/useLinghuiPageWorkspaceActions';
import {
  EMPTY_WORKSPACE_RUNTIME,
  ensureWorkspaceRuntime,
  type LinghuiWorkspaceRuntimeState,
} from '../state/linghuiPageWorkspaceRuntime';
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
  const [pendingExecutionPlan, setPendingExecutionPlan] = useState<PendingLinghuiExecutionPlanRequest | null>(null);
  const [projectPanelOpen, setProjectPanelOpen] = useState(false);
  const [executionLogPanelOpen, setExecutionLogPanelOpen] = useState(false);
  const [executionLogCollapsed, setExecutionLogCollapsed] = useState(false);
  const [, setStats] = useState<LinghuiGraphStats>({
    nodeCount: 0,
    linkCount: 0,
    groupCount: 0,
  });
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
    if (!projectPanelOpen && !executionLogPanelOpen) {
      return undefined;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (railShellRef.current && target instanceof Node && railShellRef.current.contains(target)) {
        return;
      }
      if (target instanceof Element && target.closest('.ant-modal-root, .ant-modal, .ant-popover, .ant-dropdown')) {
        return;
      }
      setProjectPanelOpen(false);
      setExecutionLogPanelOpen(false);
    };

    window.addEventListener('pointerdown', handlePointerDown, true);
    return () => window.removeEventListener('pointerdown', handlePointerDown, true);
  }, [executionLogPanelOpen, projectPanelOpen]);

  const applyWorkspaceRuntime = useCallback((runtime: LinghuiWorkspaceRuntimeState) => {
    workspaceRuntimeRef.current = runtime;
    setWorkspaceRuntime(runtime);
  }, []);

  const activateWorkspace = useCallback((workspace: LinghuiWorkspaceDocument) => {
    const normalizedWorkspace = ensureWorkspaceRuntime(workspace, { resetInterruptedRuns: true });
    activeWorkspaceRef.current = normalizedWorkspace;
    applyWorkspaceRuntime({
      nodeRuns: normalizedWorkspace.nodeRuns,
      executionLogs: normalizedWorkspace.executionLogs,
    });
    setActiveWorkspace(normalizedWorkspace);
    setStats({
      nodeCount: normalizedWorkspace.nodeCount,
      linkCount: normalizedWorkspace.linkCount,
      groupCount: normalizedWorkspace.groupCount,
    });
    setLastSavedAt(normalizedWorkspace.updatedAt);
  }, [applyWorkspaceRuntime]);

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
      for (const controller of executionBatchesRef.current) {
        if (!controller.signal.aborted) {
          controller.abort('工作区已关闭，停止当前执行');
        }
      }
      executionBatchesRef.current.clear();
      executionQueuesRef.current.clear();
    };
  }, [activateWorkspace, message]);

  // LibTV 三层保存模型的"sendBeacon"层（不可丢数据）：beforeunload 时若仍有 pending 防抖快照，
  // 强制 fire-and-forget 触发一次 flush，让 IPC 在 Electron close 5s 宽限期内尽量完成磁盘写入。
  // 与 LibTV 同语义：不阻塞关闭，只把"最近一次防抖区间的改动"挤压到磁盘。
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
      nextLogs = mergeExecutionLogs(nextLogs, entry);
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

    const nextLogs = mergeExecutionLogs(
      current.executionLogs,
      createLog('info', reason),
    );

    updateWorkspaceExecution(nextRuns, nextLogs);
  }, [updateWorkspaceExecution]);

  const recomputeExecutionQueue = useCallback(() => {
    const queues = Array.from(executionQueuesRef.current.values());
    if (queues.length === 0) {
      setExecutionQueue(null);
      return;
    }

    const status: LinghuiExecutionQueueState['status'] = queues.some(q => q.status === 'canceling')
      ? 'canceling'
      : queues.some(q => q.status === 'running')
        ? 'running'
        : queues.some(q => q.status === 'failed')
          ? 'failed'
          : queues.some(q => q.status === 'canceled')
            ? 'canceled'
            : queues.every(q => q.status === 'completed')
              ? 'completed'
              : 'running';

    const dedupe = (ids: string[]) => Array.from(new Set(ids));
    const runningNodeIds = dedupe(queues.flatMap(q => q.runningNodeIds));

    setExecutionQueue({
      status,
      total: queues.reduce((sum, q) => sum + q.total, 0),
      targetNodeIds: dedupe(queues.flatMap(q => q.targetNodeIds)),
      queuedNodeIds: dedupe(queues.flatMap(q => q.queuedNodeIds)),
      runningNodeIds,
      runningNodeId: runningNodeIds[0],
      completedNodeIds: dedupe(queues.flatMap(q => q.completedNodeIds)),
      failedNodeIds: dedupe(queues.flatMap(q => q.failedNodeIds)),
      canceledNodeIds: dedupe(queues.flatMap(q => q.canceledNodeIds)),
      startedAt: Math.min(...queues.map(q => q.startedAt ?? Number.POSITIVE_INFINITY)),
      updatedAt: Math.max(...queues.map(q => q.updatedAt ?? 0)),
    });
  }, []);

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
      activeBatchCount: executionBatchesRef.current.size,
      hasCanvasHandle: Boolean(canvasRef.current),
      hasActiveWorkspace: Boolean(activeWorkspaceRef.current),
    });

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

    let nextRuns = { ...workspaceRuntimeRef.current.nodeRuns };
    let nextLogs = [...workspaceRuntimeRef.current.executionLogs];

    // 上一次执行如果遇到 React 树崩溃或意外中断，nodeRuns 里可能留有 'running' 残影，
    // 而 executionBatchesRef 已经清空（finally 块在 Promise 链里仍会跑）。
    // 这种"孤儿 running"会把后续生图（特别是图片节点）卡在"仍在执行中"分支里，
    // 直到 RUNNING_NODE_BLOCK_WINDOW_MS（10 分钟轮询 + 60s 宽限）过去。
    // 这里在没有任何活跃执行批次时主动降级为 'stale'，让用户立刻能重新触发。
    if (executionBatchesRef.current.size === 0) {
      let sanitizedCount = 0;
      const sanitizedRuns: Record<string, LinghuiNodeRunState> = {};
      for (const [nodeId, runState] of Object.entries(nextRuns)) {
        if (runState?.status === 'running') {
          sanitizedRuns[nodeId] = {
            ...runState,
            status: 'stale',
            progress: undefined,
            message: '上次执行已中断，可重新运行。',
            updatedAt: Date.now(),
          };
          sanitizedCount += 1;
        } else {
          sanitizedRuns[nodeId] = runState;
        }
      }
      if (sanitizedCount > 0) {
        workflowLogger.warn('灵绘执行入口：清理孤儿 running 状态', {
          sanitizedCount,
          orphanedNodeIds: Object.entries(nextRuns)
            .filter(([, state]) => state?.status === 'running')
            .map(([id]) => id),
        });
        nextRuns = sanitizedRuns;
        updateWorkspaceExecution(nextRuns, nextLogs);
      }
    }

    const nodeSnapshotMap = new Map(context.nodes.map(node => [node.id, node]));
    let runningNodeBlocks;
    try {
      runningNodeBlocks = detectLinghuiRunningNodeBlocks({
        context,
        targetNodeIds: runnableTargetNodeIds ?? targetNodeIds,
        previousRuns: nextRuns,
        resolveTargetsOnly: options?.resolveTargetsOnly,
      });
    } catch (error: any) {
      workflowLogger.warn('灵绘执行被阻止：检测运行中节点失败', {
        targetNodeIds: runnableTargetNodeIds ?? targetNodeIds,
        error: error?.message || String(error),
      });
      message.error(error?.message || '检测执行状态失败');
      return;
    }

    if (runningNodeBlocks.length > 0) {
      const firstRunning = runningNodeBlocks[0];
      const content = runningNodeBlocks.length === 1
        ? `「${firstRunning.label}」仍在执行中，请等待当前轮询完成或先取消执行`
        : `${runningNodeBlocks.length} 个节点仍在执行中，请等待当前轮询完成或先取消执行`;
      workflowLogger.warn('灵绘执行被阻止：目标链路仍有运行中节点', {
        targetNodeIds: runnableTargetNodeIds ?? targetNodeIds,
        runningNodeBlocks,
      });
      const patchedRuntime = patchWorkspaceExecution(undefined, [
        createLog('warn', content, firstRunning.nodeId),
      ]);
      nextRuns = { ...patchedRuntime.nodeRuns };
      nextLogs = [...patchedRuntime.executionLogs];
      message.warning(content);
      canvasRef.current?.focusNodes([firstRunning.nodeId], { select: true });
      return;
    }

    const abortController = new AbortController();
    executionBatchesRef.current.add(abortController);

    setRunning(true);

    try {
      const batchBaselineRuns = { ...nextRuns };
      const batchTouchedNodeIds = new Set<string>();
      workflowLogger.info('灵绘开始执行工作流', {
        targetNodeIds: runnableTargetNodeIds ?? targetNodeIds,
        resolveTargetsOnly: options?.resolveTargetsOnly ?? false,
        activeBatchCount: executionBatchesRef.current.size,
      });
      const result = await executeLinghuiWorkflow({
        context,
        targetNodeIds: runnableTargetNodeIds ?? targetNodeIds,
        previousRuns: batchBaselineRuns,
        resolveTargetsOnly: options?.resolveTargetsOnly,
        signal: abortController.signal,
        // workspaceId 当 projectId 兜底，节点执行会进统一任务面板
        workspaceId: activeWorkspaceRef.current?.id,
        onNodeStateChange(nodeId, nextState) {
          batchTouchedNodeIds.add(nodeId);
          nextRuns = {
            ...nextRuns,
            [nodeId]: nextState,
          };
          const patchedRuntime = patchWorkspaceExecution({ [nodeId]: nextState });
          nextRuns = { ...patchedRuntime.nodeRuns };
          nextLogs = [...patchedRuntime.executionLogs];
        },
        onLog(entry) {
          const patchedRuntime = patchWorkspaceExecution(undefined, [entry]);
          nextRuns = { ...patchedRuntime.nodeRuns };
          nextLogs = [...patchedRuntime.executionLogs];
        },
        onQueueChange(queue) {
          executionQueuesRef.current.set(abortController, queue);
          recomputeExecutionQueue();
        },
      });

      const finalRuns = result.runs;
      workflowLogger.info('灵绘执行工作流结束', {
        queueStatus: result.queue.status,
        completedNodeIds: result.queue.completedNodeIds,
        failedNodeIds: result.queue.failedNodeIds,
        canceledNodeIds: result.queue.canceledNodeIds,
      });
      const finalRunPatches: Record<string, LinghuiNodeRunState> = {};
      for (const nodeId of batchTouchedNodeIds) {
        const runState = finalRuns[nodeId];
        if (runState) {
          finalRunPatches[nodeId] = runState;
        }
      }
      const patchedRuntime = patchWorkspaceExecution(finalRunPatches);
      nextRuns = { ...patchedRuntime.nodeRuns };
      nextLogs = [...patchedRuntime.executionLogs];

      const completedNodeIds = new Set(result.queue.completedNodeIds);
      const historyCandidates = [...completedNodeIds].flatMap(nodeId => {
        const runState = finalRuns[nodeId];
        if (
          runState?.status === 'succeeded' &&
          runState.result &&
          (runState.updatedAt ?? 0) > (batchBaselineRuns[nodeId]?.updatedAt ?? 0)
        ) {
          return [[nodeId, runState] as const];
        }
        return [];
      });

      if (current.id && historyCandidates.length > 0) {
        const historyResults = await Promise.all(historyCandidates.map(async ([nodeId, runState]) => {
          const nodeSnapshot = nodeSnapshotMap.get(nodeId);
          if (!nodeSnapshot) return { status: 'skipped' as const, nodeId };
          try {
            const result = await createLinghuiWorkspaceHistoryRecord({
              workspaceId: current.id,
              nodeId,
              nodeData: nodeSnapshot.data,
              nodeRun: runState,
            });
            return { status: 'fulfilled' as const, nodeId, ...result };
          } catch (error) {
            return {
              status: 'rejected' as const,
              nodeId,
              nodeLabel: nodeSnapshot.data.label,
              nodeType: nodeSnapshot.data.linghuiType,
              error,
            };
          }
        }));

        let hasHistoryMutate = false;
        const materializedRunPatches: Record<string, LinghuiNodeRunState> = {};

        for (const outcome of historyResults) {
          if (outcome.status === 'rejected') {
            const errorMessage = outcome.error instanceof Error ? outcome.error.message : String(outcome.error);
            workflowLogger.warn('灵绘历史结果落盘失败', {
              nodeId: outcome.nodeId,
              nodeLabel: outcome.nodeLabel,
              nodeType: outcome.nodeType,
              error: errorMessage,
            });
            const patchedHistoryErrorRuntime = patchWorkspaceExecution(undefined, [
              createLog('warn', `历史结果落盘失败：${outcome.nodeLabel || outcome.nodeId} · ${errorMessage}`, outcome.nodeId),
            ]);
            nextRuns = { ...patchedHistoryErrorRuntime.nodeRuns };
            nextLogs = [...patchedHistoryErrorRuntime.executionLogs];
            continue;
          }
          if (outcome.status !== 'fulfilled') continue;
          hasHistoryMutate = true;
          if (outcome.materializedRun) {
            materializedRunPatches[outcome.nodeId] = outcome.materializedRun;
          }
        }

        if (hasHistoryMutate) {
          handleHistoryLibraryMutate();
        }
        if (Object.keys(materializedRunPatches).length > 0) {
          const patchedMaterializedRuntime = patchWorkspaceExecution(materializedRunPatches);
          nextRuns = { ...patchedMaterializedRuntime.nodeRuns };
          nextLogs = [...patchedMaterializedRuntime.executionLogs];
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
      const patchedRuntime = patchWorkspaceExecution(undefined, [
        createLog('error', failureMessage),
      ]);
      nextRuns = { ...patchedRuntime.nodeRuns };
      nextLogs = [...patchedRuntime.executionLogs];
      message.error(failureMessage);
    } finally {
      executionBatchesRef.current.delete(abortController);
      executionQueuesRef.current.delete(abortController);
      recomputeExecutionQueue();
      if (executionBatchesRef.current.size === 0) {
        setRunning(false);
      }
      canvasRef.current?.notifyMutation();
    }
  }, [handleHistoryLibraryMutate, message, patchWorkspaceExecution, recomputeExecutionQueue, updateWorkspaceExecution]);

  const openDrawer = useCallback(async (drawer: LinghuiLibraryDrawerKey) => {
    setProjectPanelOpen(false);
    setExecutionLogPanelOpen(false);
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

  const openExecutionPlan = useCallback(async (
    scopeLabel: string,
    targetNodeIds?: string[],
    options?: {
      resolveTargetsOnly?: boolean;
      successMessage?: string;
    },
  ) => {
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
      const runningNodeBlocks = detectLinghuiRunningNodeBlocks({
        context,
        targetNodeIds: runnableTargetNodeIds ?? requestedTargetNodeIds,
        previousRuns: currentWorkspace.nodeRuns,
        resolveTargetsOnly: options?.resolveTargetsOnly,
      });
      if (runningNodeBlocks.length > 0) {
        const firstRunning = runningNodeBlocks[0];
        const content = runningNodeBlocks.length === 1
          ? `「${firstRunning.label}」仍在执行中，请等待当前轮询完成或先取消执行`
          : `${runningNodeBlocks.length} 个节点仍在执行中，请等待当前轮询完成或先取消执行`;
        message.warning(content);
        canvasRef.current?.focusNodes([firstRunning.nodeId], { select: true });
        return;
      }
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

  // preview binding 整套已移除：用户不使用，且 split-view 的"实时同步出图"概念被简化为
  // 普通的下游节点执行流（用户手动跑 image / video 节点即可）

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
    <LinghuiCanvasFloatingRail
      railShellRef={railShellRef}
      renameInputRef={renameInputRef}
      activeDrawer={activeDrawer}
      activeWorkspaceId={activeWorkspace?.id}
      activeWorkspaceName={activeWorkspace?.name}
      executionLogCollapsed={executionLogCollapsed}
      executionLogErrorCount={executionLogErrorCount}
      executionLogItems={executionLogItems}
      executionLogLatest={executionLogLatest}
      executionLogPanelOpen={executionLogPanelOpen}
      lastSavedAt={lastSavedAt}
      projectPanelOpen={projectPanelOpen}
      saving={saving}
      workspaceLogCount={workspaceRuntime.executionLogs.length}
      workspaceList={workspaceList}
      workspaceNameDraft={workspaceNameDraft}
      onCloseActiveDrawer={closeActiveDrawer}
      onCommitWorkspaceRename={commitWorkspaceRename}
      onCreateWorkspace={handleCreateWorkspace}
      onDeleteWorkspace={handleDeleteWorkspace}
      onExit={onExit}
      onExportWorkspace={handleExportWorkspace}
      onFocusLogNode={handleFocusLogNode}
      onImportWorkspace={handleImportWorkspace}
      onManualSave={handleManualSave}
      onSelectWorkspace={handleSelectWorkspace}
      onSetExecutionLogCollapsed={setExecutionLogCollapsed}
      onSetExecutionLogPanelOpen={setExecutionLogPanelOpen}
      onSetProjectPanelOpen={setProjectPanelOpen}
      onSetWorkspaceNameDraft={setWorkspaceNameDraft}
      onToggleDrawer={handleToggleDrawer}
    />
  ), [
    activeDrawer,
    activeWorkspace?.id,
    activeWorkspace?.name,
    closeActiveDrawer,
    commitWorkspaceRename,
    executionLogCollapsed,
    executionLogErrorCount,
    executionLogItems,
    executionLogLatest,
    executionLogPanelOpen,
    handleCreateWorkspace,
    handleDeleteWorkspace,
    handleExportWorkspace,
    handleFocusLogNode,
    handleImportWorkspace,
    handleManualSave,
    handleSelectWorkspace,
    handleToggleDrawer,
    lastSavedAt,
    onExit,
    projectPanelOpen,
    saving,
    workspaceRuntime.executionLogs.length,
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
          <LinghuiCanvasErrorBoundary
            onError={handleCanvasCrash}
            onRecover={handleCanvasRecover}
            onReload={handleCanvasReload}
          >
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
            onExportSelection={handleExportSelection}
            onFocusFailedNode={handleFocusFailedNode}
            onRetryFailed={handleRetryFailed}
            onRerunAffected={handleRerunAffected}
            onCancelRun={handleCancelRun}
            executionQueue={executionQueue}
            onOpenDrawer={handleOpenDrawerFromCanvas}
          />
          </LinghuiCanvasErrorBoundary>
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

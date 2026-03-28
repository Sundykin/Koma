import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { App as AntApp, Button, Dropdown, Spin } from 'antd';
import type { MenuProps } from 'antd';
import {
  createLinghuiWorkspace,
  createLinghuiWorkspaceHistoryRecord,
  exportLinghuiWorkspace,
  importLinghuiWorkspace,
  listLinghuiWorkflowTemplates,
  listLinghuiWorkspaceAssets,
  listLinghuiWorkspaceHistoryRecords,
  listLinghuiWorkspaces,
  loadLinghuiWorkspace,
  saveLinghuiWorkspace,
  saveLinghuiWorkspaceAs,
  type LinghuiWorkflowTemplateRecord,
  type LinghuiWorkspaceAssetRecord,
  type LinghuiWorkspaceHistoryRecord,
} from '../../store/linghuiStorage';
import type {
  LinghuiExecutionLogEntry,
  LinghuiExecutionQueueState,
  LinghuiGraphSnapshot,
  LinghuiGraphStats,
  LinghuiNodeType,
  LinghuiNodeRunState,
  LinghuiViewportState,
  LinghuiWorkspaceDocument,
  LinghuiWorkspaceMeta,
} from '../../types/linghui';
import {
  DEFAULT_LINGHUI_WORKSPACE_NAME,
  EMPTY_LINGHUI_EXECUTION_LOGS,
  EMPTY_LINGHUI_NODE_RUNS,
} from '../../types/linghui';
import { electronService, openFileDialog } from '../../services/electronService';
import {
  ChevronDown,
  Download,
  FileInput,
  FolderOpen,
  History,
  Library,
  Plus,
  Save,
  Workflow,
} from 'lucide-react';
import LinghuiCanvas, {
  type LinghuiCanvasHandle,
} from './LinghuiCanvas';
import { LinghuiLibraryDrawer, type LinghuiAssetFilter, type LinghuiLibraryDrawerKey } from './LinghuiLibraryDrawer';
import LinghuiToolbar from './LinghuiToolbar';
import { collectLinghuiDependentNodeIds, executeLinghuiWorkflow } from './linghuiExecution';
import { exportLinghuiNodeResults } from './linghuiResultExport';
import './LinghuiPage.css';

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

export const LinghuiPage: React.FC<LinghuiPageProps> = ({ onExit }) => {
  const { message } = AntApp.useApp();
  const canvasRef = useRef<LinghuiCanvasHandle | null>(null);
  const saveTimerRef = useRef<number | null>(null);
  const executionAbortControllerRef = useRef<AbortController | null>(null);
  const pendingSaveRef = useRef<{
    doc: LinghuiWorkspaceDocument;
    syncActiveWorkspace: boolean;
    refreshWorkspaceList: boolean;
  } | null>(null);
  const activeWorkspaceRef = useRef<LinghuiWorkspaceDocument | null>(null);
  const workspaceRuntimeRef = useRef<LinghuiWorkspaceRuntimeState>(EMPTY_WORKSPACE_RUNTIME);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [executionQueue, setExecutionQueue] = useState<LinghuiExecutionQueueState | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [workspaceList, setWorkspaceList] = useState<LinghuiWorkspaceMeta[]>([]);
  const [activeWorkspace, setActiveWorkspace] = useState<LinghuiWorkspaceDocument | null>(null);
  const [workspaceRuntime, setWorkspaceRuntime] = useState<LinghuiWorkspaceRuntimeState>(EMPTY_WORKSPACE_RUNTIME);
  const [activeDrawer, setActiveDrawer] = useState<LinghuiLibraryDrawerKey | null>(null);
  const [assetFilter, setAssetFilter] = useState<LinghuiAssetFilter>('all');
  const [assetLoading, setAssetLoading] = useState(false);
  const [workspaceAssets, setWorkspaceAssets] = useState<LinghuiWorkspaceAssetRecord[]>([]);
  const [workflowLoading, setWorkflowLoading] = useState(false);
  const [workflowTemplates, setWorkflowTemplates] = useState<LinghuiWorkflowTemplateRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [workspaceHistory, setWorkspaceHistory] = useState<LinghuiWorkspaceHistoryRecord[]>([]);
  const [stats, setStats] = useState<LinghuiGraphStats>({
    nodeCount: 0,
    linkCount: 0,
    groupCount: 0,
  });

  useEffect(() => {
    activeWorkspaceRef.current = activeWorkspace
      ? {
          ...activeWorkspace,
          nodeRuns: workspaceRuntimeRef.current.nodeRuns,
          executionLogs: workspaceRuntimeRef.current.executionLogs,
        }
      : null;
  }, [activeWorkspace]);

  const applyWorkspaceRuntime = useCallback((runtime: LinghuiWorkspaceRuntimeState) => {
    workspaceRuntimeRef.current = runtime;
    setWorkspaceRuntime(runtime);
  }, []);

  const activateWorkspace = useCallback((workspace: LinghuiWorkspaceDocument) => {
    activeWorkspaceRef.current = workspace;
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

  const cancelPendingWorkspaceSave = useCallback(() => {
    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    pendingSaveRef.current = null;
  }, []);

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
    if (activeDrawer !== 'workflow' && activeDrawer !== 'add') return;
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
  ) => {
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
    } catch (error: any) {
      message.error(error?.message || '保存灵绘工作区失败');
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
    }, 500);
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
    if (executionAbortControllerRef.current && !executionAbortControllerRef.current.signal.aborted) {
      message.info('当前已有执行队列，请先等待完成或取消');
      return;
    }

    const context = canvasRef.current?.getExecutionContext();
    const current = activeWorkspaceRef.current;
    if (!context || !current) return;

    let nextRuns = { ...current.nodeRuns };
    let nextLogs = [...current.executionLogs];
    const nodeSnapshotMap = new Map(context.nodes.map(node => [node.id, node]));
    const abortController = new AbortController();
    executionAbortControllerRef.current = abortController;

    setRunning(true);
    setExecutionQueue(null);

    try {
      const result = await executeLinghuiWorkflow({
        context,
        targetNodeIds,
        previousRuns: current.nodeRuns,
        resolveTargetsOnly: options?.resolveTargetsOnly,
        signal: abortController.signal,
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
          return createLinghuiWorkspaceHistoryRecord({
            workspaceId: current.id,
            nodeId,
            nodeData: nodeSnapshot.data,
            nodeRun: runState,
          });
        }));

        if (historyResults.some(result => result.status === 'fulfilled' && result.value)) {
          handleHistoryLibraryMutate();
        }
      }

      if (result.queue.status === 'canceled') {
        message.warning('已取消当前执行队列');
      } else if (result.queue.failedNodeIds.length > 0) {
        message.warning(`执行完成，但有 ${result.queue.failedNodeIds.length} 个节点失败`);
      } else {
        message.success(
          options?.successMessage ||
          (targetNodeIds?.length ? '已执行选中节点' : '已执行全部工作流'),
        );
      }
    } catch (error: any) {
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

  const handleCreateWorkspace = useCallback(async () => {
    const workspace = await createLinghuiWorkspace(`灵绘 ${workspaceList.length + 1}`);
    activateWorkspace(workspace);
    await refreshWorkspaceList(workspace.id);
    message.success('已创建新的灵绘工作区');
  }, [activateWorkspace, message, refreshWorkspaceList, workspaceList.length]);

  const handleSelectWorkspace = useCallback(async (workspaceId: string) => {
    const workspace = await loadLinghuiWorkspace(workspaceId);
    if (!workspace) {
      message.error('无法加载所选工作区');
      return;
    }

    activateWorkspace(workspace);
  }, [activateWorkspace, message]);

  const handleSaveAsWorkspace = useCallback(async () => {
    const current = activeWorkspaceRef.current;
    if (!current) return;

    cancelPendingWorkspaceSave();

    try {
      const duplicated = await saveLinghuiWorkspaceAs(current);
      activateWorkspace(duplicated);
      await refreshWorkspaceList(duplicated.id);
      message.success(`已另存为 ${duplicated.name}`);
    } catch (error: any) {
      message.error(error?.message || '灵绘工作区另存为失败');
    }
  }, [activateWorkspace, cancelPendingWorkspaceSave, message, refreshWorkspaceList]);

  const handleImportWorkspace = useCallback(async () => {
    if (!electronService.isElectron()) {
      message.info('当前环境暂不支持导入灵绘工作区');
      return;
    }

    try {
      const result = await openFileDialog({
        title: '导入灵绘工作区',
        multiple: false,
        filters: [{ name: 'Linghui Workspace', extensions: ['json'] }],
      });

      if (result.canceled || result.filePaths.length === 0) {
        return;
      }

      const imported = await importLinghuiWorkspace(result.filePaths[0]);
      activateWorkspace(imported);
      await refreshWorkspaceList(imported.id);
      message.success(`已导入工作区 ${imported.name}`);
    } catch (error: any) {
      message.error(error?.message || '导入灵绘工作区失败');
    }
  }, [activateWorkspace, message, refreshWorkspaceList]);

  const handleManualSave = useCallback(async () => {
    const current = activeWorkspaceRef.current;
    if (!current) return;
    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    pendingSaveRef.current = null;
    await persistWorkspace(current, {
      notify: true,
      syncActiveWorkspace: true,
      refreshWorkspaceList: true,
      showIndicator: true,
    });
  }, [persistWorkspace]);

  const handleExport = useCallback(async () => {
    const current = activeWorkspaceRef.current;
    if (!current) return;
    const result = await exportLinghuiWorkspace(current);
    if (result) {
      message.success(`已导出到 ${result}`);
    }
  }, [message]);

  const openDrawer = useCallback(async (drawer: LinghuiLibraryDrawerKey) => {
    setActiveDrawer(drawer);

    if (drawer === 'asset') {
      await loadAssetLibrary(activeWorkspaceRef.current?.id ?? null);
      return;
    }
    if (drawer === 'workflow' || drawer === 'add') {
      await loadWorkflowLibrary(activeWorkspaceRef.current?.id ?? null);
      return;
    }
    if (drawer === 'history') {
      await loadHistoryLibrary(activeWorkspaceRef.current?.id ?? null);
    }
  }, [loadAssetLibrary, loadHistoryLibrary, loadWorkflowLibrary]);

  const handleToggleDrawer = useCallback((drawer: LinghuiLibraryDrawerKey) => {
    if (activeDrawer === drawer) {
      setActiveDrawer(null);
      return;
    }
    void openDrawer(drawer);
  }, [activeDrawer, openDrawer]);

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

  const handleQuickAddNode = useCallback((type: LinghuiNodeType) => {
    canvasRef.current?.addNode(type);
    setActiveDrawer(null);
  }, []);

  const handleImportMediaToCanvas = useCallback(async (kind: 'image' | 'video' | 'audio') => {
    await canvasRef.current?.importMediaToCanvas(kind);
    setActiveDrawer(null);
  }, []);

  const handleGraphChange = useCallback((
    graphData: LinghuiGraphSnapshot,
    viewport: LinghuiViewportState,
    nextStats: LinghuiGraphStats,
  ) => {
    const current = activeWorkspaceRef.current;
    if (!current) return;

    setStats(previous => (
      previous.nodeCount === nextStats.nodeCount &&
      previous.linkCount === nextStats.linkCount &&
      previous.groupCount === nextStats.groupCount
        ? previous
        : nextStats
    ));
    scheduleWorkspaceSave({
      ...current,
      graphData,
      viewport,
      nodeCount: nextStats.nodeCount,
      linkCount: nextStats.linkCount,
      groupCount: nextStats.groupCount,
    }, {
      syncActiveWorkspace: false,
      refreshWorkspaceList: false,
    });
  }, [scheduleWorkspaceSave]);

  const handleWorkspaceRename = useCallback((name: string) => {
    const current = activeWorkspaceRef.current;
    if (!current) return;
    scheduleWorkspaceSave({
      ...current,
      name,
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

  const handleRunAll = useCallback(async () => {
    await runWorkflow();
  }, [runWorkflow]);

  const handleRunSingleNode = useCallback(async (nodeId: string) => {
    await runWorkflow([nodeId], {
      resolveTargetsOnly: true,
      successMessage: '已执行当前节点',
    });
  }, [runWorkflow]);

  const nodeRuns = workspaceRuntime.nodeRuns;
  const executionLogs = workspaceRuntime.executionLogs;

  const handleRunSelection = useCallback(async (selectionIds?: string[]) => {
    const rawSelectionIds = selectionIds?.length
      ? selectionIds
      : (canvasRef.current?.getSelectionIds() ?? []);
    const runnableIds = canvasRef.current?.resolveExecutionTargetIds(rawSelectionIds) ?? [];

    if (!rawSelectionIds.length || !runnableIds.length) {
      message.info('请先选中需要执行的节点或工作流块');
      return;
    }

    const isWorkflowBlockRun = rawSelectionIds.length === 1 && runnableIds.length > 0 && rawSelectionIds[0] !== runnableIds[0];
    await runWorkflow(runnableIds, {
      successMessage: isWorkflowBlockRun ? '已执行工作流块' : '已执行选中节点',
    });
  }, [message, runWorkflow]);

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
    message.warning(content);
  }, [message]);

  const runSummary = useMemo(() => {
    const values = Object.values(nodeRuns);
    return {
      running: values.filter(item => item.status === 'running').length,
      succeeded: values.filter(item => item.status === 'succeeded').length,
      failed: values.filter(item => item.status === 'failed').length,
      stale: values.filter(item => item.status === 'stale').length,
      queued: executionQueue?.queuedNodeIds.length ?? 0,
      queueStatus: executionQueue?.status ?? 'idle',
    };
  }, [executionQueue, nodeRuns]);

  const handleProjectMenuAction = useCallback(async (key: string) => {
    if (key.startsWith('workspace:')) {
      await handleSelectWorkspace(key.slice('workspace:'.length));
      return;
    }

    if (key.startsWith('drawer:')) {
      await openDrawer(key.slice('drawer:'.length) as LinghuiLibraryDrawerKey);
      return;
    }

    switch (key) {
      case 'workspace:new':
        await handleCreateWorkspace();
        break;
      case 'workspace:save':
        await handleManualSave();
        break;
      case 'workspace:saveAs':
        await handleSaveAsWorkspace();
        break;
      case 'workspace:import':
        await handleImportWorkspace();
        break;
      case 'workspace:export':
        await handleExport();
        break;
      default:
        break;
    }
  }, [
    handleCreateWorkspace,
    handleExport,
    handleImportWorkspace,
    handleManualSave,
    handleSaveAsWorkspace,
    handleSelectWorkspace,
    openDrawer,
  ]);

  const projectMenuItems = useMemo<MenuProps['items']>(() => ([
    {
      key: 'workspace:current',
      label: activeWorkspace?.name ?? DEFAULT_LINGHUI_WORKSPACE_NAME,
      disabled: true,
    },
    {
      key: 'workspace:new',
      label: '新建工作区',
      icon: <Plus size={14} />,
    },
    {
      key: 'workspace:open',
      label: '打开工作区',
      icon: <FolderOpen size={14} />,
      children: workspaceList.map(workspace => ({
        key: `workspace:${workspace.id}`,
        label: workspace.name,
        disabled: workspace.id === activeWorkspace?.id,
      })),
    },
    {
      key: 'workspace:save',
      label: '保存工作区',
      icon: <Save size={14} />,
    },
    {
      key: 'workspace:saveAs',
      label: '另存为副本',
      icon: <Save size={14} />,
    },
    {
      key: 'workspace:import',
      label: '导入工作区',
      icon: <FileInput size={14} />,
    },
    {
      key: 'workspace:export',
      label: '导出工作区',
      icon: <Download size={14} />,
    },
    {
      type: 'divider',
    },
    {
      key: 'drawer:add',
      label: '打开添加面板',
      icon: <Plus size={14} />,
    },
    {
      key: 'drawer:workflow',
      label: '打开工作流面板',
      icon: <Workflow size={14} />,
    },
    {
      key: 'drawer:asset',
      label: '打开资产面板',
      icon: <Library size={14} />,
    },
    {
      key: 'drawer:history',
      label: '打开历史面板',
      icon: <History size={14} />,
    },
  ]), [activeWorkspace?.id, activeWorkspace?.name, workspaceList]);

  const canvasProjectEntry = useMemo(() => (
    <Dropdown
      trigger={['click']}
      placement="bottomLeft"
      menu={{
        items: projectMenuItems,
        onClick: ({ key }) => {
          void handleProjectMenuAction(String(key));
        },
      }}
    >
      <button
        type="button"
        className="linghuiCanvasProjectEntry"
        title="打开工作区与画布入口"
      >
        <FolderOpen size={14} />
        <span className="linghuiCanvasProjectEntryLabel">
          {activeWorkspace?.name || DEFAULT_LINGHUI_WORKSPACE_NAME}
        </span>
        <ChevronDown size={14} />
      </button>
    </Dropdown>
  ), [activeWorkspace?.name, handleProjectMenuAction, projectMenuItems]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center bg-zinc-950">
        <Spin size="large" description="加载灵绘工作台..." />
      </div>
    );
  }

  return (
    <div className="linghuiPage">
      <LinghuiToolbar
        workspaces={workspaceList}
        activeWorkspaceId={activeWorkspace?.id ?? null}
        workspaceName={activeWorkspace?.name ?? ''}
        stats={stats}
        lastSavedAt={lastSavedAt}
        saving={saving}
        running={running}
        executionQueue={executionQueue}
        runSummary={runSummary}
        onExit={onExit}
        onCreateWorkspace={handleCreateWorkspace}
        onSelectWorkspace={handleSelectWorkspace}
        onWorkspaceRename={handleWorkspaceRename}
        onSave={handleManualSave}
        onExport={handleExport}
        onRetryFailed={handleRetryFailed}
        onCancelRun={handleCancelRun}
        activeDrawer={activeDrawer}
        onToggleDrawer={handleToggleDrawer}
      />

      <div className="linghuiCanvasPanel">
        <div className="linghuiCanvasWorkspace">
          <LinghuiCanvas
            ref={canvasRef}
            workspace={activeWorkspace}
            projectEntry={canvasProjectEntry}
            nodeRuns={nodeRuns}
            executionLogs={executionLogs}
            onGraphChange={handleGraphChange}
            onNodeMutate={handleNodeMutate}
            onClearNodeRunState={handleClearNodeRunState}
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
        onClose={() => setActiveDrawer(null)}
        onAssetFilterChange={setAssetFilter}
        onImportMediaToCanvas={kind => {
          void handleImportMediaToCanvas(kind);
        }}
        onQuickAddNode={handleQuickAddNode}
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
    </div>
  );
};

export default LinghuiPage;

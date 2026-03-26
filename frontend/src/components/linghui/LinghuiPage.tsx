import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { App as AntApp, Spin } from 'antd';
import {
  createLinghuiWorkspace,
  exportLinghuiWorkspace,
  listLinghuiWorkspaces,
  loadLinghuiWorkspace,
  saveLinghuiWorkspace,
} from '../../store/linghuiStorage';
import type {
  LinghuiExecutionLogEntry,
  LinghuiGraphSnapshot,
  LinghuiGraphStats,
  LinghuiNodeRunState,
  LinghuiViewportState,
  LinghuiWorkspaceDocument,
  LinghuiWorkspaceMeta,
} from '../../types/linghui';
import { DEFAULT_LINGHUI_WORKSPACE_NAME } from '../../types/linghui';
import LinghuiCanvas, {
  type LinghuiCanvasHandle,
} from './LinghuiCanvas';
import LinghuiToolbar from './LinghuiToolbar';
import { collectLinghuiDependentNodeIds, executeLinghuiWorkflow } from './linghuiExecution';
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

export const LinghuiPage: React.FC<LinghuiPageProps> = ({ onExit }) => {
  const { message } = AntApp.useApp();
  const canvasRef = useRef<LinghuiCanvasHandle | null>(null);
  const saveTimerRef = useRef<number | null>(null);
  const pendingSaveRef = useRef<{
    doc: LinghuiWorkspaceDocument;
    syncActiveWorkspace: boolean;
    refreshWorkspaceList: boolean;
  } | null>(null);
  const activeWorkspaceRef = useRef<LinghuiWorkspaceDocument | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [workspaceList, setWorkspaceList] = useState<LinghuiWorkspaceMeta[]>([]);
  const [activeWorkspace, setActiveWorkspace] = useState<LinghuiWorkspaceDocument | null>(null);
  const [stats, setStats] = useState<LinghuiGraphStats>({
    nodeCount: 0,
    linkCount: 0,
    groupCount: 0,
  });

  useEffect(() => {
    activeWorkspaceRef.current = activeWorkspace;
  }, [activeWorkspace]);

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
          setActiveWorkspace(workspace);
          setStats({
            nodeCount: workspace.nodeCount,
            linkCount: workspace.linkCount,
            groupCount: workspace.groupCount,
          });
          setLastSavedAt(workspace.updatedAt);
        } else {
          const latest = await loadLinghuiWorkspace(items[0].id);
          if (!mounted || !latest) return;
          setActiveWorkspace(latest);
          setStats({
            nodeCount: latest.nodeCount,
            linkCount: latest.linkCount,
            groupCount: latest.groupCount,
          });
          setLastSavedAt(latest.updatedAt);
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
    };
  }, [message]);

  const refreshWorkspaceList = useCallback(async (preferredId?: string) => {
    const items = await listLinghuiWorkspaces();
    setWorkspaceList(items);

    if (!preferredId || activeWorkspaceRef.current?.id === preferredId) return;
    const preferred = items.find(item => item.id === preferredId);
    if (!preferred) return;
    const loaded = await loadLinghuiWorkspace(preferred.id);
    if (!loaded) return;
    setActiveWorkspace(loaded);
    setStats({
      nodeCount: loaded.nodeCount,
      linkCount: loaded.linkCount,
      groupCount: loaded.groupCount,
    });
  }, []);

  const persistWorkspace = useCallback(async (
    doc: LinghuiWorkspaceDocument,
    options?: {
      notify?: boolean;
      syncActiveWorkspace?: boolean;
      refreshWorkspaceList?: boolean;
    },
  ) => {
    const {
      notify = false,
      syncActiveWorkspace = true,
      refreshWorkspaceList: shouldRefreshWorkspaceList = true,
    } = options ?? {};

    setSaving(true);
    try {
      const saved = await saveLinghuiWorkspace(doc);
      activeWorkspaceRef.current = saved;
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
      setSaving(false);
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

    scheduleWorkspaceSave({
      ...current,
      nodeRuns: nextRuns,
      executionLogs: nextLogs,
    });
  }, [scheduleWorkspaceSave]);

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
    const context = canvasRef.current?.getExecutionContext();
    const current = activeWorkspaceRef.current;
    if (!context || !current) return;

    let nextRuns = { ...current.nodeRuns };
    let nextLogs = [...current.executionLogs];

    setRunning(true);

    try {
      const finalRuns = await executeLinghuiWorkflow({
        context,
        targetNodeIds,
        previousRuns: current.nodeRuns,
        resolveTargetsOnly: options?.resolveTargetsOnly,
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
      });

      nextRuns = finalRuns;
      updateWorkspaceExecution(nextRuns, nextLogs);
      message.success(
        options?.successMessage ||
        (targetNodeIds?.length ? '已执行选中节点' : '已执行全部工作流'),
      );
    } catch (error: any) {
      const failureMessage = error?.message || '执行灵绘工作流失败';
      nextLogs = mergeExecutionLogs(nextLogs, createLog('error', failureMessage));
      updateWorkspaceExecution(nextRuns, nextLogs);
      message.error(failureMessage);
    } finally {
      setRunning(false);
      canvasRef.current?.notifyMutation();
    }
  }, [message, updateWorkspaceExecution]);

  const handleCreateWorkspace = useCallback(async () => {
    const workspace = await createLinghuiWorkspace(`灵绘 ${workspaceList.length + 1}`);
    activeWorkspaceRef.current = workspace;
    setActiveWorkspace(workspace);
    setStats({
      nodeCount: workspace.nodeCount,
      linkCount: workspace.linkCount,
      groupCount: workspace.groupCount,
    });
    setLastSavedAt(workspace.updatedAt);
    await refreshWorkspaceList(workspace.id);
    message.success('已创建新的灵绘工作区');
  }, [message, refreshWorkspaceList, workspaceList.length]);

  const handleSelectWorkspace = useCallback(async (workspaceId: string) => {
    const workspace = await loadLinghuiWorkspace(workspaceId);
    if (!workspace) {
      message.error('无法加载所选工作区');
      return;
    }

    activeWorkspaceRef.current = workspace;
    setActiveWorkspace(workspace);
    setStats({
      nodeCount: workspace.nodeCount,
      linkCount: workspace.linkCount,
      groupCount: workspace.groupCount,
    });
    setLastSavedAt(workspace.updatedAt);
  }, [message]);

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

  const handleGraphChange = useCallback((
    graphData: LinghuiGraphSnapshot,
    viewport: LinghuiViewportState,
    nextStats: LinghuiGraphStats,
  ) => {
    const current = activeWorkspaceRef.current;
    if (!current) return;

    setStats(nextStats);
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
    const current = activeWorkspaceRef.current;
    if (!current || !current.nodeRuns[nodeId]) return;

    const nextRuns = { ...current.nodeRuns };
    delete nextRuns[nodeId];
    updateWorkspaceExecution(nextRuns, current.executionLogs);
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

  const handleRunSelection = useCallback(async () => {
    const selectionIds = canvasRef.current?.getSelectionIds() ?? [];
    if (!selectionIds.length) {
      message.info('请先选中需要执行的节点或分组');
      return;
    }
    await runWorkflow(selectionIds);
  }, [message, runWorkflow]);

  const handleConnectionError = useCallback((content: string) => {
    message.warning(content);
  }, [message]);

  const nodeRuns = activeWorkspace?.nodeRuns ?? {};
  const executionLogs = activeWorkspace?.executionLogs ?? [];

  const runSummary = useMemo(() => {
    const values = Object.values(nodeRuns);
    return {
      running: values.filter(item => item.status === 'running').length,
      succeeded: values.filter(item => item.status === 'succeeded').length,
      failed: values.filter(item => item.status === 'failed').length,
      stale: values.filter(item => item.status === 'stale').length,
    };
  }, [nodeRuns]);

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
        runSummary={runSummary}
        onExit={onExit}
        onCreateWorkspace={handleCreateWorkspace}
        onSelectWorkspace={handleSelectWorkspace}
        onWorkspaceRename={handleWorkspaceRename}
        onSave={handleManualSave}
        onExport={handleExport}
      />

      <div className="linghuiCanvasPanel">
        <div className="linghuiCanvasWorkspace">
          <LinghuiCanvas
            ref={canvasRef}
            workspace={activeWorkspace}
            nodeRuns={nodeRuns}
            executionLogs={executionLogs}
            onGraphChange={handleGraphChange}
            onNodeMutate={handleNodeMutate}
            onClearNodeRunState={handleClearNodeRunState}
            onConnectionError={handleConnectionError}
            onRunSingleNode={handleRunSingleNode}
            onRunAll={handleRunAll}
            onRunSelection={handleRunSelection}
          />
        </div>
      </div>
    </div>
  );
};

export default LinghuiPage;

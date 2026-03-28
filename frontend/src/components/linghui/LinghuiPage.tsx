import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { App as AntApp, Button, Drawer, Empty, Segmented, Spin } from 'antd';
import {
  createLinghuiWorkspace,
  createLinghuiWorkspaceHistoryRecord,
  exportLinghuiWorkspace,
  listLinghuiWorkflowTemplates,
  listLinghuiWorkspaceAssets,
  listLinghuiWorkspaceHistoryRecords,
  listLinghuiWorkspaces,
  loadLinghuiWorkspace,
  saveLinghuiWorkspace,
  type LinghuiWorkflowTemplateRecord,
  type LinghuiWorkspaceAssetRecord,
  type LinghuiWorkspaceHistoryRecord,
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
import { electronService } from '../../services/electronService';
import LinghuiCanvas, {
  type LinghuiCanvasHandle,
} from './LinghuiCanvas';
import LinghuiToolbar from './LinghuiToolbar';
import { LINGHUI_NODE_CATALOG } from './linghuiNodeDefs';
import { collectLinghuiDependentNodeIds, executeLinghuiWorkflow } from './linghuiExecution';
import './LinghuiPage.css';

type LinghuiAssetFilter = 'all' | 'image' | 'video' | 'audio' | 'text';
type LinghuiLibraryDrawerKey = 'add' | 'workflow' | 'asset' | 'history' | 'tutorial';

const LINGHUI_TUTORIAL_SHORTCUTS = [
  ['双击空白', '快速创建节点'],
  ['右键画布', '打开添加 / 工作流 / 资产 / 历史 / 教程入口'],
  ['Cmd/Ctrl + C / V', '复制、粘贴节点或分组'],
  ['Cmd/Ctrl + D', '为当前选中创建副本'],
  ['Delete / Backspace', '删除选中节点或分组'],
  ['Cmd/Ctrl + Z / Shift + Z', '撤销 / 重做'],
  ['鼠标模式', '滚轮平移，左键框选'],
  ['手模式', '拖动画布，滚轮缩放'],
];

const LINGHUI_TUTORIAL_GUIDES = [
  '图片、视频、音频文件可以直接拖进画布，系统会自动创建对应节点。',
  '框选节点后会出现“创建分组”，分组可双击标题改名，也可右键取消分组或保存为工作流。',
  '节点右键可以继续创建下游、运行当前节点，或把结果沉淀成资产。',
  '运行后的结果会进入历史抽屉，可以随时重新发送回画布继续创作。',
];

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

function toPreviewSource(source?: string): string {
  if (!source) return '';
  if (
    source.startsWith('http://') ||
    source.startsWith('https://') ||
    source.startsWith('data:') ||
    source.startsWith('blob:') ||
    source.startsWith('koma-local://')
  ) {
    return source;
  }
  return electronService.fs.toLocalUrl(source);
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
    const nodeSnapshotMap = new Map(context.nodes.map(node => [node.id, node]));

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

      const historyCandidates = Object.entries(finalRuns).filter(([nodeId, runState]) => (
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
  }, [handleHistoryLibraryMutate, message, updateWorkspaceExecution]);

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

  const handleQuickAddNode = useCallback((type: typeof LINGHUI_NODE_CATALOG[number]['type']) => {
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

  const handleRunSelection = useCallback(async (selectionIds?: string[]) => {
    const rawSelectionIds = selectionIds?.length
      ? selectionIds
      : (canvasRef.current?.getSelectionIds() ?? []);
    const runnableIds = canvasRef.current?.resolveExecutionTargetIds(rawSelectionIds) ?? [];

    if (!rawSelectionIds.length || !runnableIds.length) {
      message.info('请先选中需要执行的节点或分组');
      return;
    }

    const isWorkflowBlockRun = rawSelectionIds.length === 1 && runnableIds.length > 0 && rawSelectionIds[0] !== runnableIds[0];
    await runWorkflow(runnableIds, {
      successMessage: isWorkflowBlockRun ? '已执行工作流块' : '已执行选中节点',
    });
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

  const filteredAssets = useMemo(() => {
    if (assetFilter === 'all') return workspaceAssets;
    return workspaceAssets.filter(asset => asset.kind === assetFilter);
  }, [assetFilter, workspaceAssets]);

  const recentWorkflowTemplates = useMemo(() => workflowTemplates.slice(0, 4), [workflowTemplates]);

  const drawerTitle = useMemo(() => {
    switch (activeDrawer) {
      case 'add':
        return '添加到画布';
      case 'workflow':
        return '工作流模板';
      case 'asset':
        return '工作区资产';
      case 'history':
        return '历史结果';
      case 'tutorial':
        return '灵绘教程';
      default:
        return '';
    }
  }, [activeDrawer]);

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
        activeDrawer={activeDrawer}
        onToggleDrawer={handleToggleDrawer}
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
            onAssetLibraryMutate={handleAssetLibraryMutate}
            onWorkflowTemplateMutate={handleWorkflowTemplateMutate}
            onRunSingleNode={handleRunSingleNode}
            onRunAll={handleRunAll}
            onRunSelection={handleRunSelection}
            onOpenDrawer={handleOpenDrawerFromCanvas}
          />
        </div>
      </div>

      <Drawer
        title={drawerTitle}
        placement="right"
        width={420}
        open={activeDrawer !== null}
        onClose={() => setActiveDrawer(null)}
        className="linghuiLibraryDrawer"
        rootClassName="linghuiLibraryDrawer"
      >
        {activeDrawer === 'add' && (
          <div className="linghuiLibraryDrawerBody">
            <div className="linghuiLibrarySection">
              <div className="linghuiLibrarySectionHeader">
                <div>
                  <div className="linghuiLibrarySectionTitle">快速导入</div>
                  <div className="linghuiLibrarySectionHint">把本地素材直接送到画布中心。</div>
                </div>
              </div>
              <div className="linghuiLibraryQuickActions">
                <Button onClick={() => void handleImportMediaToCanvas('image')}>上传图片</Button>
                <Button onClick={() => void handleImportMediaToCanvas('video')}>上传视频</Button>
                <Button onClick={() => void handleImportMediaToCanvas('audio')}>上传音频</Button>
              </div>
            </div>

            {(['creation', 'storyboard'] as const).map(category => (
              <div key={category} className="linghuiLibrarySection">
                <div className="linghuiLibrarySectionHeader">
                  <div>
                    <div className="linghuiLibrarySectionTitle">
                      {category === 'creation' ? '创作节点' : '分镜节点'}
                    </div>
                    <div className="linghuiLibrarySectionHint">
                      {category === 'creation' ? '常用生成与素材节点。' : '用于镜头编排和分镜组织。'}
                    </div>
                  </div>
                </div>

                <div className="linghuiLibraryNodeList">
                  {LINGHUI_NODE_CATALOG.filter(item => item.category === category).map(item => (
                    <button
                      key={item.type}
                      type="button"
                      className="linghuiLibraryNodeButton"
                      onClick={() => handleQuickAddNode(item.type)}
                    >
                      <span className="linghuiLibraryNodeDot" style={{ background: item.accent }} />
                      <span className="linghuiLibraryNodeBody">
                        <span className="linghuiLibraryNodeLabel">{item.label}</span>
                        <span className="linghuiLibraryNodeDesc">{item.description}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ))}

            <div className="linghuiLibrarySection">
              <div className="linghuiLibrarySectionHeader">
                <div>
                  <div className="linghuiLibrarySectionTitle">最近工作流</div>
                  <div className="linghuiLibrarySectionHint">常用模板可以一键重新发回画布。</div>
                </div>
                <Button size="small" onClick={() => void loadWorkflowLibrary(activeWorkspace?.id ?? null)}>
                  刷新
                </Button>
              </div>

              {workflowLoading ? (
                <div className="linghuiLibraryDrawerLoading">
                  <Spin size="large" />
                </div>
              ) : recentWorkflowTemplates.length === 0 ? (
                <div className="linghuiLibraryDrawerEmpty">
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="还没有已保存的工作流模板" />
                </div>
              ) : (
                <div className="linghuiLibraryCardList">
                  {recentWorkflowTemplates.map(template => (
                    <div key={template.id} className="linghuiLibraryTemplateCard">
                      <div className="linghuiLibraryCardBody">
                        <div className="linghuiLibraryCardTitle">{template.name}</div>
                        <div className="linghuiLibraryCardMeta">
                          <span>{template.nodeCount} 节点</span>
                          <span>{template.linkCount} 连线</span>
                          <span>{new Date(template.updatedAt).toLocaleString()}</span>
                        </div>
                        {template.sampleNodeLabels.length > 0 && (
                          <div className="linghuiLibraryTagRow">
                            {template.sampleNodeLabels.map(label => (
                              <span key={`${template.id}-${label}`} className="linghuiLibraryTag">{label}</span>
                            ))}
                          </div>
                        )}
                      </div>
                      <Button type="primary" size="small" onClick={() => handleSendWorkflowToCanvas(template)}>
                        发送到画布
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {activeDrawer === 'workflow' && (
          <div className="linghuiLibraryDrawerBody">
            <div className="linghuiLibrarySectionHeader">
              <div>
                <div className="linghuiLibrarySectionTitle">可复用工作流</div>
                <div className="linghuiLibrarySectionHint">来自分组右键“保存为工作流”的模板库。</div>
              </div>
              <Button size="small" onClick={() => void loadWorkflowLibrary(activeWorkspace?.id ?? null)}>
                刷新
              </Button>
            </div>

            {workflowLoading ? (
              <div className="linghuiLibraryDrawerLoading">
                <Spin size="large" />
              </div>
            ) : workflowTemplates.length === 0 ? (
              <div className="linghuiLibraryDrawerEmpty">
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="还没有工作流模板，先在画布上保存一个分组吧" />
              </div>
            ) : (
              <div className="linghuiLibraryCardList">
                {workflowTemplates.map(template => (
                  <div key={template.id} className="linghuiLibraryTemplateCard">
                    <div className="linghuiLibraryCardBody">
                      <div className="linghuiLibraryCardTitle">{template.name}</div>
                      <div className="linghuiLibraryCardMeta">
                        <span>{template.nodeCount} 节点</span>
                        <span>{template.linkCount} 连线</span>
                        <span>{template.groupCount} 分组</span>
                        <span>{new Date(template.updatedAt).toLocaleString()}</span>
                      </div>
                      {template.description && (
                        <div className="linghuiLibraryCardText">{template.description}</div>
                      )}
                      {template.sampleNodeLabels.length > 0 && (
                        <div className="linghuiLibraryTagRow">
                          {template.sampleNodeLabels.map(label => (
                            <span key={`${template.id}-${label}`} className="linghuiLibraryTag">{label}</span>
                          ))}
                        </div>
                      )}
                    </div>
                    <Button type="primary" size="small" onClick={() => handleSendWorkflowToCanvas(template)}>
                      发送到画布
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeDrawer === 'asset' && (
          <div className="linghuiLibraryDrawerBody">
            <div className="linghuiAssetDrawerToolbar">
              <Segmented<LinghuiAssetFilter>
                options={[
                  { label: '全部', value: 'all' },
                  { label: '图片', value: 'image' },
                  { label: '视频', value: 'video' },
                  { label: '音频', value: 'audio' },
                  { label: '文本', value: 'text' },
                ]}
                value={assetFilter}
                onChange={value => setAssetFilter(value as LinghuiAssetFilter)}
              />
              <Button size="small" onClick={() => void loadAssetLibrary(activeWorkspace?.id ?? null)}>
                刷新
              </Button>
            </div>

            {assetLoading ? (
              <div className="linghuiLibraryDrawerLoading">
                <Spin size="large" />
              </div>
            ) : filteredAssets.length === 0 ? (
              <div className="linghuiLibraryDrawerEmpty">
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前工作区还没有这类资产" />
              </div>
            ) : (
              <div className="linghuiLibraryCardList">
                {filteredAssets.map(asset => {
                  const previewSource = toPreviewSource(asset.previewSource || asset.posterSource || asset.source);
                  return (
                    <div key={asset.id} className="linghuiAssetDrawerCard">
                      <div className={`linghuiAssetDrawerPreview ${previewSource ? 'hasPreview' : 'isTextual'}`}>
                        {previewSource && (asset.kind === 'image' || asset.kind === 'video') ? (
                          <img src={previewSource} alt={asset.name} />
                        ) : (
                          <div className="linghuiAssetDrawerPreviewFallback">
                            <span className="linghuiAssetDrawerPreviewKind">{asset.kind.toUpperCase()}</span>
                            <span className="linghuiAssetDrawerPreviewName">{asset.name}</span>
                          </div>
                        )}
                      </div>

                      <div className="linghuiAssetDrawerCardBody">
                        <div className="linghuiAssetDrawerCardTitle">{asset.name}</div>
                        <div className="linghuiAssetDrawerCardMeta">
                          <span>{asset.kind}</span>
                          <span>{new Date(asset.createdAt).toLocaleString()}</span>
                        </div>
                        {asset.text && (
                          <div className="linghuiAssetDrawerCardText">{asset.text}</div>
                        )}
                        <Button type="primary" size="small" onClick={() => handleSendAssetToCanvas(asset)}>
                          发送到画布
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {activeDrawer === 'history' && (
          <div className="linghuiLibraryDrawerBody">
            <div className="linghuiLibrarySectionHeader">
              <div>
                <div className="linghuiLibrarySectionTitle">最近运行结果</div>
                <div className="linghuiLibrarySectionHint">执行成功后的产物会自动进入这里，可继续复用。</div>
              </div>
              <Button size="small" onClick={() => void loadHistoryLibrary(activeWorkspace?.id ?? null)}>
                刷新
              </Button>
            </div>

            {historyLoading ? (
              <div className="linghuiLibraryDrawerLoading">
                <Spin size="large" />
              </div>
            ) : workspaceHistory.length === 0 ? (
              <div className="linghuiLibraryDrawerEmpty">
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="还没有历史结果，先运行一些节点吧" />
              </div>
            ) : (
              <div className="linghuiLibraryCardList">
                {workspaceHistory.map(record => {
                  const previewSource = toPreviewSource(record.previewSource || record.posterSource || record.source);
                  return (
                    <div key={record.id} className="linghuiAssetDrawerCard">
                      <div className={`linghuiAssetDrawerPreview ${previewSource ? 'hasPreview' : 'isTextual'}`}>
                        {previewSource && (record.kind === 'image' || record.kind === 'video') ? (
                          <img src={previewSource} alt={record.name} />
                        ) : (
                          <div className="linghuiAssetDrawerPreviewFallback">
                            <span className="linghuiAssetDrawerPreviewKind">{record.kind.toUpperCase()}</span>
                            <span className="linghuiAssetDrawerPreviewName">{record.name}</span>
                          </div>
                        )}
                      </div>

                      <div className="linghuiAssetDrawerCardBody">
                        <div className="linghuiAssetDrawerCardTitle">{record.name}</div>
                        <div className="linghuiAssetDrawerCardMeta">
                          <span>{record.kind}</span>
                          <span>{record.nodeType.replace('linghui/', '')}</span>
                          <span>{new Date(record.createdAt).toLocaleString()}</span>
                        </div>
                        {record.text && (
                          <div className="linghuiAssetDrawerCardText">{record.text}</div>
                        )}
                        <Button type="primary" size="small" onClick={() => handleSendHistoryToCanvas(record)}>
                          发送到画布
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {activeDrawer === 'tutorial' && (
          <div className="linghuiLibraryDrawerBody">
            <div className="linghuiLibrarySection">
              <div className="linghuiLibrarySectionHeader">
                <div>
                  <div className="linghuiLibrarySectionTitle">画布操作手册</div>
                  <div className="linghuiLibrarySectionHint">把高频操作都收在这，方便随时对照。</div>
                </div>
              </div>
              <div className="linghuiTutorialList">
                {LINGHUI_TUTORIAL_GUIDES.map(item => (
                  <div key={item} className="linghuiTutorialItem">{item}</div>
                ))}
              </div>
            </div>

            <div className="linghuiLibrarySection">
              <div className="linghuiLibrarySectionHeader">
                <div>
                  <div className="linghuiLibrarySectionTitle">快捷键</div>
                  <div className="linghuiLibrarySectionHint">和画布交互最直接的一组快捷方式。</div>
                </div>
              </div>
              <div className="linghuiShortcutList">
                {LINGHUI_TUTORIAL_SHORTCUTS.map(([shortcut, description]) => (
                  <div key={shortcut} className="linghuiShortcutItem">
                    <span className="linghuiShortcutKey">{shortcut}</span>
                    <span className="linghuiShortcutDesc">{description}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="linghuiLibrarySection">
              <div className="linghuiLibrarySectionHeader">
                <div>
                  <div className="linghuiLibrarySectionTitle">节点类型</div>
                  <div className="linghuiLibrarySectionHint">当前灵绘里可直接使用的核心节点。</div>
                </div>
              </div>
              <div className="linghuiLibraryTagRow">
                {LINGHUI_NODE_CATALOG.map(item => (
                  <span key={item.type} className="linghuiLibraryTag">{item.label}</span>
                ))}
              </div>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
};

export default LinghuiPage;

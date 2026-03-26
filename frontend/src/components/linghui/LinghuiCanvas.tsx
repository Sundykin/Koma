import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import {
  LGraph,
  LGraphCanvas,
  LGraphGroup,
  type LGraphNode,
} from '@litegraph-ts/core';
import '@litegraph-ts/core/css/litegraph.css';
import type {
  LinghuiGraphSnapshot,
  LinghuiGraphStats,
  LinghuiNodeRunState,
  LinghuiNodeType,
  LinghuiRunStatus,
  LinghuiViewportState,
  LinghuiWorkspaceDocument,
} from '../../types/linghui';
import { createLinghuiGraphNode, getLinghuiNodeAccent, registerLinghuiNodes, setLinghuiNodeActive } from './linghuiNodes';
import './LinghuiPage.css';

export type LinghuiCanvasSelection =
  | { kind: 'node'; node: LGraphNode }
  | { kind: 'group'; group: LGraphGroup }
  | null;

export interface LinghuiCanvasHandle {
  addNode: (type: LinghuiNodeType, clientPosition?: [number, number]) => void;
  createGroupFromSelection: () => void;
  focusContent: () => void;
  notifyMutation: () => void;
  snapshotNow: () => void;
  getSelectionIds: () => string[];
  getGraph: () => LGraph | null;
}

interface LinghuiCanvasProps {
  workspace: LinghuiWorkspaceDocument | null;
  nodeRuns: Record<string, LinghuiNodeRunState>;
  onGraphChange: (
    graphData: LinghuiGraphSnapshot,
    viewport: LinghuiViewportState,
    stats: LinghuiGraphStats,
  ) => void;
  onSelectionChange?: (selection: LinghuiCanvasSelection) => void;
  onNodeMutate?: (nodeId: string) => void;
  onConnectionError?: (message: string) => void;
}

const STATUS_COLORS: Record<LinghuiRunStatus, string> = {
  idle: '#64748b',
  running: '#3b82f6',
  succeeded: '#22c55e',
  failed: '#ef4444',
  stale: '#f97316',
};

function calculateStats(graphData: LinghuiGraphSnapshot): LinghuiGraphStats {
  return {
    nodeCount: graphData.nodes.length,
    linkCount: graphData.links.length,
    groupCount: graphData.groups.length,
  };
}

function getSelection(graphCanvas: LGraphCanvas): LinghuiCanvasSelection {
  if (graphCanvas.selected_group) {
    return { kind: 'group', group: graphCanvas.selected_group };
  }

  const currentNode = graphCanvas.current_node ?? Object.values(graphCanvas.selected_nodes ?? {})[0];
  if (!currentNode) {
    return null;
  }

  return { kind: 'node', node: currentNode };
}

function getNodeBounds(nodes: LGraphNode[]) {
  const bounds = nodes.map(node => {
    const left = node.pos[0];
    const top = node.pos[1];
    const width = node.size[0];
    const height = node.size[1];
    return {
      left,
      top,
      right: left + width,
      bottom: top + height,
    };
  });

  const minX = Math.min(...bounds.map(item => item.left));
  const minY = Math.min(...bounds.map(item => item.top));
  const maxX = Math.max(...bounds.map(item => item.right));
  const maxY = Math.max(...bounds.map(item => item.bottom));

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
  };
}

function toNodeId(value: string | number | undefined): string {
  return value != null ? String(value) : '';
}

function getNodeStatusColor(status?: LinghuiRunStatus): string {
  if (!status) return STATUS_COLORS.idle;
  return STATUS_COLORS[status] ?? STATUS_COLORS.idle;
}

function getLinkStatus(statuses: LinghuiRunStatus[]): LinghuiRunStatus {
  if (statuses.includes('failed')) return 'failed';
  if (statuses.includes('running')) return 'running';
  if (statuses.includes('stale')) return 'stale';
  if (statuses.includes('succeeded')) return 'succeeded';
  return 'idle';
}

export const LinghuiCanvas = forwardRef<LinghuiCanvasHandle, LinghuiCanvasProps>(function LinghuiCanvas(
  {
    workspace,
    nodeRuns,
    onGraphChange,
    onSelectionChange,
    onNodeMutate,
    onConnectionError,
  },
  ref,
) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const runtimeRef = useRef<{ graph: LGraph; canvas: LGraphCanvas } | null>(null);
  const hydratingRef = useRef(false);
  const lastWorkspaceIdRef = useRef<string | null>(null);
  const lastSerializedRef = useRef<string | null>(null);
  const lastConnectionErrorRef = useRef<number | null>(null);
  const activeNodeRef = useRef<LGraphNode | null>(null);
  const onGraphChangeRef = useRef(onGraphChange);
  const onSelectionChangeRef = useRef(onSelectionChange);
  const onNodeMutateRef = useRef(onNodeMutate);
  const onConnectionErrorRef = useRef(onConnectionError);

  const emitSnapshotRef = useRef<() => void>(() => {});

  const nodeRunsMemo = useMemo(() => nodeRuns, [nodeRuns]);

  useEffect(() => {
    onGraphChangeRef.current = onGraphChange;
  }, [onGraphChange]);

  useEffect(() => {
    onSelectionChangeRef.current = onSelectionChange;
  }, [onSelectionChange]);

  useEffect(() => {
    onNodeMutateRef.current = onNodeMutate;
  }, [onNodeMutate]);

  useEffect(() => {
    onConnectionErrorRef.current = onConnectionError;
  }, [onConnectionError]);

  const addNodeAtPosition = (type: LinghuiNodeType, clientPosition?: [number, number]) => {
    const runtime = runtimeRef.current;
    if (!runtime || !hostRef.current) return;

    const node = createLinghuiGraphNode(type);
    if (!node) return;

    const rect = hostRef.current.getBoundingClientRect();
    const canvasPosition = clientPosition
      ? runtime.canvas.convertCanvasToOffset([
        clientPosition[0] - rect.left,
        clientPosition[1] - rect.top,
      ])
      : runtime.canvas.convertCanvasToOffset([
        hostRef.current.clientWidth * 0.5,
        hostRef.current.clientHeight * 0.5,
      ]);

    node.pos = [canvasPosition[0] - 90, canvasPosition[1] - 40];
    runtime.graph.add(node);
    runtime.canvas.selectNode(node);
    runtime.canvas.setDirty(true, true);
    emitSnapshotRef.current();
  };

  useEffect(() => {
    if (!hostRef.current || !canvasRef.current || runtimeRef.current) return;

    registerLinghuiNodes();

    const graph = new LGraph();
    const graphCanvas = new LGraphCanvas(canvasRef.current, graph, { autoresize: false });
    graphCanvas.background_image = LGraphCanvas.DEFAULT_BACKGROUND_IMAGE;
    graphCanvas.ds.min_scale = 0.25;
    graphCanvas.ds.max_scale = 2.5;
    graphCanvas.allow_dragnodes = true;
    graphCanvas.render_shadows = false;
    const syncActiveNode = () => {
      const sel = getSelection(graphCanvas);
      const nextActive = sel?.kind === 'node' ? sel.node : null;
      const prevActive = activeNodeRef.current;

      if (prevActive !== nextActive) {
        if (prevActive) {
          setLinghuiNodeActive(prevActive, false);
        }
        if (nextActive) {
          setLinghuiNodeActive(nextActive, true);
        }
        activeNodeRef.current = nextActive;
        graphCanvas.setDirty(true, true);
      }

      onSelectionChangeRef.current?.(sel);
    };

    graphCanvas.onSelectionChange = syncActiveNode;
    graphCanvas.onNodeSelected = syncActiveNode;
    graphCanvas.onNodeDeselected = syncActiveNode;

    const emitSnapshot = () => {
      const current = runtimeRef.current;
      if (!current || hydratingRef.current) return;

      const graphData = current.graph.serialize<LinghuiGraphSnapshot>();
      const viewport: LinghuiViewportState = {
        offset: [
          current.canvas.ds.offset[0],
          current.canvas.ds.offset[1],
        ],
        scale: current.canvas.ds.scale,
      };

      lastSerializedRef.current = JSON.stringify(graphData);
      onGraphChangeRef.current(graphData, viewport, calculateStats(graphData));
      onSelectionChangeRef.current?.(getSelection(current.canvas));

      const latestErrorAt = (current.graph as any)._linghuiConnectionErrorAt as number | undefined;
      if (latestErrorAt && latestErrorAt !== lastConnectionErrorRef.current) {
        const message = (current.graph as any)._linghuiConnectionError as string | undefined;
        if (message && onConnectionErrorRef.current) {
          onConnectionErrorRef.current(message);
        }
        lastConnectionErrorRef.current = latestErrorAt;
      }
    };

    emitSnapshotRef.current = emitSnapshot;
    (graph as any)._linghuiNotifyNodeMutation = (nodeId: string) => {
      graphCanvas.setDirty(true, true);
      emitSnapshot();
      onNodeMutateRef.current?.(nodeId);
    };
    graph.onAfterChange = () => emitSnapshot();
    runtimeRef.current = { graph, canvas: graphCanvas };

    const resizeCanvas = () => {
      if (!hostRef.current || !runtimeRef.current) return;

      const nextWidth = Math.max(320, Math.floor(hostRef.current.clientWidth));
      const nextHeight = Math.max(320, Math.floor(hostRef.current.clientHeight));

      runtimeRef.current.canvas.resize(nextWidth, nextHeight);
      runtimeRef.current.canvas.setDirty(true, true);
      emitSnapshot();
    };

    const scheduleViewportSnapshot = () => {
      requestAnimationFrame(() => emitSnapshot());
    };

    const observer = new ResizeObserver(() => resizeCanvas());
    observer.observe(hostRef.current);

    const root = hostRef.current;
    root.addEventListener('pointerup', scheduleViewportSnapshot);
    root.addEventListener('wheel', scheduleViewportSnapshot, { passive: true });
    resizeCanvas();

    return () => {
      observer.disconnect();
      root.removeEventListener('pointerup', scheduleViewportSnapshot);
      root.removeEventListener('wheel', scheduleViewportSnapshot);
      graphCanvas.clear();
      runtimeRef.current = null;
    };
  }, []);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime || !workspace) return;

    const workspaceId = workspace.id;
    const serialized = JSON.stringify(workspace.graphData);
    const shouldHydrate = lastWorkspaceIdRef.current !== workspaceId || lastSerializedRef.current !== serialized;

    if (!shouldHydrate) return;

    hydratingRef.current = true;
    runtime.graph.clear();
    runtime.graph.configure(workspace.graphData);
    runtime.canvas.current_node = null;
    runtime.canvas.selected_nodes = {};
    runtime.canvas.selected_group = null;
    runtime.canvas.ds.offset[0] = workspace.viewport.offset[0];
    runtime.canvas.ds.offset[1] = workspace.viewport.offset[1];
    runtime.canvas.ds.scale = workspace.viewport.scale;
    runtime.canvas.ds.computeVisibleArea();
    runtime.canvas.setDirty(true, true);
    hydratingRef.current = false;
    lastWorkspaceIdRef.current = workspaceId;
    lastSerializedRef.current = serialized;
    if (activeNodeRef.current) {
      setLinghuiNodeActive(activeNodeRef.current, false);
      activeNodeRef.current = null;
    }
    onSelectionChangeRef.current?.(getSelection(runtime.canvas));
  }, [workspace]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime) return;

    const nodes = (runtime.graph as any)._nodes as LGraphNode[];
    if (!nodes?.length) return;

    for (const node of nodes) {
      const nodeId = toNodeId(node.id);
      const runState = nodeRunsMemo[nodeId];
      (node as any).__linghuiRunState = runState;
      const status = runState?.status ?? 'idle';
      const color = getNodeStatusColor(status);

      node.has_errors = status === 'failed';
      node.highlight.enabled = status !== 'idle';
      node.highlight.color = color;
      node.highlight.width = status === 'running' ? 4 : 2;
      node.progress.running = status === 'running';
      node.progress.current = Math.round(runState?.progress ?? 0);
      node.progress.total = 100;
      node.progress.message = runState?.message ?? '';

      const accent = getLinghuiNodeAccent(node.type);
      if (status === 'failed') {
        node.boxcolor = STATUS_COLORS.failed;
      } else if (status === 'running') {
        node.boxcolor = STATUS_COLORS.running;
      } else if (status === 'succeeded') {
        node.boxcolor = accent;
      } else if (status === 'stale') {
        node.boxcolor = STATUS_COLORS.stale;
      } else {
        node.boxcolor = accent;
      }
    }

    const links = Object.values(runtime.graph.links ?? {}) as Array<any>;
    for (const link of links) {
      const fromState = nodeRunsMemo[toNodeId(link.origin_id)]?.status ?? 'idle';
      const toState = nodeRunsMemo[toNodeId(link.target_id)]?.status ?? 'idle';
      const status = getLinkStatus([fromState, toState]);
      link.color = getNodeStatusColor(status);
    }

    runtime.canvas.setDirty(true, true);
  }, [nodeRunsMemo]);

  useImperativeHandle(ref, () => ({
    addNode(type, clientPosition) {
      addNodeAtPosition(type, clientPosition);
    },
    createGroupFromSelection() {
      const runtime = runtimeRef.current;
      if (!runtime) return;

      const selectedNodes = Object.values(runtime.canvas.selected_nodes ?? {});
      if (!selectedNodes.length) return;

      const bounds = getNodeBounds(selectedNodes);
      const group = new LGraphGroup('新分组');
      group.pos = [bounds.minX - 36, bounds.minY - 56];
      group.size = [bounds.width + 72, bounds.height + 96];
      group.color = '#2563eb';
      runtime.graph.addGroup(group);
      group.recomputeInsideNodes();
      runtime.canvas.selected_group = group;
      runtime.canvas.setDirty(true, true);
      emitSnapshotRef.current();
    },
    focusContent() {
      const runtime = runtimeRef.current;
      if (!runtime || !hostRef.current) return;

      const nodes = (runtime.graph as any)._nodes as LGraphNode[];
      if (!nodes.length) {
        runtime.canvas.ds.reset();
        runtime.canvas.setDirty(true, true);
        emitSnapshotRef.current();
        return;
      }

      const bounds = getNodeBounds(nodes);
      const viewportWidth = Math.max(320, hostRef.current.clientWidth);
      const viewportHeight = Math.max(320, hostRef.current.clientHeight);
      const padding = 120;
      const scale = Math.min(
        1.2,
        Math.max(
          0.35,
          Math.min(
            (viewportWidth - padding) / bounds.width,
            (viewportHeight - padding) / bounds.height,
          ),
        ),
      );

      runtime.canvas.ds.scale = scale;
      runtime.canvas.ds.offset[0] = viewportWidth / scale / 2 - (bounds.minX + bounds.maxX) / 2;
      runtime.canvas.ds.offset[1] = viewportHeight / scale / 2 - (bounds.minY + bounds.maxY) / 2;
      runtime.canvas.ds.computeVisibleArea();
      runtime.canvas.setDirty(true, true);
      emitSnapshotRef.current();
    },
    notifyMutation() {
      const runtime = runtimeRef.current;
      if (!runtime) return;
      runtime.canvas.setDirty(true, true);
      emitSnapshotRef.current();
    },
    snapshotNow() {
      emitSnapshotRef.current();
    },
    getSelectionIds() {
      const runtime = runtimeRef.current;
      if (!runtime) return [];
      const selected = Object.values(runtime.canvas.selected_nodes ?? {});
      if (selected.length) {
        return selected.map(node => toNodeId(node.id));
      }
      if (runtime.canvas.selected_group) {
        const group = runtime.canvas.selected_group;
        group.recomputeInsideNodes();
        return ((group as any)._nodes as LGraphNode[]).map(node => toNodeId(node.id));
      }
      return [];
    },
    getGraph() {
      return runtimeRef.current?.graph ?? null;
    },
  }), []);

  function handleDragOver(event: React.DragEvent<HTMLDivElement>) {
    if (event.dataTransfer.types.includes('application/x-linghui-node-type')) {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
    }
  }

  function handleDrop(event: React.DragEvent<HTMLDivElement>) {
    const nodeType = event.dataTransfer.getData('application/x-linghui-node-type') as LinghuiNodeType | '';
    if (!nodeType) return;

    event.preventDefault();
    addNodeAtPosition(nodeType, [event.clientX, event.clientY]);
  }

  return (
    <div
      ref={hostRef}
      className="linghuiCanvasRoot"
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <canvas ref={canvasRef} className="linghuiGraphCanvas" />
      {!workspace && (
        <div className="linghuiCanvasEmpty">
          <div className="linghuiCanvasEmptyTitle">正在准备灵绘工作区</div>
          <div className="linghuiCanvasEmptyDesc">节点创建、拖拽、分组和自动保存会在这里生效。</div>
        </div>
      )}
    </div>
  );
});

export default LinghuiCanvas;

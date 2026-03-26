import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  addEdge,
  useNodesState,
  useEdgesState,
  useReactFlow,
  useViewport,
  type Connection,
  type Edge,
  type Node,
  type OnSelectionChangeParams,
  type NodeChange,
  type EdgeChange,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { nanoid } from 'nanoid';
import { Focus, Hand, MousePointer2, ZoomIn, ZoomOut } from 'lucide-react';
import type {
  LinghuiCanvasSelection,
  LinghuiCanvasMode,
  LinghuiExecutionContext,
  LinghuiExecutionLogEntry,
  LinghuiGraphSnapshot,
  LinghuiGraphStats,
  LinghuiNodeData,
  LinghuiNodeRunState,
  LinghuiNodeType,
  LinghuiRFEdgeSnapshot,
  LinghuiRFGroupSnapshot,
  LinghuiRFNodeSnapshot,
  LinghuiViewportState,
  LinghuiWorkspaceDocument,
} from '../../types/linghui';
import { createNewNodeData, LINGHUI_NODE_CATALOG } from './linghuiNodeDefs';
import { isLinghuiConnectionValid } from './linghuiNodeDefs';
import {
  linghuiNodeTypes,
  LinghuiNodeRunsContext,
  LinghuiConnectionErrorContext,
  LinghuiNodeInteractionContext,
  LinghuiNodeMutationContext,
} from './nodes';
import { linghuiEdgeTypes } from './LinghuiEdge';
import { LinghuiNodeEditor } from './LinghuiNodeEditor';
import './LinghuiPage.css';

export interface LinghuiCanvasHandle {
  addNode: (type: LinghuiNodeType, clientPosition?: [number, number]) => void;
  createGroupFromSelection: () => void;
  focusContent: () => void;
  notifyMutation: () => void;
  snapshotNow: () => void;
  getSelectionIds: () => string[];
  getExecutionContext: () => LinghuiExecutionContext | null;
}

interface LinghuiCanvasProps {
  workspace: LinghuiWorkspaceDocument | null;
  nodeRuns: Record<string, LinghuiNodeRunState>;
  executionLogs?: LinghuiExecutionLogEntry[];
  onGraphChange: (
    graphData: LinghuiGraphSnapshot,
    viewport: LinghuiViewportState,
    stats: LinghuiGraphStats,
  ) => void;
  onSelectionChange?: (selection: LinghuiCanvasSelection) => void;
  onNodeMutate?: (nodeId: string) => void;
  onConnectionError?: (message: string) => void;
  onRunSingleNode?: (nodeId: string) => void;
  onRunAll?: () => void;
  onRunSelection?: () => void;
}

function toNodeSnapshot(node: Node): LinghuiRFNodeSnapshot {
  const data = node.data as unknown as LinghuiNodeData;
  return {
    id: node.id,
    type: node.type ?? '',
    position: { x: node.position.x, y: node.position.y },
    data,
    width: node.measured?.width ?? node.width,
    height: node.measured?.height ?? node.height,
    parentId: node.parentId,
  };
}

function toEdgeSnapshot(edge: Edge): LinghuiRFEdgeSnapshot {
  return {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    sourceHandle: edge.sourceHandle ?? 'output-0',
    targetHandle: edge.targetHandle ?? 'input-0',
    type: edge.type,
    data: edge.data as any,
  };
}

function toGroupSnapshot(node: Node): LinghuiRFGroupSnapshot {
  return {
    id: node.id,
    position: { x: node.position.x, y: node.position.y },
    data: node.data as any,
    style: {
      width: (node.style as any)?.width ?? node.measured?.width ?? 300,
      height: (node.style as any)?.height ?? node.measured?.height ?? 200,
    },
  };
}

function calculateStats(graphData: LinghuiGraphSnapshot): LinghuiGraphStats {
  return {
    nodeCount: graphData.nodes.length,
    linkCount: graphData.edges.length,
    groupCount: graphData.groups.length,
  };
}

function rfTypeKey(linghuiType: LinghuiNodeType): string {
  return linghuiType.replace(/\//g, '-');
}

function extractDefaultImageLabelIndex(label: string): number {
  const match = label.trim().match(/^图片\s*(\d+)$/);
  return match ? Number(match[1]) : 0;
}

function resolveNewNodeLabel(type: LinghuiNodeType, currentNodes: Node[]): string | undefined {
  if (type !== 'linghui/image') {
    return undefined;
  }

  const imageNodes = currentNodes.filter(node => {
    if (node.type === 'group') return false;
    const nodeData = node.data as unknown as LinghuiNodeData | undefined;
    return nodeData?.linghuiType === 'linghui/image';
  });

  const maxDefaultIndex = imageNodes.reduce((maxValue, node) => {
    const nodeData = node.data as unknown as LinghuiNodeData | undefined;
    return Math.max(maxValue, extractDefaultImageLabelIndex(nodeData?.label ?? ''));
  }, 0);

  return `图片 ${Math.max(imageNodes.length, maxDefaultIndex) + 1}`;
}

function createCanvasNode(type: LinghuiNodeType, position: Node['position'], currentNodes: Node[]): Node {
  return {
    id: nanoid(10),
    type: rfTypeKey(type),
    position,
    data: createNewNodeData(type, {
      label: resolveNewNodeLabel(type, currentNodes),
    }) as any,
    draggable: false,
  };
}

const NODE_LONG_PRESS_MS = 220;

interface ActiveNodePressState {
  nodeId: string;
  pointerId: number;
  startClientX: number;
  startClientY: number;
  lastClientX: number;
  lastClientY: number;
  dragActive: boolean;
  timerId: number;
}

type LinghuiCanvasMenuKind = 'pane' | 'node' | 'selection';

interface LinghuiCanvasMenuState {
  kind: LinghuiCanvasMenuKind;
  x: number;
  y: number;
  screenX: number;
  screenY: number;
  nodeId?: string;
  selectionIds?: string[];
}

interface LinghuiPendingGroupFrame {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  selectionIds: string[];
}

interface SelectionScreenState {
  startClientX: number;
  startClientY: number;
  lastClientX: number;
  lastClientY: number;
  detach?: () => void;
}

const LinghuiCanvasInner = forwardRef<LinghuiCanvasHandle, LinghuiCanvasProps>(function LinghuiCanvasInner(
  {
    workspace,
    nodeRuns,
    executionLogs,
    onGraphChange,
    onSelectionChange,
    onNodeMutate,
    onConnectionError,
    onRunSingleNode,
    onRunAll,
    onRunSelection,
  },
  ref,
) {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const reactFlow = useReactFlow();

  const [, setSelection] = useState<LinghuiCanvasSelection>(null);
  const [editorSelection, setEditorSelection] = useState<LinghuiCanvasSelection>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [canvasRect, setCanvasRect] = useState<DOMRect | null>(null);
  const [canvasMode, setCanvasMode] = useState<LinghuiCanvasMode>('mouse');
  const [contextMenu, setContextMenu] = useState<LinghuiCanvasMenuState | null>(null);
  const [pendingGroupFrame, setPendingGroupFrame] = useState<LinghuiPendingGroupFrame | null>(null);
  const viewport = useViewport();

  const lastWorkspaceIdRef = useRef<string | null>(null);
  const hydratingRef = useRef(false);
  const activePressRef = useRef<ActiveNodePressState | null>(null);
  const suppressedClickRef = useRef<{ nodeId: string; until: number } | null>(null);
  const selectionDragRef = useRef<{ previousIds: Set<string> } | null>(null);
  const selectionScreenRef = useRef<SelectionScreenState | null>(null);
  const onGraphChangeRef = useRef(onGraphChange);
  const onSelectionChangeRef = useRef(onSelectionChange);
  const onNodeMutateRef = useRef(onNodeMutate);
  const onConnectionErrorRef = useRef(onConnectionError);
  const onRunSingleNodeRef = useRef(onRunSingleNode);

  // Track canvas rect for editor positioning
  useEffect(() => {
    if (!hostRef.current) return;
    const observer = new ResizeObserver(() => {
      if (hostRef.current) setCanvasRect(hostRef.current.getBoundingClientRect());
    });
    observer.observe(hostRef.current);
    setCanvasRect(hostRef.current.getBoundingClientRect());
    return () => observer.disconnect();
  }, []);

  useEffect(() => { onGraphChangeRef.current = onGraphChange; }, [onGraphChange]);
  useEffect(() => { onSelectionChangeRef.current = onSelectionChange; }, [onSelectionChange]);
  useEffect(() => { onNodeMutateRef.current = onNodeMutate; }, [onNodeMutate]);
  useEffect(() => { onConnectionErrorRef.current = onConnectionError; }, [onConnectionError]);
  useEffect(() => { onRunSingleNodeRef.current = onRunSingleNode; }, [onRunSingleNode]);
  useEffect(() => {
    if (contextMenu && hostRef.current) {
      setCanvasRect(hostRef.current.getBoundingClientRect());
    }
  }, [contextMenu]);
  useEffect(() => () => {
    if (activePressRef.current) {
      window.clearTimeout(activePressRef.current.timerId);
    }
  }, []);

  const emitSnapshot = useCallback(() => {
    if (hydratingRef.current) return;
    const rfNodes = reactFlow.getNodes();
    const rfEdges = reactFlow.getEdges();
    const viewport = reactFlow.getViewport();

    const graphData: LinghuiGraphSnapshot = {
      version: 2,
      nodes: rfNodes.filter(n => n.type !== 'group').map(toNodeSnapshot),
      edges: rfEdges.map(toEdgeSnapshot),
      groups: rfNodes.filter(n => n.type === 'group').map(toGroupSnapshot),
    };

    onGraphChangeRef.current(
      graphData,
      { x: viewport.x, y: viewport.y, zoom: viewport.zoom },
      calculateStats(graphData),
    );
  }, [reactFlow]);
  const emitSnapshotRef = useRef(emitSnapshot);
  useEffect(() => {
    emitSnapshotRef.current = emitSnapshot;
  }, [emitSnapshot]);

  const reactFlowRef = useRef(reactFlow);
  useEffect(() => {
    reactFlowRef.current = reactFlow;
  }, [reactFlow]);

  const setNodesRef = useRef(setNodes);
  useEffect(() => {
    setNodesRef.current = setNodes;
  }, [setNodes]);

  const setEdgesRef = useRef(setEdges);
  useEffect(() => {
    setEdgesRef.current = setEdges;
  }, [setEdges]);

  const recentLogs = useMemo(() => {
    return (executionLogs ?? []).slice(-8).reverse();
  }, [executionLogs]);

  // Hydrate from workspace
  useEffect(() => {
    if (!workspace) return;
    if (lastWorkspaceIdRef.current === workspace.id) return;

    hydratingRef.current = true;
    lastWorkspaceIdRef.current = workspace.id;
    setEditorSelection(null);
    setSelection(null);
    setContextMenu(null);
    setPendingGroupFrame(null);

    const { nodes: snapNodes, edges: snapEdges, groups: snapGroups } = workspace.graphData;

    const rfNodes = [
      ...(snapGroups ?? []).map(g => ({
        id: g.id,
        type: 'group' as const,
        position: g.position,
        data: g.data as unknown as Record<string, unknown>,
        style: { width: g.style.width, height: g.style.height },
        draggable: true,
      })),
      ...(snapNodes ?? []).map(n => ({
        id: n.id,
        type: n.type,
        position: n.position,
        data: n.data as unknown as Record<string, unknown>,
        parentId: n.parentId,
        draggable: false,
      })),
    ] satisfies Node[];

    const rfEdges = (snapEdges ?? []).map(e => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle,
      targetHandle: e.targetHandle,
      type: e.type ?? 'linghui-edge',
      data: (e.data ?? {}) as Record<string, unknown>,
    })) satisfies Edge[];

    setNodes(rfNodes);
    setEdges(rfEdges);

    requestAnimationFrame(() => {
      reactFlow.setViewport({
        x: workspace.viewport.x,
        y: workspace.viewport.y,
        zoom: workspace.viewport.zoom,
      });
      hydratingRef.current = false;
    });
  }, [workspace?.id, workspace?.graphData, setNodes, setEdges, reactFlow]);

  const handleNodesChange = useCallback((changes: NodeChange[]) => {
    onNodesChange(changes);
    // Check for property changes that need mutation tracking
    for (const change of changes) {
      if (change.type === 'replace' && change.item) {
        const prevData = (change as any).oldItem?.data as LinghuiNodeData | undefined;
        const nextData = change.item.data as unknown as LinghuiNodeData;
        if (prevData && JSON.stringify(prevData.properties) !== JSON.stringify(nextData?.properties)) {
          onNodeMutateRef.current?.(change.id);
        }
      }
    }
    requestAnimationFrame(() => emitSnapshot());
  }, [onNodesChange, emitSnapshot]);

  const handleEdgesChange = useCallback((changes: EdgeChange[]) => {
    onEdgesChange(changes);
    requestAnimationFrame(() => emitSnapshot());
  }, [onEdgesChange, emitSnapshot]);

  const handleConnect = useCallback((connection: Connection) => {
    const allNodes = reactFlow.getNodes();
    const validation = isLinghuiConnectionValid(
      {
        source: connection.source ?? '',
        target: connection.target ?? '',
        sourceHandle: connection.sourceHandle,
        targetHandle: connection.targetHandle,
      },
      allNodes.map(n => ({ id: n.id, data: n.data as unknown as LinghuiNodeData })),
    );

    if (!validation.valid) {
      onConnectionErrorRef.current?.(validation.message ?? '无法连接');
      return;
    }

    setEdges(eds => addEdge({
      ...connection,
      type: 'linghui-edge',
      id: `e-${nanoid(8)}`,
    }, eds));
    requestAnimationFrame(() => emitSnapshot());
  }, [reactFlow, setEdges, emitSnapshot]);

  const handleIsValidConnection = useCallback((connection: Connection) => {
    const allNodes = reactFlow.getNodes();
    const result = isLinghuiConnectionValid(
      {
        source: connection.source ?? '',
        target: connection.target ?? '',
        sourceHandle: connection.sourceHandle,
        targetHandle: connection.targetHandle,
      },
      allNodes.map(n => ({ id: n.id, data: n.data as unknown as LinghuiNodeData })),
    );
    return result.valid;
  }, [reactFlow]);

  const handleSelectionChange = useCallback(({ nodes: selectedNodes }: OnSelectionChangeParams) => {
    let sel: LinghuiCanvasSelection = null;

    if (selectedNodes.length === 1 && selectedNodes[0].type !== 'group') {
      const n = selectedNodes[0];
      const nd = n.data as unknown as LinghuiNodeData;
      sel = { kind: 'node', nodeId: n.id, nodeType: nd.linghuiType, label: nd.label };
    } else if (selectedNodes.length === 1 && selectedNodes[0].type === 'group') {
      const g = selectedNodes[0];
      sel = { kind: 'group', groupId: g.id, label: (g.data as any)?.label ?? '分组' };
    }

    setSelection(sel);
    if (!sel || sel.kind !== 'node') {
      setEditorSelection(null);
    }
    onSelectionChangeRef.current?.(sel);

    // Update active flag
    setNodes(nds => nds.map(n => {
      const isSelected = selectedNodes.some(s => s.id === n.id);
      const currentData = n.data as unknown as LinghuiNodeData;
      if (currentData?.active === isSelected) return n;
      return { ...n, data: { ...currentData, active: isSelected } as any };
    }));
  }, [setNodes]);

  const handleMoveEnd = useCallback(() => {
    emitSnapshot();
    if (hostRef.current) setCanvasRect(hostRef.current.getBoundingClientRect());
  }, [emitSnapshot]);

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  const openContextMenuAt = useCallback((
    clientX: number,
    clientY: number,
    kind: LinghuiCanvasMenuKind,
    extras?: { nodeId?: string; selectionIds?: string[] },
  ) => {
    if (!hostRef.current) return;
    const rect = hostRef.current.getBoundingClientRect();
    const menuWidth = 260;
    const menuHeight = 320;
    const rawX = clientX - rect.left;
    const rawY = clientY - rect.top;
    const x = Math.max(10, Math.min(rawX, rect.width - menuWidth - 10));
    const y = Math.max(10, Math.min(rawY, rect.height - menuHeight - 10));
    setContextMenu({
      kind,
      x,
      y,
      screenX: clientX,
      screenY: clientY,
      nodeId: extras?.nodeId,
      selectionIds: extras?.selectionIds,
    });
  }, []);

  const selectedNodeIds = useMemo(
    () => nodes.filter(node => node.selected).map(node => node.id),
    [nodes],
  );

  const selectedCreatableIds = useMemo(() => {
    return nodes.filter(node => node.selected && node.type !== 'group').map(node => node.id);
  }, [nodes]);

  const contextMenuNode = useMemo(() => {
    if (!contextMenu?.nodeId) return null;
    return nodes.find(node => node.id === contextMenu.nodeId) ?? null;
  }, [contextMenu?.nodeId, nodes]);

  const pendingGroupFrameStyle = useMemo(() => {
    if (!pendingGroupFrame || !canvasRect) return null;
    const topLeft = reactFlow.flowToScreenPosition({ x: pendingGroupFrame.minX, y: pendingGroupFrame.minY });
    const bottomRight = reactFlow.flowToScreenPosition({ x: pendingGroupFrame.maxX, y: pendingGroupFrame.maxY });
    return {
      left: topLeft.x - canvasRect.left,
      top: topLeft.y - canvasRect.top,
      width: Math.max(0, bottomRight.x - topLeft.x),
      height: Math.max(0, bottomRight.y - topLeft.y),
    };
  }, [canvasRect, pendingGroupFrame, reactFlow, viewport]);

  const deleteNodesByIds = useCallback((nodeIds: string[]) => {
    if (!nodeIds.length) return;

    setNodes(currentNodes => {
      const deleteSet = new Set(nodeIds);
      const groupPositions = new Map<string, { x: number; y: number }>();

      for (const node of currentNodes) {
        if (deleteSet.has(node.id) && node.type === 'group') {
          groupPositions.set(node.id, { x: node.position.x, y: node.position.y });
        }
      }

      return currentNodes
        .filter(node => !deleteSet.has(node.id))
        .map(node => {
          if (!node.parentId || !groupPositions.has(node.parentId)) return node;
          const groupPos = groupPositions.get(node.parentId)!;
          return {
            ...node,
            parentId: undefined,
            position: {
              x: node.position.x + groupPos.x,
              y: node.position.y + groupPos.y,
            },
          };
        });
    });

    setEdges(currentEdges => currentEdges.filter(edge => (
      !nodeIds.includes(edge.source) && !nodeIds.includes(edge.target)
    )));

    setEditorSelection(null);
    setPendingGroupFrame(null);
    requestAnimationFrame(() => emitSnapshot());
  }, [emitSnapshot, setNodes, setEdges]);

  const addNodeFromMenu = useCallback((type: LinghuiNodeType) => {
    if (!contextMenu) return;
    const position = reactFlow.screenToFlowPosition({ x: contextMenu.screenX, y: contextMenu.screenY });
    setNodes(currentNodes => [...currentNodes, createCanvasNode(type, position, currentNodes)]);
    closeContextMenu();
    requestAnimationFrame(() => emitSnapshot());
  }, [closeContextMenu, contextMenu, emitSnapshot, reactFlow, setNodes]);

  const handlePaneContextMenu = useCallback((event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (selectedNodeIds.length || pendingGroupFrame) {
      openContextMenuAt(event.clientX, event.clientY, 'selection', {
        selectionIds: pendingGroupFrame?.selectionIds ?? selectedNodeIds,
      });
      return;
    }
    openContextMenuAt(event.clientX, event.clientY, 'pane');
  }, [openContextMenuAt, pendingGroupFrame, selectedNodeIds]);

  const handleNodeContextMenu = useCallback((event: React.MouseEvent, node: Node) => {
    event.preventDefault();
    event.stopPropagation();

    if (!node.selected) {
      setNodes(current => current.map(n => ({ ...n, selected: n.id === node.id })));
    }

    setPendingGroupFrame(null);
    openContextMenuAt(event.clientX, event.clientY, 'node', { nodeId: node.id });
  }, [openContextMenuAt, setNodes]);

  const detachSelectionTracking = useCallback(() => {
    selectionScreenRef.current?.detach?.();
    if (selectionScreenRef.current) {
      selectionScreenRef.current.detach = undefined;
    }
  }, []);

  const resetSelectionTracking = useCallback(() => {
    selectionScreenRef.current?.detach?.();
    selectionScreenRef.current = null;
  }, []);

  const handleSelectionStart = useCallback((event: React.MouseEvent) => {
    if (canvasMode !== 'mouse') return;

    resetSelectionTracking();
    const state: SelectionScreenState = {
      startClientX: event.clientX,
      startClientY: event.clientY,
      lastClientX: event.clientX,
      lastClientY: event.clientY,
    };

    const handlePointerMove = (moveEvent: PointerEvent) => {
      if (!selectionScreenRef.current) return;
      selectionScreenRef.current.lastClientX = moveEvent.clientX;
      selectionScreenRef.current.lastClientY = moveEvent.clientY;
    };

    const handlePointerUp = () => {
      detachSelectionTracking();
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp, { once: true });
    state.detach = () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };

    selectionScreenRef.current = state;
  }, [canvasMode, detachSelectionTracking, resetSelectionTracking]);

  const handleSelectionDragStart = useCallback(() => {
    const previousIds = new Set(reactFlow.getNodes().filter(n => n.selected).map(n => n.id));
    selectionDragRef.current = { previousIds };
  }, [reactFlow]);

  const handleSelectionDragStop = useCallback((event: React.MouseEvent, draggedNodes: Node[]) => {
    detachSelectionTracking();
    const previousIds = selectionDragRef.current?.previousIds ?? new Set<string>();
    const mergedIds = new Set<string>(previousIds);
    draggedNodes.forEach(node => mergedIds.add(node.id));
    selectionDragRef.current = null;

    if (mergedIds.size === 0) {
      closeContextMenu();
      return;
    }

    const selectionScreen = selectionScreenRef.current;
    if (selectionScreen) {
      const minClientX = Math.min(selectionScreen.startClientX, selectionScreen.lastClientX);
      const minClientY = Math.min(selectionScreen.startClientY, selectionScreen.lastClientY);
      const maxClientX = Math.max(selectionScreen.startClientX, selectionScreen.lastClientX);
      const maxClientY = Math.max(selectionScreen.startClientY, selectionScreen.lastClientY);
      const topLeft = reactFlow.screenToFlowPosition({ x: minClientX, y: minClientY });
      const bottomRight = reactFlow.screenToFlowPosition({ x: maxClientX, y: maxClientY });

      setPendingGroupFrame({
        minX: Math.min(topLeft.x, bottomRight.x),
        minY: Math.min(topLeft.y, bottomRight.y),
        maxX: Math.max(topLeft.x, bottomRight.x),
        maxY: Math.max(topLeft.y, bottomRight.y),
        selectionIds: Array.from(mergedIds),
      });
    }

    setNodes(current => current.map(node => ({
      ...node,
      selected: mergedIds.has(node.id),
    })));

    openContextMenuAt(event.clientX, event.clientY, 'selection', { selectionIds: Array.from(mergedIds) });
  }, [closeContextMenu, detachSelectionTracking, openContextMenuAt, reactFlow, setNodes]);

  const handleSelectionContextMenu = useCallback((event: React.MouseEvent, selectedNodes: Node[]) => {
    event.preventDefault();
    event.stopPropagation();
    openContextMenuAt(event.clientX, event.clientY, 'selection', {
      selectionIds: selectedNodes.map(node => node.id),
    });
  }, [openContextMenuAt]);

  const handleSelectionEnd = useCallback(() => {
    detachSelectionTracking();
  }, [detachSelectionTracking]);

  const clearActivePress = useCallback(() => {
    if (activePressRef.current) {
      window.clearTimeout(activePressRef.current.timerId);
      activePressRef.current = null;
    }
  }, []);

  const openNodeEditor = useCallback((nodeId: string) => {
    const node = reactFlow.getNode(nodeId);
    if (!node || node.type === 'group') {
      setEditorSelection(null);
      return;
    }

    const nodeData = node.data as unknown as LinghuiNodeData;
    if (
      nodeData.linghuiType !== 'linghui/reference' &&
      nodeData.linghuiType !== 'linghui/image' &&
      nodeData.linghuiType !== 'linghui/video'
    ) {
      setEditorSelection(null);
      return;
    }

    setEditorSelection({
      kind: 'node',
      nodeId,
      nodeType: nodeData.linghuiType,
      label: nodeData.label,
    });
  }, [reactFlow]);

  const isInteractiveNodeTarget = useCallback((target: EventTarget | null): boolean => {
    const element = target as HTMLElement | null;
    if (!element) return false;

    return Boolean(
      element.closest('.react-flow__handle') ||
      element.closest('button, input, textarea, select, a, [role="button"], [contenteditable="true"]'),
    );
  }, []);

  const bindNodeSurface = useCallback((nodeId: string) => ({
    onPointerDown: (event: React.PointerEvent<HTMLElement>) => {
      if (event.button !== 0) return;
      if (isInteractiveNodeTarget(event.target)) return;

      clearActivePress();
      const pointerId = event.pointerId;
      const startClientX = event.clientX;
      const startClientY = event.clientY;

      const timerId = window.setTimeout(() => {
        if (activePressRef.current?.nodeId !== nodeId || activePressRef.current?.pointerId !== pointerId) {
          return;
        }

        activePressRef.current = {
          ...activePressRef.current,
          dragActive: true,
        };
      }, NODE_LONG_PRESS_MS);

      activePressRef.current = {
        nodeId,
        pointerId,
        startClientX,
        startClientY,
        lastClientX: startClientX,
        lastClientY: startClientY,
        dragActive: false,
        timerId,
      };

      event.currentTarget.setPointerCapture?.(pointerId);
    },
    onPointerMove: (event: React.PointerEvent<HTMLElement>) => {
      const activePress = activePressRef.current;
      if (!activePress || activePress.nodeId !== nodeId || activePress.pointerId !== event.pointerId) {
        return;
      }

      if (!activePress.dragActive) {
        activePress.lastClientX = event.clientX;
        activePress.lastClientY = event.clientY;
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      const previousFlow = reactFlow.screenToFlowPosition({
        x: activePress.lastClientX,
        y: activePress.lastClientY,
      });
      const nextFlow = reactFlow.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });
      const deltaX = nextFlow.x - previousFlow.x;
      const deltaY = nextFlow.y - previousFlow.y;

      if (deltaX !== 0 || deltaY !== 0) {
        setNodes(currentNodes => currentNodes.map(node => (
          node.id === nodeId
            ? {
                ...node,
                position: {
                  x: node.position.x + deltaX,
                  y: node.position.y + deltaY,
                },
              }
            : node
        )));
      }

      activePress.lastClientX = event.clientX;
      activePress.lastClientY = event.clientY;
    },
    onPointerUp: (event: React.PointerEvent<HTMLElement>) => {
      const activePress = activePressRef.current;
      if (!activePress || activePress.nodeId !== nodeId || activePress.pointerId !== event.pointerId) {
        return;
      }

      const wasDragging = activePress.dragActive;

      clearActivePress();
      event.currentTarget.releasePointerCapture?.(event.pointerId);

      if (wasDragging) {
        suppressedClickRef.current = {
          nodeId,
          until: Date.now() + 280,
        };
        requestAnimationFrame(() => emitSnapshot());
        return;
      }
    },
    onPointerCancel: (event: React.PointerEvent<HTMLElement>) => {
      const activePress = activePressRef.current;
      if (!activePress || activePress.nodeId !== nodeId || activePress.pointerId !== event.pointerId) {
        return;
      }

      clearActivePress();
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    },
  }), [clearActivePress, emitSnapshot, isInteractiveNodeTarget, reactFlow, setNodes]);

  const updateLinghuiNodeData = useCallback((
    nodeId: string,
    updater: (prev: LinghuiNodeData) => LinghuiNodeData,
    options?: { markStale?: boolean },
  ) => {
    let changed = false;

    setNodes(currentNodes => currentNodes.map(node => {
      if (node.id !== nodeId) return node;
      const prevData = node.data as unknown as LinghuiNodeData;
      const nextData = updater(prevData);

      if (JSON.stringify(prevData) === JSON.stringify(nextData)) {
        return node;
      }

      changed = true;
      return {
        ...node,
        data: nextData as unknown as Record<string, unknown>,
      };
    }));

    if (!changed) return;

    requestAnimationFrame(() => {
      emitSnapshot();
      if (options?.markStale !== false) {
        onNodeMutateRef.current?.(nodeId);
      }
    });
  }, [emitSnapshot, setNodes]);

  // Drag & drop from node library
  const handleDragOver = useCallback((event: React.DragEvent) => {
    if (event.dataTransfer.types.includes('application/x-linghui-node-type')) {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
    }
  }, []);

  const handleDrop = useCallback((event: React.DragEvent) => {
    const nodeType = event.dataTransfer.getData('application/x-linghui-node-type') as LinghuiNodeType | '';
    if (!nodeType) return;
    event.preventDefault();

    const position = reactFlow.screenToFlowPosition({ x: event.clientX, y: event.clientY });
    setNodes(currentNodes => [...currentNodes, createCanvasNode(nodeType, position, currentNodes)]);
    requestAnimationFrame(() => emitSnapshot());
  }, [reactFlow, setNodes, emitSnapshot]);

  const zoomIn = useCallback(() => {
    reactFlow.zoomIn({ duration: 180 });
  }, [reactFlow]);

  const zoomOut = useCallback(() => {
    reactFlow.zoomOut({ duration: 180 });
  }, [reactFlow]);

  const focusContent = useCallback(() => {
    reactFlow.fitView({ padding: 0.12, duration: 240 });
  }, [reactFlow]);

  const createGroupFromSelection = useCallback((selectionIds?: string[]) => {
    const rf = reactFlowRef.current;
    if (!rf) return;
    const selected = rf.getNodes().filter(n => (selectionIds?.includes(n.id) ?? n.selected) && n.type !== 'group');
    if (!selected.length) return;

    const frameBounds = pendingGroupFrame && (!selectionIds || selectionIds.every(id => pendingGroupFrame.selectionIds.includes(id)))
      ? pendingGroupFrame
      : null;

    const selectedNodeBounds = {
      minX: Math.min(...selected.map(n => n.position.x)),
      minY: Math.min(...selected.map(n => n.position.y)),
      maxX: Math.max(...selected.map(n => n.position.x + (n.measured?.width ?? 280))),
      maxY: Math.max(...selected.map(n => n.position.y + (n.measured?.height ?? 180))),
    };
    const bounds = frameBounds ? {
      minX: Math.min(frameBounds.minX, selectedNodeBounds.minX),
      minY: Math.min(frameBounds.minY, selectedNodeBounds.minY),
      maxX: Math.max(frameBounds.maxX, selectedNodeBounds.maxX),
      maxY: Math.max(frameBounds.maxY, selectedNodeBounds.maxY),
    } : selectedNodeBounds;

    const padding = 36;
    const groupId = nanoid(10);
    const groupNode: Node = {
      id: groupId,
      type: 'group',
      position: { x: bounds.minX - padding, y: bounds.minY - padding - 20 },
      data: { label: '新分组', color: '#2563eb' },
      draggable: true,
      style: {
        width: bounds.maxX - bounds.minX + padding * 2,
        height: bounds.maxY - bounds.minY + padding * 2 + 20,
      },
    };

    setNodesRef.current(nds => {
      const updated = nds.map(n => {
        if (!selected.some(s => s.id === n.id)) return n;
        return {
          ...n,
          parentId: groupId,
          position: {
            x: n.position.x - (bounds.minX - padding),
            y: n.position.y - (bounds.minY - padding - 20),
          },
        };
      });
      return [groupNode, ...updated];
    });

    setPendingGroupFrame(null);
    requestAnimationFrame(() => emitSnapshotRef.current());
  }, [pendingGroupFrame]);

  useImperativeHandle(ref, () => ({
    addNode(type, clientPosition) {
      const rf = reactFlowRef.current;
      if (!rf) return;
      const position = clientPosition
        ? rf.screenToFlowPosition({ x: clientPosition[0], y: clientPosition[1] })
        : rf.screenToFlowPosition({
          x: window.innerWidth / 2,
          y: window.innerHeight / 2,
        });

      setNodesRef.current(currentNodes => [...currentNodes, createCanvasNode(type, position, currentNodes)]);
      requestAnimationFrame(() => emitSnapshotRef.current());
    },

    createGroupFromSelection() {
      createGroupFromSelection();
    },

    focusContent() {
      reactFlowRef.current?.fitView({ padding: 0.12, duration: 240 });
    },

    notifyMutation() {
      emitSnapshotRef.current();
    },

    snapshotNow() {
      emitSnapshotRef.current();
    },

    getSelectionIds() {
      return reactFlowRef.current?.getNodes().filter(n => n.selected).map(n => n.id) ?? [];
    },

    getExecutionContext() {
      const rf = reactFlowRef.current;
      if (!rf) return null;
      const rfNodes = rf.getNodes().filter(n => n.type !== 'group');
      const rfEdges = rf.getEdges();
      return {
        nodes: rfNodes.map(toNodeSnapshot),
        edges: rfEdges.map(toEdgeSnapshot),
        nodeOutputs: {},
      };
    },
  }), [createGroupFromSelection]);

  return (
    <LinghuiNodeInteractionContext.Provider value={{ canvasMode, bindNodeSurface }}>
      <LinghuiNodeMutationContext.Provider value={{ updateNodeData: updateLinghuiNodeData }}>
      <div
        ref={hostRef}
        className={`linghuiCanvasRoot ${canvasMode === 'hand' ? 'isHandMode' : 'isMouseMode'}`}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        <div className="linghuiCanvasTools nopan nowheel">
          <button
            type="button"
            className={`linghuiCanvasToolButton ${canvasMode === 'mouse' ? 'isActive' : ''}`}
            onClick={() => setCanvasMode('mouse')}
            title="鼠标模式：滚轮平移画布，双指捏合或工具按钮缩放"
          >
            <MousePointer2 size={15} />
          </button>
          <button
            type="button"
            className={`linghuiCanvasToolButton ${canvasMode === 'hand' ? 'isActive' : ''}`}
            onClick={() => setCanvasMode('hand')}
            title="手模式：拖动画布，滚轮缩放"
          >
            <Hand size={15} />
          </button>
          <span className="linghuiCanvasToolDivider" />
          <button
            type="button"
            className="linghuiCanvasToolButton"
            onClick={zoomOut}
            title="缩小"
          >
            <ZoomOut size={15} />
          </button>
          <button
            type="button"
            className="linghuiCanvasToolButton"
            onClick={focusContent}
            title="适配内容"
          >
            <Focus size={15} />
          </button>
          <button
            type="button"
            className="linghuiCanvasToolButton"
            onClick={zoomIn}
            title="放大"
          >
            <ZoomIn size={15} />
          </button>
        </div>

        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={handleNodesChange}
          onEdgesChange={handleEdgesChange}
          onConnect={handleConnect}
          isValidConnection={handleIsValidConnection}
          onSelectionChange={handleSelectionChange}
          onSelectionDragStart={handleSelectionDragStart}
          onSelectionDragStop={handleSelectionDragStop}
          onSelectionContextMenu={handleSelectionContextMenu}
          onSelectionStart={handleSelectionStart}
          onSelectionEnd={handleSelectionEnd}
          onNodeClick={(event, node) => {
            if (isInteractiveNodeTarget(event.target)) {
              return;
            }
            if (
              suppressedClickRef.current &&
              suppressedClickRef.current.nodeId === node.id &&
              suppressedClickRef.current.until > Date.now()
            ) {
              return;
            }
            setPendingGroupFrame(null);
            closeContextMenu();
            openNodeEditor(node.id);
          }}
          onNodeContextMenu={handleNodeContextMenu}
          onPaneClick={() => {
            setEditorSelection(null);
            setPendingGroupFrame(null);
            closeContextMenu();
          }}
          onPaneContextMenu={handlePaneContextMenu}
          onMoveEnd={handleMoveEnd}
          nodeTypes={linghuiNodeTypes}
          edgeTypes={linghuiEdgeTypes}
          defaultEdgeOptions={{ type: 'linghui-edge' }}
          minZoom={0.25}
          maxZoom={2.5}
          deleteKeyCode={null}
          nodesDraggable
          selectionOnDrag={canvasMode === 'mouse'}
          panOnDrag={canvasMode === 'hand'}
          panOnScroll={canvasMode === 'mouse'}
          zoomOnScroll={canvasMode === 'hand'}
          zoomOnPinch
          zoomOnDoubleClick={false}
          panOnScrollSpeed={0.8}
          panActivationKeyCode={null}
          zoomActivationKeyCode={null}
          nodeDragThreshold={8}
          proOptions={{ hideAttribution: true }}
          colorMode="dark"
          fitView
        >
          <Background
            variant={BackgroundVariant.Dots}
            gap={20}
            size={1}
            color="rgba(255,255,255,0.05)"
          />
        </ReactFlow>

        <LinghuiNodeEditor
          selection={editorSelection}
          nodeRuns={nodeRuns}
          onRunNode={(nodeId) => onRunSingleNodeRef.current?.(nodeId)}
          canvasRect={canvasRect}
          workspaceId={workspace?.id ?? null}
        />

        {pendingGroupFrameStyle && (
          <div
            className="linghuiPendingGroupFrame"
            style={pendingGroupFrameStyle}
          >
            <span className="linghuiPendingGroupBadge">
              选区待分组 · {pendingGroupFrame?.selectionIds.length ?? 0} 项
            </span>
          </div>
        )}

        {contextMenu && (
          <div
            className="linghuiContextMenu nopan nowheel"
            style={{ left: contextMenu.x, top: contextMenu.y }}
            onPointerDown={(event) => event.stopPropagation()}
          >
            {contextMenu.kind === 'node' && (
              <>
                <div className="linghuiContextMenuHeader">节点操作</div>
                {contextMenuNode?.type !== 'group' ? (
                  <button
                    type="button"
                    className="linghuiContextMenuItem"
                    onClick={() => {
                      const nodeId = contextMenu.nodeId;
                      if (nodeId) {
                        onRunSingleNodeRef.current?.(nodeId);
                      }
                      closeContextMenu();
                    }}
                  >
                    运行当前节点
                  </button>
                ) : (
                  <div className="linghuiContextMenuHint">双击分组标题可直接重命名</div>
                )}
                <button
                  type="button"
                  className="linghuiContextMenuItem isDanger"
                  onClick={() => {
                    if (contextMenu.nodeId) {
                      deleteNodesByIds([contextMenu.nodeId]);
                    }
                    closeContextMenu();
                  }}
                >
                  删除节点
                </button>
              </>
            )}

            {contextMenu.kind !== 'node' && (
              <>
                <div className="linghuiContextMenuHeader">添加节点</div>
                {(['creation', 'storyboard'] as const).map(category => (
                  <div key={category} className="linghuiContextMenuSection">
                    <div className="linghuiContextMenuSectionTitle">
                      {category === 'creation' ? '创作节点' : '分镜节点'}
                    </div>
                    {LINGHUI_NODE_CATALOG.filter(item => item.category === category).map(item => (
                      <button
                        key={item.type}
                        type="button"
                        className="linghuiContextMenuItem"
                        onClick={() => addNodeFromMenu(item.type)}
                      >
                        <span className="linghuiContextMenuDot" style={{ background: item.accent }} />
                        {item.label}
                      </button>
                    ))}
                  </div>
                ))}
                <div className="linghuiContextMenuDivider" />
                <div className="linghuiContextMenuHeader">运行与分组</div>
                <button
                  type="button"
                  className="linghuiContextMenuItem"
                  onClick={() => {
                    onRunAll?.();
                    closeContextMenu();
                  }}
                >
                  运行全部
                </button>
                <button
                  type="button"
                  className={`linghuiContextMenuItem ${selectedNodeIds.length ? '' : 'isDisabled'}`}
                  onClick={() => {
                    if (!selectedNodeIds.length) return;
                    onRunSelection?.();
                    closeContextMenu();
                  }}
                >
                  运行选中
                </button>
                <button
                  type="button"
                  className={`linghuiContextMenuItem ${selectedCreatableIds.length ? '' : 'isDisabled'}`}
                  onClick={() => {
                    if (!selectedCreatableIds.length) return;
                    createGroupFromSelection(selectedCreatableIds);
                    closeContextMenu();
                  }}
                >
                  创建分组
                </button>
                {selectedNodeIds.length > 0 && (
                  <button
                    type="button"
                    className="linghuiContextMenuItem isDanger"
                    onClick={() => {
                      deleteNodesByIds(selectedNodeIds);
                      closeContextMenu();
                    }}
                  >
                    删除选中
                  </button>
                )}
                <div className="linghuiContextMenuDivider" />
                <div className="linghuiContextMenuHeader">最近日志</div>
                {recentLogs.length ? (
                  <div className="linghuiContextMenuLogs">
                    {recentLogs.map(entry => (
                      <div key={entry.id} className={`linghuiContextMenuLogItem linghuiLog-${entry.level}`}>
                        <span className="linghuiContextMenuLogTime">
                          {new Date(entry.createdAt).toLocaleTimeString()}
                        </span>
                        <span className="linghuiContextMenuLogMessage">{entry.message}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="linghuiContextMenuEmpty">暂无执行日志</div>
                )}
              </>
            )}
          </div>
        )}

        {!workspace && (
          <div className="linghuiCanvasEmpty">
            <div className="linghuiCanvasEmptyTitle">正在准备灵绘工作区</div>
            <div className="linghuiCanvasEmptyDesc">节点创建、拖拽、分组和自动保存会在这里生效。</div>
          </div>
        )}
      </div>
      </LinghuiNodeMutationContext.Provider>
    </LinghuiNodeInteractionContext.Provider>
  );
});

export const LinghuiCanvas = forwardRef<LinghuiCanvasHandle, LinghuiCanvasProps>(function LinghuiCanvas(
  props,
  ref,
) {
  return (
    <LinghuiNodeRunsContext.Provider value={props.nodeRuns}>
      <LinghuiConnectionErrorContext.Provider value={props.onConnectionError ?? (() => {})}>
        <ReactFlowProvider>
          <LinghuiCanvasInner {...props} ref={ref} />
        </ReactFlowProvider>
      </LinghuiConnectionErrorContext.Provider>
    </LinghuiNodeRunsContext.Provider>
  );
});

export default LinghuiCanvas;

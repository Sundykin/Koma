import { addEdge, type Connection, type Edge, type EdgeChange, type FinalConnectionState, type Node, type NodeChange, type OnConnectStartParams, type OnSelectionChangeParams, type ReactFlowInstance } from '@xyflow/react';
import { nanoid } from 'nanoid';
import { useCallback } from 'react';
import type { Dispatch, MutableRefObject, RefObject, SetStateAction } from 'react';
import type { LinghuiCanvasSelection, LinghuiNodeData } from '../../types/linghui';
import { isLinghuiConnectionValid, parseHandleId } from './linghuiNodeDefs';
import type { PendingConnectionCreateState } from './linghuiCanvasShared';

interface UseLinghuiCanvasFlowBridgeParams {
  reactFlow: ReactFlowInstance;
  hostRef: RefObject<HTMLDivElement | null>;
  onNodesChange: (changes: NodeChange[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  setNodes: Dispatch<SetStateAction<Node[]>>;
  setEdges: Dispatch<SetStateAction<Edge[]>>;
  setSelection: Dispatch<SetStateAction<LinghuiCanvasSelection>>;
  setEditorSelection: Dispatch<SetStateAction<LinghuiCanvasSelection>>;
  setCanvasRect: Dispatch<SetStateAction<DOMRect | null>>;
  emitSnapshot: (options?: { recordHistory?: boolean; force?: boolean }) => void;
  openQuickCreateAt: (
    clientX: number,
    clientY: number,
    extras?: { sourceConnection?: PendingConnectionCreateState },
  ) => void;
  pendingConnectionCreateRef: MutableRefObject<PendingConnectionCreateState | null>;
  onSelectionChangeRef: MutableRefObject<((selection: LinghuiCanvasSelection) => void) | undefined>;
  onNodeMutateRef: MutableRefObject<((nodeId: string) => void) | undefined>;
  onConnectionErrorRef: MutableRefObject<((message: string) => void) | undefined>;
}

function buildCanvasSelection(selectedNodes: Node[]): LinghuiCanvasSelection {
  if (selectedNodes.length === 1 && selectedNodes[0].type !== 'group') {
    const node = selectedNodes[0];
    const nodeData = node.data as unknown as LinghuiNodeData;
    return {
      kind: 'node',
      nodeId: node.id,
      nodeType: nodeData.linghuiType,
      label: nodeData.label,
    };
  }

  if (selectedNodes.length === 1 && selectedNodes[0].type === 'group') {
    const group = selectedNodes[0];
    return {
      kind: 'group',
      groupId: group.id,
      label: (group.data as { label?: string } | undefined)?.label ?? '分组',
    };
  }

  return null;
}

export function useLinghuiCanvasFlowBridge({
  reactFlow,
  hostRef,
  onNodesChange,
  onEdgesChange,
  setNodes,
  setEdges,
  setSelection,
  setEditorSelection,
  setCanvasRect,
  emitSnapshot,
  openQuickCreateAt,
  pendingConnectionCreateRef,
  onSelectionChangeRef,
  onNodeMutateRef,
  onConnectionErrorRef,
}: UseLinghuiCanvasFlowBridgeParams) {
  const handleNodesChange = useCallback((changes: NodeChange[]) => {
    onNodesChange(changes);

    for (const change of changes) {
      if (change.type !== 'replace' || !change.item) {
        continue;
      }

      const previousData = (change as { oldItem?: Node }).oldItem?.data as unknown as LinghuiNodeData | undefined;
      const nextData = change.item.data as unknown as LinghuiNodeData;
      if (previousData && JSON.stringify(previousData.properties) !== JSON.stringify(nextData?.properties)) {
        onNodeMutateRef.current?.(change.id);
      }
    }

    requestAnimationFrame(() => emitSnapshot());
  }, [emitSnapshot, onNodeMutateRef, onNodesChange]);

  const handleEdgesChange = useCallback((changes: EdgeChange[]) => {
    onEdgesChange(changes);
    requestAnimationFrame(() => emitSnapshot());
  }, [emitSnapshot, onEdgesChange]);

  const handleConnect = useCallback((connection: Connection) => {
    pendingConnectionCreateRef.current = null;
    const allNodes = reactFlow.getNodes();
    const validation = isLinghuiConnectionValid(
      {
        source: connection.source ?? '',
        target: connection.target ?? '',
        sourceHandle: connection.sourceHandle,
        targetHandle: connection.targetHandle,
      },
      allNodes.map(node => ({ id: node.id, data: node.data as unknown as LinghuiNodeData })),
    );

    if (!validation.valid) {
      onConnectionErrorRef.current?.(validation.message ?? '无法连接');
      return;
    }

    setEdges(currentEdges => addEdge({
      ...connection,
      type: 'linghui-edge',
      id: `e-${nanoid(8)}`,
    }, currentEdges));
    requestAnimationFrame(() => emitSnapshot());
  }, [emitSnapshot, onConnectionErrorRef, pendingConnectionCreateRef, reactFlow, setEdges]);

  const handleIsValidConnection = useCallback((connection: Connection) => {
    const allNodes = reactFlow.getNodes();
    const result = isLinghuiConnectionValid(
      {
        source: connection.source ?? '',
        target: connection.target ?? '',
        sourceHandle: connection.sourceHandle,
        targetHandle: connection.targetHandle,
      },
      allNodes.map(node => ({ id: node.id, data: node.data as unknown as LinghuiNodeData })),
    );
    return result.valid;
  }, [reactFlow]);

  const handleSelectionChange = useCallback(({ nodes: selectedNodes }: OnSelectionChangeParams) => {
    const nextSelection = buildCanvasSelection(selectedNodes);

    setSelection(nextSelection);
    if (!nextSelection || nextSelection.kind !== 'node') {
      setEditorSelection(null);
    }
    onSelectionChangeRef.current?.(nextSelection);

    setNodes(currentNodes => currentNodes.map(node => {
      const isSelected = selectedNodes.some(selectedNode => selectedNode.id === node.id);
      const currentData = node.data as unknown as LinghuiNodeData;
      if (currentData?.active === isSelected) {
        return node;
      }
      return {
        ...node,
        data: {
          ...currentData,
          active: isSelected,
        } as Record<string, unknown>,
      };
    }));
  }, [onSelectionChangeRef, setEditorSelection, setNodes, setSelection]);

  const handleMoveEnd = useCallback(() => {
    emitSnapshot();
    if (hostRef.current) {
      setCanvasRect(hostRef.current.getBoundingClientRect());
    }
  }, [emitSnapshot, hostRef, setCanvasRect]);

  const handleConnectStart = useCallback((_event: MouseEvent | TouchEvent, params: OnConnectStartParams) => {
    if (!params.nodeId || params.handleType !== 'source') {
      pendingConnectionCreateRef.current = null;
      return;
    }

    const sourceNode = reactFlow.getNode(params.nodeId);
    const sourceNodeData = sourceNode?.data as unknown as LinghuiNodeData | undefined;
    const parsedHandle = parseHandleId(params.handleId ?? 'output-0');
    const sourceSlot = parsedHandle && parsedHandle.direction === 'output'
      ? sourceNodeData?.outputs?.[parsedHandle.index]
      : sourceNodeData?.outputs?.[0];

    if (!sourceSlot) {
      pendingConnectionCreateRef.current = null;
      return;
    }

    pendingConnectionCreateRef.current = {
      sourceNodeId: params.nodeId,
      sourceHandleId: params.handleId ?? 'output-0',
      sourceDataType: sourceSlot.dataType,
    };
  }, [pendingConnectionCreateRef, reactFlow]);

  const handleConnectEnd = useCallback((event: MouseEvent | TouchEvent, connectionState: FinalConnectionState) => {
    const pendingConnection = pendingConnectionCreateRef.current;
    if (!pendingConnection) {
      return;
    }

    pendingConnectionCreateRef.current = null;

    if (connectionState.isValid || connectionState.toNode || !connectionState.pointer) {
      return;
    }

    const target = event.target as HTMLElement | null;
    const releasedOnPane = Boolean(target?.closest('.react-flow__pane'))
      || Boolean(target?.closest('.react-flow__renderer'));
    if (!releasedOnPane) {
      return;
    }

    openQuickCreateAt(connectionState.pointer.x, connectionState.pointer.y, {
      sourceConnection: pendingConnection,
    });
  }, [openQuickCreateAt, pendingConnectionCreateRef]);

  const updateLinghuiNodeData = useCallback((
    nodeId: string,
    updater: (previous: LinghuiNodeData) => LinghuiNodeData,
    options?: { markStale?: boolean },
  ) => {
    let changed = false;

    setNodes(currentNodes => currentNodes.map(node => {
      if (node.id !== nodeId) {
        return node;
      }

      const previousData = node.data as unknown as LinghuiNodeData;
      const nextData = updater(previousData);
      if (JSON.stringify(previousData) === JSON.stringify(nextData)) {
        return node;
      }

      changed = true;
      return {
        ...node,
        data: nextData as unknown as Record<string, unknown>,
      };
    }));

    if (!changed) {
      return;
    }

    requestAnimationFrame(() => {
      emitSnapshot();
      if (options?.markStale !== false) {
        onNodeMutateRef.current?.(nodeId);
      }
    });
  }, [emitSnapshot, onNodeMutateRef, setNodes]);

  return {
    handleNodesChange,
    handleEdgesChange,
    handleConnect,
    handleIsValidConnection,
    handleSelectionChange,
    handleMoveEnd,
    handleConnectStart,
    handleConnectEnd,
    updateLinghuiNodeData,
  };
}

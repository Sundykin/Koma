import { addEdge, type Connection, type Edge, type EdgeChange, type FinalConnectionState, type Node, type NodeChange, type OnConnectStartParams, type OnSelectionChangeParams, type ReactFlowInstance } from '@xyflow/react';
import { nanoid } from 'nanoid';
import { useCallback } from 'react';
import type { Dispatch, MutableRefObject, RefObject, SetStateAction } from 'react';
import type { LinghuiCanvasSelection, LinghuiNodeData } from '../../../../types/linghui';
import {
  buildLinghuiGroupCountLabel,
  isAutoLinghuiGroupCountLabel,
  resolveLinghuiWorkflowBlockLabel,
} from '../../../../constants/linghuiWorkflowBlock';
import {
  isLinghuiConnectionValid,
  resolveLinghuiCompatibleInputSlot,
} from '../../library/state/linghuiNodeDefs';
import {
  clampNodePositionToParentBounds,
  type PendingConnectionCreateState,
} from '../state/linghuiCanvasShared';

/**
 * 纯函数：根据连线松开时的 connectionState + 原生事件决定是否要打开 LibTV 风"引用该节点生成"面板。
 *
 * 规则（对齐 LibTV onConnectEnd）：
 * - 没有 pending（onConnectStart 没记到源） → 不打开
 * - 有效连接 isValid → 不打开（连接已经成立）
 * - 命中下游节点 toNode → 不打开（连接将由 onConnect 处理）
 * - pointer 缺失 + 事件坐标也都为 0 → 不打开（极端兼容性，避免左上角误弹）
 * - 其他情况一律打开
 *
 * 故意不再检查 `releasedOnPane`：旧逻辑要求 event.target 闭包到 .react-flow__pane / __renderer，
 * 但鼠标松开时 event.target 经常落到 .react-flow__edges / __nodes-overlay / 其他子层，
 * 导致 quickCreate 永远不会被触发；LibTV 自己也没有这一层判断。
 */
export function resolveQuickCreateFromConnectEnd(
  event: { clientX?: number; clientY?: number; changedTouches?: TouchList; touches?: TouchList },
  connectionState: {
    isValid: boolean | null;
    toNode: Node | null;
    pointer?: { x: number; y: number } | null;
  },
  pendingConnection: PendingConnectionCreateState | null,
): { open: false } | { open: true; x: number; y: number; sourceConnection: PendingConnectionCreateState } {
  if (!pendingConnection) return { open: false };
  if (connectionState.isValid || connectionState.toNode) return { open: false };

  const fallbackClientX = typeof event.clientX === 'number'
    ? event.clientX
    : event.changedTouches?.[0]?.clientX ?? event.touches?.[0]?.clientX ?? 0;
  const fallbackClientY = typeof event.clientY === 'number'
    ? event.clientY
    : event.changedTouches?.[0]?.clientY ?? event.touches?.[0]?.clientY ?? 0;
  const pointerX = connectionState.pointer?.x ?? fallbackClientX;
  const pointerY = connectionState.pointer?.y ?? fallbackClientY;

  if (!pointerX && !pointerY) return { open: false };

  return { open: true, x: pointerX, y: pointerY, sourceConnection: pendingConnection };
}

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
  scheduleSnapshot: (options?: { recordHistory?: boolean; force?: boolean }) => void;
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
  onConnectionInteractionChange?: (interacting: boolean) => void;
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
      label: resolveLinghuiWorkflowBlockLabel(
        (group.data as { label?: string } | undefined)?.label,
      ),
    };
  }

  return null;
}

export function hasPersistableNodeChanges(changes: NodeChange[]): boolean {
  return changes.some((change) => {
    if (change.type === 'select') {
      return false;
    }
    if (change.type === 'position') {
      return !change.dragging;
    }
    if (change.type === 'dimensions') {
      return !change.resizing;
    }
    return true;
  });
}

export function hasPersistableEdgeChanges(changes: EdgeChange[]): boolean {
  return changes.some(change => change.type !== 'select');
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
  scheduleSnapshot,
  emitSnapshot,
  openQuickCreateAt,
  pendingConnectionCreateRef,
  onSelectionChangeRef,
  onNodeMutateRef,
  onConnectionErrorRef,
  onConnectionInteractionChange,
}: UseLinghuiCanvasFlowBridgeParams) {
  const handleNodesChange = useCallback((changes: NodeChange[]) => {
    const currentNodes = reactFlow.getNodes();
    const nodeMap = new Map(currentNodes.map(node => [node.id, node]));
    const normalizedChanges = changes.map(change => {
      if (change.type !== 'position') {
        return change;
      }

      const currentNode = nodeMap.get(change.id);
      if (!currentNode?.parentId || !change.position) {
        return change;
      }

      const parentNode = nodeMap.get(currentNode.parentId) ?? reactFlow.getNode(currentNode.parentId);
      const clampedPosition = clampNodePositionToParentBounds({
        node: currentNode,
        parentNode,
        nextPosition: change.position,
      });

      if (
        clampedPosition.x === change.position.x &&
        clampedPosition.y === change.position.y
      ) {
        return change;
      }

      return {
        ...change,
        position: clampedPosition,
        positionAbsolute: parentNode
          ? {
              x: parentNode.position.x + clampedPosition.x,
              y: parentNode.position.y + clampedPosition.y,
            }
          : change.positionAbsolute,
      };
    });

    onNodesChange(normalizedChanges);

    for (const change of normalizedChanges) {
      if (change.type !== 'replace' || !change.item) {
        continue;
      }

      const previousData = (change as { oldItem?: Node }).oldItem?.data as unknown as LinghuiNodeData | undefined;
      const nextData = change.item.data as unknown as LinghuiNodeData;
      if (previousData && JSON.stringify(previousData.properties) !== JSON.stringify(nextData?.properties)) {
        onNodeMutateRef.current?.(change.id);
      }
    }

    if (hasPersistableNodeChanges(normalizedChanges)) {
      scheduleSnapshot();
    }
  }, [onNodeMutateRef, onNodesChange, reactFlow, scheduleSnapshot]);

  const handleEdgesChange = useCallback((changes: EdgeChange[]) => {
    onEdgesChange(changes);
    if (hasPersistableEdgeChanges(changes)) {
      scheduleSnapshot();
    }
  }, [onEdgesChange, scheduleSnapshot]);

  const handleConnect = useCallback((connection: Connection) => {
    pendingConnectionCreateRef.current = null;
    onConnectionInteractionChange?.(false);
    const source = connection.source ?? '';
    const target = connection.target ?? '';
    const allNodes = reactFlow.getNodes();
    const validation = isLinghuiConnectionValid(
      {
        source,
        target,
        sourceHandle: 'output-0',
        targetHandle: 'input-0',
      },
      allNodes.map(node => ({ id: node.id, data: node.data as unknown as LinghuiNodeData })),
    );

    if (!validation.valid) {
      onConnectionErrorRef.current?.(validation.message ?? '无法连接');
      return;
    }

    const sourceNode = allNodes.find(node => node.id === source);
    const targetNode = allNodes.find(node => node.id === target);
    const sourceSlot = (sourceNode?.data as unknown as LinghuiNodeData | undefined)?.outputs?.[0];
    const targetNodeData = targetNode?.data as unknown as LinghuiNodeData | undefined;
    const targetSlot = sourceSlot && targetNodeData
      ? resolveLinghuiCompatibleInputSlot(targetNodeData.linghuiType, sourceSlot.dataType)?.slot
      : null;

    setEdges((currentEdges) => {
      if (currentEdges.some(edge => edge.source === source && edge.target === target)) {
        return currentEdges;
      }
      return addEdge({
        source,
        target,
        sourceHandle: 'output-0',
        targetHandle: 'input-0',
        type: 'linghui-edge',
        id: `e-${nanoid(8)}`,
        data: sourceSlot
          ? {
              sourceSlotType: sourceSlot.dataType,
              targetSlotType: targetSlot?.dataType ?? sourceSlot.dataType,
            }
          : undefined,
      }, currentEdges);
    });
    scheduleSnapshot();
  }, [onConnectionErrorRef, onConnectionInteractionChange, pendingConnectionCreateRef, reactFlow, scheduleSnapshot, setEdges]);

  const handleIsValidConnection = useCallback((connection: Connection) => {
    const allNodes = reactFlow.getNodes();
    const result = isLinghuiConnectionValid(
      {
        source: connection.source ?? '',
        target: connection.target ?? '',
        sourceHandle: 'output-0',
        targetHandle: 'input-0',
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
  }, [onSelectionChangeRef, setEditorSelection, setSelection]);

  const handleMoveEnd = useCallback(() => {
    emitSnapshot();
    if (hostRef.current) {
      setCanvasRect(hostRef.current.getBoundingClientRect());
    }
  }, [emitSnapshot, hostRef, setCanvasRect]);

  const handleConnectStart = useCallback((_event: MouseEvent | TouchEvent, params: OnConnectStartParams) => {
    if (!params.nodeId || params.handleType !== 'source') {
      pendingConnectionCreateRef.current = null;
      onConnectionInteractionChange?.(false);
      return;
    }

    const sourceNode = reactFlow.getNode(params.nodeId);
    const sourceNodeData = sourceNode?.data as unknown as LinghuiNodeData | undefined;
    const sourceSlot = sourceNodeData?.outputs?.[0];

    if (!sourceSlot) {
      pendingConnectionCreateRef.current = null;
      onConnectionInteractionChange?.(false);
      return;
    }

    onConnectionInteractionChange?.(true);
    pendingConnectionCreateRef.current = {
      sourceNodeId: params.nodeId,
      sourceHandleId: 'output-0',
      sourceDataType: sourceSlot.dataType,
    };
  }, [onConnectionInteractionChange, pendingConnectionCreateRef, reactFlow]);

  const handleConnectEnd = useCallback((event: MouseEvent | TouchEvent, connectionState: FinalConnectionState) => {
    const pendingConnection = pendingConnectionCreateRef.current;
    pendingConnectionCreateRef.current = null;
    onConnectionInteractionChange?.(false);

    const decision = resolveQuickCreateFromConnectEnd(
      event as unknown as { clientX?: number; clientY?: number; changedTouches?: TouchList; touches?: TouchList },
      connectionState,
      pendingConnection,
    );

    if (!decision.open) {
      return;
    }

    openQuickCreateAt(decision.x, decision.y, {
      sourceConnection: decision.sourceConnection,
    });
  }, [onConnectionInteractionChange, openQuickCreateAt, pendingConnectionCreateRef]);

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
        data: withAutoGroupCountLabel(
          { ...node, data: nextData as unknown as Record<string, unknown> },
          currentNodes,
        ).data as unknown as Record<string, unknown>,
      };
    }));

    if (!changed) {
      return;
    }

    requestAnimationFrame(() => {
      scheduleSnapshot();
      if (options?.markStale !== false) {
        onNodeMutateRef.current?.(nodeId);
      }
    });
  }, [onNodeMutateRef, scheduleSnapshot, setNodes]);

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

function withAutoGroupCountLabel(node: Node, allNodes: Node[]): Node {
  if (node.type !== 'group') return node;

  const data = node.data as {
    label?: string;
    storyboardGroupType?: string;
  } | undefined;
  if (!isAutoLinghuiGroupCountLabel(data?.label)) {
    return node;
  }

  const childCount = allNodes.filter(item => item.parentId === node.id && item.type !== 'group').length;
  const storyboardGroup = data?.storyboardGroupType === 'image' || data?.storyboardGroupType === 'video';
  const label = buildLinghuiGroupCountLabel(childCount, storyboardGroup);
  if (data?.label === label) {
    return node;
  }

  return {
    ...node,
    data: {
      ...node.data,
      label,
    },
  };
}

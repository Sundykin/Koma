import { addEdge, type Edge, type Node, type ReactFlowInstance } from '@xyflow/react';
import { nanoid } from 'nanoid';
import { useCallback, useRef } from 'react';
import type { Dispatch, RefObject, SetStateAction } from 'react';
import type {
  LinghuiCanvasSelection,
  LinghuiImageNodeProperties,
  LinghuiNodeData,
  LinghuiNodeType,
} from '../../types/linghui';
import type {
  LinghuiWorkspaceAssetRecord,
  LinghuiWorkspaceHistoryRecord,
} from '../../store/linghuiStorage';
import {
  type LinghuiCanvasMenuState,
  type LinghuiClipboardSnapshot,
  type LinghuiPendingGroupFrame,
  type PendingConnectionCreateState,
  type QuickCreateState,
  PASTE_OFFSET_STEP,
  cloneLinghuiNodeData,
  cloneSnapshotValue,
  collectGroupPositions,
  createCanvasNode,
  detachNodesFromGroups,
  getNodeAbsolutePosition,
  resolveCompatibleTargetHandleId,
  toEdgeSnapshot,
  toGroupSnapshot,
  toNodeSnapshot,
} from './linghuiCanvasShared';

interface UseLinghuiCanvasDocumentOpsParams {
  reactFlow: ReactFlowInstance;
  hostRef: RefObject<HTMLDivElement | null>;
  setNodes: Dispatch<SetStateAction<Node[]>>;
  setEdges: Dispatch<SetStateAction<Edge[]>>;
  setEditorSelection: Dispatch<SetStateAction<LinghuiCanvasSelection>>;
  setContextMenu: Dispatch<SetStateAction<LinghuiCanvasMenuState | null>>;
  setQuickCreate: Dispatch<SetStateAction<QuickCreateState | null>>;
  setPendingGroupFrame: Dispatch<SetStateAction<LinghuiPendingGroupFrame | null>>;
  pendingGroupFrame: LinghuiPendingGroupFrame | null;
  scheduleSnapshot: (options?: { recordHistory?: boolean; force?: boolean }) => void;
}

export function useLinghuiCanvasDocumentOps({
  reactFlow,
  hostRef,
  setNodes,
  setEdges,
  setEditorSelection,
  setContextMenu,
  setQuickCreate,
  setPendingGroupFrame,
  pendingGroupFrame,
  scheduleSnapshot,
}: UseLinghuiCanvasDocumentOpsParams) {
  const clipboardRef = useRef<LinghuiClipboardSnapshot | null>(null);
  const pasteSequenceRef = useRef(0);

  const clearPendingGroupFrame = useCallback(() => {
    setPendingGroupFrame(null);
  }, [setPendingGroupFrame]);

  const buildClipboardSnapshot = useCallback((requestedIds?: string[]): LinghuiClipboardSnapshot | null => {
    const rfNodes = reactFlow.getNodes();
    const rfEdges = reactFlow.getEdges();
    const selectionIds = new Set(
      requestedIds?.length
        ? requestedIds
        : rfNodes.filter(node => node.selected).map(node => node.id),
    );

    const selectedGroups = rfNodes.filter(node => selectionIds.has(node.id) && node.type === 'group');
    const selectedGroupIds = new Set(selectedGroups.map(node => node.id));
    const selectedNodes = rfNodes.filter(node => (
      node.type !== 'group' && (
        selectionIds.has(node.id) ||
        (node.parentId ? selectedGroupIds.has(node.parentId) : false)
      )
    ));
    const selectedNodeIds = new Set(selectedNodes.map(node => node.id));
    const selectedEdges = rfEdges.filter(edge => (
      selectedNodeIds.has(edge.source) && selectedNodeIds.has(edge.target)
    ));

    if (!selectedNodes.length && !selectedGroups.length) {
      return null;
    }

    return {
      nodes: selectedNodes.map(toNodeSnapshot),
      edges: selectedEdges.map(toEdgeSnapshot),
      groups: selectedGroups.map(toGroupSnapshot),
    };
  }, [reactFlow]);

  const copySelectionToClipboard = useCallback((requestedIds?: string[]) => {
    const snapshot = buildClipboardSnapshot(requestedIds);
    if (!snapshot) return false;
    clipboardRef.current = snapshot;
    return true;
  }, [buildClipboardSnapshot]);

  const insertSubgraphSnapshotAtScreenPosition = useCallback((
    snapshot: LinghuiClipboardSnapshot,
    options?: { screenX?: number; screenY?: number },
  ) => {
    if (!snapshot.nodes.length && !snapshot.groups.length) {
      return false;
    }

    const rect = hostRef.current?.getBoundingClientRect();
    const targetScreenX = options?.screenX ?? (rect ? rect.left + rect.width / 2 : window.innerWidth / 2);
    const targetScreenY = options?.screenY ?? (rect ? rect.top + rect.height / 2 : window.innerHeight / 2);
    const targetCenter = reactFlow.screenToFlowPosition({ x: targetScreenX, y: targetScreenY });
    const serialOffset = pasteSequenceRef.current * PASTE_OFFSET_STEP;
    pasteSequenceRef.current += 1;

    const sourceGroupPositions = new Map(snapshot.groups.map(group => [group.id, group.position]));
    const sourceNodePositions = snapshot.nodes.map(node => {
      const absolutePosition = getNodeAbsolutePosition(node, sourceGroupPositions);
      return {
        node,
        absolutePosition,
        width: node.width ?? 280,
        height: node.height ?? 180,
      };
    });

    const bounds = [...snapshot.groups.map(group => ({
      x: group.position.x,
      y: group.position.y,
      width: group.style.width,
      height: group.style.height,
    })), ...sourceNodePositions.map(item => ({
      x: item.absolutePosition.x,
      y: item.absolutePosition.y,
      width: item.width,
      height: item.height,
    }))];

    if (!bounds.length) {
      return false;
    }

    const minX = Math.min(...bounds.map(item => item.x));
    const minY = Math.min(...bounds.map(item => item.y));
    const maxX = Math.max(...bounds.map(item => item.x + item.width));
    const maxY = Math.max(...bounds.map(item => item.y + item.height));
    const deltaX = targetCenter.x - (minX + (maxX - minX) / 2) + serialOffset;
    const deltaY = targetCenter.y - (minY + (maxY - minY) / 2) + serialOffset * 0.75;

    const groupIdMap = new Map(snapshot.groups.map(group => [group.id, nanoid(10)]));
    const nodeIdMap = new Map(snapshot.nodes.map(node => [node.id, nanoid(10)]));

    const nextGroups: Node[] = snapshot.groups.map(group => ({
      id: groupIdMap.get(group.id)!,
      type: 'group',
      position: {
        x: group.position.x + deltaX,
        y: group.position.y + deltaY,
      },
      data: cloneSnapshotValue(group.data) as unknown as Record<string, unknown>,
      style: {
        width: group.style.width,
        height: group.style.height,
      },
      draggable: true,
      selected: true,
    }));

    const nextNodes: Node[] = sourceNodePositions.map(({ node, absolutePosition }) => {
      const nextParentId = node.parentId && groupIdMap.has(node.parentId)
        ? groupIdMap.get(node.parentId)
        : undefined;

      return {
        id: nodeIdMap.get(node.id)!,
        type: node.type,
        position: nextParentId
          ? cloneSnapshotValue(node.position)
          : {
              x: absolutePosition.x + deltaX,
              y: absolutePosition.y + deltaY,
            },
        data: cloneLinghuiNodeData(node.data) as unknown as Record<string, unknown>,
        parentId: nextParentId,
        draggable: false,
        selected: true,
      };
    });

    const nextEdges: Edge[] = snapshot.edges.flatMap(edge => {
      const source = nodeIdMap.get(edge.source);
      const target = nodeIdMap.get(edge.target);
      if (!source || !target) {
        return [];
      }

      return [{
        id: `e-${nanoid(8)}`,
        source,
        target,
        sourceHandle: edge.sourceHandle,
        targetHandle: edge.targetHandle,
        type: edge.type ?? 'linghui-edge',
        data: cloneSnapshotValue((edge.data ?? {}) as Record<string, unknown>),
      }];
    });

    setNodes(currentNodes => [
      ...currentNodes.map(node => (node.selected ? { ...node, selected: false } : node)),
      ...nextGroups,
      ...nextNodes,
    ]);
    setEdges(currentEdges => [...currentEdges, ...nextEdges]);
    setEditorSelection(null);
    setContextMenu(null);
    setQuickCreate(null);
    setPendingGroupFrame(null);
    scheduleSnapshot();
    return true;
  }, [hostRef, reactFlow, scheduleSnapshot, setContextMenu, setEditorSelection, setEdges, setNodes, setPendingGroupFrame, setQuickCreate]);

  const pasteClipboardSnapshot = useCallback((options?: { screenX?: number; screenY?: number }) => {
    const snapshot = clipboardRef.current;
    if (!snapshot) {
      return false;
    }

    return insertSubgraphSnapshotAtScreenPosition(snapshot, options);
  }, [insertSubgraphSnapshotAtScreenPosition]);

  const duplicateSelection = useCallback((requestedIds?: string[], options?: { screenX?: number; screenY?: number }) => {
    const snapshot = buildClipboardSnapshot(requestedIds);
    if (!snapshot) return false;
    clipboardRef.current = snapshot;
    return pasteClipboardSnapshot(options);
  }, [buildClipboardSnapshot, pasteClipboardSnapshot]);

  const createNodeFromWorkspaceAsset = useCallback((
    asset: LinghuiWorkspaceAssetRecord | LinghuiWorkspaceHistoryRecord,
    position: Node['position'],
    currentNodes: Node[],
  ): Node => {
    const targetType: LinghuiNodeType = asset.kind === 'text'
      ? 'linghui/text'
      : asset.kind === 'video'
        ? 'linghui/video'
        : asset.kind === 'audio'
          ? 'linghui/audio'
          : 'linghui/image';
    const node = createCanvasNode(targetType, position, currentNodes);
    const nodeData = node.data as unknown as LinghuiNodeData;
    const properties = nodeData.properties as Record<string, unknown>;

    if (targetType === 'linghui/text') {
      return {
        ...node,
        selected: true,
        data: {
          ...nodeData,
          label: asset.name,
          properties: {
            ...properties,
            mode: 'manual',
            content: asset.text ?? '',
          },
        } as unknown as Record<string, unknown>,
      };
    }

    if (targetType === 'linghui/video') {
      return {
        ...node,
        selected: true,
        data: {
          ...nodeData,
          label: asset.name,
          properties: {
            ...properties,
            source: asset.source ?? '',
            posterSource: asset.posterSource ?? asset.previewSource ?? '',
          },
        } as unknown as Record<string, unknown>,
      };
    }

    if (targetType === 'linghui/audio') {
      return {
        ...node,
        selected: true,
        data: {
          ...nodeData,
          label: asset.name,
          properties: {
            ...properties,
            source: asset.source ?? '',
            prompt: asset.text ?? '',
          },
        } as unknown as Record<string, unknown>,
      };
    }

    return {
      ...node,
      selected: true,
      data: {
        ...nodeData,
        label: asset.name,
        properties: {
          ...properties,
          mode: 'import',
          source: asset.source ?? asset.previewSource ?? '',
        } as LinghuiImageNodeProperties,
      } as unknown as Record<string, unknown>,
    };
  }, []);

  const deleteNodesByIds = useCallback((nodeIds: string[]) => {
    if (!nodeIds.length) return;

    setNodes(currentNodes => {
      const deleteSet = new Set(nodeIds);
      const groupPositions = collectGroupPositions(currentNodes, deleteSet);
      return detachNodesFromGroups(
        currentNodes.filter(node => !deleteSet.has(node.id)),
        groupPositions,
      );
    });

    setEdges(currentEdges => currentEdges.filter(edge => (
      !nodeIds.includes(edge.source) && !nodeIds.includes(edge.target)
    )));

    setEditorSelection(null);
    setPendingGroupFrame(null);
    scheduleSnapshot();
  }, [scheduleSnapshot, setEdges, setEditorSelection, setNodes, setPendingGroupFrame]);

  const ungroupGroupsByIds = useCallback((groupIds: string[]) => {
    if (!groupIds.length) return;

    setNodes(currentNodes => {
      const groupPositions = collectGroupPositions(currentNodes, groupIds);
      if (!groupPositions.size) return currentNodes;

      return detachNodesFromGroups(
        currentNodes.filter(node => !groupPositions.has(node.id)),
        groupPositions,
        { selectDetached: true },
      );
    });

    setEditorSelection(null);
    clearPendingGroupFrame();
    scheduleSnapshot();
  }, [clearPendingGroupFrame, scheduleSnapshot, setEditorSelection, setNodes]);

  const insertNodeAtScreenPosition = useCallback((
    type: LinghuiNodeType,
    screenX: number,
    screenY: number,
    options?: { openEditor?: boolean; sourceConnection?: PendingConnectionCreateState },
  ) => {
    const position = reactFlow.screenToFlowPosition({ x: screenX, y: screenY });
    const currentNodes = reactFlow.getNodes();
    const createdNode = createCanvasNode(type, position, currentNodes);

    setNodes(existingNodes => [...existingNodes, createdNode]);

    if (options?.sourceConnection) {
      const targetHandleId = resolveCompatibleTargetHandleId(type, options.sourceConnection.sourceDataType);
      if (targetHandleId) {
        setEdges(existingEdges => addEdge({
          id: `e-${nanoid(8)}`,
          source: options.sourceConnection!.sourceNodeId,
          sourceHandle: options.sourceConnection!.sourceHandleId,
          target: createdNode.id,
          targetHandle: targetHandleId,
          type: 'linghui-edge',
        }, existingEdges));
      }
    }

    setContextMenu(null);
    setQuickCreate(null);
    requestAnimationFrame(() => {
      scheduleSnapshot();
      if (options?.openEditor) {
        const nodeData = createdNode.data as unknown as LinghuiNodeData;
        setEditorSelection({
          kind: 'node',
          nodeId: createdNode.id,
          nodeType: nodeData.linghuiType,
          label: nodeData.label,
        });
      }
    });
  }, [reactFlow, scheduleSnapshot, setContextMenu, setEditorSelection, setEdges, setNodes, setQuickCreate]);

  const createGroupFromSelection = useCallback((selectionIds?: string[]) => {
    const selected = reactFlow.getNodes().filter(n => (selectionIds?.includes(n.id) ?? n.selected) && n.type !== 'group');
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
      selected: true,
      draggable: true,
      style: {
        width: bounds.maxX - bounds.minX + padding * 2,
        height: bounds.maxY - bounds.minY + padding * 2 + 20,
      },
    };

    setNodes(nds => {
      const selectedIdSet = new Set(selected.map(node => node.id));
      const updated = nds.map(n => {
        if (!selectedIdSet.has(n.id)) {
          return n.selected ? { ...n, selected: false } : n;
        }
        return {
          ...n,
          parentId: groupId,
          selected: false,
          position: {
            x: n.position.x - (bounds.minX - padding),
            y: n.position.y - (bounds.minY - padding - 20),
          },
        };
      });
      return [groupNode, ...updated];
    });

    setEditorSelection(null);
    setContextMenu(null);
    clearPendingGroupFrame();
    scheduleSnapshot();
  }, [clearPendingGroupFrame, pendingGroupFrame, reactFlow, scheduleSnapshot, setContextMenu, setEditorSelection, setNodes]);

  const hasClipboardData = Boolean(clipboardRef.current?.nodes.length || clipboardRef.current?.groups.length);

  return {
    hasClipboardData,
    buildClipboardSnapshot,
    copySelectionToClipboard,
    insertSubgraphSnapshotAtScreenPosition,
    pasteClipboardSnapshot,
    duplicateSelection,
    createNodeFromWorkspaceAsset,
    deleteNodesByIds,
    ungroupGroupsByIds,
    insertNodeAtScreenPosition,
    createGroupFromSelection,
    clearPendingGroupFrame,
  };
}

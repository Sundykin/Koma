import type { Edge, Node, ReactFlowInstance } from '@xyflow/react';
import { nanoid } from 'nanoid';
import { useCallback } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { LinghuiCanvasSelection } from '../../../../types/linghui';
import { createNextLinghuiWorkflowBlockLabel } from '../../../../constants/linghuiWorkflowBlock';
import {
  type LinghuiCanvasMenuState,
  type LinghuiPendingGroupFrame,
  type QuickCreateState,
  collectGroupPositions,
  detachNodesFromGroups,
  expandNodeIdsWithDescendants,
} from '../state/linghuiCanvasShared';

interface UseLinghuiCanvasGroupOpsParams {
  reactFlow: ReactFlowInstance;
  setNodes: Dispatch<SetStateAction<Node[]>>;
  setEdges: Dispatch<SetStateAction<Edge[]>>;
  setEditorSelection: Dispatch<SetStateAction<LinghuiCanvasSelection>>;
  setContextMenu: Dispatch<SetStateAction<LinghuiCanvasMenuState | null>>;
  setQuickCreate: Dispatch<SetStateAction<QuickCreateState | null>>;
  setPendingGroupFrame: Dispatch<SetStateAction<LinghuiPendingGroupFrame | null>>;
  pendingGroupFrame: LinghuiPendingGroupFrame | null;
  scheduleSnapshot: (options?: { recordHistory?: boolean; force?: boolean }) => void;
  onClearNodeRunState?: (nodeId: string) => void;
}

export function useLinghuiCanvasGroupOps({
  reactFlow,
  setNodes,
  setEdges,
  setEditorSelection,
  setContextMenu,
  setQuickCreate,
  setPendingGroupFrame,
  pendingGroupFrame,
  scheduleSnapshot,
  onClearNodeRunState,
}: UseLinghuiCanvasGroupOpsParams) {
  const clearPendingGroupFrame = useCallback(() => {
    setPendingGroupFrame(null);
  }, [setPendingGroupFrame]);

  const deleteNodesByIds = useCallback((nodeIds: string[]) => {
    if (!nodeIds.length) return;

    const currentNodes = reactFlow.getNodes();
    const expandedNodeIds = expandNodeIdsWithDescendants(currentNodes, nodeIds);
    const deleteSet = new Set(expandedNodeIds);
    const deletedLeafNodeIds = currentNodes
      .filter(node => deleteSet.has(node.id) && node.type !== 'group')
      .map(node => node.id);

    deletedLeafNodeIds.forEach(nodeId => {
      onClearNodeRunState?.(nodeId);
    });

    setNodes(currentNodes => {
      const groupPositions = collectGroupPositions(currentNodes, deleteSet);
      return detachNodesFromGroups(
        currentNodes.filter(node => !deleteSet.has(node.id)),
        groupPositions,
      );
    });

    setEdges(currentEdges => currentEdges.filter(edge => (
      !deleteSet.has(edge.source) && !deleteSet.has(edge.target)
    )));

    setEditorSelection(null);
    setPendingGroupFrame(null);
    scheduleSnapshot();
  }, [onClearNodeRunState, reactFlow, scheduleSnapshot, setEdges, setEditorSelection, setNodes, setPendingGroupFrame]);

  const deleteEdgesByIds = useCallback((edgeIds: string[]) => {
    if (!edgeIds.length) return;

    const deleteSet = new Set(edgeIds);
    setEdges(currentEdges => currentEdges.filter(edge => !deleteSet.has(edge.id)));
    setContextMenu(null);
    setQuickCreate(null);
    setPendingGroupFrame(null);
    scheduleSnapshot();
  }, [scheduleSnapshot, setContextMenu, setEdges, setPendingGroupFrame, setQuickCreate]);

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

  const createGroupFromSelection = useCallback((selectionIds?: string[]) => {
    const allNodes = reactFlow.getNodes();
    const selected = allNodes.filter(n => (selectionIds?.includes(n.id) ?? n.selected) && n.type !== 'group');
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
    const nextGroupLabel = createNextLinghuiWorkflowBlockLabel(
      allNodes
        .filter(node => node.type === 'group')
        .map(node => (node.data as { label?: string } | undefined)?.label),
    );
    const groupNode: Node = {
      id: groupId,
      type: 'group',
      position: { x: bounds.minX - padding, y: bounds.minY - padding - 20 },
      data: { label: nextGroupLabel, color: 'var(--token-status-info)' },
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
          extent: 'parent' as const,
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

  return {
    clearPendingGroupFrame,
    deleteNodesByIds,
    deleteEdgesByIds,
    ungroupGroupsByIds,
    createGroupFromSelection,
  };
}

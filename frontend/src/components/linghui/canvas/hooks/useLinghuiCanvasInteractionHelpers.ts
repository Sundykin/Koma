import { useCallback } from 'react';
import { Modal } from 'antd';
import type { Dispatch, SetStateAction } from 'react';
import type { Edge } from '@xyflow/react';
import type { LinghuiNodeRunState } from '../../../../types/linghui';
import type { PendingConnectionCreateState } from '../state/linghuiCanvasShared';

interface UseLinghuiCanvasInteractionHelpersParams {
  setNodes: Dispatch<SetStateAction<any[]>>;
  setEdges: Dispatch<SetStateAction<any[]>>;
  setEditorSelection: (selection: any) => void;
  setActiveNodeTool: (tool: any) => void;
  setPendingGroupFrame: (frame: any) => void;
  closeContextMenu: () => void;
  closeQuickCreate: () => void;
  openContextMenuAt: (clientX: number, clientY: number, kind: string, extras?: any) => void;
  deleteNodesByIds: (nodeIds: string[]) => void;
  deleteEdgesByIds: (edgeIds: string[]) => void;
  nodeRuns: Record<string, LinghuiNodeRunState>;
  pendingConnectionCreateRef: React.MutableRefObject<PendingConnectionCreateState | null>;
  setInteracting: (interacting: boolean) => void;
}

export function useLinghuiCanvasInteractionHelpers({
  setNodes,
  setEdges,
  setEditorSelection,
  setActiveNodeTool,
  setPendingGroupFrame,
  closeContextMenu,
  closeQuickCreate,
  openContextMenuAt,
  deleteNodesByIds,
  deleteEdgesByIds,
  nodeRuns,
  pendingConnectionCreateRef,
  setInteracting,
}: UseLinghuiCanvasInteractionHelpersParams) {
  const cancelPendingConnection = useCallback(() => {
    if (!pendingConnectionCreateRef.current) return false;
    pendingConnectionCreateRef.current = null;
    setInteracting(false);
    if (typeof window !== 'undefined') {
      const PointerUpEvent = window.PointerEvent ?? window.MouseEvent;
      const evt = new PointerUpEvent('pointerup', { bubbles: true, cancelable: true });
      window.dispatchEvent(evt);
    }
    return true;
  }, [pendingConnectionCreateRef, setInteracting]);

  const confirmDeleteNodes = useCallback((nodeIds: string[]) => {
    if (!nodeIds.length) return;
    const hasContent = nodeIds.some(id => {
      const run = nodeRuns[id];
      return run?.status === 'succeeded' || run?.status === 'failed' || run?.status === 'stale';
    });
    if (!hasContent) {
      deleteNodesByIds(nodeIds);
      return;
    }
    Modal.confirm({
      title: nodeIds.length > 1 ? `删除 ${nodeIds.length} 个节点` : '删除节点',
      content: '所选节点包含已生成的内容，删除后可通过 ⌘Z 撤销。确定删除？',
      okText: '确定删除',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: () => deleteNodesByIds(nodeIds),
    });
  }, [deleteNodesByIds, nodeRuns]);

  const selectSingleEdge = useCallback((edgeId: string) => {
    setEdges(currentEdges => currentEdges.map(edge => ({
      ...edge,
      selected: edge.id === edgeId,
    })));
    setNodes(currentNodes => currentNodes.map(node => (
      node.selected ? { ...node, selected: false } : node
    )));
    setEditorSelection(null);
    setActiveNodeTool(null);
    setPendingGroupFrame(null);
  }, [setActiveNodeTool, setEditorSelection, setEdges, setNodes, setPendingGroupFrame]);

  const handleEdgeClick = useCallback((event: React.MouseEvent, edge: Edge) => {
    event.preventDefault();
    event.stopPropagation();
    closeContextMenu();
    closeQuickCreate();
    selectSingleEdge(edge.id);
  }, [closeContextMenu, closeQuickCreate, selectSingleEdge]);

  const handleEdgeContextMenu = useCallback((event: React.MouseEvent, edge: Edge) => {
    event.preventDefault();
    event.stopPropagation();
    closeQuickCreate();
    selectSingleEdge(edge.id);
    openContextMenuAt(event.clientX, event.clientY, 'edge', { edgeId: edge.id, selectionIds: [] });
  }, [closeQuickCreate, openContextMenuAt, selectSingleEdge]);

  return {
    cancelPendingConnection,
    confirmDeleteNodes,
    selectSingleEdge,
    handleEdgeClick,
    handleEdgeContextMenu,
  };
}

import { useCallback, useEffect, useRef } from 'react';
import type { Dispatch, MouseEvent as ReactMouseEvent, SetStateAction } from 'react';
import type { Node, ReactFlowInstance } from '@xyflow/react';
import type { LinghuiCanvasMode, LinghuiCanvasSelection } from '../../types/linghui';
import type { LinghuiPendingGroupFrame, SelectionScreenState } from './linghuiCanvasShared';

interface UseLinghuiCanvasSelectionInteractionsParams {
  canvasMode: LinghuiCanvasMode;
  selectedNodeIds: string[];
  pendingGroupFrame: LinghuiPendingGroupFrame | null;
  reactFlow: ReactFlowInstance;
  setNodes: Dispatch<SetStateAction<Node[]>>;
  setPendingGroupFrame: Dispatch<SetStateAction<LinghuiPendingGroupFrame | null>>;
  setEditorSelection: Dispatch<SetStateAction<LinghuiCanvasSelection>>;
  openContextMenuAt: (
    clientX: number,
    clientY: number,
    kind: 'pane' | 'node' | 'selection',
    extras?: { nodeId?: string; selectionIds?: string[] },
  ) => void;
  openQuickCreateAt: (clientX: number, clientY: number) => void;
  closeContextMenu: () => void;
}

export function useLinghuiCanvasSelectionInteractions({
  canvasMode,
  selectedNodeIds,
  pendingGroupFrame,
  reactFlow,
  setNodes,
  setPendingGroupFrame,
  setEditorSelection,
  openContextMenuAt,
  openQuickCreateAt,
  closeContextMenu,
}: UseLinghuiCanvasSelectionInteractionsParams) {
  const selectionDragRef = useRef<{ previousIds: Set<string> } | null>(null);
  const selectionScreenRef = useRef<SelectionScreenState | null>(null);

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

  useEffect(() => () => {
    resetSelectionTracking();
    selectionDragRef.current = null;
  }, [resetSelectionTracking]);

  const handlePaneContextMenu = useCallback((event: ReactMouseEvent) => {
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

  const handleCanvasDoubleClick = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement | null;
    if (!target?.closest('.react-flow__pane')) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    setEditorSelection(null);
    setPendingGroupFrame(null);
    openQuickCreateAt(event.clientX, event.clientY);
  }, [openQuickCreateAt, setEditorSelection, setPendingGroupFrame]);

  const handleNodeContextMenu = useCallback((event: ReactMouseEvent, node: Node) => {
    event.preventDefault();
    event.stopPropagation();

    if (!node.selected) {
      setNodes(current => current.map(item => ({ ...item, selected: item.id === node.id })));
    }

    setPendingGroupFrame(null);
    openContextMenuAt(event.clientX, event.clientY, 'node', { nodeId: node.id });
  }, [openContextMenuAt, setNodes, setPendingGroupFrame]);

  const openNodeContextMenu = useCallback((nodeId: string, clientX: number, clientY: number) => {
    const targetNode = reactFlow.getNode(nodeId);
    if (!targetNode) return;

    if (!targetNode.selected) {
      setNodes(current => current.map(node => ({
        ...node,
        selected: node.id === nodeId,
      })));
    }

    setPendingGroupFrame(null);
    openContextMenuAt(clientX, clientY, 'node', { nodeId });
  }, [openContextMenuAt, reactFlow, setNodes, setPendingGroupFrame]);

  const handleSelectionStart = useCallback((event: ReactMouseEvent) => {
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
    const previousIds = new Set(reactFlow.getNodes().filter(node => node.selected).map(node => node.id));
    selectionDragRef.current = { previousIds };
  }, [reactFlow]);

  const handleSelectionDragStop = useCallback(() => {
    detachSelectionTracking();
  }, [detachSelectionTracking]);

  const handleSelectionContextMenu = useCallback((event: ReactMouseEvent, selectedNodes: Node[]) => {
    event.preventDefault();
    event.stopPropagation();
    openContextMenuAt(event.clientX, event.clientY, 'selection', {
      selectionIds: selectedNodes.map(node => node.id),
    });
  }, [openContextMenuAt]);

  const handleSelectionEnd = useCallback(() => {
    const selectionScreen = selectionScreenRef.current;
    detachSelectionTracking();

    const currentSelectedIds = reactFlow.getNodes().filter(node => node.selected).map(node => node.id);
    const previousIds = selectionDragRef.current?.previousIds ?? new Set<string>();
    selectionDragRef.current = null;

    const mergedIds = new Set<string>(previousIds);
    currentSelectedIds.forEach(id => mergedIds.add(id));
    const selectionIds = Array.from(mergedIds);

    if (selectionIds.length !== currentSelectedIds.length) {
      setNodes(current => current.map(node => ({
        ...node,
        selected: mergedIds.has(node.id),
      })));
    }

    if (!selectionIds.length) {
      setPendingGroupFrame(null);
      return;
    }

    closeContextMenu();

    const creatableNodes = reactFlow.getNodes().filter(node => (
      mergedIds.has(node.id) && node.type !== 'group'
    ));

    if (!creatableNodes.length) {
      setPendingGroupFrame(null);
      return;
    }

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
        selectionIds,
      });
      return;
    }

    setPendingGroupFrame({
      minX: Math.min(...creatableNodes.map(node => node.position.x)),
      minY: Math.min(...creatableNodes.map(node => node.position.y)),
      maxX: Math.max(...creatableNodes.map(node => node.position.x + (node.measured?.width ?? 280))),
      maxY: Math.max(...creatableNodes.map(node => node.position.y + (node.measured?.height ?? 180))),
      selectionIds,
    });
  }, [closeContextMenu, detachSelectionTracking, reactFlow, setNodes, setPendingGroupFrame]);

  return {
    handlePaneContextMenu,
    handleCanvasDoubleClick,
    handleNodeContextMenu,
    openNodeContextMenu,
    handleSelectionStart,
    handleSelectionDragStart,
    handleSelectionDragStop,
    handleSelectionContextMenu,
    handleSelectionEnd,
  };
}

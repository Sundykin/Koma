import { useCallback, useEffect, useRef } from 'react';
import type {
  Dispatch,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  SetStateAction,
} from 'react';
import type { Node, ReactFlowInstance } from '@xyflow/react';
import type {
  LinghuiCanvasSelection,
  LinghuiNodeData,
  LinghuiNodeToolState,
} from '../../../../types/linghui';
import {
  clampNodePositionToParentBounds,
  NODE_LONG_PRESS_MS,
  type ActiveNodePressState,
  type LinghuiPendingGroupFrame,
} from '../state/linghuiCanvasShared';

interface UseLinghuiCanvasNodeInteractionsParams {
  reactFlow: ReactFlowInstance;
  setNodes: Dispatch<SetStateAction<Node[]>>;
  setEditorSelection: Dispatch<SetStateAction<LinghuiCanvasSelection>>;
  setActiveNodeTool: Dispatch<SetStateAction<LinghuiNodeToolState>>;
  setPendingGroupFrame: Dispatch<SetStateAction<LinghuiPendingGroupFrame | null>>;
  closeContextMenu: () => void;
  closeQuickCreate: () => void;
  openContextMenuAt: (
    clientX: number,
    clientY: number,
    kind: 'pane' | 'node' | 'selection',
    extras?: { nodeId?: string; selectionIds?: string[] },
  ) => void;
  emitSnapshot: (options?: { recordHistory?: boolean; force?: boolean }) => void;
  onNodeDragStart?: () => void;
  onNodeDragStop?: () => void;
}

export function useLinghuiCanvasNodeInteractions({
  reactFlow,
  setNodes,
  setEditorSelection,
  setActiveNodeTool,
  setPendingGroupFrame,
  closeContextMenu,
  closeQuickCreate,
  openContextMenuAt,
  emitSnapshot,
  onNodeDragStart,
  onNodeDragStop,
}: UseLinghuiCanvasNodeInteractionsParams) {
  const activePressRef = useRef<ActiveNodePressState | null>(null);
  const suppressedClickRef = useRef<{ nodeId: string; until: number } | null>(null);
  const dragFrameRef = useRef<number | null>(null);

  const cancelDragFrame = useCallback(() => {
    if (dragFrameRef.current !== null) {
      window.cancelAnimationFrame(dragFrameRef.current);
      dragFrameRef.current = null;
    }
  }, []);

  const clearActivePress = useCallback(() => {
    cancelDragFrame();
    if (activePressRef.current) {
      window.clearTimeout(activePressRef.current.timerId);
      activePressRef.current = null;
    }
  }, [cancelDragFrame]);

  useEffect(() => () => {
    cancelDragFrame();
    if (activePressRef.current) {
      window.clearTimeout(activePressRef.current.timerId);
    }
  }, [cancelDragFrame]);

  const openNodeEditor = useCallback((nodeId: string) => {
    const node = reactFlow.getNode(nodeId);
    if (!node || node.type === 'group') {
      setEditorSelection(null);
      setActiveNodeTool(null);
      return;
    }

    const nodeData = node.data as unknown as LinghuiNodeData;
    if (
      nodeData.linghuiType !== 'linghui/text' &&
      nodeData.linghuiType !== 'linghui/agent' &&
      nodeData.linghuiType !== 'linghui/image' &&
      nodeData.linghuiType !== 'linghui/panorama' &&
      nodeData.linghuiType !== 'linghui/video' &&
      nodeData.linghuiType !== 'linghui/audio' &&
      nodeData.linghuiType !== 'linghui/script' &&
      nodeData.linghuiType !== 'linghui/director3d'
    ) {
      setEditorSelection(null);
      setActiveNodeTool(null);
      return;
    }

    setEditorSelection({
      kind: 'node',
      nodeId,
      nodeType: nodeData.linghuiType,
      label: nodeData.label,
    });
    setActiveNodeTool(null);
  }, [reactFlow, setActiveNodeTool, setEditorSelection]);

  const openNodeToolPanel = useCallback((toolState: Exclude<LinghuiNodeToolState, null>) => {
    const node = reactFlow.getNode(toolState.nodeId);
    if (!node || node.type === 'group') return;

    const nodeData = node.data as unknown as LinghuiNodeData;
    if (
      (toolState.kind === 'image' && nodeData.linghuiType !== 'linghui/image') ||
      (toolState.kind === 'video' && nodeData.linghuiType !== 'linghui/video')
    ) {
      return;
    }

    setEditorSelection({
      kind: 'node',
      nodeId: toolState.nodeId,
      nodeType: nodeData.linghuiType,
      label: nodeData.label,
    });
    setActiveNodeTool(toolState);
    closeContextMenu();
    closeQuickCreate();
    setPendingGroupFrame(null);
  }, [
    closeContextMenu,
    closeQuickCreate,
    reactFlow,
    setActiveNodeTool,
    setEditorSelection,
    setPendingGroupFrame,
  ]);

  const isInteractiveNodeTarget = useCallback((target: EventTarget | null): boolean => {
    const element = target as HTMLElement | null;
    if (!element) return false;

    return Boolean(
      element.closest('.linghuiNodeEditorContainer') ||
      element.closest('.linghuiNodeEditorTopBar') ||
      element.closest('.linghuiNodeEditorMainSurface') ||
      element.closest('.linghuiEditorPanel') ||
      element.closest('.react-flow__handle') ||
      element.closest('button, input, textarea, select, a, [role="button"], [contenteditable="true"]'),
    );
  }, []);

  const applyPendingDragMovement = useCallback(() => {
    const activePress = activePressRef.current;
    if (!activePress?.dragActive) {
      return;
    }

    const nextClientX = activePress.pendingClientX;
    const nextClientY = activePress.pendingClientY;
    if (nextClientX === activePress.lastClientX && nextClientY === activePress.lastClientY) {
      return;
    }

    const previousFlow = reactFlow.screenToFlowPosition({
      x: activePress.lastClientX,
      y: activePress.lastClientY,
    });
    const nextFlow = reactFlow.screenToFlowPosition({
      x: nextClientX,
      y: nextClientY,
    });
    const deltaX = nextFlow.x - previousFlow.x;
    const deltaY = nextFlow.y - previousFlow.y;

    if (deltaX !== 0 || deltaY !== 0) {
      reactFlow.updateNode(activePress.nodeId, node => {
        const nextPosition = {
          x: node.position.x + deltaX,
          y: node.position.y + deltaY,
        };
        const parentNode = node.parentId ? reactFlow.getNode(node.parentId) : null;
        const clampedPosition = clampNodePositionToParentBounds({
          node,
          parentNode,
          nextPosition,
        });

        if (
          clampedPosition.x === node.position.x &&
          clampedPosition.y === node.position.y
        ) {
          return {};
        }

        return {
          position: clampedPosition,
        };
      });
    }

    activePress.lastClientX = nextClientX;
    activePress.lastClientY = nextClientY;
  }, [reactFlow]);

  const scheduleDragFrame = useCallback(() => {
    if (dragFrameRef.current !== null) {
      return;
    }

    dragFrameRef.current = window.requestAnimationFrame(() => {
      dragFrameRef.current = null;
      applyPendingDragMovement();
    });
  }, [applyPendingDragMovement]);

  const bindNodeSurface = useCallback((nodeId: string) => ({
    onPointerDown: (event: ReactPointerEvent<HTMLElement>) => {
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
        onNodeDragStart?.();
      }, NODE_LONG_PRESS_MS);

      activePressRef.current = {
        nodeId,
        pointerId,
        startClientX,
        startClientY,
        lastClientX: startClientX,
        lastClientY: startClientY,
        pendingClientX: startClientX,
        pendingClientY: startClientY,
        dragActive: false,
        timerId,
      };

      event.currentTarget.setPointerCapture?.(pointerId);
    },
    onPointerMove: (event: ReactPointerEvent<HTMLElement>) => {
      const activePress = activePressRef.current;
      if (!activePress || activePress.nodeId !== nodeId || activePress.pointerId !== event.pointerId) {
        return;
      }

      if (!activePress.dragActive) {
        activePress.pendingClientX = event.clientX;
        activePress.pendingClientY = event.clientY;
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      activePress.pendingClientX = event.clientX;
      activePress.pendingClientY = event.clientY;
      scheduleDragFrame();
    },
    onPointerUp: (event: ReactPointerEvent<HTMLElement>) => {
      const activePress = activePressRef.current;
      if (!activePress || activePress.nodeId !== nodeId || activePress.pointerId !== event.pointerId) {
        return;
      }

      const wasDragging = activePress.dragActive;

      cancelDragFrame();
      applyPendingDragMovement();
      clearActivePress();
      event.currentTarget.releasePointerCapture?.(event.pointerId);

      if (wasDragging) {
        onNodeDragStop?.();
        suppressedClickRef.current = {
          nodeId,
          until: Date.now() + 280,
        };
        requestAnimationFrame(() => emitSnapshot());
      }
    },
    onPointerCancel: (event: ReactPointerEvent<HTMLElement>) => {
      const activePress = activePressRef.current;
      if (!activePress || activePress.nodeId !== nodeId || activePress.pointerId !== event.pointerId) {
        return;
      }

      if (activePress.dragActive) {
        onNodeDragStop?.();
      }
      clearActivePress();
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    },
  }), [
    applyPendingDragMovement,
    cancelDragFrame,
    clearActivePress,
    emitSnapshot,
    isInteractiveNodeTarget,
    onNodeDragStart,
    onNodeDragStop,
    scheduleDragFrame,
  ]);

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

  const handleNodeClick = useCallback((event: ReactMouseEvent, node: Node) => {
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

    // Block editor opening when image node is in expanded state
    const nodeElement = (event.target as HTMLElement)?.closest?.('.linghuiCompactNode');
    if (nodeElement instanceof HTMLElement && nodeElement.dataset.expanded === 'true') {
      return;
    }

    setPendingGroupFrame(null);
    closeContextMenu();
    openNodeEditor(node.id);
  }, [closeContextMenu, isInteractiveNodeTarget, openNodeEditor, setPendingGroupFrame]);

  const handlePaneClick = useCallback(() => {
    setEditorSelection(null);
    setActiveNodeTool(null);
    setPendingGroupFrame(null);
    closeContextMenu();
    closeQuickCreate();
  }, [
    closeContextMenu,
    closeQuickCreate,
    setActiveNodeTool,
    setEditorSelection,
    setPendingGroupFrame,
  ]);

  return {
    bindNodeSurface,
    openNodeContextMenu,
    openNodeEditor,
    openNodeToolPanel,
    handleNodeContextMenu,
    handleNodeClick,
    handlePaneClick,
  };
}

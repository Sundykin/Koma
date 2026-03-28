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
} from '../../types/linghui';
import {
  clampNodePositionToParentBounds,
  NODE_LONG_PRESS_MS,
  type ActiveNodePressState,
  type LinghuiPendingGroupFrame,
} from './linghuiCanvasShared';

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
}: UseLinghuiCanvasNodeInteractionsParams) {
  const activePressRef = useRef<ActiveNodePressState | null>(null);
  const suppressedClickRef = useRef<{ nodeId: string; until: number } | null>(null);

  const clearActivePress = useCallback(() => {
    if (activePressRef.current) {
      window.clearTimeout(activePressRef.current.timerId);
      activePressRef.current = null;
    }
  }, []);

  useEffect(() => () => {
    if (activePressRef.current) {
      window.clearTimeout(activePressRef.current.timerId);
    }
  }, []);

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
      nodeData.linghuiType !== 'linghui/image' &&
      nodeData.linghuiType !== 'linghui/video' &&
      nodeData.linghuiType !== 'linghui/audio' &&
      nodeData.linghuiType !== 'linghui/script'
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
      element.closest('.react-flow__handle') ||
      element.closest('button, input, textarea, select, a, [role="button"], [contenteditable="true"]'),
    );
  }, []);

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
    onPointerMove: (event: ReactPointerEvent<HTMLElement>) => {
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
            ? (() => {
                const nextPosition = {
                  x: node.position.x + deltaX,
                  y: node.position.y + deltaY,
                };
                const parentNode = node.parentId
                  ? currentNodes.find(currentNode => currentNode.id === node.parentId)
                  : null;

                return {
                  ...node,
                  position: clampNodePositionToParentBounds({
                    node,
                    parentNode,
                    nextPosition,
                  }),
                };
              })()
            : node
        )));
      }

      activePress.lastClientX = event.clientX;
      activePress.lastClientY = event.clientY;
    },
    onPointerUp: (event: ReactPointerEvent<HTMLElement>) => {
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
      }
    },
    onPointerCancel: (event: ReactPointerEvent<HTMLElement>) => {
      const activePress = activePressRef.current;
      if (!activePress || activePress.nodeId !== nodeId || activePress.pointerId !== event.pointerId) {
        return;
      }

      clearActivePress();
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    },
  }), [clearActivePress, emitSnapshot, isInteractiveNodeTarget, reactFlow, setNodes]);

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

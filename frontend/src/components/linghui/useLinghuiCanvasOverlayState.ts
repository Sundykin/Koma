import { useCallback, useMemo, useState } from 'react';
import type { MutableRefObject, RefObject } from 'react';
import type { Node, ReactFlowInstance, Viewport } from '@xyflow/react';
import type { LinghuiNodeData } from '../../types/linghui';
import { LINGHUI_NODE_CATALOG } from './linghuiNodeDefs';
import {
  type LinghuiCanvasMenuState,
  type LinghuiPendingGroupFrame,
  type QuickCreateState,
  PENDING_GROUP_ACTIONS_WIDTH,
  QUICK_CREATE_HEIGHT,
  QUICK_CREATE_WIDTH,
  resolveCompatibleTargetHandleId,
} from './linghuiCanvasShared';

interface UseLinghuiCanvasOverlayStateParams {
  hostRef: RefObject<HTMLDivElement | null>;
  reactFlow: ReactFlowInstance;
  nodes: Node[];
  selectedNodeIds: string[];
  pendingGroupFrame: LinghuiPendingGroupFrame | null;
  canvasRect: DOMRect | null;
  viewport: Viewport;
}

export function useLinghuiCanvasOverlayState({
  hostRef,
  reactFlow,
  nodes,
  selectedNodeIds,
  pendingGroupFrame,
  canvasRect,
  viewport,
}: UseLinghuiCanvasOverlayStateParams) {
  const [contextMenu, setContextMenu] = useState<LinghuiCanvasMenuState | null>(null);
  const [quickCreate, setQuickCreate] = useState<QuickCreateState | null>(null);

  const contextMenuNode = useMemo(() => {
    if (!contextMenu?.nodeId) return null;
    return nodes.find(node => node.id === contextMenu.nodeId) ?? null;
  }, [contextMenu?.nodeId, nodes]);

  const contextMenuSelectionIds = useMemo(() => {
    if (contextMenu?.selectionIds?.length) {
      return contextMenu.selectionIds;
    }
    if (contextMenu?.nodeId) {
      return [contextMenu.nodeId];
    }
    if (pendingGroupFrame?.selectionIds?.length) {
      return pendingGroupFrame.selectionIds;
    }
    return selectedNodeIds;
  }, [contextMenu?.nodeId, contextMenu?.selectionIds, pendingGroupFrame?.selectionIds, selectedNodeIds]);

  const quickCreateCatalog = useMemo(() => {
    if (!quickCreate?.sourceConnection) {
      return LINGHUI_NODE_CATALOG;
    }

    return LINGHUI_NODE_CATALOG.filter(item => (
      resolveCompatibleTargetHandleId(item.type, quickCreate.sourceConnection!.sourceDataType) !== null
    ));
  }, [quickCreate?.sourceConnection]);

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

  const pendingGroupCreatableIds = useMemo(() => {
    if (!pendingGroupFrame) return [];
    const selectionSet = new Set(pendingGroupFrame.selectionIds);
    return nodes
      .filter(node => selectionSet.has(node.id) && node.type !== 'group')
      .map(node => node.id);
  }, [nodes, pendingGroupFrame]);

  const pendingGroupActionsStyle = useMemo(() => {
    if (!pendingGroupFrame || !canvasRect) return null;

    const topRight = reactFlow.flowToScreenPosition({ x: pendingGroupFrame.maxX, y: pendingGroupFrame.minY });
    const rawLeft = topRight.x - canvasRect.left - PENDING_GROUP_ACTIONS_WIDTH;
    const rawTop = topRight.y - canvasRect.top - 52;
    const maxLeft = Math.max(12, canvasRect.width - PENDING_GROUP_ACTIONS_WIDTH - 12);
    const maxTop = Math.max(12, canvasRect.height - 44 - 12);
    const left = Math.max(12, Math.min(rawLeft, maxLeft));
    const top = rawTop >= 12
      ? rawTop
      : Math.max(12, Math.min(topRight.y - canvasRect.top + 12, maxTop));

    return { left, top };
  }, [canvasRect, pendingGroupFrame, reactFlow, viewport]);

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  const closeQuickCreate = useCallback(() => {
    setQuickCreate(null);
  }, []);

  const openContextMenuAt = useCallback((
    clientX: number,
    clientY: number,
    kind: LinghuiCanvasMenuState['kind'],
    extras?: { nodeId?: string; selectionIds?: string[] },
  ) => {
    if (!hostRef.current) return;
    const rect = hostRef.current.getBoundingClientRect();
    const menuWidth = 260;
    const menuHeight = kind === 'node' ? 460 : 560;
    const rawX = clientX - rect.left;
    const rawY = clientY - rect.top;
    const x = Math.max(10, Math.min(rawX, rect.width - menuWidth - 10));
    const y = Math.max(10, Math.min(rawY, rect.height - menuHeight - 10));
    setQuickCreate(null);
    setContextMenu({
      kind,
      x,
      y,
      screenX: clientX,
      screenY: clientY,
      nodeId: extras?.nodeId,
      selectionIds: extras?.selectionIds,
    });
  }, [hostRef]);

  const openQuickCreateAt = useCallback((
    clientX: number,
    clientY: number,
    options?: { sourceConnection?: QuickCreateState['sourceConnection'] },
  ) => {
    if (!hostRef.current) return;
    const rect = hostRef.current.getBoundingClientRect();
    const rawX = clientX - rect.left;
    const rawY = clientY - rect.top;
    const x = Math.max(10, Math.min(rawX, rect.width - QUICK_CREATE_WIDTH - 10));
    const y = Math.max(10, Math.min(rawY, rect.height - QUICK_CREATE_HEIGHT - 10));
    setContextMenu(null);
    setQuickCreate({
      x,
      y,
      screenX: clientX,
      screenY: clientY,
      sourceConnection: options?.sourceConnection,
    });
  }, [hostRef]);

  const resetOverlayStates = useCallback(() => {
    setContextMenu(null);
    setQuickCreate(null);
  }, []);

  return {
    contextMenu,
    quickCreate,
    setContextMenu,
    setQuickCreate,
    contextMenuNode,
    contextMenuSelectionIds,
    quickCreateCatalog,
    pendingGroupFrameStyle,
    pendingGroupCreatableIds,
    pendingGroupActionsStyle,
    closeContextMenu,
    closeQuickCreate,
    openContextMenuAt,
    openQuickCreateAt,
    resetOverlayStates,
  };
}

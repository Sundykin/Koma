import { useCallback, useMemo } from 'react';
import type { Dispatch, RefObject, SetStateAction } from 'react';
import type { Node, ReactFlowInstance, Viewport } from '@xyflow/react';
import { LINGHUI_NODE_CATALOG } from '../../library/state/linghuiNodeDefs';
import {
  type LinghuiCanvasMenuState,
  type LinghuiPendingGroupFrame,
  type QuickCreateState,
  PENDING_GROUP_ACTIONS_WIDTH,
  resolveCompatibleTargetHandleId,
} from '../state/linghuiCanvasShared';
import { useLinghuiCanvasStore } from '../state/linghuiCanvasStore';

interface UseLinghuiCanvasOverlayStateParams {
  hostRef: RefObject<HTMLDivElement | null>;
  reactFlow: ReactFlowInstance;
  nodes: Node[];
  selectedNodeIds: string[];
  pendingGroupFrame: LinghuiPendingGroupFrame | null;
  canvasRect: DOMRect | null;
  viewport: Viewport;
}

function resolveSetterValue<T>(value: SetStateAction<T>, currentValue: T): T {
  return typeof value === 'function'
    ? (value as (previous: T) => T)(currentValue)
    : value;
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
  const contextMenu = useLinghuiCanvasStore(state => state.contextMenu);
  const quickCreate = useLinghuiCanvasStore(state => state.quickCreate);
  const storeSetContextMenu = useLinghuiCanvasStore(state => state.setContextMenu);
  const storeSetQuickCreate = useLinghuiCanvasStore(state => state.setQuickCreate);
  const storeCloseContextMenu = useLinghuiCanvasStore(state => state.closeContextMenu);
  const storeCloseQuickCreate = useLinghuiCanvasStore(state => state.closeQuickCreate);
  const storeOpenContextMenuAt = useLinghuiCanvasStore(state => state.openContextMenuAt);
  const storeOpenQuickCreateAt = useLinghuiCanvasStore(state => state.openQuickCreateAt);

  const setContextMenu = useCallback<Dispatch<SetStateAction<LinghuiCanvasMenuState | null>>>((nextValue) => {
    const currentValue = useLinghuiCanvasStore.getState().contextMenu;
    storeSetContextMenu(resolveSetterValue(nextValue, currentValue));
  }, [storeSetContextMenu]);

  const setQuickCreate = useCallback<Dispatch<SetStateAction<QuickCreateState | null>>>((nextValue) => {
    const currentValue = useLinghuiCanvasStore.getState().quickCreate;
    storeSetQuickCreate(resolveSetterValue(nextValue, currentValue));
  }, [storeSetQuickCreate]);

  const contextMenuNode = useMemo(() => {
    if (!contextMenu?.nodeId) return null;
    return nodes.find(node => node.id === contextMenu.nodeId) ?? null;
  }, [contextMenu?.nodeId, nodes]);

  const contextMenuSelectionIds = useMemo(() => {
    if (contextMenu?.kind === 'edge') {
      return [];
    }
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
    storeCloseContextMenu();
  }, [storeCloseContextMenu]);

  const closeQuickCreate = useCallback(() => {
    storeCloseQuickCreate();
  }, [storeCloseQuickCreate]);

  const openContextMenuAt = useCallback((
    clientX: number,
    clientY: number,
    kind: LinghuiCanvasMenuState['kind'],
    extras?: { nodeId?: string; edgeId?: string; selectionIds?: string[] },
  ) => {
    if (!hostRef.current) return;
    storeOpenContextMenuAt({
      clientX,
      clientY,
      hostRect: hostRef.current.getBoundingClientRect(),
      kind,
      extras,
    });
  }, [hostRef, storeOpenContextMenuAt]);

  const openQuickCreateAt = useCallback((
    clientX: number,
    clientY: number,
    options?: { sourceConnection?: QuickCreateState['sourceConnection'] },
  ) => {
    if (!hostRef.current) return;
    storeOpenQuickCreateAt({
      clientX,
      clientY,
      hostRect: hostRef.current.getBoundingClientRect(),
      options,
    });
  }, [hostRef, storeOpenQuickCreateAt]);

  const resetOverlayStates = useCallback(() => {
    setContextMenu(null);
    setQuickCreate(null);
  }, [setContextMenu, setQuickCreate]);

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

import { useCallback, useMemo } from 'react';
import type { Dispatch, RefObject, SetStateAction } from 'react';
import type { Node, ReactFlowInstance } from '@xyflow/react';
import {
  type LinghuiCanvasMenuState,
  type LinghuiPendingGroupFrame,
  type QuickCreateState,
  PENDING_GROUP_ACTIONS_WIDTH,
} from '../state/linghuiCanvasShared';
import { resolveLinghuiQuickCreateCatalog } from '../state/linghuiCanvasQuickCreateCatalog';
import { useLinghuiCanvasStore } from '../state/linghuiCanvasStore';
import type { CssVarStyle } from '../../../../theme/runtime';

interface UseLinghuiCanvasOverlayStateParams {
  hostRef: RefObject<HTMLDivElement | null>;
  reactFlow: ReactFlowInstance;
  nodes: Node[];
  /** 调用方会传入；本 hook 不消费（历史遗留参数，保留接口兼容） */
  viewport?: unknown;
  selectedNodeIds: string[];
  pendingGroupFrame: LinghuiPendingGroupFrame | null;
  canvasRect: DOMRect | null;
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
}: UseLinghuiCanvasOverlayStateParams) {
  const contextMenu = useLinghuiCanvasStore(state => state.contextMenu);
  const quickCreate = useLinghuiCanvasStore(state => state.quickCreate);
  const storeSetContextMenu = useLinghuiCanvasStore(state => state.setContextMenu);
  const storeSetQuickCreate = useLinghuiCanvasStore(state => state.setQuickCreate);
  const storeCloseContextMenu = useLinghuiCanvasStore(state => state.closeContextMenu);
  const storeCloseQuickCreate = useLinghuiCanvasStore(state => state.closeQuickCreate);
  const storeCloseQuickCreateFromPane = useLinghuiCanvasStore(state => state.closeQuickCreateFromPane);
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
  }, [contextMenu?.kind, contextMenu?.nodeId, contextMenu?.selectionIds, pendingGroupFrame?.selectionIds, selectedNodeIds]);

  const quickCreateCatalog = useMemo(() => {
    return resolveLinghuiQuickCreateCatalog(quickCreate?.sourceConnection?.sourceDataType);
  }, [quickCreate?.sourceConnection?.sourceDataType]);

  const pendingGroupFrameStyle = useMemo(() => {
    if (!pendingGroupFrame || !canvasRect) return null;
    const topLeft = reactFlow.flowToScreenPosition({ x: pendingGroupFrame.minX, y: pendingGroupFrame.minY });
    const bottomRight = reactFlow.flowToScreenPosition({ x: pendingGroupFrame.maxX, y: pendingGroupFrame.maxY });
    return {
      '--linghui-pending-group-left': `${topLeft.x - canvasRect.left}px`,
      '--linghui-pending-group-top': `${topLeft.y - canvasRect.top}px`,
      '--linghui-pending-group-width': `${Math.max(0, bottomRight.x - topLeft.x)}px`,
      '--linghui-pending-group-height': `${Math.max(0, bottomRight.y - topLeft.y)}px`,
    } satisfies CssVarStyle;
  }, [canvasRect, pendingGroupFrame, reactFlow]);

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

    return {
      '--linghui-pending-actions-left': `${left}px`,
      '--linghui-pending-actions-top': `${top}px`,
    } satisfies CssVarStyle;
  }, [canvasRect, pendingGroupFrame, reactFlow]);

  const closeContextMenu = useCallback(() => {
    storeCloseContextMenu();
  }, [storeCloseContextMenu]);

  const closeQuickCreate = useCallback(() => {
    storeCloseQuickCreate();
  }, [storeCloseQuickCreate]);

  /**
   * 仅给 onPaneClick 用的关闭入口：250ms 抑制窗口内来自 paneClick 的关闭会被丢弃，
   * 防止连线松开同帧 onPaneClick 把刚开的"引用该节点生成"面板立刻关掉。
   */
  const closeQuickCreateFromPane = useCallback(() => {
    storeCloseQuickCreateFromPane();
  }, [storeCloseQuickCreateFromPane]);

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
    closeQuickCreateFromPane,
    openContextMenuAt,
    openQuickCreateAt,
    resetOverlayStates,
  };
}

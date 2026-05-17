import type {
  LinghuiCanvasMode,
  LinghuiSlotDataType,
  LinghuiSubgraphSnapshot,
} from '../../../../types/linghui';

export const NODE_LONG_PRESS_MS = 220;
export const PENDING_GROUP_ACTIONS_WIDTH = 228;
export const QUICK_CREATE_WIDTH = 304;
export const QUICK_CREATE_HEIGHT = 360;
export const PASTE_OFFSET_STEP = 28;
export const GROUP_HEADER_HEIGHT = 40;

export interface LinghuiCanvasDocumentSnapshot {
  graphData: import('../../../../types/linghui').LinghuiGraphSnapshot;
  viewport: import('../../../../types/linghui').LinghuiViewportState;
}

export type LinghuiClipboardSnapshot = LinghuiSubgraphSnapshot;
export type LinghuiCanvasMutationKind = 'none' | 'viewport' | 'layout' | 'content';

export function resolveParentExtent(parentId?: string): 'parent' | undefined {
  return parentId ? 'parent' : undefined;
}

export interface ActiveNodePressState {
  nodeId: string;
  pointerId: number;
  startClientX: number;
  startClientY: number;
  lastClientX: number;
  lastClientY: number;
  pendingClientX: number;
  pendingClientY: number;
  dragActive: boolean;
  timerId: number;
}

export type LinghuiCanvasMenuKind = 'pane' | 'node' | 'selection' | 'edge';

export interface LinghuiCanvasMenuState {
  kind: LinghuiCanvasMenuKind;
  x: number;
  y: number;
  screenX: number;
  screenY: number;
  nodeId?: string;
  edgeId?: string;
  selectionIds?: string[];
}

export interface LinghuiPendingGroupFrame {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  selectionIds: string[];
}

export interface SelectionScreenState {
  startClientX: number;
  startClientY: number;
  lastClientX: number;
  lastClientY: number;
  detach?: () => void;
}

export interface PendingConnectionCreateState {
  sourceNodeId: string;
  sourceHandleId: string;
  sourceDataType: LinghuiSlotDataType;
}

export interface QuickCreateState {
  x: number;
  y: number;
  screenX: number;
  screenY: number;
  sourceConnection?: PendingConnectionCreateState;
}

export type LinghuiCanvasResolvedMode = LinghuiCanvasMode;

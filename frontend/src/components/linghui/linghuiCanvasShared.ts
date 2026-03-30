import type { Edge, Node } from '@xyflow/react';
import { nanoid } from 'nanoid';
import type {
  LinghuiCanvasGroupData,
  LinghuiCanvasMode,
  LinghuiEdgeData,
  LinghuiGraphSnapshot,
  LinghuiGraphStats,
  LinghuiNodeData,
  LinghuiNodeType,
  LinghuiRFEdgeSnapshot,
  LinghuiRFGroupSnapshot,
  LinghuiRFNodeSnapshot,
  LinghuiSlotDataType,
  LinghuiSubgraphSnapshot,
  LinghuiViewportState,
} from '../../types/linghui';
import { createNewNodeData } from './linghuiNodeDefs';

export interface LinghuiCanvasDocumentSnapshot {
  graphData: LinghuiGraphSnapshot;
  viewport: LinghuiViewportState;
}

export type LinghuiClipboardSnapshot = LinghuiSubgraphSnapshot;

export const NODE_LONG_PRESS_MS = 220;
export const PENDING_GROUP_ACTIONS_WIDTH = 228;
export const QUICK_CREATE_WIDTH = 304;
export const QUICK_CREATE_HEIGHT = 360;
export const PASTE_OFFSET_STEP = 28;
export const GROUP_HEADER_HEIGHT = 40;

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

export function cloneSnapshotValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function cloneLinghuiNodeData(data: LinghuiNodeData): LinghuiNodeData {
  return {
    ...cloneSnapshotValue(data),
    active: false,
  };
}

export function toNodeSnapshot(node: Node): LinghuiRFNodeSnapshot {
  const data = node.data as unknown as LinghuiNodeData;
  return {
    id: node.id,
    type: node.type ?? '',
    position: { x: node.position.x, y: node.position.y },
    data: cloneLinghuiNodeData(data),
    width: node.measured?.width ?? node.width,
    height: node.measured?.height ?? node.height,
    parentId: node.parentId,
  };
}

export function toEdgeSnapshot(edge: Edge): LinghuiRFEdgeSnapshot {
  return {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    sourceHandle: edge.sourceHandle ?? 'output-0',
    targetHandle: edge.targetHandle ?? 'input-0',
    type: edge.type,
    data: cloneSnapshotValue((edge.data ?? {}) as LinghuiEdgeData),
  };
}

export function toGroupSnapshot(node: Node): LinghuiRFGroupSnapshot {
  return {
    id: node.id,
    position: { x: node.position.x, y: node.position.y },
    data: cloneSnapshotValue(node.data as unknown as LinghuiCanvasGroupData),
    style: {
      width: (node.style as { width?: number } | undefined)?.width ?? node.measured?.width ?? 300,
      height: (node.style as { height?: number } | undefined)?.height ?? node.measured?.height ?? 200,
    },
  };
}

export function calculateStats(graphData: LinghuiGraphSnapshot): LinghuiGraphStats {
  return {
    nodeCount: graphData.nodes.length,
    linkCount: graphData.edges.length,
    groupCount: graphData.groups.length,
  };
}

export function serializeCanvasDocumentSnapshot(snapshot: LinghuiCanvasDocumentSnapshot): string {
  return JSON.stringify(snapshot);
}

export function buildCanvasDocumentSnapshotFromRF(
  rfNodes: Node[],
  rfEdges: Edge[],
  viewport: LinghuiViewportState,
): LinghuiCanvasDocumentSnapshot {
  return {
    graphData: {
      version: 2,
      nodes: rfNodes.filter(node => node.type !== 'group').map(toNodeSnapshot),
      edges: rfEdges.map(toEdgeSnapshot),
      groups: rfNodes.filter(node => node.type === 'group').map(toGroupSnapshot),
    },
    viewport,
  };
}

export function buildRFNodesFromSnapshot(snapshot: LinghuiCanvasDocumentSnapshot): Node[] {
  const { nodes: snapNodes, groups: snapGroups } = snapshot.graphData;
  const groupNodes: Node[] = (snapGroups ?? []).map(group => ({
    id: group.id,
    type: 'group',
    position: group.position,
    data: group.data as unknown as Record<string, unknown>,
    style: { width: group.style.width, height: group.style.height },
    draggable: true,
    selected: false,
  }));
  const childNodes: Node[] = (snapNodes ?? []).map(node => ({
    id: node.id,
    type: node.type,
    position: node.position,
    data: cloneLinghuiNodeData(node.data) as unknown as Record<string, unknown>,
    parentId: node.parentId,
    extent: resolveParentExtent(node.parentId),
    draggable: false,
    selected: false,
  }));

  return [
    ...groupNodes,
    ...childNodes,
  ];
}

export function buildRFEdgesFromSnapshot(snapshot: LinghuiCanvasDocumentSnapshot): Edge[] {
  return (snapshot.graphData.edges ?? []).map(edge => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    sourceHandle: edge.sourceHandle,
    targetHandle: edge.targetHandle,
    type: edge.type ?? 'linghui-edge',
    data: cloneSnapshotValue((edge.data ?? {}) as Record<string, unknown>),
  })) satisfies Edge[];
}

function rfTypeKey(linghuiType: LinghuiNodeType): string {
  return linghuiType.replace(/\//g, '-');
}

function extractDefaultImageLabelIndex(label: string): number {
  const match = label.trim().match(/^图片\s*(\d+)$/);
  return match ? Number(match[1]) : 0;
}

function resolveNewNodeLabel(type: LinghuiNodeType, currentNodes: Node[]): string | undefined {
  if (type !== 'linghui/image') {
    return undefined;
  }

  const imageNodes = currentNodes.filter(node => {
    if (node.type === 'group') return false;
    const nodeData = node.data as unknown as LinghuiNodeData | undefined;
    return nodeData?.linghuiType === 'linghui/image';
  });

  const maxDefaultIndex = imageNodes.reduce((maxValue, node) => {
    const nodeData = node.data as unknown as LinghuiNodeData | undefined;
    return Math.max(maxValue, extractDefaultImageLabelIndex(nodeData?.label ?? ''));
  }, 0);

  return `图片 ${Math.max(imageNodes.length, maxDefaultIndex) + 1}`;
}

export function createCanvasNode(type: LinghuiNodeType, position: Node['position'], currentNodes: Node[]): Node {
  return {
    id: nanoid(10),
    type: rfTypeKey(type),
    position,
    data: createNewNodeData(type, {
      label: resolveNewNodeLabel(type, currentNodes),
    }) as unknown as Record<string, unknown>,
    draggable: false,
  };
}

export function expandNodeIdsWithDescendants(
  currentNodes: Node[],
  nodeIds: Iterable<string>,
): string[] {
  const expanded = new Set(nodeIds);
  let changed = true;

  while (changed) {
    changed = false;

    for (const node of currentNodes) {
      if (!node.parentId || expanded.has(node.id) || !expanded.has(node.parentId)) {
        continue;
      }

      expanded.add(node.id);
      changed = true;
    }
  }

  return [...expanded];
}

export function resolveCompatibleTargetHandleId(
  type: LinghuiNodeType,
  sourceDataType: LinghuiSlotDataType,
): string | null {
  const draftNodeData = createNewNodeData(type);
  const targetSlotIndex = draftNodeData.inputs.findIndex(slot => slot.dataType === sourceDataType);
  return targetSlotIndex >= 0 ? `input-${targetSlotIndex}` : null;
}

export function isEditableEventTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  if (!element) return false;

  return Boolean(
    element.closest('input, textarea, select, [contenteditable="true"], .cm-editor'),
  );
}

export function readDroppedFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('读取拖入文件失败'));
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.readAsDataURL(file);
  });
}

export function getNodeAbsolutePosition(
  node: Pick<Node, 'position' | 'parentId'>,
  groupPositions: Map<string, { x: number; y: number }>,
): { x: number; y: number } {
  if (!node.parentId) {
    return { x: node.position.x, y: node.position.y };
  }

  const parentPosition = groupPositions.get(node.parentId);
  if (!parentPosition) {
    return { x: node.position.x, y: node.position.y };
  }

  return {
    x: parentPosition.x + node.position.x,
    y: parentPosition.y + node.position.y,
  };
}

export function collectGroupPositions(
  currentNodes: Node[],
  groupIds: Iterable<string>,
): Map<string, { x: number; y: number }> {
  const groupIdSet = new Set(groupIds);
  const groupPositions = new Map<string, { x: number; y: number }>();

  for (const node of currentNodes) {
    if (node.type !== 'group' || !groupIdSet.has(node.id)) continue;
    groupPositions.set(node.id, { x: node.position.x, y: node.position.y });
  }

  return groupPositions;
}

export function detachNodesFromGroups(
  currentNodes: Node[],
  groupPositions: Map<string, { x: number; y: number }>,
  options?: { selectDetached?: boolean },
): Node[] {
  return currentNodes.map(node => {
    if (!node.parentId || !groupPositions.has(node.parentId)) return node;

    const groupPos = groupPositions.get(node.parentId)!;
    return {
      ...node,
      parentId: undefined,
      extent: undefined,
      selected: options?.selectDetached ? true : node.selected,
      position: {
        x: node.position.x + groupPos.x,
        y: node.position.y + groupPos.y,
      },
    };
  });
}

function resolveNodeSize(node: Pick<Node, 'measured' | 'width' | 'height'>): { width: number; height: number } {
  return {
    width: node.measured?.width ?? node.width ?? 180,
    height: node.measured?.height ?? node.height ?? 120,
  };
}

export function clampNodePositionToParentBounds(params: {
  node: Pick<Node, 'parentId' | 'measured' | 'width' | 'height'>;
  parentNode?: Pick<Node, 'measured' | 'width' | 'height' | 'style'> | null;
  nextPosition: { x: number; y: number };
}): { x: number; y: number } {
  const { node, parentNode, nextPosition } = params;
  if (!node.parentId || !parentNode) {
    return nextPosition;
  }

  const parentWidth = Number(
    (parentNode.style as { width?: number | string } | undefined)?.width
      ?? parentNode.measured?.width
      ?? parentNode.width
      ?? 0,
  );
  const parentHeight = Number(
    (parentNode.style as { height?: number | string } | undefined)?.height
      ?? parentNode.measured?.height
      ?? parentNode.height
      ?? 0,
  );

  if (!Number.isFinite(parentWidth) || !Number.isFinite(parentHeight) || parentWidth <= 0 || parentHeight <= 0) {
    return nextPosition;
  }

  const { width: nodeWidth, height: nodeHeight } = resolveNodeSize(node);
  const minX = 0;
  const maxX = Math.max(0, parentWidth - nodeWidth);
  const minY = GROUP_HEADER_HEIGHT;
  const maxY = Math.max(minY, parentHeight - nodeHeight);

  return {
    x: Math.max(minX, Math.min(nextPosition.x, maxX)),
    y: Math.max(minY, Math.min(nextPosition.y, maxY)),
  };
}

export function resolveExecutionTargetNodeIds(
  currentNodes: Node[],
  requestedIds?: string[],
): string[] {
  const targetIds = requestedIds?.length
    ? requestedIds
    : currentNodes.filter(node => node.selected).map(node => node.id);

  const selectionSet = new Set(targetIds);
  const resolved = new Set<string>();

  for (const node of currentNodes) {
    if (node.type === 'group') continue;

    if (selectionSet.has(node.id)) {
      resolved.add(node.id);
      continue;
    }

    if (node.parentId && selectionSet.has(node.parentId)) {
      resolved.add(node.id);
    }
  }

  return [...resolved];
}

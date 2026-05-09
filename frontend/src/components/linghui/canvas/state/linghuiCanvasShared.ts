import type { Edge, Node } from '@xyflow/react';
import { nanoid } from 'nanoid';
import { linghuiTypeToRFType } from '../../../../types/linghui';
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
} from '../../../../types/linghui';
import { createNewNodeData } from '../../library/state/linghuiNodeDefs';

export interface LinghuiCanvasDocumentSnapshot {
  graphData: LinghuiGraphSnapshot;
  viewport: LinghuiViewportState;
}

export type LinghuiClipboardSnapshot = LinghuiSubgraphSnapshot;
export type LinghuiCanvasMutationKind = 'none' | 'viewport' | 'layout' | 'content';

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

export function cloneSnapshotValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function cloneLinghuiNodeData(data: LinghuiNodeData): LinghuiNodeData {
  return {
    ...cloneSnapshotValue(data),
    active: false,
  };
}

const LINGHUI_RF_TYPE_TO_NODE_TYPE: Record<string, LinghuiNodeType> = {
  'linghui-text': 'linghui/text',
  'linghui-agent': 'linghui/agent',
  'linghui-image': 'linghui/image',
  'linghui-panorama': 'linghui/panorama',
  'linghui-video': 'linghui/video',
  'linghui-audio': 'linghui/audio',
  'linghui-script': 'linghui/script',
  'linghui-director3d': 'linghui/director3d',
};

function isKnownLinghuiNodeType(value: unknown): value is LinghuiNodeType {
  return typeof value === 'string' && Object.values(LINGHUI_RF_TYPE_TO_NODE_TYPE).includes(value as LinghuiNodeType);
}

function resolveLinghuiTypeFromRFNode(node: Node): LinghuiNodeType | null {
  const data = node.data as unknown as Partial<LinghuiNodeData> | undefined;
  if (isKnownLinghuiNodeType(data?.linghuiType)) {
    return data.linghuiType;
  }
  return LINGHUI_RF_TYPE_TO_NODE_TYPE[node.type ?? ''] ?? null;
}

export function isPersistableLinghuiNode(node: Node): boolean {
  if (node.type === 'group') {
    return false;
  }

  const nodeType = resolveLinghuiTypeFromRFNode(node);
  if (!nodeType) {
    return false;
  }

  const data = node.data as unknown as Partial<LinghuiNodeData> | undefined;
  return data?.linghuiType === nodeType || node.type === linghuiTypeToRFType(nodeType);
}

export function toNodeSnapshot(node: Node): LinghuiRFNodeSnapshot {
  const nodeType = resolveLinghuiTypeFromRFNode(node);
  if (!nodeType) {
    throw new Error(`无法保存未知灵绘节点: ${node.id}`);
  }

  const inputData = node.data as unknown as Partial<LinghuiNodeData> | undefined;
  const fallbackData = createNewNodeData(nodeType);
  const data: LinghuiNodeData = {
    ...fallbackData,
    ...inputData,
    linghuiType: nodeType,
    inputs: Array.isArray(inputData?.inputs) ? inputData.inputs : fallbackData.inputs,
    outputs: Array.isArray(inputData?.outputs) ? inputData.outputs : fallbackData.outputs,
    properties: {
      ...fallbackData.properties,
      ...(inputData?.properties ?? {}),
    },
    active: false,
  };

  return {
    id: node.id,
    type: linghuiTypeToRFType(nodeType),
    position: { x: node.position.x, y: node.position.y },
    data: cloneLinghuiNodeData(data),
    parentId: node.parentId,
  };
}

export function toEdgeSnapshot(edge: Edge): LinghuiRFEdgeSnapshot {
  return {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    sourceHandle: 'output-0',
    targetHandle: 'input-0',
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

function normalizeGraphSnapshot(
  graphData: LinghuiGraphSnapshot,
  options?: { omitPositions?: boolean },
): Omit<LinghuiGraphSnapshot, 'nodes' | 'groups'> & {
  nodes: Array<Omit<LinghuiRFNodeSnapshot, 'width' | 'height'> | Omit<LinghuiRFNodeSnapshot, 'position' | 'width' | 'height'>>;
  groups: Array<LinghuiRFGroupSnapshot | Omit<LinghuiRFGroupSnapshot, 'position'>>;
} {
  const { omitPositions = false } = options ?? {};
  return {
    version: graphData.version,
    edges: graphData.edges.map(edge => cloneSnapshotValue(edge)),
    nodes: graphData.nodes.map((node) => {
      if (omitPositions) {
        const { position: _position, width: _width, height: _height, ...rest } = node;
        return cloneSnapshotValue(rest);
      }
      const { width: _width, height: _height, ...rest } = node;
      return cloneSnapshotValue(rest);
    }),
    groups: graphData.groups.map((group) => {
      if (omitPositions) {
        const { position: _position, ...rest } = group;
        return cloneSnapshotValue(rest);
      }
      return cloneSnapshotValue(group);
    }),
  };
}

function serializeViewport(viewport: LinghuiViewportState): string {
  return JSON.stringify(viewport);
}

function serializeGraphSnapshot(graphData: LinghuiGraphSnapshot): string {
  return JSON.stringify(normalizeGraphSnapshot(graphData));
}

function serializeGraphSnapshotWithoutPositions(graphData: LinghuiGraphSnapshot): string {
  return JSON.stringify(normalizeGraphSnapshot(graphData, { omitPositions: true }));
}

export function serializeCanvasDocumentSnapshot(snapshot: LinghuiCanvasDocumentSnapshot): string {
  return JSON.stringify({
    graphData: normalizeGraphSnapshot(snapshot.graphData),
    viewport: cloneSnapshotValue(snapshot.viewport),
  });
}

export function detectCanvasMutationKind(
  previous: LinghuiCanvasDocumentSnapshot | null | undefined,
  next: LinghuiCanvasDocumentSnapshot,
): LinghuiCanvasMutationKind {
  if (!previous) {
    return 'content';
  }

  const sameGraph = serializeGraphSnapshot(previous.graphData) === serializeGraphSnapshot(next.graphData);
  const sameViewport = serializeViewport(previous.viewport) === serializeViewport(next.viewport);

  if (sameGraph && sameViewport) {
    return 'none';
  }

  if (sameGraph) {
    return 'viewport';
  }

  const sameGraphContent = (
    serializeGraphSnapshotWithoutPositions(previous.graphData) ===
    serializeGraphSnapshotWithoutPositions(next.graphData)
  );

  if (sameGraphContent) {
    return 'layout';
  }

  return 'content';
}

export function buildCanvasDocumentSnapshotFromRF(
  rfNodes: Node[],
  rfEdges: Edge[],
  viewport: LinghuiViewportState,
): LinghuiCanvasDocumentSnapshot {
  const persistableNodeIds = new Set(
    rfNodes
      .filter(isPersistableLinghuiNode)
      .map(node => node.id),
  );

  return {
    graphData: {
      version: 2,
      nodes: rfNodes.filter(isPersistableLinghuiNode).map(toNodeSnapshot),
      edges: rfEdges
        .filter(edge => persistableNodeIds.has(edge.source) && persistableNodeIds.has(edge.target))
        .map(toEdgeSnapshot),
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
  const childNodes: Node[] = (snapNodes ?? []).map((node) => {
    const nodeType = isKnownLinghuiNodeType(node.data?.linghuiType)
      ? node.data.linghuiType
      : LINGHUI_RF_TYPE_TO_NODE_TYPE[node.type] ?? node.data.linghuiType;
    const fallbackData = createNewNodeData(nodeType);
    const data: LinghuiNodeData = {
      ...fallbackData,
      ...node.data,
      linghuiType: nodeType,
      inputs: Array.isArray(node.data?.inputs) && node.data.inputs.length > 0 ? node.data.inputs : fallbackData.inputs,
      outputs: Array.isArray(node.data?.outputs) && node.data.outputs.length > 0 ? node.data.outputs : fallbackData.outputs,
      properties: {
        ...fallbackData.properties,
        ...(node.data?.properties ?? {}),
      },
      active: false,
    };

    return {
      id: node.id,
      type: linghuiTypeToRFType(nodeType),
      position: node.position,
      data: cloneLinghuiNodeData(data) as unknown as Record<string, unknown>,
      parentId: node.parentId,
      extent: resolveParentExtent(node.parentId),
      draggable: false,
      selected: false,
    };
  });

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
    sourceHandle: 'output-0',
    targetHandle: 'input-0',
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
  void sourceDataType;
  return draftNodeData.inputs.length > 0 ? 'input-0' : null;
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

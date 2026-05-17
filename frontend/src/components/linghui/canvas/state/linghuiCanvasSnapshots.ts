import type { Edge, Node } from '@xyflow/react';
import { linghuiTypeToRFType } from '../../../../types/linghui';
import type {
  LinghuiCanvasGroupData,
  LinghuiEdgeData,
  LinghuiGraphSnapshot,
  LinghuiGraphStats,
  LinghuiNodeData,
  LinghuiNodeType,
  LinghuiRFEdgeSnapshot,
  LinghuiRFGroupSnapshot,
  LinghuiRFNodeSnapshot,
  LinghuiViewportState,
} from '../../../../types/linghui';
import { createNewNodeData } from '../../library/state/linghuiNodeDefs';
import type {
  LinghuiCanvasDocumentSnapshot,
  LinghuiCanvasMutationKind,
  LinghuiClipboardSnapshot,
} from './linghuiCanvasSharedTypes';
import { resolveParentExtent } from './linghuiCanvasSharedTypes';

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
  // 旧持久化迁移：linghui-image-generator → 统一图片节点（properties.mode 在 normalize 层补回 'generate'）。
  'linghui-image-generator': 'linghui/image',
  'linghui-panorama': 'linghui/panorama',
  'linghui-video': 'linghui/video',
  'linghui-audio': 'linghui/audio',
  'linghui-script': 'linghui/script',
  'linghui-storyboard': 'linghui/storyboard',
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

export function buildLinghuiClipboardSnapshotFromRF(
  rfNodes: Node[],
  rfEdges: Edge[],
  requestedIds?: string[],
  options?: { includeExternalInputEdges?: boolean },
): LinghuiClipboardSnapshot | null {
  const selectionIds = new Set(
    requestedIds?.length
      ? requestedIds
      : rfNodes.filter(node => node.selected).map(node => node.id),
  );

  const selectedGroups = rfNodes.filter(node => selectionIds.has(node.id) && node.type === 'group');
  const selectedGroupIds = new Set(selectedGroups.map(node => node.id));
  const selectedNodes = rfNodes.filter(node => (
    node.type !== 'group' && (
      selectionIds.has(node.id) ||
      (node.parentId ? selectedGroupIds.has(node.parentId) : false)
    )
  ));
  const selectedNodeIds = new Set(selectedNodes.map(node => node.id));
  const selectedEdges = rfEdges.filter(edge => {
    const sourceSelected = selectedNodeIds.has(edge.source);
    const targetSelected = selectedNodeIds.has(edge.target);
    if (sourceSelected && targetSelected) {
      return true;
    }
    return Boolean(options?.includeExternalInputEdges) && !sourceSelected && targetSelected;
  });

  if (!selectedNodes.length && !selectedGroups.length) {
    return null;
  }

  return {
    nodes: selectedNodes.map(toNodeSnapshot),
    edges: selectedEdges.map(toEdgeSnapshot),
    groups: selectedGroups.map(toGroupSnapshot),
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

import type { Edge, Node } from '@xyflow/react';
import ELK from 'elkjs/lib/elk.bundled.js';
import type { ElkExtendedEdge, ElkNode } from 'elkjs/lib/elk-api';
import type { LinghuiNodeData } from '../../../../types/linghui';

export const LINGHUI_CANVAS_SNAP_GRID_SIZE = 24;
export const LINGHUI_CANVAS_NODE_GAP = 96;

export interface LinghuiCanvasLayoutUpdate {
  id: string;
  position: { x: number; y: number };
}

export interface LinghuiCanvasOutlierNode {
  id: string;
  name: string;
  cx: number;
  cy: number;
}

export interface LinghuiCanvasLayoutResult {
  updates: LinghuiCanvasLayoutUpdate[];
  outlierNodes: LinghuiCanvasOutlierNode[];
}

const DEFAULT_NODE_WIDTH = 350;
const DEFAULT_NODE_HEIGHT = 220;
const DEFAULT_GROUP_WIDTH = 420;
const DEFAULT_GROUP_HEIGHT = 320;

const elk = new ELK();

function snap(value: number): number {
  return Math.round(value / LINGHUI_CANVAS_SNAP_GRID_SIZE) * LINGHUI_CANVAS_SNAP_GRID_SIZE;
}

function resolveNumericDimension(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }

  return undefined;
}

export function getLinghuiFlowNodeSize(node: Node): { width: number; height: number } {
  const style = node.style as { width?: number | string; height?: number | string } | undefined;
  const fallbackWidth = node.type === 'group' ? DEFAULT_GROUP_WIDTH : DEFAULT_NODE_WIDTH;
  const fallbackHeight = node.type === 'group' ? DEFAULT_GROUP_HEIGHT : DEFAULT_NODE_HEIGHT;

  return {
    width: resolveNumericDimension(style?.width)
      ?? resolveNumericDimension(node.measured?.width)
      ?? resolveNumericDimension(node.width)
      ?? fallbackWidth,
    height: resolveNumericDimension(style?.height)
      ?? resolveNumericDimension(node.measured?.height)
      ?? resolveNumericDimension(node.height)
      ?? fallbackHeight,
  };
}

function buildNodeMap(nodes: Node[]): Map<string, Node> {
  return new Map(nodes.map(node => [node.id, node]));
}

function getRootNodeId(nodeId: string, nodeMap: Map<string, Node>): string {
  let currentId = nodeId;
  const seen = new Set<string>();

  for (let index = 0; index < 128; index += 1) {
    if (seen.has(currentId)) break;
    seen.add(currentId);
    const node = nodeMap.get(currentId);
    if (!node?.parentId || !nodeMap.has(node.parentId)) break;
    currentId = node.parentId;
  }

  return currentId;
}

function getTopLevelNodes(nodes: Node[]): Node[] {
  return nodes
    .filter(node => !node.parentId)
    .sort((left, right) => {
      const yDiff = left.position.y - right.position.y;
      return Math.abs(yDiff) > 1 ? yDiff : left.position.x - right.position.x;
    });
}

function buildCollapsedEdges(edges: Edge[], nodeMap: Map<string, Node>, rootIds: Set<string>): ElkExtendedEdge[] {
  const seen = new Set<string>();
  const result: ElkExtendedEdge[] = [];

  for (const edge of edges) {
    const source = getRootNodeId(edge.source, nodeMap);
    const target = getRootNodeId(edge.target, nodeMap);
    if (source === target || !rootIds.has(source) || !rootIds.has(target)) continue;

    const key = `${source}->${target}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({
      id: `edge-${source}-${target}`,
      sources: [source],
      targets: [target],
    });
  }

  return result;
}

function normalizeLayoutOrigin(positions: Map<string, { x: number; y: number }>): void {
  if (!positions.size) return;
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;

  for (const position of positions.values()) {
    minX = Math.min(minX, position.x);
    minY = Math.min(minY, position.y);
  }

  if (!Number.isFinite(minX) || !Number.isFinite(minY)) return;

  for (const position of positions.values()) {
    position.x -= minX;
    position.y -= minY;
  }
}

export function detectLinghuiCanvasOutliers(nodes: Node[], edges: Edge[]): LinghuiCanvasOutlierNode[] {
  const topLevelNodes = getTopLevelNodes(nodes);
  if (topLevelNodes.length <= 1) return [];

  const nodeMap = buildNodeMap(nodes);
  const topLevelIds = new Set(topLevelNodes.map(node => node.id));
  const adjacency = new Map<string, Set<string>>();
  for (const nodeId of topLevelIds) {
    adjacency.set(nodeId, new Set());
  }

  for (const edge of edges) {
    const source = getRootNodeId(edge.source, nodeMap);
    const target = getRootNodeId(edge.target, nodeMap);
    if (source === target || !topLevelIds.has(source) || !topLevelIds.has(target)) continue;
    adjacency.get(source)?.add(target);
    adjacency.get(target)?.add(source);
  }

  const components: string[][] = [];
  const visited = new Set<string>();
  for (const node of topLevelNodes) {
    if (visited.has(node.id)) continue;
    const component: string[] = [];
    const stack = [node.id];
    visited.add(node.id);

    while (stack.length) {
      const current = stack.pop()!;
      component.push(current);
      for (const nextId of adjacency.get(current) ?? []) {
        if (visited.has(nextId)) continue;
        visited.add(nextId);
        stack.push(nextId);
      }
    }

    components.push(component);
  }

  if (components.length <= 1) return [];

  const mainComponent = components.reduce((largest, current) => (
    current.length > largest.length ? current : largest
  ), components[0]);
  const mainIds = new Set(mainComponent);

  return topLevelNodes
    .filter(node => !mainIds.has(node.id))
    .map(node => {
      const size = getLinghuiFlowNodeSize(node);
      const data = node.data as unknown as Partial<LinghuiNodeData> | undefined;
      return {
        id: node.id,
        name: data?.label || String(node.id).slice(0, 8),
        cx: node.position.x + size.width / 2,
        cy: node.position.y + size.height / 2,
      };
    });
}

export async function computeLinghuiCanvasElkLayout(nodes: Node[], edges: Edge[]): Promise<LinghuiCanvasLayoutResult> {
  const topLevelNodes = getTopLevelNodes(nodes);
  if (topLevelNodes.length <= 1) {
    return {
      updates: [],
      outlierNodes: detectLinghuiCanvasOutliers(nodes, edges),
    };
  }

  const nodeMap = buildNodeMap(nodes);
  const rootIds = new Set(topLevelNodes.map(node => node.id));
  const children: ElkNode[] = topLevelNodes.map(node => {
    const size = getLinghuiFlowNodeSize(node);
    return {
      id: node.id,
      width: Math.max(1, size.width),
      height: Math.max(1, size.height),
    };
  });

  const graph: ElkNode = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'RIGHT',
      'elk.spacing.nodeNode': String(LINGHUI_CANVAS_NODE_GAP),
      'elk.layered.spacing.nodeNodeBetweenLayers': String(LINGHUI_CANVAS_NODE_GAP * 1.35),
      'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
      'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
      'elk.padding': '[top=0,left=0,bottom=0,right=0]',
    },
    children,
    edges: buildCollapsedEdges(edges, nodeMap, rootIds),
  };

  const layout = await elk.layout(graph);
  const layoutPositions = new Map<string, { x: number; y: number }>();
  for (const child of layout.children ?? []) {
    if (!child.id) continue;
    layoutPositions.set(child.id, { x: child.x ?? 0, y: child.y ?? 0 });
  }
  normalizeLayoutOrigin(layoutPositions);

  if (!layoutPositions.size) {
    return {
      updates: [],
      outlierNodes: detectLinghuiCanvasOutliers(nodes, edges),
    };
  }

  const minCurrentX = Math.min(...topLevelNodes.map(node => node.position.x));
  const minCurrentY = Math.min(...topLevelNodes.map(node => node.position.y));
  const originX = snap(Number.isFinite(minCurrentX) ? minCurrentX : 0);
  const originY = snap(Number.isFinite(minCurrentY) ? minCurrentY : 0);

  const updates: LinghuiCanvasLayoutUpdate[] = [];
  for (const node of topLevelNodes) {
    const nextPosition = layoutPositions.get(node.id);
    if (!nextPosition) continue;
    const nextX = snap(originX + nextPosition.x);
    const nextY = snap(originY + nextPosition.y);
    if (Math.abs(nextX - node.position.x) <= 0.5 && Math.abs(nextY - node.position.y) <= 0.5) {
      continue;
    }
    updates.push({
      id: node.id,
      position: { x: nextX, y: nextY },
    });
  }

  return {
    updates,
    outlierNodes: detectLinghuiCanvasOutliers(nodes, edges),
  };
}

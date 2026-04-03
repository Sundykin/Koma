import type { LinghuiRFEdgeSnapshot, LinghuiRFNodeSnapshot } from '../../../../types/linghui';

export function getDirectUpstreamNodeIds(edges: LinghuiRFEdgeSnapshot[], nodeId: string): string[] {
  const incoming = new Set<string>();
  for (const edge of edges) {
    if (edge.target === nodeId) incoming.add(edge.source);
  }
  return [...incoming];
}

export function collectLinghuiDependentNodeIds(edges: LinghuiRFEdgeSnapshot[], rootNodeIds: string[]): string[] {
  const adjacency = new Map<string, Set<string>>();
  for (const edge of edges) {
    if (!adjacency.has(edge.source)) adjacency.set(edge.source, new Set());
    adjacency.get(edge.source)?.add(edge.target);
  }

  const queue = [...new Set(rootNodeIds)];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const next of adjacency.get(current) ?? []) {
      if (visited.has(next)) continue;
      visited.add(next);
      queue.push(next);
    }
  }

  return [...visited];
}

export function collectRequiredNodeIds(edges: LinghuiRFEdgeSnapshot[], targetNodeIds: string[]): string[] {
  const stack = [...targetNodeIds];
  const required = new Set<string>(targetNodeIds);

  while (stack.length > 0) {
    const current = stack.pop()!;
    for (const upstreamId of getDirectUpstreamNodeIds(edges, current)) {
      if (required.has(upstreamId)) continue;
      required.add(upstreamId);
      stack.push(upstreamId);
    }
  }

  return [...required];
}

function compareExecutionNodePosition(a: LinghuiRFNodeSnapshot, b: LinghuiRFNodeSnapshot): number {
  return a.position.x - b.position.x || a.position.y - b.position.y;
}

export function buildTopologicalLayers(
  nodes: LinghuiRFNodeSnapshot[],
  edges: LinghuiRFEdgeSnapshot[],
  requiredNodeIds: Set<string>,
): LinghuiRFNodeSnapshot[][] {
  const filteredNodes = nodes.filter(node => requiredNodeIds.has(node.id));
  const nodeById = new Map(filteredNodes.map(node => [node.id, node] as const));
  const indegree = new Map<string, number>();
  const adjacency = new Map<string, Set<string>>();

  for (const node of filteredNodes) {
    indegree.set(node.id, 0);
    adjacency.set(node.id, new Set());
  }

  for (const edge of edges) {
    if (!requiredNodeIds.has(edge.source) || !requiredNodeIds.has(edge.target)) continue;
    adjacency.get(edge.source)?.add(edge.target);
    indegree.set(edge.target, (indegree.get(edge.target) ?? 0) + 1);
  }

  let currentLayer = filteredNodes
    .filter(node => (indegree.get(node.id) ?? 0) === 0)
    .sort(compareExecutionNodePosition);
  const layers: LinghuiRFNodeSnapshot[][] = [];
  const ordered: LinghuiRFNodeSnapshot[] = [];

  while (currentLayer.length > 0) {
    layers.push(currentLayer);
    ordered.push(...currentLayer);

    const nextLayer: LinghuiRFNodeSnapshot[] = [];
    for (const node of currentLayer) {
      for (const nextId of adjacency.get(node.id) ?? []) {
        const nextDegree = (indegree.get(nextId) ?? 0) - 1;
        indegree.set(nextId, nextDegree);
        if (nextDegree === 0) {
          const nextNode = nodeById.get(nextId);
          if (nextNode) nextLayer.push(nextNode);
        }
      }
    }

    currentLayer = nextLayer.sort(compareExecutionNodePosition);
  }

  if (ordered.length === filteredNodes.length) {
    return layers;
  }

  const orderedSet = new Set(ordered.map(node => node.id));
  const cyclicNodes = filteredNodes.filter(node => !orderedSet.has(node.id));
  const cyclicNodeLabels = cyclicNodes.map(node => node.data.label || node.id);
  throw new Error(`工作流存在循环依赖，请检查这些节点：${cyclicNodeLabels.join('、')}`);
}

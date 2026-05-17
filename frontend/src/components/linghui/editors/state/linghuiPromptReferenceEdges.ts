import type { LinghuiPromptReferenceEdge } from './linghuiPromptReferences';

function getHandleIndex(handleId: string | null | undefined, prefix: 'input' | 'output'): number {
  if (!handleId) return 0;
  const match = handleId.match(new RegExp(`^${prefix}-(\\d+)$`));
  return match ? Number(match[1]) : 0;
}

export function getOrderedIncomingReferenceEdges(
  nodeId: string,
  edges: LinghuiPromptReferenceEdge[],
): LinghuiPromptReferenceEdge[] {
  return edges
    .map((edge, index) => ({ edge, index }))
    .filter(item => item.edge.target === nodeId)
    .sort((left, right) => (
      getHandleIndex(left.edge.targetHandle, 'input') - getHandleIndex(right.edge.targetHandle, 'input')
      || getHandleIndex(left.edge.sourceHandle, 'output') - getHandleIndex(right.edge.sourceHandle, 'output')
      || left.index - right.index
    ))
    .map(item => item.edge);
}

export function collectOrderedUpstreamReferenceNodeIds(
  nodeId: string,
  edges: LinghuiPromptReferenceEdge[],
): string[] {
  const queue = getOrderedIncomingReferenceEdges(nodeId, edges).map(edge => edge.source);
  const seen = new Set<string>();
  const ordered: string[] = [];
  while (queue.length > 0) {
    const currentId = queue.shift()!;
    if (seen.has(currentId)) continue;
    seen.add(currentId);
    ordered.push(currentId);
    const parents = getOrderedIncomingReferenceEdges(currentId, edges).map(edge => edge.source);
    queue.push(...parents);
  }
  return ordered;
}

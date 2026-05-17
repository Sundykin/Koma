import type { Edge, Node } from '@xyflow/react';
import type {
  LinghuiNodeData,
  LinghuiScriptDerivationKind,
} from '../../../../types/linghui';

export function getDerivedNodeMeta(node: Node): {
  scriptSourceNodeId?: string;
  scriptShotId?: string;
  scriptDerivationKind?: LinghuiScriptDerivationKind;
} {
  const nodeData = node.data as unknown as LinghuiNodeData | undefined;
  const properties = (nodeData?.properties ?? {}) as Record<string, unknown>;

  return {
    scriptSourceNodeId: typeof properties.scriptSourceNodeId === 'string' ? properties.scriptSourceNodeId : undefined,
    scriptShotId: typeof properties.scriptShotId === 'string' ? properties.scriptShotId : undefined,
    scriptDerivationKind: typeof properties.scriptDerivationKind === 'string'
      ? properties.scriptDerivationKind as LinghuiScriptDerivationKind
      : undefined,
  };
}

export function hasMatchingEdge(
  edges: Edge[],
  target: Pick<Edge, 'source' | 'sourceHandle' | 'target' | 'targetHandle'>,
): boolean {
  void target.sourceHandle;
  void target.targetHandle;
  return edges.some(edge => (
    edge.source === target.source &&
    edge.target === target.target
  ));
}

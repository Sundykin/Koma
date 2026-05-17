import type { Edge, Node, ReactFlowInstance } from '@xyflow/react';
import type { Dispatch, SetStateAction } from 'react';
import type { LinghuiCanvasSelection } from '../../../../types/linghui';
import type {
  LinghuiCanvasMenuState,
  LinghuiPendingGroupFrame,
  QuickCreateState,
} from '../state/linghuiCanvasShared';

export interface UseLinghuiCanvasEmptyActionParams {
  reactFlow: ReactFlowInstance;
  setNodes: Dispatch<SetStateAction<Node[]>>;
  setEdges: Dispatch<SetStateAction<Edge[]>>;
  setEditorSelection: Dispatch<SetStateAction<LinghuiCanvasSelection>>;
  setContextMenu: Dispatch<SetStateAction<LinghuiCanvasMenuState | null>>;
  setQuickCreate: Dispatch<SetStateAction<QuickCreateState | null>>;
  setPendingGroupFrame: Dispatch<SetStateAction<LinghuiPendingGroupFrame | null>>;
  scheduleSnapshot: (options?: { recordHistory?: boolean; force?: boolean }) => void;
}

export function hasMatchingEmptyActionEdge(
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

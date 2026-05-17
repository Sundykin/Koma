import type { Edge, Node, ReactFlowInstance } from '@xyflow/react';
import type { Dispatch, SetStateAction } from 'react';
import type { LinghuiCanvasSelection } from '../../../../types/linghui';
import type {
  LinghuiCanvasMenuState,
  LinghuiPendingGroupFrame,
  QuickCreateState,
} from '../state/linghuiCanvasShared';

export interface UseLinghuiCanvasStoryboardDerivationParams {
  reactFlow: ReactFlowInstance;
  setNodes: Dispatch<SetStateAction<Node[]>>;
  setEdges: Dispatch<SetStateAction<Edge[]>>;
  setEditorSelection: Dispatch<SetStateAction<LinghuiCanvasSelection>>;
  setContextMenu: Dispatch<SetStateAction<LinghuiCanvasMenuState | null>>;
  setQuickCreate: Dispatch<SetStateAction<QuickCreateState | null>>;
  setPendingGroupFrame: Dispatch<SetStateAction<LinghuiPendingGroupFrame | null>>;
  scheduleSnapshot: (options?: { recordHistory?: boolean; force?: boolean }) => void;
}

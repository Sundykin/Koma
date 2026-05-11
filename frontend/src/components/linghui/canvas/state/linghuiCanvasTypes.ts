import type { ReactNode } from 'react';
import type {
  LinghuiCanvasSelection,
  LinghuiExecutionContext,
  LinghuiExecutionQueueState,
  LinghuiNodeRunState,
  LinghuiNodeType,
  LinghuiWorkspaceDocument,
} from '../../../../types/linghui';
import type {
  LinghuiWorkflowTemplateRecord,
  LinghuiWorkspaceAssetRecord,
  LinghuiWorkspaceHistoryRecord,
} from '../../../../store/linghuiStorage';
import type { LinghuiLibraryDrawerKey } from '../../library/components/LinghuiLibraryDrawer';

export interface LinghuiCanvasHandle {
  addNode: (type: LinghuiNodeType, clientPosition?: [number, number]) => void;
  addWorkspaceAsset: (
    asset: LinghuiWorkspaceAssetRecord | LinghuiWorkspaceHistoryRecord,
    clientPosition?: [number, number],
  ) => void;
  addWorkflowTemplate: (template: LinghuiWorkflowTemplateRecord, clientPosition?: [number, number]) => void;
  importMediaToCanvas: (
    kind: 'image' | 'video' | 'audio',
    clientPosition?: [number, number],
  ) => Promise<void>;
  createGroupFromSelection: () => void;
  focusContent: () => void;
  focusNodes: (nodeIds: string[], options?: { select?: boolean }) => void;
  notifyMutation: () => void;
  snapshotNow: () => void;
  getSelectionIds: () => string[];
  resolveExecutionTargetIds: (selectionIds?: string[]) => string[];
  getExecutionContext: () => LinghuiExecutionContext | null;
}

export interface LinghuiCanvasProps {
  workspace: LinghuiWorkspaceDocument | null;
  projectEntry?: ReactNode;
  nodeRuns: Record<string, LinghuiNodeRunState>;
  onGraphChange: (
    graphData: import('../../../../types/linghui').LinghuiGraphSnapshot,
    viewport: import('../../../../types/linghui').LinghuiViewportState,
    stats: import('../../../../types/linghui').LinghuiGraphStats,
  ) => void;
  onSelectionChange?: (selection: LinghuiCanvasSelection) => void;
  onNodeMutate?: (nodeId: string) => void;
  onClearNodeRunState?: (nodeId: string) => void;
  onRestoreNodeRuns?: (nodeRuns: Record<string, LinghuiNodeRunState>) => void;
  onConnectionError?: (message: string) => void;
  onAssetLibraryMutate?: () => void;
  onWorkflowTemplateMutate?: () => void;
  onRunSingleNode?: (nodeId: string) => void;
  onRunAll?: () => void;
  onRunSelection?: (selectionIds?: string[]) => void;
  onExportSelection?: (selectionIds?: string[]) => void;
  onFocusFailedNode?: () => void;
  onRetryFailed?: () => void;
  onRerunAffected?: () => void;
  onCancelRun?: () => void;
  executionQueue?: LinghuiExecutionQueueState | null;
  onOpenDrawer?: (drawer: LinghuiLibraryDrawerKey) => void;
}

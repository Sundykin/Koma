import React from 'react';
import type {
  LinghuiExecutionQueueState,
  LinghuiNodeRunState,
  LinghuiWorkspaceDocument,
} from '../../../../types/linghui';
import LinghuiCanvas, { type LinghuiCanvasHandle, type LinghuiCanvasProps } from '../../canvas/components/LinghuiCanvas';
import { LinghuiCanvasErrorBoundary } from '../../canvas/components/LinghuiCanvasErrorBoundary';

interface LinghuiPageShellProps {
  activeWorkspace: LinghuiWorkspaceDocument | null;
  canvasRef: React.RefObject<LinghuiCanvasHandle | null>;
  executionQueue: LinghuiExecutionQueueState | null;
  nodeRuns: Record<string, LinghuiNodeRunState>;
  projectEntry: React.ReactNode;
  onAssetLibraryMutate: NonNullable<LinghuiCanvasProps['onAssetLibraryMutate']>;
  onCancelRun: NonNullable<LinghuiCanvasProps['onCancelRun']>;
  onCanvasCrash: (error: Error, info: React.ErrorInfo) => void;
  onCanvasRecover: () => void;
  onCanvasReload: () => void;
  onClearNodeRunState: NonNullable<LinghuiCanvasProps['onClearNodeRunState']>;
  onConnectionError: NonNullable<LinghuiCanvasProps['onConnectionError']>;
  onExportSelection: NonNullable<LinghuiCanvasProps['onExportSelection']>;
  onFocusFailedNode: NonNullable<LinghuiCanvasProps['onFocusFailedNode']>;
  onGraphChange: LinghuiCanvasProps['onGraphChange'];
  onNodeMutate: NonNullable<LinghuiCanvasProps['onNodeMutate']>;
  onOpenDrawer: NonNullable<LinghuiCanvasProps['onOpenDrawer']>;
  onRestoreNodeRuns: NonNullable<LinghuiCanvasProps['onRestoreNodeRuns']>;
  onRetryFailed: NonNullable<LinghuiCanvasProps['onRetryFailed']>;
  onRunAll: NonNullable<LinghuiCanvasProps['onRunAll']>;
  onRunSelection: NonNullable<LinghuiCanvasProps['onRunSelection']>;
  onRunSingleNode: NonNullable<LinghuiCanvasProps['onRunSingleNode']>;
  onWorkflowTemplateMutate: NonNullable<LinghuiCanvasProps['onWorkflowTemplateMutate']>;
}

export function LinghuiPageShell({
  activeWorkspace,
  canvasRef,
  executionQueue,
  nodeRuns,
  projectEntry,
  onAssetLibraryMutate,
  onCancelRun,
  onCanvasCrash,
  onCanvasRecover,
  onCanvasReload,
  onClearNodeRunState,
  onConnectionError,
  onExportSelection,
  onFocusFailedNode,
  onGraphChange,
  onNodeMutate,
  onOpenDrawer,
  onRestoreNodeRuns,
  onRetryFailed,
  onRunAll,
  onRunSelection,
  onRunSingleNode,
  onWorkflowTemplateMutate,
}: LinghuiPageShellProps) {
  return (
    <div className="linghuiCanvasPanel">
      <div className="linghuiCanvasWorkspace">
        <LinghuiCanvasErrorBoundary
          onError={onCanvasCrash}
          onRecover={onCanvasRecover}
          onReload={onCanvasReload}
        >
          <LinghuiCanvas
            ref={canvasRef}
            workspace={activeWorkspace}
            projectEntry={projectEntry}
            nodeRuns={nodeRuns}
            onGraphChange={onGraphChange}
            onNodeMutate={onNodeMutate}
            onClearNodeRunState={onClearNodeRunState}
            onRestoreNodeRuns={onRestoreNodeRuns}
            onConnectionError={onConnectionError}
            onAssetLibraryMutate={onAssetLibraryMutate}
            onWorkflowTemplateMutate={onWorkflowTemplateMutate}
            onRunSingleNode={onRunSingleNode}
            onRunAll={onRunAll}
            onRunSelection={onRunSelection}
            onExportSelection={onExportSelection}
            onFocusFailedNode={onFocusFailedNode}
            onRetryFailed={onRetryFailed}
            onCancelRun={onCancelRun}
            executionQueue={executionQueue}
            onOpenDrawer={onOpenDrawer}
          />
        </LinghuiCanvasErrorBoundary>
      </div>
    </div>
  );
}

import { forwardRef, memo } from 'react';
import { EMPTY_LINGHUI_NODE_RUNS } from '../../../../types/linghui';
import { LinghuiCanvasProviders } from './LinghuiCanvasProviders';
import { LinghuiCanvasInner } from './LinghuiCanvasInner';
import type { LinghuiCanvasHandle, LinghuiCanvasProps } from '../state/linghuiCanvasTypes';

const LinghuiCanvasComponent = forwardRef<LinghuiCanvasHandle, LinghuiCanvasProps>(function LinghuiCanvas(
  props,
  ref,
) {
  if (!props) {
    return null;
  }

  const nodeRuns = props.nodeRuns ?? EMPTY_LINGHUI_NODE_RUNS;

  return (
    <LinghuiCanvasProviders
      nodeRuns={nodeRuns}
      onConnectionError={props.onConnectionError}
    >
      <LinghuiCanvasInner {...props} nodeRuns={nodeRuns} ref={ref} />
    </LinghuiCanvasProviders>
  );
});

function areLinghuiCanvasPropsEqual(prev: LinghuiCanvasProps, next: LinghuiCanvasProps): boolean {
  return (
    prev.workspace === next.workspace &&
    prev.projectEntry === next.projectEntry &&
    prev.nodeRuns === next.nodeRuns &&
    prev.onGraphChange === next.onGraphChange &&
    prev.onSelectionChange === next.onSelectionChange &&
    prev.onNodeMutate === next.onNodeMutate &&
    prev.onClearNodeRunState === next.onClearNodeRunState &&
    prev.onConnectionError === next.onConnectionError &&
    prev.onAssetLibraryMutate === next.onAssetLibraryMutate &&
    prev.onWorkflowTemplateMutate === next.onWorkflowTemplateMutate &&
    prev.onRunSingleNode === next.onRunSingleNode &&
    prev.onRunAll === next.onRunAll &&
    prev.onRunSelection === next.onRunSelection &&
    prev.onExportSelection === next.onExportSelection &&
    prev.onFocusFailedNode === next.onFocusFailedNode &&
    prev.onRetryFailed === next.onRetryFailed &&
    prev.onRerunAffected === next.onRerunAffected &&
    prev.onCancelRun === next.onCancelRun &&
    prev.executionQueue === next.executionQueue &&
    prev.onOpenDrawer === next.onOpenDrawer
  );
}

export const LinghuiCanvas = memo(LinghuiCanvasComponent, areLinghuiCanvasPropsEqual);
LinghuiCanvas.displayName = 'LinghuiCanvas';

export type { LinghuiCanvasHandle, LinghuiCanvasProps } from '../state/linghuiCanvasTypes';
export default LinghuiCanvas;

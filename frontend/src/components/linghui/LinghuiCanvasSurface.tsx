import React from 'react';
import type { RefObject } from 'react';
import type { LinghuiCanvasMode } from '../../types/linghui';
import {
  LinghuiGroupRunsContext,
  LinghuiExecutionTraceContext,
  LinghuiNodeInteractionContext,
  LinghuiNodeMutationContext,
} from './nodes';
import type {
  LinghuiExecutionTraceState,
  LinghuiGroupRunSummary,
  LinghuiNodeInteractionApi,
  LinghuiNodeMutationApi,
} from './nodes/LinghuiNodeRunsContext';
import { LinghuiCanvasHud } from './LinghuiCanvasHud';
import { LinghuiCanvasOverlays, type LinghuiCanvasOverlaysProps } from './LinghuiCanvasOverlays';
import { LinghuiCanvasStage } from './LinghuiCanvasStage';

interface LinghuiCanvasSurfaceProps {
  hostRef: RefObject<HTMLDivElement | null>;
  canvasMode: LinghuiCanvasMode;
  nodeInteraction: LinghuiNodeInteractionApi;
  nodeMutation: LinghuiNodeMutationApi;
  executionTrace: LinghuiExecutionTraceState;
  groupRunSummaries: Record<string, LinghuiGroupRunSummary>;
  rootHandlers: {
    onDragOver: React.DragEventHandler<HTMLDivElement>;
    onDrop: React.DragEventHandler<HTMLDivElement>;
    onDoubleClick: React.MouseEventHandler<HTMLDivElement>;
  };
  hudProps: React.ComponentProps<typeof LinghuiCanvasHud>;
  stageProps: React.ComponentProps<typeof LinghuiCanvasStage>;
  overlayProps: LinghuiCanvasOverlaysProps;
}

export function LinghuiCanvasSurface({
  hostRef,
  canvasMode,
  nodeInteraction,
  nodeMutation,
  executionTrace,
  groupRunSummaries,
  rootHandlers,
  hudProps,
  stageProps,
  overlayProps,
}: LinghuiCanvasSurfaceProps) {
  return (
    <LinghuiGroupRunsContext.Provider value={groupRunSummaries}>
      <LinghuiExecutionTraceContext.Provider value={executionTrace}>
        <LinghuiNodeInteractionContext.Provider value={nodeInteraction}>
          <LinghuiNodeMutationContext.Provider value={nodeMutation}>
            <div
              ref={hostRef}
              className={`linghuiCanvasRoot ${canvasMode === 'hand' ? 'isHandMode' : 'isMouseMode'}`}
              onDragOver={rootHandlers.onDragOver}
              onDrop={rootHandlers.onDrop}
              onDoubleClick={rootHandlers.onDoubleClick}
            >
              <LinghuiCanvasHud {...hudProps} />
              <LinghuiCanvasStage {...stageProps} />
              <LinghuiCanvasOverlays {...overlayProps} />
            </div>
          </LinghuiNodeMutationContext.Provider>
        </LinghuiNodeInteractionContext.Provider>
      </LinghuiExecutionTraceContext.Provider>
    </LinghuiGroupRunsContext.Provider>
  );
}

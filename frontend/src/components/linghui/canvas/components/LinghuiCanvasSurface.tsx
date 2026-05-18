import React from 'react';
import type { RefObject } from 'react';
import type { LinghuiCanvasMode } from '../../../../types/linghui';
import {
  LinghuiCanvasModeContext,
  LinghuiCanvasZoomContext,
  LinghuiGroupRunsContext,
  LinghuiExecutionTraceContext,
  LinghuiNodeEditorContext,
  LinghuiNodeInteractionContext,
  LinghuiNodeMutationContext,
} from '../../nodes';
import type {
  LinghuiExecutionTraceState,
  LinghuiGroupRunSummary,
  LinghuiNodeInteractionApi,
  LinghuiNodeMutationApi,
} from '../../nodes/state/LinghuiNodeRunsContext';
import {
  LinghuiGridSplitContext,
  type LinghuiGridSplitOverlayState,
} from '../../nodes/state/LinghuiNodeRunsContext';
import { LinghuiCanvasHud } from './LinghuiCanvasHud';
import { LinghuiCanvasOverlays, type LinghuiCanvasOverlaysProps } from './LinghuiCanvasOverlays';
import { LinghuiCanvasStage } from './LinghuiCanvasStage';

interface LinghuiCanvasSurfaceProps {
  hostRef: RefObject<HTMLDivElement | null>;
  canvasMode: LinghuiCanvasMode;
  /** LibTV interacting：节点/框选拖拽中，根节点挂 .canvas-interacting 暂停节点动画。 */
  interacting: boolean;
  canvasZoom: number;
  nodeInteraction: LinghuiNodeInteractionApi;
  nodeMutation: LinghuiNodeMutationApi;
  executionTrace: LinghuiExecutionTraceState;
  gridSplitOverlay: LinghuiGridSplitOverlayState;
  groupRunSummaries: Record<string, LinghuiGroupRunSummary>;
  rootHandlers: {
    onDragOver: React.DragEventHandler<HTMLDivElement>;
    onDrop: React.DragEventHandler<HTMLDivElement>;
    onDoubleClick: React.MouseEventHandler<HTMLDivElement>;
  };
  hudProps: React.ComponentProps<typeof LinghuiCanvasHud>;
  stageProps: React.ComponentProps<typeof LinghuiCanvasStage>;
  overlayProps: LinghuiCanvasOverlaysProps;
  canvasInteractionVersion: number;
}

export function LinghuiCanvasSurface({
  hostRef,
  canvasMode,
  interacting,
  canvasZoom,
  nodeInteraction,
  nodeMutation,
  executionTrace,
  gridSplitOverlay,
  groupRunSummaries,
  rootHandlers,
  hudProps,
  stageProps,
  overlayProps,
  canvasInteractionVersion,
}: LinghuiCanvasSurfaceProps) {
  const nodeEditor = React.useMemo(() => ({
    selection: overlayProps.editorSelection,
    activeTool: overlayProps.activeNodeTool,
    setActiveTool: overlayProps.setActiveNodeTool,
    closeEditor: overlayProps.onCloseEditor,
    canvasInteractionVersion,
    nodeRuns: overlayProps.nodeRuns,
    executionQueue: overlayProps.executionQueue,
    workspaceId: overlayProps.workspaceId,
    onAssetLibraryMutate: overlayProps.onAssetLibraryMutate,
    onRunNode: overlayProps.onRunNode,
    onDeriveScriptShots: overlayProps.onDeriveScriptShots,
    onGenerateScriptImages: overlayProps.onGenerateScriptImages,
    onGenerateScriptVideos: overlayProps.onGenerateScriptVideos,
    onCreateDerivedImportImages: overlayProps.onCreateDerivedImportImages,
    onCreateDerivedMultiAngleImage: overlayProps.onCreateDerivedMultiAngleImage,
    onExecuteImageUpscale: overlayProps.onExecuteImageUpscale,
    onExecuteImageCrop: overlayProps.onExecuteImageCrop,
    onCreatePanoramaPreview: overlayProps.onCreatePanoramaPreview,
    onGenerateImageFromController: overlayProps.onGenerateImageFromController,
    onExecuteMultiAngle: overlayProps.onExecuteMultiAngle,
    onApplyImageToolPreset: overlayProps.onApplyImageToolPreset,
    onApplyTextEmptyAction: overlayProps.onApplyTextEmptyAction,
    onApplyVideoEmptyAction: overlayProps.onApplyVideoEmptyAction,
    onApplyAudioEmptyAction: overlayProps.onApplyAudioEmptyAction,
    onSetGridSplitType: overlayProps.onSetGridSplitType,
    onClearGridSplitCells: overlayProps.onClearGridSplitCells,
    onExecuteGridSplit: overlayProps.onExecuteGridSplit,
    gridSplitUpscaleFactor: overlayProps.gridSplitUpscaleFactor,
    onSetGridSplitUpscaleFactor: overlayProps.onSetGridSplitUpscaleFactor,
    onRevertGridSplit: overlayProps.onRevertGridSplit,
    onSeparateVideoAudio: overlayProps.onSeparateVideoAudio,
    onCreateDerivedVideoFrames: overlayProps.onCreateDerivedVideoFrames,
    onCreateDerivedVideoClips: overlayProps.onCreateDerivedVideoClips,
    onCreateDerivedVideoAnalysis: overlayProps.onCreateDerivedVideoAnalysis,
  }), [canvasInteractionVersion, overlayProps]);

  return (
    <LinghuiCanvasModeContext.Provider value={canvasMode}>
      <LinghuiCanvasZoomContext.Provider value={canvasZoom}>
        <LinghuiGroupRunsContext.Provider value={groupRunSummaries}>
          <LinghuiExecutionTraceContext.Provider value={executionTrace}>
            <LinghuiNodeInteractionContext.Provider value={nodeInteraction}>
              <LinghuiGridSplitContext.Provider value={gridSplitOverlay}>
                <LinghuiNodeMutationContext.Provider value={nodeMutation}>
                  <LinghuiNodeEditorContext.Provider value={nodeEditor}>
                    <div
                      ref={hostRef}
                      className={[
                        'linghuiCanvasRoot',
                        canvasMode === 'hand' ? 'isHandMode' : 'isMouseMode',
                        interacting ? 'canvas-interacting' : '',
                      ].filter(Boolean).join(' ')}
                      onDragOver={rootHandlers.onDragOver}
                      onDrop={rootHandlers.onDrop}
                      onDoubleClick={rootHandlers.onDoubleClick}
                    >
                      <LinghuiCanvasHud {...hudProps} />
                      <LinghuiCanvasStage {...stageProps} />
                      <LinghuiCanvasOverlays {...overlayProps} />
                    </div>
                  </LinghuiNodeEditorContext.Provider>
                </LinghuiNodeMutationContext.Provider>
              </LinghuiGridSplitContext.Provider>
            </LinghuiNodeInteractionContext.Provider>
          </LinghuiExecutionTraceContext.Provider>
        </LinghuiGroupRunsContext.Provider>
      </LinghuiCanvasZoomContext.Provider>
    </LinghuiCanvasModeContext.Provider>
  );
}

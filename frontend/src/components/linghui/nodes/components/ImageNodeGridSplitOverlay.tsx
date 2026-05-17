import type { SyntheticEvent } from 'react';
import type { LinghuiGridSplitOverlayState } from '../state/LinghuiNodeRunsContext';
import type { GridSplitPreviewLayout } from '../state/imageNodeGridSplitLayout';
import { cssVars } from '../../../../theme/runtime';

interface ImageNodeGridSplitOverlayProps {
  gridSplitOverlay: LinghuiGridSplitOverlayState;
  gridSplitPreviewLayout: GridSplitPreviewLayout | null;
  onStopSurfaceEvent: (event: SyntheticEvent) => void;
}

export function ImageNodeGridSplitOverlay({
  gridSplitOverlay,
  gridSplitPreviewLayout,
  onStopSurfaceEvent,
}: ImageNodeGridSplitOverlayProps) {
  return (
    <div
      className="linghuiCompactGridOverlay nopan nodrag"
      style={gridSplitPreviewLayout ? cssVars(gridSplitPreviewLayout.frameStyle) : undefined}
      onMouseDown={onStopSurfaceEvent}
      onPointerDown={onStopSurfaceEvent}
    >
      {gridSplitPreviewLayout?.verticalLines.map((style, index) => (
        <div
          key={`v-${index}`}
          className="linghuiCompactGridLine isVertical"
          style={cssVars(style)}
        />
      ))}
      {gridSplitPreviewLayout?.horizontalLines.map((style, index) => (
        <div
          key={`h-${index}`}
          className="linghuiCompactGridLine isHorizontal"
          style={cssVars(style)}
        />
      ))}
      {gridSplitPreviewLayout?.cells.map(cell => {
        const isSelected = gridSplitOverlay.selectedCells.includes(cell.index);
        return (
          <button
            key={cell.index}
            type="button"
            className={`linghuiCompactGridCell ${isSelected ? 'isSelected' : ''}`}
            style={cssVars(cell.style)}
            onClick={(event) => {
              onStopSurfaceEvent(event);
              gridSplitOverlay.toggleCell(cell.index);
            }}
          >
            <span>{cell.index + 1}</span>
          </button>
        );
      })}
    </div>
  );
}

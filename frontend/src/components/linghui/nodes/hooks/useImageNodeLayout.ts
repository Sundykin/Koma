import { useMemo, type CSSProperties } from 'react';
import type { LinghuiImageNodeProperties } from '../../../../types/linghui';
import type { LinghuiResolvedImageCollection } from '../../editors/state/linghuiImageCollections';
import { cssVars } from '../../../../theme/runtime';
import { resolveMediaCardSize } from '../state/linghuiNodeCardSizing';
import { buildGridSplitPreviewLayout, type GridSplitPreviewLayout } from '../state/imageNodeGridSplitLayout';
import type { LinghuiGridSplitOverlayState } from '../state/LinghuiNodeRunsContext';

interface ImageNodeLayoutParams {
  collection: LinghuiResolvedImageCollection;
  properties: LinghuiImageNodeProperties;
  displayItemCount: number;
  isExpanded: boolean;
  status: string;
  statusColor: string;
  selected: boolean;
  accent?: string;
  progress?: number;
  gridSplitOverlay: LinghuiGridSplitOverlayState | null;
}

export interface ImageNodeLayoutState {
  expandedWidth: number;
  expandedHeight: number;
  nodeStyle: CSSProperties;
  expandedDeckStyle?: CSSProperties;
  gridSplitPreviewLayout: GridSplitPreviewLayout | null;
}

export function useImageNodeLayout({
  collection,
  properties,
  displayItemCount,
  isExpanded,
  status,
  statusColor,
  selected,
  accent,
  progress,
  gridSplitOverlay,
}: ImageNodeLayoutParams): ImageNodeLayoutState {
  const mediaCardLayout = useMemo(() => {
    const metadataAspectRatio = typeof collection.primary?.metadata?.aspectRatio === 'string'
      ? collection.primary.metadata.aspectRatio
      : undefined;

    return resolveMediaCardSize({
      width: collection.primary?.width,
      height: collection.primary?.height,
      aspectRatio: metadataAspectRatio || properties.aspectRatio,
    });
  }, [collection.primary, properties.aspectRatio]);
  const expandedColumns = Math.min(2, Math.max(1, displayItemCount));
  const expandedRows = Math.max(1, Math.ceil(displayItemCount / 2));
  const expandedGap = 12;
  const expandedWidth = isExpanded
    ? (mediaCardLayout.width * expandedColumns) + (expandedGap * Math.max(0, expandedColumns - 1))
    : mediaCardLayout.width;
  const expandedHeight = isExpanded
    ? (mediaCardLayout.height * expandedRows) + (expandedGap * Math.max(0, expandedRows - 1))
    : mediaCardLayout.height;
  const nodeStyle = useMemo(() => cssVars({
    ...mediaCardLayout.style,
    '--linghui-node-width': `${expandedWidth}px`,
    '--linghui-thumb-height': `${expandedHeight}px`,
    '--linghui-node-min-height': `${expandedHeight}px`,
    '--linghui-base-node-width': `${mediaCardLayout.width}px`,
    '--linghui-base-thumb-height': `${mediaCardLayout.height}px`,
    '--linghui-node-shadow': status !== 'idle'
      ? `0 0 0 1px color-mix(in srgb, ${statusColor} 66%, transparent), 0 12px 28px color-mix(in srgb, var(--token-bg-app) 32%, transparent)`
      : selected
        ? '0 0 0 1px color-mix(in srgb, var(--token-text-primary) 8%, transparent), 0 12px 24px color-mix(in srgb, var(--token-bg-app) 26%, transparent)'
        : 'none',
    '--linghui-accent': accent,
    '--linghui-progress': `${progress ?? 0}%`,
  }), [
    accent,
    expandedHeight,
    expandedWidth,
    mediaCardLayout.height,
    mediaCardLayout.style,
    mediaCardLayout.width,
    progress,
    selected,
    status,
    statusColor,
  ]);
  const expandedDeckStyle = useMemo(() => (
    isExpanded
      ? cssVars({
          '--linghui-expanded-grid-columns': `repeat(${expandedColumns}, ${mediaCardLayout.width}px)`,
          '--linghui-expanded-grid-auto-rows': `${mediaCardLayout.height}px`,
        })
      : undefined
  ), [expandedColumns, isExpanded, mediaCardLayout.height, mediaCardLayout.width]);
  const primaryAspectRatio = useMemo(() => {
    const metadataAspectRatio = typeof collection.primary?.metadata?.aspectRatio === 'string'
      ? collection.primary.metadata.aspectRatio
      : undefined;
    return metadataAspectRatio || properties.aspectRatio;
  }, [collection.primary?.metadata, properties.aspectRatio]);
  const gridSplitPreviewLayout = useMemo(() => {
    if (!gridSplitOverlay) {
      return null;
    }

    return buildGridSplitPreviewLayout({
      containerWidth: expandedWidth,
      containerHeight: expandedHeight,
      imageWidth: collection.primary?.width,
      imageHeight: collection.primary?.height,
      aspectRatio: primaryAspectRatio,
      gridSize: gridSplitOverlay.gridSize,
    });
  }, [
    collection.primary?.height,
    collection.primary?.width,
    expandedHeight,
    expandedWidth,
    gridSplitOverlay,
    primaryAspectRatio,
  ]);

  return {
    expandedWidth,
    expandedHeight,
    nodeStyle,
    expandedDeckStyle,
    gridSplitPreviewLayout,
  };
}

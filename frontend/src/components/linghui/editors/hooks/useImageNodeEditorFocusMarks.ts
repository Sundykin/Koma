import { useCallback } from 'react';
import type { MessageInstance } from 'antd/es/message/interface';
import type {
  LinghuiImageFocusRegion,
  LinghuiImageMarkPoint,
} from '../../../../types/linghui';
import {
  LINGHUI_IMAGE_MARK_POINT_LIMIT,
  normalizeLinghuiImageFocusRegion,
} from '../../../../types/linghui';
import type { LinghuiFocusRegionAxis } from '../components/ImageNodeEditorFocusMarkPanels';
import {
  buildFocusRegionPatch,
  createLinghuiImageMarkPoint,
} from '../components/ImageNodeEditorUtils';

export function useImageNodeEditorFocusMarks(params: {
  currentImageSource: string;
  focusRegion: unknown;
  message: MessageInstance;
  normalizedMarkPoints: LinghuiImageMarkPoint[];
  onToolChange: (tool: null) => void;
  updateProp: (key: string, value: unknown, options?: { markStale?: boolean }) => void;
}): {
  handleAddCenterMarkPoint: (target: HTMLDivElement) => void;
  handleClearMarkPoints: () => void;
  handleDisableFocusRegion: () => void;
  handleEnableFocusRegion: () => void;
  handleMarkStageClick: (event: React.MouseEvent<HTMLDivElement>) => void;
  handleRemoveMarkPoint: (pointId: string) => void;
  updateFocusRegion: (patch: Partial<LinghuiImageFocusRegion>) => void;
  updateFocusRegionAxis: (axis: LinghuiFocusRegionAxis, rawValue: number) => void;
} {
  const {
    currentImageSource,
    focusRegion,
    message,
    normalizedMarkPoints,
    onToolChange,
    updateProp,
  } = params;

  const updateFocusRegion = useCallback((patch: Partial<LinghuiImageFocusRegion>) => {
    if (!currentImageSource) {
      message.info('请先导入或生成一张图片');
      return;
    }

    const nextFocusRegion = buildFocusRegionPatch(
      normalizeLinghuiImageFocusRegion(focusRegion),
      patch,
      currentImageSource,
    );
    updateProp('focusRegion', nextFocusRegion);
  }, [currentImageSource, focusRegion, message, updateProp]);

  const updateFocusRegionAxis = useCallback((axis: LinghuiFocusRegionAxis, rawValue: number) => {
    const numeric = Math.max(0, Math.min(1, rawValue));
    updateFocusRegion({ [axis]: numeric });
  }, [updateFocusRegion]);

  const handleEnableFocusRegion = useCallback(() => {
    updateFocusRegion({ enabled: true });
  }, [updateFocusRegion]);

  const handleDisableFocusRegion = useCallback(() => {
    const previous = normalizeLinghuiImageFocusRegion(focusRegion);
    updateProp('focusRegion', previous ? { ...previous, enabled: false } : null);
    onToolChange(null);
  }, [focusRegion, onToolChange, updateProp]);

  const updateMarkPoints = useCallback((nextPoints: LinghuiImageMarkPoint[]) => {
    updateProp('markPoints', nextPoints);
  }, [updateProp]);

  const handleMarkStageClick = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (!currentImageSource) {
      message.info('请先导入或生成一张图片');
      return;
    }
    if (normalizedMarkPoints.length >= LINGHUI_IMAGE_MARK_POINT_LIMIT) {
      message.warning(`焦点选择最多支持 ${LINGHUI_IMAGE_MARK_POINT_LIMIT} 个标记点`);
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return;
    }
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    const nextPoint = createLinghuiImageMarkPoint({
      x,
      y,
      source: currentImageSource,
      index: normalizedMarkPoints.length,
    });
    updateMarkPoints([...normalizedMarkPoints, nextPoint]);
  }, [currentImageSource, message, normalizedMarkPoints, updateMarkPoints]);

  const handleAddCenterMarkPoint = useCallback((target: HTMLDivElement) => {
    const rect = target.getBoundingClientRect();
    const point = createLinghuiImageMarkPoint({
      x: 0.5,
      y: 0.5,
      source: currentImageSource,
      index: normalizedMarkPoints.length,
    });
    if (rect.width > 0 && rect.height > 0 && normalizedMarkPoints.length < LINGHUI_IMAGE_MARK_POINT_LIMIT) {
      updateMarkPoints([...normalizedMarkPoints, point]);
    }
  }, [currentImageSource, normalizedMarkPoints, updateMarkPoints]);

  const handleRemoveMarkPoint = useCallback((pointId: string) => {
    updateMarkPoints(normalizedMarkPoints.filter(point => point.id !== pointId));
  }, [normalizedMarkPoints, updateMarkPoints]);

  const handleClearMarkPoints = useCallback(() => {
    updateMarkPoints([]);
    onToolChange(null);
  }, [onToolChange, updateMarkPoints]);

  return {
    handleAddCenterMarkPoint,
    handleClearMarkPoints,
    handleDisableFocusRegion,
    handleEnableFocusRegion,
    handleMarkStageClick,
    handleRemoveMarkPoint,
    updateFocusRegion,
    updateFocusRegionAxis,
  };
}

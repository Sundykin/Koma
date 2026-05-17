import { useCallback, useState } from 'react';
import type { ReactFlowInstance } from '@xyflow/react';
import type { MessageInstance } from 'antd/es/message/interface';
import { computeLinghuiCanvasElkLayout, type LinghuiCanvasOutlierNode } from '../state/linghuiCanvasLayout';

interface LayoutReviewState {
  previousPositions: Record<string, { x: number; y: number }>;
}

interface OutlierNoticeState {
  nodes: LinghuiCanvasOutlierNode[];
  currentIndex: number;
}

interface UseLinghuiCanvasLayoutParams {
  reactFlow: ReactFlowInstance;
  setNodes: (updater: (nodes: any[]) => any[]) => void;
  message: MessageInstance;
  focusContent: () => void;
  scheduleSnapshot: (options?: { force?: boolean }) => void;
}

export function useLinghuiCanvasLayout({
  reactFlow,
  setNodes,
  message,
  focusContent,
  scheduleSnapshot,
}: UseLinghuiCanvasLayoutParams) {
  const [layoutReview, setLayoutReview] = useState<LayoutReviewState | null>(null);
  const [isLayouting, setIsLayouting] = useState(false);
  const [outlierNotice, setOutlierNotice] = useState<OutlierNoticeState | null>(null);

  const handleFormatLayout = useCallback(async () => {
    if (isLayouting) return;
    const currentNodes = reactFlow.getNodes();
    if (currentNodes.length <= 1) {
      focusContent();
      return;
    }

    setIsLayouting(true);
    try {
      const result = await computeLinghuiCanvasElkLayout(currentNodes, reactFlow.getEdges());
      const updateMap = new Map(result.updates.map(update => [update.id, update.position]));
      setOutlierNotice(result.outlierNodes.length > 0
        ? { nodes: result.outlierNodes, currentIndex: 0 }
        : null);

      if (updateMap.size === 0) {
        message.info('画布布局已整齐');
        focusContent();
        return;
      }

      const previousPositions: LayoutReviewState['previousPositions'] = {};
      for (const node of currentNodes) {
        if (updateMap.has(node.id)) {
          previousPositions[node.id] = { x: node.position.x, y: node.position.y };
        }
      }

      setNodes(existingNodes => existingNodes.map(node => {
        const nextPosition = updateMap.get(node.id);
        return nextPosition ? { ...node, position: nextPosition } : node;
      }));
      setLayoutReview({ previousPositions });
      requestAnimationFrame(() => {
        focusContent();
      });
    } catch (error) {
      console.error('[LinghuiCanvas] format layout failed', error);
      message.error('整理画布失败，请稍后重试');
    } finally {
      setIsLayouting(false);
    }
  }, [focusContent, isLayouting, message, reactFlow, setNodes]);

  const handleRestoreLayout = useCallback(() => {
    if (!layoutReview) return;
    const previousPositions = layoutReview.previousPositions;
    setNodes(existingNodes => existingNodes.map(node => {
      const previousPosition = previousPositions[node.id];
      return previousPosition ? { ...node, position: previousPosition } : node;
    }));
    setLayoutReview(null);
    requestAnimationFrame(() => {
      scheduleSnapshot({ force: true });
      focusContent();
    });
  }, [focusContent, layoutReview, scheduleSnapshot, setNodes]);

  const handleKeepLayout = useCallback(() => {
    setLayoutReview(null);
    requestAnimationFrame(() => {
      scheduleSnapshot({ force: true });
    });
  }, [scheduleSnapshot]);

  const handleNavigateToOutlier = useCallback(() => {
    setOutlierNotice(current => {
      if (!current || current.nodes.length === 0) return current;
      const target = current.nodes[current.currentIndex] ?? current.nodes[0];
      reactFlow.setCenter(target.cx, target.cy, {
        duration: 280,
        zoom: Math.max(reactFlow.getViewport().zoom, 0.75),
      });
      return {
        ...current,
        currentIndex: current.nodes.length > 1
          ? (current.currentIndex + 1) % current.nodes.length
          : current.currentIndex,
      };
    });
  }, [reactFlow]);

  const handleDismissOutliers = useCallback(() => {
    setOutlierNotice(null);
  }, []);

  return {
    layoutReview,
    isLayouting,
    outlierNotice,
    setLayoutReview,
    setIsLayouting,
    setOutlierNotice,
    handleFormatLayout,
    handleRestoreLayout,
    handleKeepLayout,
    handleNavigateToOutlier,
    handleDismissOutliers,
  };
}

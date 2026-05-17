import { useCallback } from 'react';
import type { ReactFlowInstance } from '@xyflow/react';

export function useLinghuiCanvasViewportControls(reactFlow: ReactFlowInstance) {
  const zoomIn = useCallback(() => {
    reactFlow.zoomIn({ duration: 180 });
  }, [reactFlow]);

  const zoomOut = useCallback(() => {
    reactFlow.zoomOut({ duration: 180 });
  }, [reactFlow]);

  const focusContent = useCallback(() => {
    reactFlow.fitView({ padding: 0.12, duration: 240 });
  }, [reactFlow]);

  const zoomToPreset = useCallback((zoom: number) => {
    reactFlow.zoomTo(zoom, { duration: 220 });
  }, [reactFlow]);

  return {
    zoomIn,
    zoomOut,
    focusContent,
    zoomToPreset,
  };
}

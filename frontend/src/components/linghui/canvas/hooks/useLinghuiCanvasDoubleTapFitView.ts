import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';

const DOUBLE_TAP_MAX_DELAY_MS = 320;
const DOUBLE_TAP_MAX_DISTANCE_PX = 42;

export interface LinghuiCanvasTapPoint {
  time: number;
  x: number;
  y: number;
}

export function shouldTriggerLinghuiDoubleTapFitView(
  previous: LinghuiCanvasTapPoint | null,
  current: LinghuiCanvasTapPoint,
): boolean {
  if (!previous) {
    return false;
  }

  const delay = current.time - previous.time;
  if (delay <= 0 || delay > DOUBLE_TAP_MAX_DELAY_MS) {
    return false;
  }

  const distance = Math.hypot(current.x - previous.x, current.y - previous.y);
  return distance <= DOUBLE_TAP_MAX_DISTANCE_PX;
}

export function useLinghuiCanvasDoubleTapFitView(params: {
  hostRef: RefObject<HTMLElement | null>;
  onFitView: () => void;
}): void {
  const { hostRef, onFitView } = params;
  const lastTapRef = useRef<LinghuiCanvasTapPoint | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return;
    }

    const target = host.querySelector<HTMLElement>('.react-flow__pane') ?? host;
    const handleTouchEnd = (event: TouchEvent) => {
      if (event.touches.length > 0 || event.changedTouches.length !== 1) {
        lastTapRef.current = null;
        return;
      }

      const touch = event.changedTouches[0];
      const currentTap = {
        time: Date.now(),
        x: touch.clientX,
        y: touch.clientY,
      };

      if (shouldTriggerLinghuiDoubleTapFitView(lastTapRef.current, currentTap)) {
        event.preventDefault();
        lastTapRef.current = null;
        onFitView();
        return;
      }

      lastTapRef.current = currentTap;
    };

    target.addEventListener('touchend', handleTouchEnd, { passive: false });
    return () => target.removeEventListener('touchend', handleTouchEnd);
  }, [hostRef, onFitView]);
}

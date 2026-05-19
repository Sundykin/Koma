import React from 'react';
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useLinghuiCanvasInteractionHelpers } from '../hooks/useLinghuiCanvasInteractionHelpers';
import type { PendingConnectionCreateState } from '../state/linghuiCanvasShared';

const pendingConnection: PendingConnectionCreateState = {
  sourceNodeId: 'image-1',
  sourceHandleId: 'output-0',
  sourceDataType: 'image',
};

function Harness({
  pendingRef,
  setInteracting,
  onReady,
}: {
  pendingRef: React.MutableRefObject<PendingConnectionCreateState | null>;
  setInteracting: (interacting: boolean) => void;
  onReady: (helpers: ReturnType<typeof useLinghuiCanvasInteractionHelpers>) => void;
}) {
  const helpers = useLinghuiCanvasInteractionHelpers({
    setNodes: vi.fn(),
    setEdges: vi.fn(),
    setEditorSelection: vi.fn(),
    setActiveNodeTool: vi.fn(),
    setPendingGroupFrame: vi.fn(),
    closeContextMenu: vi.fn(),
    closeQuickCreate: vi.fn(),
    openContextMenuAt: vi.fn(),
    deleteNodesByIds: vi.fn(),
    deleteEdgesByIds: vi.fn(),
    nodeRuns: {},
    pendingConnectionCreateRef: pendingRef,
    setInteracting,
  });

  React.useEffect(() => {
    onReady(helpers);
  }, [helpers, onReady]);

  return null;
}

describe('useLinghuiCanvasInteractionHelpers', () => {
  it('Esc cancel clears pending connection and exits LibTV interacting state', () => {
    const pendingRef = { current: pendingConnection };
    const setInteracting = vi.fn();
    const onPointerUp = vi.fn();
    let helpers: ReturnType<typeof useLinghuiCanvasInteractionHelpers> | null = null;

    window.addEventListener('pointerup', onPointerUp);
    render(
      <Harness
        pendingRef={pendingRef}
        setInteracting={setInteracting}
        onReady={value => { helpers = value; }}
      />,
    );

    expect(helpers?.cancelPendingConnection()).toBe(true);
    expect(pendingRef.current).toBeNull();
    expect(setInteracting).toHaveBeenCalledWith(false);
    expect(onPointerUp).toHaveBeenCalledTimes(1);
    window.removeEventListener('pointerup', onPointerUp);
  });

  it('returns false without touching interacting state when no connection is pending', () => {
    const pendingRef = { current: null };
    const setInteracting = vi.fn();
    let helpers: ReturnType<typeof useLinghuiCanvasInteractionHelpers> | null = null;

    render(
      <Harness
        pendingRef={pendingRef}
        setInteracting={setInteracting}
        onReady={value => { helpers = value; }}
      />,
    );

    expect(helpers?.cancelPendingConnection()).toBe(false);
    expect(setInteracting).not.toHaveBeenCalled();
  });
});

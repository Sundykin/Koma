import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LinghuiCanvasHud } from '../components/LinghuiCanvasHud';

function renderHud(runSummary: {
  running: number;
  failed: number;
  stale: number;
  queued: number;
  queueStatus: 'idle' | 'running' | 'canceling' | 'completed' | 'failed' | 'canceled';
}, actions?: {
  onRetryFailed?: () => void;
  onFocusFailedNode?: () => void;
}) {
  return render(
    <LinghuiCanvasHud
      canvasMode="hand"
      zoom={1}
      showMiniMap={false}
      snapToGrid
      shortcutPanelOpen={false}
      layoutReviewPending={false}
      isLayouting={false}
      runSummary={runSummary}
      showEmpty={false}
      onRetryFailed={actions?.onRetryFailed}
      onFocusFailedNode={actions?.onFocusFailedNode}
      onSetCanvasMode={vi.fn()}
      onToggleMiniMap={vi.fn()}
      onToggleSnapToGrid={vi.fn()}
      onFormatLayout={vi.fn()}
      onRestoreLayout={vi.fn()}
      onKeepLayout={vi.fn()}
      onNavigateToOutlier={vi.fn()}
      onDismissOutliers={vi.fn()}
      onToggleShortcutPanel={vi.fn()}
      onZoomOut={vi.fn()}
      onFocusContent={vi.fn()}
      onZoomIn={vi.fn()}
      onZoomToPreset={vi.fn()}
    />,
  );
}

describe('LinghuiCanvasHud', () => {
  it('不把内部 stale 状态展示为待重跑操作', () => {
    renderHud({
      running: 0,
      failed: 0,
      stale: 4,
      queued: 0,
      queueStatus: 'idle',
    });

    expect(screen.getByLabelText('画布就绪')).toBeInTheDocument();
    expect(screen.queryByText(/待重跑|重跑受影响/)).not.toBeInTheDocument();
  });

  it('只保留明确的失败恢复动作', () => {
    const onRetryFailed = vi.fn();
    const onFocusFailedNode = vi.fn();
    renderHud({
      running: 0,
      failed: 2,
      stale: 3,
      queued: 0,
      queueStatus: 'idle',
    }, { onRetryFailed, onFocusFailedNode });

    expect(screen.getByLabelText('运行失败')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '重试失败节点' }));
    fireEvent.click(screen.getByRole('button', { name: '查看失败节点' }));
    expect(onRetryFailed).toHaveBeenCalledTimes(1);
    expect(onFocusFailedNode).toHaveBeenCalledTimes(1);
  });
});

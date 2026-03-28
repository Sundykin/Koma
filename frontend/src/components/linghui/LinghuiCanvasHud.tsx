import React from 'react';
import { Focus, Hand, MousePointer2, ZoomIn, ZoomOut } from 'lucide-react';
import type { LinghuiCanvasMode, LinghuiExecutionQueueState } from '../../types/linghui';

interface LinghuiCanvasHudProps {
  projectEntry?: React.ReactNode;
  canvasMode: LinghuiCanvasMode;
  zoom: number;
  runSummary: {
    running: number;
    failed: number;
    stale: number;
    queued: number;
    queueStatus: LinghuiExecutionQueueState['status'];
  };
  showEmpty: boolean;
  onOpenHistory: () => void;
  onFocusFailedNode?: () => void;
  onRetryFailed?: () => void;
  onRerunAffected?: () => void;
  onCancelRun?: () => void;
  onSetCanvasMode: (mode: LinghuiCanvasMode) => void;
  onZoomOut: () => void;
  onFocusContent: () => void;
  onZoomIn: () => void;
}

export const LinghuiCanvasHud: React.FC<LinghuiCanvasHudProps> = ({
  projectEntry,
  canvasMode,
  zoom,
  runSummary,
  showEmpty,
  onOpenHistory,
  onFocusFailedNode,
  onRetryFailed,
  onRerunAffected,
  onCancelRun,
  onSetCanvasMode,
  onZoomOut,
  onFocusContent,
  onZoomIn,
}) => {
  const isCanceling = runSummary.queueStatus === 'canceling';
  const hasQueue = runSummary.running > 0 || runSummary.queued > 0 || isCanceling;
  const badgeLabel = isCanceling
    ? `取消中 · 排队 ${runSummary.queued}`
    : hasQueue
      ? `${runSummary.queued > 0 ? `排队 ${runSummary.queued} · ` : ''}运行中 ${runSummary.running}`
      : '画布就绪';

  return (
    <>
    <div className="linghuiCanvasBackdrop" aria-hidden="true">
      <div className="linghuiCanvasNebula" />
      <div className="linghuiCanvasStarField isPrimary" />
      <div className="linghuiCanvasStarField isSecondary" />
    </div>

    <div className="linghuiCanvasHud nopan nowheel">
      {projectEntry}
      <button
        type="button"
        className="linghuiCanvasRunBadge"
        onClick={onOpenHistory}
        title="打开历史记录与最近运行结果"
      >
        {badgeLabel}
        {runSummary.failed > 0 && <span className="isWarn">失败 {runSummary.failed}</span>}
        {runSummary.stale > 0 && <span className="isMuted">待重跑 {runSummary.stale}</span>}
      </button>
      {runSummary.failed > 0 && onRetryFailed && !hasQueue && (
        <button
          type="button"
          className="linghuiCanvasRunAction isWarn"
          onClick={onRetryFailed}
          title="重新执行失败节点"
        >
          重试失败
        </button>
      )}
      {runSummary.failed > 0 && onFocusFailedNode && (
        <button
          type="button"
          className="linghuiCanvasRunAction isWarn"
          onClick={onFocusFailedNode}
          title="快速定位失败节点"
        >
          跳到失败
        </button>
      )}
      {runSummary.stale > 0 && onRerunAffected && (
        <button
          type="button"
          className="linghuiCanvasRunAction isMuted"
          onClick={onRerunAffected}
          title="只重跑受影响的节点"
        >
          重跑受影响
        </button>
      )}
      {hasQueue && onCancelRun && (
        <button
          type="button"
          className={`linghuiCanvasRunAction ${isCanceling ? 'isMuted' : 'isWarn'}`}
          onClick={onCancelRun}
          disabled={isCanceling}
          title="取消当前执行队列"
        >
          {isCanceling ? '取消中' : '取消执行'}
        </button>
      )}
    </div>

    <div className="linghuiCanvasTools nopan nowheel">
      <button
        type="button"
        className={`linghuiCanvasToolButton ${canvasMode === 'mouse' ? 'isActive' : ''}`}
        onClick={() => onSetCanvasMode('mouse')}
        title="鼠标模式：滚轮平移画布，双指捏合或工具按钮缩放"
      >
        <MousePointer2 size={15} />
      </button>
      <button
        type="button"
        className={`linghuiCanvasToolButton ${canvasMode === 'hand' ? 'isActive' : ''}`}
        onClick={() => onSetCanvasMode('hand')}
        title="手模式：拖动画布，滚轮缩放"
      >
        <Hand size={15} />
      </button>
      <span className="linghuiCanvasToolDivider" />
      <button
        type="button"
        className="linghuiCanvasToolButton"
        onClick={onZoomOut}
        title="缩小"
      >
        <ZoomOut size={15} />
      </button>
      <button
        type="button"
        className="linghuiCanvasToolButton"
        onClick={onFocusContent}
        title="适配内容"
      >
        <Focus size={15} />
      </button>
      <button
        type="button"
        className="linghuiCanvasToolButton"
        onClick={onZoomIn}
        title="放大"
      >
        <ZoomIn size={15} />
      </button>
      <span className="linghuiCanvasZoomBadge">{Math.round(zoom * 100)}%</span>
    </div>

    {showEmpty && (
      <div className="linghuiCanvasEmpty">
        <div className="linghuiCanvasEmptyTitle">正在准备灵绘工作区</div>
        <div className="linghuiCanvasEmptyDesc">节点创建、拖拽、工作流块整理和自动保存会在这里生效。</div>
      </div>
    )}
  </>
  );
};

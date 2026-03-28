import React from 'react';
import { Focus, Hand, MousePointer2, ZoomIn, ZoomOut } from 'lucide-react';
import type { LinghuiCanvasMode } from '../../types/linghui';

interface LinghuiCanvasHudProps {
  canvasMode: LinghuiCanvasMode;
  zoom: number;
  runSummary: {
    running: number;
    failed: number;
    stale: number;
  };
  showEmpty: boolean;
  onOpenHistory: () => void;
  onSetCanvasMode: (mode: LinghuiCanvasMode) => void;
  onZoomOut: () => void;
  onFocusContent: () => void;
  onZoomIn: () => void;
}

export const LinghuiCanvasHud: React.FC<LinghuiCanvasHudProps> = ({
  canvasMode,
  zoom,
  runSummary,
  showEmpty,
  onOpenHistory,
  onSetCanvasMode,
  onZoomOut,
  onFocusContent,
  onZoomIn,
}) => (
  <>
    <div className="linghuiCanvasBackdrop" aria-hidden="true">
      <div className="linghuiCanvasNebula" />
      <div className="linghuiCanvasStarField isPrimary" />
      <div className="linghuiCanvasStarField isSecondary" />
    </div>

    <div className="linghuiCanvasHud nopan nowheel">
      <button
        type="button"
        className="linghuiCanvasRunBadge"
        onClick={onOpenHistory}
        title="打开历史记录与最近运行结果"
      >
        {runSummary.running > 0 ? `运行中 ${runSummary.running}` : '画布就绪'}
        {runSummary.failed > 0 && <span className="isWarn">失败 {runSummary.failed}</span>}
        {runSummary.stale > 0 && <span className="isMuted">待重跑 {runSummary.stale}</span>}
      </button>
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
        <div className="linghuiCanvasEmptyDesc">节点创建、拖拽、分组和自动保存会在这里生效。</div>
      </div>
    )}
  </>
);

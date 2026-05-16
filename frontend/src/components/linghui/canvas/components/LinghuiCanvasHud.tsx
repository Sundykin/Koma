import React from 'react';
import {
  Check,
  ChevronDown,
  Focus,
  Hand,
  Keyboard,
  Magnet,
  MapPinned,
  Minus,
  MousePointer2,
  Play,
  PlayCircle,
  Plus,
  RotateCcw,
  Workflow,
  X,
} from 'lucide-react';
import type {
  LinghuiCanvasMode,
  LinghuiExecutionQueueState,
} from '../../../../types/linghui';

interface LinghuiCanvasOutlierNotice {
  count: number;
  currentIndex: number;
}

interface LinghuiCanvasHudProps {
  projectEntry?: React.ReactNode;
  canvasMode: LinghuiCanvasMode;
  zoom: number;
  showMiniMap: boolean;
  snapToGrid: boolean;
  shortcutPanelOpen: boolean;
  layoutReviewPending: boolean;
  isLayouting: boolean;
  outlierNotice?: LinghuiCanvasOutlierNotice | null;
  runSummary: {
    running: number;
    failed: number;
    stale: number;
    queued: number;
    queueStatus: LinghuiExecutionQueueState['status'];
  };
  showEmpty: boolean;
  onFocusFailedNode?: () => void;
  onRetryFailed?: () => void;
  onRerunAffected?: () => void;
  onCancelRun?: () => void;
  onRunAll?: () => void;
  onRunSelection?: () => void;
  onSetCanvasMode: (mode: LinghuiCanvasMode) => void;
  onToggleMiniMap: () => void;
  onToggleSnapToGrid: () => void;
  onFormatLayout: () => void;
  onRestoreLayout: () => void;
  onKeepLayout: () => void;
  onNavigateToOutlier: () => void;
  onDismissOutliers: () => void;
  onToggleShortcutPanel: () => void;
  onZoomOut: () => void;
  onFocusContent: () => void;
  onZoomIn: () => void;
  onZoomToPreset: (zoom: number) => void;
}

export const LinghuiCanvasHud: React.FC<LinghuiCanvasHudProps> = ({
  projectEntry,
  canvasMode,
  zoom,
  showMiniMap,
  snapToGrid,
  shortcutPanelOpen,
  layoutReviewPending,
  isLayouting,
  outlierNotice,
  runSummary,
  showEmpty,
  onFocusFailedNode,
  onRetryFailed,
  onRerunAffected,
  onCancelRun,
  onRunAll,
  onRunSelection,
  onSetCanvasMode,
  onToggleMiniMap,
  onToggleSnapToGrid,
  onFormatLayout,
  onRestoreLayout,
  onKeepLayout,
  onNavigateToOutlier,
  onDismissOutliers,
  onToggleShortcutPanel,
  onZoomOut,
  onFocusContent,
  onZoomIn,
  onZoomToPreset,
}) => {
  const isCanceling = runSummary.queueStatus === 'canceling';
  const hasQueue = runSummary.running > 0 || runSummary.queued > 0 || isCanceling;
  const hasAttention = runSummary.failed > 0 || runSummary.stale > 0;
  const badgeLabel = isCanceling
    ? `取消中 · 排队 ${runSummary.queued}`
    : hasQueue
      ? `${runSummary.queued > 0 ? `排队 ${runSummary.queued} · ` : ''}运行中 ${runSummary.running}`
      : hasAttention
        ? '需要处理'
        : '画布就绪';

  return (
    <>
      {projectEntry ? (
        <div className="linghuiCanvasLeftRail nopan nowheel">
          {projectEntry}
        </div>
      ) : null}

      <div className="linghuiCanvasStatusDock nopan nowheel">
        <div
          className={`linghuiCanvasRunBadge ${hasQueue ? 'isRunning' : ''} ${runSummary.failed > 0 ? 'hasFailure' : ''}`}
          aria-label={badgeLabel}
        >
          {badgeLabel}
          {runSummary.failed > 0 && <span className="isWarn">失败 {runSummary.failed}</span>}
          {runSummary.stale > 0 && <span className="isMuted">待重跑 {runSummary.stale}</span>}
        </div>
        {runSummary.failed > 0 && onRetryFailed && !hasQueue && (
          <button
            type="button"
            className="linghuiCanvasRunAction isWarn"
            onClick={onRetryFailed}
            title="重新执行失败节点"
          >
            重试
          </button>
        )}
        {runSummary.failed > 0 && onFocusFailedNode && (
          <button
            type="button"
            className="linghuiCanvasRunAction isWarn"
            onClick={onFocusFailedNode}
            title="快速定位失败节点"
          >
            定位失败
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

      {outlierNotice && outlierNotice.count > 0 ? (
        <div className="linghuiCanvasOutlierNotice nopan nowheel">
          <span>有 {outlierNotice.count} 个离群节点</span>
          <button type="button" onClick={onNavigateToOutlier}>
            {outlierNotice.count === 1
              ? '定位节点'
              : `定位下一个 (${outlierNotice.currentIndex + 1}/${outlierNotice.count})`}
          </button>
          <button
            type="button"
            className="isIconOnly"
            aria-label="关闭"
            onClick={onDismissOutliers}
          >
            <X size={14} />
          </button>
        </div>
      ) : null}

      {layoutReviewPending ? (
        <div className="linghuiCanvasLayoutReview nopan nowheel">
          <span>是否保留此次整理结果？</span>
          <button type="button" onClick={onRestoreLayout}>
            <RotateCcw size={13} />
            还原
          </button>
          <button type="button" className="isPrimary" onClick={onKeepLayout}>
            <Check size={13} />
            保留
          </button>
        </div>
      ) : null}

      <div className="linghuiCanvasControls nopan nowheel" aria-label="画布控制">
        {onRunAll && !hasQueue && (
          <button
            type="button"
            className="linghuiCanvasControlButton isRunPrimary"
            onClick={onRunAll}
            title="生成执行计划并运行整个画布"
          >
            <PlayCircle size={15} />
            <span>运行全部</span>
          </button>
        )}
        {onRunSelection && !hasQueue && (
          <button
            type="button"
            className="linghuiCanvasControlButton isRun"
            onClick={onRunSelection}
            title="运行当前选中的节点或工作流块"
          >
            <Play size={14} />
            <span>运行选中</span>
          </button>
        )}
        {(onRunAll || onRunSelection) && !hasQueue ? (
          <span className="linghuiCanvasControlDivider" />
        ) : null}
        <button
          type="button"
          className={`linghuiCanvasControlButton ${layoutReviewPending ? 'isActive' : ''}`}
          onClick={onFormatLayout}
          disabled={isLayouting}
          title="整理画布（Alt+Shift+F）"
          aria-label="整理画布"
        >
          <Workflow size={15} />
        </button>
        <button
          type="button"
          className={`linghuiCanvasControlButton ${showMiniMap ? 'isActive' : ''}`}
          onClick={onToggleMiniMap}
          title="画布小地图"
          aria-label="切换小地图"
        >
          <MapPinned size={15} />
        </button>
        <button
          type="button"
          className={`linghuiCanvasControlButton ${snapToGrid ? 'isActive' : ''}`}
          onClick={onToggleSnapToGrid}
          title="网格吸附"
          aria-label="网格吸附"
        >
          <Magnet size={15} />
        </button>
        <span className="linghuiCanvasControlDivider" />
        <button
          type="button"
          className={`linghuiCanvasControlButton ${canvasMode === 'hand' ? 'isActive' : ''}`}
          onClick={() => onSetCanvasMode('hand')}
          title="手模式（ComfyUI 风格，默认）：左键拖动空白处平移画布；滚轮缩放；Shift+拖动框选"
        >
          <Hand size={15} />
        </button>
        <button
          type="button"
          className={`linghuiCanvasControlButton ${canvasMode === 'mouse' ? 'isActive' : ''}`}
          onClick={() => onSetCanvasMode('mouse')}
          title="鼠标模式（Figma 风格）：左键框选；中键/右键拖动平移；滚轮缩放"
        >
          <MousePointer2 size={15} />
        </button>
        <span className="linghuiCanvasControlDivider" />
        <button
          type="button"
          className="linghuiCanvasControlButton"
          onClick={onZoomOut}
          title="缩小"
        >
          <Minus size={15} />
        </button>
        <div className="linghuiCanvasZoomMenu">
          <button
            type="button"
            className="linghuiCanvasZoomTrigger"
            title="缩放选项"
            aria-label="缩放选项"
          >
            <span>{Math.round(zoom * 100)}%</span>
            <ChevronDown size={12} />
          </button>
          <div className="linghuiCanvasZoomDropdown">
            <button type="button" onClick={onZoomIn}>放大 <span>⌘ +</span></button>
            <button type="button" onClick={onZoomOut}>缩小 <span>⌘ -</span></button>
            <button type="button" onClick={onFocusContent}>适合屏幕 <span>⇧ 1</span></button>
            <hr />
            <button type="button" onClick={() => onZoomToPreset(0.5)}>缩放至50%</button>
            <button type="button" onClick={() => onZoomToPreset(1)}>缩放至100%</button>
            <button type="button" onClick={() => onZoomToPreset(2)}>缩放至200%</button>
          </div>
        </div>
        <button
          type="button"
          className="linghuiCanvasControlButton"
          onClick={onZoomIn}
          title="放大"
        >
          <Plus size={15} />
        </button>
        <button
          type="button"
          className="linghuiCanvasControlButton"
          onClick={onFocusContent}
          title="适合屏幕"
          aria-label="适合屏幕"
        >
          <Focus size={15} />
        </button>
        <span className="linghuiCanvasControlDivider" />
        <button
          type="button"
          className={`linghuiCanvasControlButton ${shortcutPanelOpen ? 'isActive' : ''}`}
          onClick={onToggleShortcutPanel}
          title="快捷键"
          aria-label="快捷键"
        >
          <Keyboard size={15} />
        </button>
      </div>

      {shortcutPanelOpen ? (
        <div className="linghuiCanvasShortcutPanel nopan nowheel">
          <header>
            <strong>快捷键</strong>
            <button type="button" onClick={onToggleShortcutPanel} aria-label="关闭快捷键面板">
              <X size={14} />
            </button>
          </header>
          <div className="linghuiCanvasShortcutGrid">
            <section>
              <h3>创作</h3>
              <p><span>⌘ / Ctrl + Enter</span> 生成</p>
              <p><span>Tab</span> 新建节点</p>
              <p><span>⌘ / Ctrl + C</span> 节点复制</p>
              <p><span>⌥ / Alt + 拖动节点</span> 创建副本</p>
            </section>
            <section>
              <h3>缩放</h3>
              <p><span>⌘ / Ctrl + +</span> 放大</p>
              <p><span>⌘ / Ctrl + -</span> 缩小</p>
              <p><span>Shift + 1</span> 适合屏幕</p>
              <p><span>触控板</span> 捏合缩放</p>
            </section>
            <section>
              <h3>移动画布</h3>
              <p><span>Space</span> 临时移动画布</p>
              <p><span>手模式</span> 拖动画布</p>
              <p><span>鼠标模式</span> 框选节点</p>
              <p><span>Alt + Shift + F</span> 整理画布</p>
            </section>
            <section>
              <h3>其他</h3>
              <p><span>Delete / Backspace</span> 删除</p>
              <p><span>⌘ / Ctrl + Z</span> 撤销</p>
              <p><span>⇧ + ⌘ / Ctrl + Z</span> 重做</p>
              <p><span>?</span> 快捷键</p>
            </section>
          </div>
        </div>
      ) : null}

      {showEmpty && (
        <div className="linghuiCanvasEmpty">
          <div className="linghuiCanvasEmptyTitle">画布已就绪</div>
          <div className="linghuiCanvasEmptyDesc">双击空白快速创建节点，或从左侧贴边按钮打开资源入口。</div>
        </div>
      )}
    </>
  );
};

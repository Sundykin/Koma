import React from 'react';
import { Focus, Hand, ListChecks, MousePointer2, Play, PlayCircle, ZoomIn, ZoomOut } from 'lucide-react';
import type {
  LinghuiCanvasMode,
  LinghuiExecutionLogEntry,
  LinghuiExecutionQueueState,
} from '../../../../types/linghui';

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
  onRunAll?: () => void;
  onRunSelection?: () => void;
  executionLogs?: LinghuiExecutionLogEntry[];
  onFocusLogNode?: (nodeId: string) => void;
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
  onRunAll,
  onRunSelection,
  executionLogs = [],
  onFocusLogNode,
  onSetCanvasMode,
  onZoomOut,
  onFocusContent,
  onZoomIn,
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
  const recentLogs = executionLogs.slice(-5).reverse();
  const shouldShowLogs = hasQueue || runSummary.failed > 0 || recentLogs.some(entry => entry.level === 'error');

  return (
    <>
      {projectEntry ? (
        <div className="linghuiCanvasLeftRail nopan nowheel">
          {projectEntry}
        </div>
      ) : null}

      <div className="linghuiCanvasStatusDock nopan nowheel">
        <button
          type="button"
          className={`linghuiCanvasRunBadge ${hasQueue ? 'isRunning' : ''} ${runSummary.failed > 0 ? 'hasFailure' : ''}`}
          onClick={onOpenHistory}
          title="打开历史记录与最近运行结果"
        >
          {badgeLabel}
          {runSummary.failed > 0 && <span className="isWarn">失败 {runSummary.failed}</span>}
          {runSummary.stale > 0 && <span className="isMuted">待重跑 {runSummary.stale}</span>}
        </button>
        {onRunAll && !hasQueue && (
          <button
            type="button"
            className="linghuiCanvasRunAction isPrimary"
            onClick={onRunAll}
            title="生成执行计划并运行整个画布"
          >
            <PlayCircle size={14} />
            <span>运行全部</span>
          </button>
        )}
        {onRunSelection && !hasQueue && (
          <button
            type="button"
            className="linghuiCanvasRunAction"
            onClick={onRunSelection}
            title="运行当前选中的节点或工作流块"
          >
            <Play size={13} />
            <span>运行选中</span>
          </button>
        )}
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
        {shouldShowLogs && recentLogs.length > 0 && (
          <div className="linghuiCanvasRunLog">
            <div className="linghuiCanvasRunLogHeader">
              <ListChecks size={13} />
              <span>执行日志</span>
            </div>
            <div className="linghuiCanvasRunLogList">
              {recentLogs.map(entry => (
                <button
                  key={entry.id}
                  type="button"
                  className={`linghuiCanvasRunLogItem is-${entry.level} ${entry.nodeId ? 'isFocusable' : ''}`}
                  onClick={() => {
                    if (entry.nodeId) {
                      onFocusLogNode?.(entry.nodeId);
                    }
                  }}
                  disabled={!entry.nodeId}
                  title={entry.nodeId ? '定位相关节点' : entry.message}
                >
                  <span className="linghuiCanvasRunLogTime">
                    {new Date(entry.createdAt).toLocaleTimeString()}
                  </span>
                  <span className="linghuiCanvasRunLogMessage">{entry.message}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="linghuiCanvasTools nopan nowheel">
        <button
          type="button"
          className={`linghuiCanvasToolButton ${canvasMode === 'hand' ? 'isActive' : ''}`}
          onClick={() => onSetCanvasMode('hand')}
          title="手模式（ComfyUI 风格，默认）：左键拖动空白处平移画布；滚轮缩放；Shift+拖动框选"
        >
          <Hand size={15} />
        </button>
        <button
          type="button"
          className={`linghuiCanvasToolButton ${canvasMode === 'mouse' ? 'isActive' : ''}`}
          onClick={() => onSetCanvasMode('mouse')}
          title="鼠标模式（Figma 风格）：左键框选；中键/右键拖动平移；滚轮缩放"
        >
          <MousePointer2 size={15} />
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
          <div className="linghuiCanvasEmptyTitle">画布已就绪</div>
          <div className="linghuiCanvasEmptyDesc">双击空白快速创建节点，或从左侧贴边按钮打开资源入口。</div>
        </div>
      )}
    </>
  );
};

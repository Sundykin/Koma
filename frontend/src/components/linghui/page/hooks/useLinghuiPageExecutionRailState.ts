import { useCallback, useMemo } from 'react';
import type { MessageInstance } from 'antd/es/message/interface';
import type {
  LinghuiExecutionLogEntry,
  LinghuiExecutionQueueState,
  LinghuiNodeRunState,
} from '../../../../types/linghui';
import type { LinghuiCanvasHandle } from '../../canvas/components/LinghuiCanvas';

interface UseLinghuiPageExecutionRailStateParams {
  canvasRef: React.RefObject<LinghuiCanvasHandle | null>;
  executionBatchesRef: React.MutableRefObject<Set<AbortController>>;
  message: MessageInstance;
  nodeRuns: Record<string, LinghuiNodeRunState>;
  runWorkflow: (
    targetNodeIds?: string[],
    options?: {
      resolveTargetsOnly?: boolean;
      successMessage?: string;
    },
  ) => Promise<void>;
  setExecutionQueue: React.Dispatch<React.SetStateAction<LinghuiExecutionQueueState | null>>;
  workspaceLogs: LinghuiExecutionLogEntry[];
}

export function useLinghuiPageExecutionRailState({
  canvasRef,
  executionBatchesRef,
  message,
  nodeRuns,
  runWorkflow,
  setExecutionQueue,
  workspaceLogs,
}: UseLinghuiPageExecutionRailStateParams) {
  const failedNodeIds = useMemo(() => Object.entries(nodeRuns)
    .filter(([, item]) => item.status === 'failed')
    .sort((left, right) => (right[1].updatedAt ?? 0) - (left[1].updatedAt ?? 0))
    .map(([nodeId]) => nodeId), [nodeRuns]);

  const handleFocusFailedNode = useCallback(() => {
    const targetNodeId = failedNodeIds[0];
    if (!targetNodeId) {
      message.info('当前没有失败节点');
      return;
    }
    canvasRef.current?.focusNodes([targetNodeId], { select: true });
  }, [canvasRef, failedNodeIds, message]);

  const handleFocusLogNode = useCallback((nodeId: string) => {
    if (!nodeId) {
      return;
    }
    canvasRef.current?.focusNodes([nodeId], { select: true });
  }, [canvasRef]);

  const executionLogItems = useMemo(
    () => workspaceLogs.slice(-24).reverse(),
    [workspaceLogs],
  );

  const executionLogErrorCount = useMemo(
    () => workspaceLogs.filter(entry => entry.level === 'error').length,
    [workspaceLogs],
  );

  const executionLogLatest = executionLogItems[0];

  const handleRetryFailed = useCallback(async () => {
    if (failedNodeIds.length === 0) {
      message.info('当前没有失败节点');
      return;
    }

    await runWorkflow(failedNodeIds, {
      resolveTargetsOnly: true,
      successMessage: '已重试失败节点',
    });
  }, [failedNodeIds, message, runWorkflow]);

  const handleCancelRun = useCallback(() => {
    const activeControllers = Array.from(executionBatchesRef.current).filter(
      controller => !controller.signal.aborted,
    );
    if (activeControllers.length === 0) {
      message.info('当前没有正在执行的队列');
      return;
    }

    for (const controller of activeControllers) {
      controller.abort('用户取消了本轮灵绘执行');
    }
    setExecutionQueue(current => current ? {
      ...current,
      status: 'canceling',
      updatedAt: Date.now(),
    } : current);
    message.info('已请求取消，当前节点结束后将停止后续队列');
  }, [executionBatchesRef, message, setExecutionQueue]);

  return {
    executionLogErrorCount,
    executionLogItems,
    executionLogLatest,
    handleCancelRun,
    handleFocusFailedNode,
    handleFocusLogNode,
    handleRetryFailed,
  };
}

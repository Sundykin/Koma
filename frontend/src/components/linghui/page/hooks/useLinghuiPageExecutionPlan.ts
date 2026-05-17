import { useCallback, useState } from 'react';
import type { MessageInstance } from 'antd/es/message/interface';
import type { LinghuiNodeRunState, LinghuiWorkspaceDocument } from '../../../../types/linghui';
import type { LinghuiCanvasHandle } from '../../canvas/components/LinghuiCanvas';
import { detectLinghuiRunningNodeBlocks } from '../../execution/state/linghuiExecution';
import {
  buildLinghuiExecutionPlan,
  type LinghuiExecutionPlan,
} from '../../execution/state/linghuiExecutionPlan';

interface PendingLinghuiExecutionPlanRequest {
  plan: LinghuiExecutionPlan;
  scopeLabel: string;
  targetNodeIds?: string[];
  options?: {
    resolveTargetsOnly?: boolean;
    successMessage?: string;
  };
}

export function useLinghuiPageExecutionPlan(params: {
  activeWorkspaceRef: React.MutableRefObject<LinghuiWorkspaceDocument | null>;
  canvasRef: React.MutableRefObject<LinghuiCanvasHandle | null>;
  message: MessageInstance;
  runWorkflow: (targetNodeIds?: string[], options?: {
    resolveTargetsOnly?: boolean;
    successMessage?: string;
  }) => Promise<void>;
  workflowLogger: {
    warn: (message: string, meta?: Record<string, unknown>) => void;
  };
}): {
  pendingExecutionPlan: PendingLinghuiExecutionPlanRequest | null;
  handleCancelExecutionPlan: () => void;
  handleConfirmExecutionPlan: () => Promise<void>;
  openExecutionPlan: (
    scopeLabel: string,
    targetNodeIds?: string[],
    options?: {
      resolveTargetsOnly?: boolean;
      successMessage?: string;
    },
  ) => Promise<void>;
} {
  const {
    activeWorkspaceRef,
    canvasRef,
    message,
    runWorkflow,
    workflowLogger,
  } = params;
  const [pendingExecutionPlan, setPendingExecutionPlan] = useState<PendingLinghuiExecutionPlanRequest | null>(null);

  const openExecutionPlan = useCallback(async (
    scopeLabel: string,
    targetNodeIds?: string[],
    options?: {
      resolveTargetsOnly?: boolean;
      successMessage?: string;
    },
  ) => {
    const context = canvasRef.current?.getExecutionContext();
    const currentWorkspace = activeWorkspaceRef.current;
    if (!context || !currentWorkspace) {
      return;
    }

    const requestedTargetNodeIds = targetNodeIds?.length ? [...new Set(targetNodeIds)] : undefined;
    const contextNodeIds = new Set(context.nodes.map(node => node.id));
    const missingTargetNodeIds = requestedTargetNodeIds?.filter(nodeId => !contextNodeIds.has(nodeId)) ?? [];
    const runnableTargetNodeIds = requestedTargetNodeIds?.filter(nodeId => contextNodeIds.has(nodeId));

    if (missingTargetNodeIds.length > 0) {
      workflowLogger.warn('灵绘执行计划目标节点缺失，可能尚未同步到画布', {
        requestedTargetNodeIds,
        runnableTargetNodeIds,
        missingTargetNodeIds,
      });
    }

    if (requestedTargetNodeIds && runnableTargetNodeIds?.length === 0) {
      message.error('目标节点尚未同步到画布，请稍后重试');
      return;
    }

    try {
      const previousRuns = currentWorkspace.nodeRuns as Record<string, LinghuiNodeRunState>;
      const plan = buildLinghuiExecutionPlan({
        context,
        targetNodeIds: runnableTargetNodeIds ?? requestedTargetNodeIds,
        previousRuns,
      });
      const runningNodeBlocks = detectLinghuiRunningNodeBlocks({
        context,
        targetNodeIds: runnableTargetNodeIds ?? requestedTargetNodeIds,
        previousRuns,
        resolveTargetsOnly: options?.resolveTargetsOnly,
      });
      if (runningNodeBlocks.length > 0) {
        const firstRunning = runningNodeBlocks[0];
        const content = runningNodeBlocks.length === 1
          ? `「${firstRunning.label}」仍在执行中，请等待当前轮询完成或先取消执行`
          : `${runningNodeBlocks.length} 个节点仍在执行中，请等待当前轮询完成或先取消执行`;
        message.warning(content);
        canvasRef.current?.focusNodes([firstRunning.nodeId], { select: true });
        return;
      }
      setPendingExecutionPlan({
        plan,
        scopeLabel,
        targetNodeIds: runnableTargetNodeIds ?? requestedTargetNodeIds,
        options,
      });
    } catch (error: any) {
      message.error(error?.message || '生成执行计划失败');
    }
  }, [activeWorkspaceRef, canvasRef, message, workflowLogger]);

  const handleCancelExecutionPlan = useCallback(() => {
    setPendingExecutionPlan(null);
  }, []);

  const handleConfirmExecutionPlan = useCallback(async () => {
    const pendingPlan = pendingExecutionPlan;
    if (!pendingPlan) {
      return;
    }
    setPendingExecutionPlan(null);
    await runWorkflow(pendingPlan.targetNodeIds, pendingPlan.options);
  }, [pendingExecutionPlan, runWorkflow]);

  return {
    pendingExecutionPlan,
    handleCancelExecutionPlan,
    handleConfirmExecutionPlan,
    openExecutionPlan,
  };
}

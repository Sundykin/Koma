import { useCallback } from 'react';
import type { MessageInstance } from 'antd/es/message/interface';
import type { LinghuiNodeRunState, LinghuiWorkspaceDocument } from '../../../../types/linghui';
import type { LinghuiCanvasHandle } from '../../canvas/components/LinghuiCanvas';
import { exportLinghuiNodeResults } from '../../execution/state/linghuiResultExport';

export function useLinghuiPageExportSelection(params: {
  activeWorkspaceRef: React.MutableRefObject<LinghuiWorkspaceDocument | null>;
  canvasRef: React.MutableRefObject<LinghuiCanvasHandle | null>;
  message: MessageInstance;
  workspaceRuntimeRef: React.MutableRefObject<{
    nodeRuns: Record<string, LinghuiNodeRunState>;
  }>;
}): (selectionIds?: string[]) => Promise<void> {
  const {
    activeWorkspaceRef,
    canvasRef,
    message,
    workspaceRuntimeRef,
  } = params;

  return useCallback(async (selectionIds?: string[]) => {
    const currentWorkspace = activeWorkspaceRef.current;
    if (!currentWorkspace) {
      message.info('请先打开一个灵绘工作区');
      return;
    }

    const rawSelectionIds = selectionIds?.length
      ? selectionIds
      : (canvasRef.current?.getSelectionIds() ?? []);
    const targetIds = canvasRef.current?.resolveExecutionTargetIds(rawSelectionIds) ?? [];

    if (!rawSelectionIds.length || !targetIds.length) {
      message.info('请先选中需要导出的节点或工作流块');
      return;
    }

    const nodeById = new Map(currentWorkspace.graphData.nodes.map(node => [node.id, node]));
    const targets = targetIds.flatMap(nodeId => {
      const node = nodeById.get(nodeId);
      return node ? [{
        node,
        runState: workspaceRuntimeRef.current.nodeRuns[nodeId],
      }] : [];
    });

    if (!targets.length) {
      message.info('当前选中的节点还没有可导出的结果');
      return;
    }

    try {
      const summary = await exportLinghuiNodeResults({
        workspaceName: currentWorkspace.name,
        targets,
      });

      if (!summary) {
        return;
      }

      if (summary.nodeCount === 0) {
        message.warning('当前选中的节点还没有可导出的结果');
        return;
      }

      const skippedCount = summary.skippedNodeIds.length;
      const summaryText = skippedCount > 0
        ? `已导出 ${summary.nodeCount} 个节点，共 ${summary.fileCount} 个文件，跳过 ${skippedCount} 个无结果节点`
        : `已导出 ${summary.nodeCount} 个节点，共 ${summary.fileCount} 个文件`;
      message.success(summaryText);
    } catch (error: any) {
      message.error(error?.message || '导出灵绘结果失败');
    }
  }, [activeWorkspaceRef, canvasRef, message, workspaceRuntimeRef]);
}

import { useCallback, useMemo } from 'react';
import type { LinghuiImageToolKey, LinghuiVideoToolKey } from '../../../../types/linghui';

interface UseLinghuiCanvasNodeApiParams {
  bindNodeSurface: (nodeId: string) => import('../../nodes/state/LinghuiNodeRunsContext').LinghuiNodeInteractionHandlers;
  openNodeContextMenu: (nodeId: string, clientX: number, clientY: number) => void;
  openNodeEditor: (nodeId: string) => void;
  openNodeToolPanel: (toolState: any) => void;
  updateLinghuiNodeData: (nodeId: string, updater: any, options?: any) => void;
  onClearNodeRunState?: (nodeId: string) => void;
}

export function useLinghuiCanvasNodeApi({
  bindNodeSurface,
  openNodeContextMenu,
  openNodeEditor,
  openNodeToolPanel,
  updateLinghuiNodeData,
  onClearNodeRunState,
}: UseLinghuiCanvasNodeApiParams) {
  const nodeInteractionApi = useMemo(() => ({
    bindNodeSurface,
    openNodeContextMenu,
    openNodeEditor,
    openImageToolPanel(nodeId: string, tool: LinghuiImageToolKey) {
      openNodeToolPanel({ kind: 'image', nodeId, tool });
    },
    openVideoToolPanel(nodeId: string, tool: LinghuiVideoToolKey) {
      openNodeToolPanel({ kind: 'video', nodeId, tool });
    },
  }), [bindNodeSurface, openNodeContextMenu, openNodeEditor, openNodeToolPanel]);

  const clearNodeRunState = useCallback((nodeId: string) => {
    onClearNodeRunState?.(nodeId);
  }, [onClearNodeRunState]);

  const nodeMutationApi = useMemo(() => ({
    updateNodeData: updateLinghuiNodeData,
    clearNodeRunState,
  }), [clearNodeRunState, updateLinghuiNodeData]);

  return { nodeInteractionApi, nodeMutationApi };
}

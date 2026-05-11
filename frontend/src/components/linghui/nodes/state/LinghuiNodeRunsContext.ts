import { createContext, useContext, useMemo } from 'react';
import type { PointerEventHandler } from 'react';
import type {
  LinghuiCanvasMode,
  LinghuiCanvasSelection,
  LinghuiExecutionQueueState,
  LinghuiExecuteMultiAngleOptions,
  LinghuiGridType,
  LinghuiImageAssetItem,
  LinghuiMultiAngleConfig,
  LinghuiImageNodeProperties,
  LinghuiImageToolKey,
  LinghuiNodeData,
  LinghuiNodeRunState,
  LinghuiNodeToolState,
  LinghuiNodeType,
  LinghuiStoryboardFrame,
  LinghuiVideoToolKey,
} from '../../../../types/linghui';

export const LinghuiNodeRunsContext = createContext<Record<string, LinghuiNodeRunState>>({});

export function useNodeRunState(nodeId: string): LinghuiNodeRunState | undefined {
  const runs = useContext(LinghuiNodeRunsContext);
  return runs[nodeId];
}

export interface LinghuiGroupRunSummary {
  status: 'idle' | 'running' | 'failed' | 'stale' | 'succeeded' | 'partial';
  total: number;
  running: number;
  failed: number;
  stale: number;
  succeeded: number;
  idle: number;
  updatedAt?: number;
}

export const LinghuiGroupRunsContext = createContext<Record<string, LinghuiGroupRunSummary>>({});

export function useGroupRunSummary(groupId: string): LinghuiGroupRunSummary | undefined {
  return useContext(LinghuiGroupRunsContext)[groupId];
}

export interface LinghuiExecutionTraceState {
  edgeStatuses: Record<string, LinghuiNodeRunState['status']>;
  failedNodeIds: string[];
  staleNodeIds: string[];
}

const emptyExecutionTraceState: LinghuiExecutionTraceState = {
  edgeStatuses: {},
  failedNodeIds: [],
  staleNodeIds: [],
};

export const LinghuiExecutionTraceContext = createContext<LinghuiExecutionTraceState>(emptyExecutionTraceState);

export function useLinghuiExecutionTrace(): LinghuiExecutionTraceState {
  return useContext(LinghuiExecutionTraceContext);
}

export type ConnectionErrorHandler = (message: string) => void;
export const LinghuiConnectionErrorContext = createContext<ConnectionErrorHandler>(() => {});

export interface LinghuiNodeMutationOptions {
  markStale?: boolean;
}

export interface LinghuiNodeMutationApi {
  updateNodeData: (
    nodeId: string,
    updater: (prev: LinghuiNodeData) => LinghuiNodeData,
    options?: LinghuiNodeMutationOptions,
  ) => void;
  clearNodeRunState: (nodeId: string) => void;
}

const noopMutationApi: LinghuiNodeMutationApi = {
  updateNodeData: () => undefined,
  clearNodeRunState: () => undefined,
};

export const LinghuiNodeMutationContext = createContext<LinghuiNodeMutationApi>(noopMutationApi);

export function useLinghuiNodeMutation(): LinghuiNodeMutationApi {
  return useContext(LinghuiNodeMutationContext);
}

export interface LinghuiNodeInteractionHandlers {
  onPointerDown: PointerEventHandler<HTMLElement>;
  onPointerMove: PointerEventHandler<HTMLElement>;
  onPointerUp: PointerEventHandler<HTMLElement>;
  onPointerCancel: PointerEventHandler<HTMLElement>;
}

export interface LinghuiNodeInteractionApi {
  bindNodeSurface: (nodeId: string) => LinghuiNodeInteractionHandlers;
  openNodeContextMenu: (nodeId: string, clientX: number, clientY: number) => void;
  openImageToolPanel: (nodeId: string, tool: LinghuiImageToolKey) => void;
  openVideoToolPanel: (nodeId: string, tool: LinghuiVideoToolKey) => void;
}

const noopHandlers: LinghuiNodeInteractionHandlers = {
  onPointerDown: () => undefined,
  onPointerMove: () => undefined,
  onPointerUp: () => undefined,
  onPointerCancel: () => undefined,
};

const noopInteractionApi: LinghuiNodeInteractionApi = {
  bindNodeSurface: () => noopHandlers,
  openNodeContextMenu: () => undefined,
  openImageToolPanel: () => undefined,
  openVideoToolPanel: () => undefined,
};

export const LinghuiNodeInteractionContext = createContext<LinghuiNodeInteractionApi>(noopInteractionApi);
export const LinghuiCanvasModeContext = createContext<LinghuiCanvasMode>('mouse');
export const LinghuiCanvasZoomContext = createContext<number>(1);

export function useLinghuiNodeInteraction(nodeId: string): LinghuiNodeInteractionHandlers {
  const api = useContext(LinghuiNodeInteractionContext);
  return useMemo(() => api.bindNodeSurface(nodeId), [api, nodeId]);
}

export function useLinghuiCanvasMode(): LinghuiCanvasMode {
  return useContext(LinghuiCanvasModeContext);
}

export function useLinghuiCanvasZoom(): number {
  return useContext(LinghuiCanvasZoomContext);
}

export function useLinghuiNodeInteractionApi(): LinghuiNodeInteractionApi {
  return useContext(LinghuiNodeInteractionContext);
}

export interface LinghuiGridSplitOverlayState {
  nodeId: string | null;
  gridSize: number;
  selectedCells: number[];
  toggleCell: (index: number) => void;
}

const defaultGridSplitState: LinghuiGridSplitOverlayState = {
  nodeId: null,
  gridSize: 2,
  selectedCells: [],
  toggleCell: () => undefined,
};

export const LinghuiGridSplitContext = createContext<LinghuiGridSplitOverlayState>(defaultGridSplitState);

export function useLinghuiGridSplitOverlay(nodeId: string): LinghuiGridSplitOverlayState | null {
  const state = useContext(LinghuiGridSplitContext);
  if (state.nodeId !== nodeId) return null;
  return state;
}

export interface LinghuiNodeEditorApi {
  selection: LinghuiCanvasSelection;
  activeTool: LinghuiNodeToolState;
  setActiveTool: (tool: LinghuiNodeToolState) => void;
  closeEditor: () => void;
  canvasInteractionVersion: number;
  nodeRuns: Record<string, LinghuiNodeRunState>;
  executionQueue?: LinghuiExecutionQueueState | null;
  workspaceId: string | null;
  onAssetLibraryMutate?: () => void;
  onRunNode: (nodeId: string) => void;
  onDeriveScriptShots: (nodeId: string, shots: LinghuiStoryboardFrame[]) => void;
  onGenerateScriptImages: (nodeId: string, shots: LinghuiStoryboardFrame[]) => void;
  onGenerateScriptVideos: (nodeId: string, shots: LinghuiStoryboardFrame[]) => void;
  onCreateDerivedImportImages: (nodeId: string, items: LinghuiImageAssetItem[]) => void;
  onCreateDerivedMultiAngleImage?: (nodeId: string, options?: {
    prompt?: string;
    ttiSelection?: string;
    multiAngle?: Partial<LinghuiMultiAngleConfig>;
    label?: string;
  }) => string | null;
  onExecuteMultiAngle?: (options?: LinghuiExecuteMultiAngleOptions) => void;
  onApplyImageToolPreset?: (preset: {
    promptSnippet: string;
    properties?: Partial<LinghuiImageNodeProperties>;
  }) => void;
  onSetGridSplitType?: (type: LinghuiGridType) => void;
  onClearGridSplitCells?: () => void;
  onExecuteGridSplit?: () => void;
  gridSplitUpscaleFactor: 2 | 4;
  onSetGridSplitUpscaleFactor?: (factor: 2 | 4) => void;
  onRevertGridSplit?: () => void;
  /**
   * 3D 导演 split-view 绑定（key = director3d nodeId，value = 下游被绑预览的节点 id）
   * 跨会话持久化在 workspace.directorPreviewBindings 字段
   */
  directorPreviewBindings?: Record<string, string>;
  /** 设置 / 解绑 director3d 节点的预览源；previewNodeId 为 null/undefined 时表示解绑 */
  setDirectorPreviewBinding?: (directorNodeId: string, previewNodeId: string | null) => void;
  /** 串联跑 director3d + 预览节点（实时模式用，先让 director3d 重新落盘 lineart） */
  onRunDirectorWithPreview?: (directorNodeId: string, previewNodeId: string) => Promise<void> | void;
}

const noopNodeEditorApi: LinghuiNodeEditorApi = {
  selection: null,
  activeTool: null,
  setActiveTool: () => undefined,
  closeEditor: () => undefined,
  canvasInteractionVersion: 0,
  nodeRuns: {},
  executionQueue: null,
  workspaceId: null,
  onRunNode: () => undefined,
  onDeriveScriptShots: () => undefined,
  onGenerateScriptImages: () => undefined,
  onGenerateScriptVideos: () => undefined,
  onCreateDerivedImportImages: () => undefined,
  gridSplitUpscaleFactor: 2,
};

export const LinghuiNodeEditorContext = createContext<LinghuiNodeEditorApi>(noopNodeEditorApi);

export function useLinghuiNodeEditorApi(): LinghuiNodeEditorApi {
  return useContext(LinghuiNodeEditorContext);
}

export function useLinghuiNodeEditorVisibility(nodeId: string, nodeType: LinghuiNodeType): boolean {
  const selection = useContext(LinghuiNodeEditorContext).selection;
  return selection?.kind === 'node' && selection.nodeId === nodeId && selection.nodeType === nodeType;
}

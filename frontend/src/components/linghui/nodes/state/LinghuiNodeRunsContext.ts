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
  /**
   * 显式打开节点编辑器面板。供需要把"展开节点"绑定到节点内部按钮的场景（如 Director3D
   * 节点上的「打开工作台」按钮）使用 —— 整张卡片不再 click 即展开。
   */
  openNodeEditor: (nodeId: string) => void;
}

const noopHandlers: LinghuiNodeInteractionHandlers = {
  onPointerDown: () => undefined,
  onPointerMove: () => undefined,
  onPointerUp: () => undefined,
  onPointerCancel: () => undefined,
};

const noopInteractionApi: LinghuiNodeInteractionApi = {
  bindNodeSurface: () => noopHandlers,
  openNodeEditor: () => undefined,
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
  /**
   * 从"图片生成器"控制器节点派生一个下游图片展示节点：
   *  - 在控制器右下方新建 linghui/image 节点（mode='generate'），prompt / 模型 / 比例 / batch 全部复制
   *  - 自动连接 controller → image 的 edge
   *  - 自动触发执行，loading → 出图 / 失败的状态全部由展示节点的 nodeRun 体现
   *  - 控制器自己的 generatedImageNodeIds / generationCount 同步更新（保留历史链）
   * 返回新建展示节点的 id（便于测试 / 调试）
   */
  onGenerateImageFromController?: (controllerNodeId: string) => string | null;
  onCreateDerivedMultiAngleImage?: (nodeId: string, options?: {
    prompt?: string;
    ttiSelection?: string;
    multiAngle?: Partial<LinghuiMultiAngleConfig>;
    label?: string;
  }) => string | null;
  onExecuteImageUpscale?: (nodeId: string, options?: { factor?: 2 | 4 }) => void;
  onExecuteImageCrop?: (nodeId: string, options: { aspectRatio: string; label?: string }) => void;
  onCreatePanoramaPreview?: (nodeId: string) => void;
  onExecuteMultiAngle?: (options?: LinghuiExecuteMultiAngleOptions) => void;
  onApplyImageToolPreset?: (preset: {
    label?: string;
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
   * 视频工具：把当前视频节点的内嵌音轨分离成独立 audio 节点。
   * 对齐 LibTV "音频分离 → 音视频分离"，复用现有 FFmpeg splitAudio 链路。
   */
  onSeparateVideoAudio?: (nodeId: string) => void;

  /**
   * LibTV TextNode EmptyState 4 actions（15gvxu:55145-55256 eJ/eY/eV/eW）。
   * 在 TextNode "empty_generate" 视图态点击 4 个按钮时调用，派生上下游子图。
   * 详见 docs/libtv-text-node-deep-dive.md §3 与 useLinghuiCanvasDocumentOps.applyTextEmptyAction。
   */
  onApplyTextEmptyAction?: (nodeId: string, action: 'edit' | 'video' | 'image-prompt' | 'music') => string | null;

  /**
   * LibTV VideoNode EmptyState 2 actions（15gvxu:192400-192509 iU/iO）。
   * - 'first-frame'      派生 1 个 ImageNode（首帧）+ 自动连线 + 写 image-to-video capability
   * - 'first-last-frame' 派生 2 个 ImageNode（首帧 + 尾帧）+ 2 条连线 + 写 start-end-to-video capability
   * 详见 docs/libtv-video-node-deep-dive.md §3 与 useLinghuiCanvasDocumentOps.applyVideoEmptyAction。
   */
  onApplyVideoEmptyAction?: (nodeId: string, action: 'first-frame' | 'first-last-frame') => string | null;

  /**
   * LibTV AudioNode EmptyState 1 action（15gvxu:8668-8728 eH "音频生视频"）。
   * 派生右侧 VideoNode + 下方 ImageNode + 2 条边（audio→video + image→video），focus 切到新视频。
   */
  onApplyAudioEmptyAction?: (nodeId: string, action: 'audio-to-video') => string | null;
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

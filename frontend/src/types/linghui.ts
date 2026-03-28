export type LinghuiNodeType =
  | 'linghui/text'
  | 'linghui/image'
  | 'linghui/video'
  | 'linghui/audio'
  | 'linghui/script';

export type LinghuiRFNodeTypeKey =
  | 'linghui-text'
  | 'linghui-image'
  | 'linghui-video'
  | 'linghui-audio'
  | 'linghui-script';

export type LinghuiNodeCategory = 'creation' | 'storyboard';
export type LinghuiSlotDataType = 'image' | 'text' | 'video' | 'audio' | 'images' | 'shot' | 'storyboard';
export type LinghuiRunStatus = 'idle' | 'running' | 'succeeded' | 'failed' | 'stale';
export type LinghuiResultKind = 'image' | 'text' | 'video' | 'audio' | 'grid' | 'images' | 'shot' | 'storyboard';
export type LinghuiCanvasMode = 'mouse' | 'hand';
export type LinghuiImageNodeMode = 'import' | 'generate';
export type LinghuiImageToolKey = 'multi-angle' | 'outpaint' | 'relight' | 'repaint' | 'grid-split';
export type LinghuiVideoToolKey = 'upscale' | 'analyze' | 'compose';
export type LinghuiNodeViewMode = 'collapsed' | 'light' | 'immersive';
export type LinghuiNodeToolState =
  | { kind: 'image'; nodeId: string; tool: LinghuiImageToolKey }
  | { kind: 'video'; nodeId: string; tool: LinghuiVideoToolKey }
  | null;

// --- 图片节点 ---

export type LinghuiTextNodeMode = 'manual' | 'generate';
export type LinghuiScriptNodeMode = 'manual' | 'generate';
export type LinghuiScriptNodeViewMode = 'cards' | 'table';
export type LinghuiScriptDerivationKind = 'text' | 'image' | 'video-image' | 'video';

export interface LinghuiScriptDerivedProperties {
  scriptSourceNodeId?: string;
  scriptShotId?: string;
  scriptShotTitle?: string;
  scriptDerivationKind?: LinghuiScriptDerivationKind;
}

export interface LinghuiTextNodeProperties extends LinghuiScriptDerivedProperties {
  mode: LinghuiTextNodeMode;
  content: string;
  prompt: string;
  systemPrompt: string;
  llmConfigId: string;
}

export interface LinghuiScriptNodeProperties {
  mode: LinghuiScriptNodeMode;
  content: string;
  prompt: string;
  systemPrompt: string;
  llmConfigId: string;
  viewMode: LinghuiScriptNodeViewMode;
}

export type LinghuiGridType = 'none' | '2x2' | '3x3' | '4x4' | '5x5';

export interface LinghuiImageAssetItem {
  id: string;
  source: string;
  label?: string;
  width?: number;
  height?: number;
  mimeType?: string;
  aspectRatio?: string;
}

export interface LinghuiImageNodeProperties extends LinghuiScriptDerivedProperties {
  mode: LinghuiImageNodeMode;
  source: string;
  items?: LinghuiImageAssetItem[];
  primaryAssetId?: string;
  primaryResultSource?: string;
  prompt: string;
  ttiConfigId: string;
  aspectRatio: string;
  resolution: string;
  gridType: LinghuiGridType;
  batchCount: number;
}

// --- 视频节点 ---

export type LinghuiVideoRefMode = 'all-ref' | 'first-last-frame';

export interface LinghuiVideoNodeProperties extends LinghuiScriptDerivedProperties {
  prompt: string;
  itvConfigId: string;
  source: string;
  posterSource: string;
  refMode: LinghuiVideoRefMode;
  aspectRatio: string;
  resolution: string;
  duration: number;
}

// --- 音频节点 ---

export interface LinghuiAudioNodeProperties {
  source: string;
  prompt: string;
  ttsConfigId: string;
}

// --- 通用 ---

export interface LinghuiSlotDef {
  name: string;
  dataType: LinghuiSlotDataType;
}

export interface LinghuiNodeData {
  linghuiType: LinghuiNodeType;
  label: string;
  accent: string;
  background: string;
  viewMode?: LinghuiNodeViewMode;
  properties: Record<string, unknown>;
  inputs: LinghuiSlotDef[];
  outputs: LinghuiSlotDef[];
  active: boolean;
}

export interface LinghuiEdgeData {
  sourceSlotType?: LinghuiSlotDataType;
  targetSlotType?: LinghuiSlotDataType;
}

export interface LinghuiMediaItem {
  kind: 'image' | 'video' | 'audio';
  label?: string;
  source?: string;
  posterSource?: string;
  mimeType?: string;
  width?: number;
  height?: number;
  durationSec?: number;
  placeholder?: boolean;
  metadata?: Record<string, unknown>;
}

export interface LinghuiStoryboardFrame {
  id: string;
  title: string;
  description: string;
  durationSec: number;
  image?: LinghuiMediaItem;
}

export interface LinghuiNodeResult {
  kind: LinghuiResultKind;
  text?: string;
  primary?: LinghuiMediaItem;
  items?: LinghuiMediaItem[];
  shots?: LinghuiStoryboardFrame[];
  metadata?: Record<string, unknown>;
}

export interface LinghuiNodeRunState {
  status: LinghuiRunStatus;
  message?: string;
  error?: string;
  progress?: number;
  startedAt?: number;
  updatedAt?: number;
  result?: LinghuiNodeResult;
  upstreamIds?: string[];
}

export interface LinghuiExecutionLogEntry {
  id: string;
  level: 'info' | 'success' | 'error';
  message: string;
  nodeId?: string;
  createdAt: number;
}

export type LinghuiExecutionQueueStatus =
  | 'idle'
  | 'running'
  | 'canceling'
  | 'completed'
  | 'failed'
  | 'canceled';

export interface LinghuiExecutionQueueState {
  status: LinghuiExecutionQueueStatus;
  total: number;
  targetNodeIds: string[];
  queuedNodeIds: string[];
  runningNodeId?: string;
  completedNodeIds: string[];
  failedNodeIds: string[];
  canceledNodeIds: string[];
  startedAt?: number;
  updatedAt?: number;
}

export interface LinghuiViewportState {
  x: number;
  y: number;
  zoom: number;
}

export interface LinghuiRFNodeSnapshot {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: LinghuiNodeData;
  width?: number;
  height?: number;
  parentId?: string;
}

export interface LinghuiRFEdgeSnapshot {
  id: string;
  source: string;
  target: string;
  sourceHandle: string;
  targetHandle: string;
  type?: string;
  data?: LinghuiEdgeData;
}

export interface LinghuiRFGroupSnapshot {
  id: string;
  position: { x: number; y: number };
  data: LinghuiCanvasGroupData;
  style: { width: number; height: number };
}

export interface LinghuiCanvasGroupData {
  label: string;
  color: string;
  collapsed?: boolean;
}

export interface LinghuiSubgraphSnapshot {
  nodes: LinghuiRFNodeSnapshot[];
  edges: LinghuiRFEdgeSnapshot[];
  groups: LinghuiRFGroupSnapshot[];
}

export interface LinghuiGraphSnapshot extends LinghuiSubgraphSnapshot {
  version: number;
}

export interface LinghuiGraphStats {
  nodeCount: number;
  linkCount: number;
  groupCount: number;
}

export interface LinghuiWorkspaceMeta {
  id: string;
  name: string;
  description?: string;
  createdAt: number;
  updatedAt: number;
  lastOpenedAt: number;
  nodeCount: number;
  linkCount: number;
  groupCount: number;
}

export interface LinghuiWorkspaceDocument extends LinghuiWorkspaceMeta {
  viewport: LinghuiViewportState;
  graphData: LinghuiGraphSnapshot;
  nodeRuns: Record<string, LinghuiNodeRunState>;
  executionLogs: LinghuiExecutionLogEntry[];
}

export interface LinghuiNodeCatalogItem {
  type: LinghuiNodeType;
  label: string;
  description: string;
  category: LinghuiNodeCategory;
  accent: string;
}

export interface LinghuiExecutionContext {
  nodes: LinghuiRFNodeSnapshot[];
  edges: LinghuiRFEdgeSnapshot[];
  nodeOutputs: Record<string, LinghuiNodeResult>;
}

export type LinghuiCanvasSelection =
  | { kind: 'node'; nodeId: string; nodeType: LinghuiNodeType; label: string }
  | { kind: 'group'; groupId: string; label: string }
  | null;

export const DEFAULT_LINGHUI_VIEWPORT: LinghuiViewportState = {
  x: 0,
  y: 0,
  zoom: 1,
};

export const EMPTY_LINGHUI_GRAPH: LinghuiGraphSnapshot = {
  version: 2,
  nodes: [],
  edges: [],
  groups: [],
};

export const EMPTY_LINGHUI_NODE_RUNS: Record<string, LinghuiNodeRunState> = {};
export const EMPTY_LINGHUI_EXECUTION_LOGS: LinghuiExecutionLogEntry[] = [];

export const DEFAULT_LINGHUI_WORKSPACE_NAME = '未命名灵绘';

export function linghuiTypeToRFType(type: LinghuiNodeType): LinghuiRFNodeTypeKey {
  return type.replace(/\//g, '-') as LinghuiRFNodeTypeKey;
}

export function rfTypeToLinghuiType(rfType: string): LinghuiNodeType {
  return rfType.replace(/-/g, '/').replace('linghui/', 'linghui/') as LinghuiNodeType;
}

// 宫格尺寸映射
export function gridTypeToCount(gridType: LinghuiGridType): number {
  switch (gridType) {
    case '2x2': return 4;
    case '3x3': return 9;
    case '4x4': return 16;
    case '5x5': return 25;
    default: return 1;
  }
}

export const IMAGE_ASPECT_RATIOS = [
  { label: '1:1', value: '1:1' },
  { label: '3:4', value: '3:4' },
  { label: '4:3', value: '4:3' },
  { label: '16:9', value: '16:9' },
  { label: '9:16', value: '9:16' },
  { label: '21:9', value: '21:9' },
];

export const IMAGE_RESOLUTIONS = [
  { label: '自适应', value: 'auto' },
  { label: '1K', value: '1K' },
  { label: '2K', value: '2K' },
  { label: '4K', value: '4K' },
];

export const GRID_TYPES: Array<{ label: string; value: LinghuiGridType }> = [
  { label: '单图', value: 'none' },
  { label: '4宫格 (2×2)', value: '2x2' },
  { label: '9宫格 (3×3)', value: '3x3' },
  { label: '16宫格 (4×4)', value: '4x4' },
  { label: '25宫格 (5×5)', value: '5x5' },
];

export const LINGHUI_IMAGE_BATCH_COUNTS = [1, 2, 3, 4] as const;

export const VIDEO_ASPECT_RATIOS = [
  { label: '16:9', value: '16:9' },
  { label: '9:16', value: '9:16' },
  { label: '21:9', value: '21:9' },
  { label: '1:1', value: '1:1' },
];

export const VIDEO_RESOLUTIONS = [
  { label: '720P', value: '720P' },
  { label: '1080P', value: '1080P' },
];

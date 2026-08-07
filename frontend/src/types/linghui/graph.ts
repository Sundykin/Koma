/**
 * 灵绘图结构：槽位/节点数据/边/媒体项/结果类型/快照/工作区/执行上下文
 * （从 types/linghui.ts 拆出）
 */
import type {
  LinghuiNodeCategory,
  LinghuiNodeType,
  LinghuiNodeViewMode,
  LinghuiRFNodeTypeKey,
  LinghuiRunStatus,
  LinghuiSlotDataType,
  LinghuiImageNodeViewState,
} from './core';
import type {
  LinghuiGridType,
  LinghuiImageNodeProperties,
  LinghuiTextNodeProperties,
  LinghuiTextNodeViewState,
} from './imageNodes';
import type { LinghuiVideoNodeProperties, LinghuiVideoNodeViewState } from './videoNodes';
import type { AppSettings } from '../../types';

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

export type LinghuiImageMediaItem = LinghuiMediaItem & { kind: 'image' };
export type LinghuiVideoMediaItem = LinghuiMediaItem & { kind: 'video' };
export type LinghuiAudioMediaItem = LinghuiMediaItem & { kind: 'audio' };

export function isLinghuiImageMediaItem(item?: LinghuiMediaItem): item is LinghuiImageMediaItem {
  return item?.kind === 'image';
}

export function isLinghuiVideoMediaItem(item?: LinghuiMediaItem): item is LinghuiVideoMediaItem {
  return item?.kind === 'video';
}

export function isLinghuiAudioMediaItem(item?: LinghuiMediaItem): item is LinghuiAudioMediaItem {
  return item?.kind === 'audio';
}

export interface LinghuiStoryboardFrame {
  id: string;
  title: string;
  description: string;
  durationSec: number;
  image?: LinghuiImageMediaItem;
  hiddenUuid?: string;
  shotNumber?: number;
  plotDescription?: string;
  visualDescription?: string;
  characters?: Array<{
    characterName?: string;
    characterDescription?: string;
    characterImageUrl?: string;
  }>;
  scenes?: Array<{
    sceneName?: string;
    sceneDescription?: string;
    sceneImageUrl?: string;
  }>;
  props?: Array<{
    propName?: string;
    propDescription?: string;
    propImageUrl?: string;
  }>;
  productionAsset?: {
    id: string;
    kind: 'character' | 'scene' | 'prop';
    name: string;
  };
  videoReference?: {
    startTime?: number;
    endTime?: number;
    referenceFrameImage?: string;
  };
  shotSize?: string;
  characterAction?: string;
  emotion?: string;
  sceneTags?: string;
  lightingAndAtmosphere?: string;
  audioEffects?: string;
  dialogue?: string;
  imageGenerationPrompt?: string;
  videoMotionPrompt?: string;
}

export interface LinghuiNodeResultMetadata {
  description?: string;
  note?: string;
  [key: string]: unknown;
}

export interface LinghuiAgentToolCallTrace {
  kind: 'tool-call';
  toolCallId: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface LinghuiAgentToolResultTrace {
  kind: 'tool-result';
  toolCallId: string;
  name: string;
  result?: unknown;
  error?: string;
}

export type LinghuiAgentToolTraceEntry = LinghuiAgentToolCallTrace | LinghuiAgentToolResultTrace;

export interface LinghuiAgentExecutionMetadata extends LinghuiNodeResultMetadata {
  mode: 'agent';
  prompt: string;
  systemPrompt: string;
  llmSelection: string;
  enabledTools: string[];
  maxIterations: number;
  observedToolRounds: number;
  finishReason?: string;
  reasoning?: string;
  toolTrace: LinghuiAgentToolTraceEntry[];
  inputTextCount: number;
  inputImageCount: number;
}

export interface LinghuiTextResult {
  kind: 'text';
  text: string;
  metadata?: LinghuiNodeResultMetadata;
}

export interface LinghuiImageResult {
  kind: 'image' | 'shot';
  primary: LinghuiImageMediaItem;
  metadata?: LinghuiNodeResultMetadata;
}

export interface LinghuiImageCollectionResult {
  kind: 'images' | 'grid';
  primary: LinghuiImageMediaItem;
  items: LinghuiImageMediaItem[];
  metadata?: LinghuiNodeResultMetadata;
}

export interface LinghuiVideoResult {
  kind: 'video';
  primary: LinghuiVideoMediaItem;
  metadata?: LinghuiNodeResultMetadata;
}

export interface LinghuiAudioResult {
  kind: 'audio';
  primary: LinghuiAudioMediaItem;
  text?: string;
  metadata?: LinghuiNodeResultMetadata;
}

export interface LinghuiStoryboardResult {
  kind: 'storyboard';
  text: string;
  shots: LinghuiStoryboardFrame[];
  primary?: LinghuiImageMediaItem;
  metadata?: LinghuiNodeResultMetadata;
}

export type LinghuiNodeResult =
  | LinghuiTextResult
  | LinghuiImageResult
  | LinghuiImageCollectionResult
  | LinghuiVideoResult
  | LinghuiAudioResult
  | LinghuiStoryboardResult;

export function isLinghuiImageResult(result?: LinghuiNodeResult): result is LinghuiImageResult {
  return result?.kind === 'image' || result?.kind === 'shot';
}

export function isLinghuiImageCollectionResult(result?: LinghuiNodeResult): result is LinghuiImageCollectionResult {
  return result?.kind === 'images' || result?.kind === 'grid';
}

export function isLinghuiVideoResult(result?: LinghuiNodeResult): result is LinghuiVideoResult {
  return result?.kind === 'video';
}

export function isLinghuiAudioResult(result?: LinghuiNodeResult): result is LinghuiAudioResult {
  return result?.kind === 'audio';
}

export function isLinghuiStoryboardResult(result?: LinghuiNodeResult): result is LinghuiStoryboardResult {
  return result?.kind === 'storyboard';
}

export function isLinghuiTextResult(result?: LinghuiNodeResult): result is LinghuiTextResult {
  return result?.kind === 'text';
}

export function getLinghuiResultPrimaryMedia(result?: LinghuiNodeResult): LinghuiMediaItem | undefined {
  if (
    isLinghuiImageResult(result) ||
    isLinghuiImageCollectionResult(result) ||
    isLinghuiVideoResult(result) ||
    isLinghuiAudioResult(result)
  ) {
    return result.primary;
  }

  if (isLinghuiStoryboardResult(result)) {
    return result.primary;
  }

  return undefined;
}

export function getLinghuiResultItems(result?: LinghuiNodeResult): LinghuiMediaItem[] {
  return isLinghuiImageCollectionResult(result) ? result.items : [];
}

export function getLinghuiResultShots(result?: LinghuiNodeResult): LinghuiStoryboardFrame[] {
  return isLinghuiStoryboardResult(result) ? result.shots : [];
}

export function getLinghuiResultText(result?: LinghuiNodeResult): string | undefined {
  if (isLinghuiTextResult(result) || isLinghuiStoryboardResult(result) || isLinghuiAudioResult(result)) {
    return result.text;
  }

  return undefined;
}

export function getLinghuiResultDescriptionText(result?: LinghuiNodeResult): string | undefined {
  const description = typeof result?.metadata?.description === 'string' ? result.metadata.description.trim() : '';
  if (description) {
    return description;
  }

  const note = typeof result?.metadata?.note === 'string' ? result.metadata.note.trim() : '';
  return note || undefined;
}

export function getLinghuiResultItemCount(result?: LinghuiNodeResult): number {
  return isLinghuiImageCollectionResult(result) ? result.items.length : 0;
}

/**
 * 对齐 LibTV ImageNode 状态机（docs/libtv-imagenode-state-machine.md §2-3）。
 * - 优先级 generating > failed > resource > pending > empty_generate
 * - resource 判定：import 模式 / 有 source / 有 result 主图 / collection 任意 item
 * - pending：generate + 无图 + 已有上游连入
 */
export function resolveLinghuiImageNodeViewState(args: {
  properties: LinghuiImageNodeProperties;
  result?: LinghuiNodeResult;
  runStatus?: LinghuiRunStatus;
  hasIncomingEdge: boolean;
  /** 派生标记：collection.items 是否非空（由 caller 用 resolveLinghuiImageCollection 算好传入，避免 types 模块反向依赖）。 */
  hasCollectionItems?: boolean;
}): LinghuiImageNodeViewState {
  const { properties, result, runStatus, hasIncomingEdge, hasCollectionItems } = args;
  if (runStatus === 'running') return 'generating';
  if (runStatus === 'failed') return 'failed';
  const sourceLen = String(properties.source ?? '').trim().length;
  const primary = getLinghuiResultPrimaryMedia(result);
  const resultSourceLen = String(primary?.source ?? '').trim().length;
  if (properties.mode === 'import' || sourceLen > 0 || resultSourceLen > 0 || hasCollectionItems) {
    return 'resource';
  }
  if (hasIncomingEdge) return 'pending';
  return 'empty_generate';
}

/**
 * 对齐 LibTV VideoNode 状态机（chunk 15gvxu:191642-191652）。
 * - 优先级 generating > failed > resource > pending > empty_generate
 * - import 模式直接走 resource（与 LibTV VIDEO_RESOURCE 一致；纯参考节点不会进 empty/pending）
 * - resource 判定：有 source / 有 result primary 媒体 / mode==='import'
 * - pending：generate 模式 + 无 content + 已有上游连入
 */
export function resolveLinghuiVideoNodeViewState(args: {
  properties: LinghuiVideoNodeProperties;
  result?: LinghuiNodeResult;
  runStatus?: LinghuiRunStatus;
  hasIncomingEdge: boolean;
}): LinghuiVideoNodeViewState {
  const { properties, result, runStatus, hasIncomingEdge } = args;
  if (runStatus === 'running') return 'generating';
  if (runStatus === 'failed') return 'failed';
  const sourceLen = String(properties.source ?? '').trim().length;
  const primary = getLinghuiResultPrimaryMedia(result);
  const resultSourceLen = String(primary?.source ?? '').trim().length;
  if (properties.mode === 'import' || sourceLen > 0 || resultSourceLen > 0) return 'resource';
  if (hasIncomingEdge) return 'pending';
  return 'empty_generate';
}

/**
 * 对齐 LibTV TextNode 状态机（15gvxu:55066-55074）。
 * - 优先级 generating > failed > resource > pending > empty_generate
 * - resource 同时覆盖 LibTV `TEXT_RESOURCE` action（mode='manual'）：即使无 content 也走 resource，让"请编写内容"占位显示
 * - pending：generate 模式下、无 content 但已经有上游连入，等待上游产出
 */
export function resolveLinghuiTextNodeViewState(args: {
  properties: LinghuiTextNodeProperties;
  result?: LinghuiNodeResult;
  runStatus?: LinghuiRunStatus;
  hasIncomingEdge: boolean;
}): LinghuiTextNodeViewState {
  const { properties, result, runStatus, hasIncomingEdge } = args;
  if (runStatus === 'running') return 'generating';
  if (runStatus === 'failed') return 'failed';
  const contentLen = (properties.content ?? '').trim().length;
  const resultText = (getLinghuiResultText(result) ?? '').trim();
  if (properties.mode === 'manual' || contentLen > 0 || resultText.length > 0) return 'resource';
  if (hasIncomingEdge) return 'pending';
  return 'empty_generate';
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
  level: 'info' | 'success' | 'warn' | 'error';
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
  runningNodeIds: string[];
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
  sourceScriptNodeId?: string;
  storyboardTitle?: string;
  storyboardGroupType?: 'image' | 'video' | string;
  standaloneStoryboardImageGrid?: boolean;
  childNodeIds?: string[];
  storyboardManualGridCols?: number;
  storyboardManualGridRows?: number;
  showStoryboardShotNumbers?: boolean;
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
  /**
   * 3D 导演节点 → 预览节点 的绑定。
   * key 是 director3d nodeId，value 是被绑定用作 split-view 预览源的下游
   * image/video 节点 id。导演台 HUD 内的"实时预览窗"按这里取数。
   * 跨会话持久化，让用户重新打开工作区还能看到原来的绑定关系。
   */
  directorPreviewBindings?: Record<string, string>;
}

export interface LinghuiNodeCatalogItem {
  id?: string;
  type: LinghuiNodeType;
  label: string;
  description: string;
  category: LinghuiNodeCategory;
  accent: string;
  nodeLabel?: string;
  initialProperties?: Record<string, unknown>;
  recommendation?: string;
  targetSlotName?: string;
  targetSlotType?: LinghuiSlotDataType;
}

export interface LinghuiExecutionContext {
  nodes: LinghuiRFNodeSnapshot[];
  edges: LinghuiRFEdgeSnapshot[];
  nodeOutputs: Record<string, LinghuiNodeResult>;
  settingsSnapshot?: AppSettings;
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

const LINGHUI_TYPE_TO_RF_TYPE_MAP: Record<LinghuiNodeType, LinghuiRFNodeTypeKey> = {
  'linghui/text': 'linghui-text',
  'linghui/agent': 'linghui-agent',
  'linghui/image': 'linghui-image',
  'linghui/panorama': 'linghui-panorama',
  'linghui/video': 'linghui-video',
  'linghui/audio': 'linghui-audio',
  'linghui/script': 'linghui-script',
  'linghui/storyboard': 'linghui-storyboard',
  'linghui/director3d': 'linghui-director3d',
  'linghui/image-grid-slice': 'linghui-image-grid-slice',
  'linghui/video-clip': 'linghui-video-clip',
};

const RF_TYPE_TO_LINGHUI_TYPE_MAP: Record<LinghuiRFNodeTypeKey, LinghuiNodeType> = {
  'linghui-text': 'linghui/text',
  'linghui-agent': 'linghui/agent',
  'linghui-image': 'linghui/image',
  'linghui-panorama': 'linghui/panorama',
  'linghui-video': 'linghui/video',
  'linghui-audio': 'linghui/audio',
  'linghui-script': 'linghui/script',
  'linghui-storyboard': 'linghui/storyboard',
  'linghui-director3d': 'linghui/director3d',
  'linghui-image-grid-slice': 'linghui/image-grid-slice',
  'linghui-video-clip': 'linghui/video-clip',
};

/** 旧持久化迁移：linghui-image-generator → linghui-image (mode=generate)。下游 normalize 时同步处理 properties.mode。 */
const LEGACY_RF_TYPE_MIGRATION: Record<string, LinghuiNodeType> = {
  'linghui-image-generator': 'linghui/image',
};

export function linghuiTypeToRFType(type: LinghuiNodeType): LinghuiRFNodeTypeKey {
  return LINGHUI_TYPE_TO_RF_TYPE_MAP[type];
}

export function rfTypeToLinghuiType(rfType: string): LinghuiNodeType {
  return RF_TYPE_TO_LINGHUI_TYPE_MAP[rfType as LinghuiRFNodeTypeKey]
    ?? LEGACY_RF_TYPE_MIGRATION[rfType]
    ?? 'linghui/text';
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

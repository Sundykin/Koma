export type LinghuiNodeType =
  | 'linghui/reference-image'
  | 'linghui/prompt'
  | 'linghui/image-to-image'
  | 'linghui/image-to-video'
  | 'linghui/four-grid'
  | 'linghui/multi-angle'
  | 'linghui/storyboard-shot'
  | 'linghui/storyboard-group';

export type LinghuiNodeCategory = 'basic' | 'generation' | 'storyboard';
export type LinghuiSlotDataType = 'image' | 'text' | 'video' | 'images' | 'shot' | 'storyboard';
export type LinghuiRunStatus = 'idle' | 'running' | 'succeeded' | 'failed' | 'stale';
export type LinghuiResultKind = 'image' | 'text' | 'video' | 'grid' | 'images' | 'shot' | 'storyboard';

export interface LinghuiMediaItem {
  kind: 'image' | 'video';
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

export interface LinghuiViewportState {
  offset: [number, number];
  scale: number;
}

export interface LinghuiGraphSnapshot {
  last_node_id?: number | string;
  last_link_id?: number | string;
  nodes: Record<string, unknown>[];
  links: unknown[];
  groups: Record<string, unknown>[];
  config?: Record<string, unknown>;
  extra?: Record<string, unknown>;
  version?: number;
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

export const DEFAULT_LINGHUI_VIEWPORT: LinghuiViewportState = {
  offset: [0, 0],
  scale: 1,
};

export const EMPTY_LINGHUI_GRAPH: LinghuiGraphSnapshot = {
  nodes: [],
  links: [],
  groups: [],
  config: {},
  extra: {},
};

export const EMPTY_LINGHUI_NODE_RUNS: Record<string, LinghuiNodeRunState> = {};
export const EMPTY_LINGHUI_EXECUTION_LOGS: LinghuiExecutionLogEntry[] = [];

export const DEFAULT_LINGHUI_WORKSPACE_NAME = '未命名灵绘';

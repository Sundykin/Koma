import { randomUUID } from 'crypto';
import type {
  LinghuiExecutionLogEntry,
  LinghuiGraphSnapshot,
  LinghuiMediaItem,
  LinghuiNodeData,
  LinghuiNodeResult,
  LinghuiNodeRunState,
  LinghuiNodeType,
  LinghuiRFEdgeSnapshot,
  LinghuiRFGroupSnapshot,
  LinghuiRFNodeSnapshot,
  LinghuiWorkspaceMeta,
} from '../../../frontend/src/types/linghui';
import type {
  LinghuiWorkspaceAssetRecord,
  LinghuiWorkspaceHistoryRecord,
} from '../../../frontend/src/store/linghuiStorage';

export interface LinghuiWorkspaceRow {
  id: string;
  name: string;
  description?: string | null;
  created_at: number;
  updated_at: number;
  last_opened_at: number;
  node_count: number;
  link_count: number;
  group_count: number;
  viewport_x: number;
  viewport_y: number;
  viewport_zoom: number;
  graph_version: number;
}

export interface LinghuiGraphGroupRow {
  id: string;
  position_x: number;
  position_y: number;
  label: string;
  color: string;
  collapsed?: number | null;
  width: number;
  height: number;
  sort_order: number;
}

export interface LinghuiGraphNodeRow {
  id: string;
  type: string;
  position_x: number;
  position_y: number;
  width?: number | null;
  height?: number | null;
  parent_group_id?: string | null;
  label: string;
  accent: string;
  background: string;
  view_mode?: string | null;
  active?: number | null;
  properties_json: string;
  inputs_json: string;
  outputs_json: string;
  sort_order: number;
}

export interface LinghuiGraphEdgeRow {
  id: string;
  source_node_id: string;
  target_node_id: string;
  source_handle: string;
  target_handle: string;
  edge_type?: string | null;
  data_json?: string | null;
  sort_order: number;
}

export interface LinghuiWorkspaceNodeRunRow {
  workspace_id: string;
  node_id: string;
  status: string;
  message?: string | null;
  error?: string | null;
  progress?: number | null;
  started_at?: number | null;
  updated_at?: number | null;
  result_json?: string | null;
}

export interface LinghuiWorkspaceExecutionLogRow {
  id: string;
  workspace_id: string;
  level: string;
  message: string;
  node_id?: string | null;
  created_at: number;
  sort_order: number;
}

export interface LinghuiWorkflowTemplateRow {
  id: string;
  workspace_id: string;
  name: string;
  description?: string | null;
  source: 'workspace';
  kind: 'saved-workflow';
  recipe_key?: string | null;
  created_at: number;
  updated_at: number;
  source_group_id?: string | null;
  node_count: number;
  link_count: number;
  group_count: number;
  sample_node_labels_json: string;
}

export interface LinghuiLibraryRecordRow {
  id: string;
  workspace_id: string;
  node_id: string;
  node_type: string;
  kind: 'image' | 'video' | 'audio' | 'text';
  name: string;
  created_at: number;
  source?: string | null;
  preview_source?: string | null;
  poster_source?: string | null;
  text?: string | null;
  snapshot_path?: string | null;
  metadata_json?: string | null;
}

export const DEFAULT_LINGHUI_WORKSPACE_NAME = '未命名灵绘';

export function randomLinghuiId(length = 12): string {
  return randomUUID().replace(/-/g, '').slice(0, length);
}

export function parseLinghuiJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function stringifyLinghuiJson(value: unknown): string {
  return JSON.stringify(value ?? null);
}

export function sanitizeLinghuiAssetSegment(value: string): string {
  return value.replace(/[\\/:*?"<>|\s]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'asset';
}

export function sanitizeLinghuiWorkspaceName(name?: string): string {
  const trimmed = name?.trim();
  return trimmed || DEFAULT_LINGHUI_WORKSPACE_NAME;
}

export function buildLinghuiGraphStats(graphData?: LinghuiGraphSnapshot): {
  nodeCount: number;
  linkCount: number;
  groupCount: number;
} {
  return {
    nodeCount: graphData?.nodes?.length ?? 0,
    linkCount: graphData?.edges?.length ?? 0,
    groupCount: graphData?.groups?.length ?? 0,
  };
}

export function buildLinghuiTemplateSnapshotKey(workspaceId: string, templateId: string): string {
  return `sqlite://linghui/workspaces/${workspaceId}/workflow-templates/${templateId}`;
}

export function buildLinghuiLibrarySnapshotKey(
  workspaceId: string,
  collection: 'assets' | 'history',
  recordId: string,
): string {
  return `sqlite://linghui/workspaces/${workspaceId}/${collection}/${recordId}`;
}

export function rowToWorkspaceMeta(row: LinghuiWorkspaceRow): LinghuiWorkspaceMeta {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastOpenedAt: row.last_opened_at,
    nodeCount: row.node_count,
    linkCount: row.link_count,
    groupCount: row.group_count,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function inferLinghuiTypeFromStoredProperties(properties: Record<string, unknown>): LinghuiNodeType | null {
  const scene = properties.scene;
  if (isRecord(scene) && scene.version === 1) {
    return 'linghui/director3d';
  }

  if (
    properties.projectionMode === 'ar720-band'
    || properties.projectionMode === 'equirectangular-2to1'
    || properties.projectionMode === 'flat-wide'
    || properties.panoramaTemplate === 'auto'
    || properties.panoramaTemplate === 'indoor'
    || properties.panoramaTemplate === 'outdoor'
  ) {
    return 'linghui/panorama';
  }

  return null;
}

function linghuiTypeToRFType(type: LinghuiNodeType): string {
  switch (type) {
    case 'linghui/text':
      return 'linghui-text';
    case 'linghui/agent':
      return 'linghui-agent';
    case 'linghui/image':
      return 'linghui-image';
    case 'linghui/panorama':
      return 'linghui-panorama';
    case 'linghui/video':
      return 'linghui-video';
    case 'linghui/audio':
      return 'linghui-audio';
    case 'linghui/script':
      return 'linghui-script';
    case 'linghui/director3d':
      return 'linghui-director3d';
    default:
      return 'linghui-text';
  }
}

function rfTypeToLinghuiType(rfType: string): LinghuiNodeType {
  switch (rfType) {
    case 'linghui-text':
      return 'linghui/text';
    case 'linghui-agent':
      return 'linghui/agent';
    case 'linghui-image':
      return 'linghui/image';
    case 'linghui-panorama':
      return 'linghui/panorama';
    case 'linghui-video':
      return 'linghui/video';
    case 'linghui-audio':
      return 'linghui/audio';
    case 'linghui-script':
      return 'linghui/script';
    case 'linghui-director3d':
      return 'linghui/director3d';
    default:
      return 'linghui/text';
  }
}

export function nodeRowToSnapshot(row: LinghuiGraphNodeRow): LinghuiRFNodeSnapshot {
  const properties = parseLinghuiJson<Record<string, unknown>>(row.properties_json, {});
  const inferredType = inferLinghuiTypeFromStoredProperties(properties);
  const linghuiType = inferredType ?? rfTypeToLinghuiType(row.type);

  return {
    id: row.id,
    type: inferredType ? linghuiTypeToRFType(inferredType) : row.type,
    position: {
      x: row.position_x,
      y: row.position_y,
    },
    width: row.width ?? undefined,
    height: row.height ?? undefined,
    parentId: row.parent_group_id ?? undefined,
    data: {
      linghuiType,
      label: row.label,
      accent: row.accent,
      background: row.background,
      viewMode: row.view_mode ?? undefined,
      properties,
      inputs: parseLinghuiJson<any[]>(row.inputs_json, []),
      outputs: parseLinghuiJson<any[]>(row.outputs_json, []),
      active: Boolean(row.active),
    } as LinghuiNodeData,
  };
}

export function edgeRowToSnapshot(row: LinghuiGraphEdgeRow): LinghuiRFEdgeSnapshot {
  return {
    id: row.id,
    source: row.source_node_id,
    target: row.target_node_id,
    sourceHandle: row.source_handle,
    targetHandle: row.target_handle,
    type: row.edge_type ?? undefined,
    data: parseLinghuiJson<Record<string, unknown> | undefined>(row.data_json, undefined),
  };
}

export function groupRowToSnapshot(row: LinghuiGraphGroupRow): LinghuiRFGroupSnapshot {
  return {
    id: row.id,
    position: {
      x: row.position_x,
      y: row.position_y,
    },
    data: {
      label: row.label,
      color: row.color,
      collapsed: Boolean(row.collapsed),
    },
    style: {
      width: row.width,
      height: row.height,
    },
  };
}

export function runRowToState(row: LinghuiWorkspaceNodeRunRow): LinghuiNodeRunState {
  return {
    status: row.status as LinghuiNodeRunState['status'],
    message: row.message ?? undefined,
    error: row.error ?? undefined,
    progress: row.progress ?? undefined,
    startedAt: row.started_at ?? undefined,
    updatedAt: row.updated_at ?? undefined,
    result: parseLinghuiJson<LinghuiNodeResult | undefined>(row.result_json, undefined),
  };
}

export function logRowToEntry(row: LinghuiWorkspaceExecutionLogRow): LinghuiExecutionLogEntry {
  return {
    id: row.id,
    level: row.level as LinghuiExecutionLogEntry['level'],
    message: row.message,
    nodeId: row.node_id ?? undefined,
    createdAt: row.created_at,
  };
}

export function libraryRowToAssetRecord(row: LinghuiLibraryRecordRow): LinghuiWorkspaceAssetRecord {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    nodeId: row.node_id,
    nodeType: row.node_type as LinghuiNodeType,
    kind: row.kind,
    name: row.name,
    createdAt: row.created_at,
    source: row.source ?? undefined,
    previewSource: row.preview_source ?? undefined,
    posterSource: row.poster_source ?? undefined,
    text: row.text ?? undefined,
    snapshotPath: row.snapshot_path?.trim() || buildLinghuiLibrarySnapshotKey(row.workspace_id, 'assets', row.id),
    metadata: parseLinghuiJson<Record<string, unknown> | undefined>(row.metadata_json, undefined),
  };
}

export function libraryRowToHistoryRecord(row: LinghuiLibraryRecordRow): LinghuiWorkspaceHistoryRecord {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    nodeId: row.node_id,
    nodeType: row.node_type as LinghuiNodeType,
    kind: row.kind,
    name: row.name,
    createdAt: row.created_at,
    source: row.source ?? undefined,
    previewSource: row.preview_source ?? undefined,
    posterSource: row.poster_source ?? undefined,
    text: row.text ?? undefined,
    snapshotPath: row.snapshot_path?.trim() || buildLinghuiLibrarySnapshotKey(row.workspace_id, 'history', row.id),
    metadata: parseLinghuiJson<Record<string, unknown> | undefined>(row.metadata_json, undefined),
  };
}

export function getNodeAssetTextValue(nodeData: LinghuiNodeData, nodeRun?: LinghuiNodeRunState): string {
  const properties = (nodeData.properties ?? {}) as Record<string, unknown>;
  const result = nodeRun?.result as any;
  const resultText = typeof result?.text === 'string' ? result.text.trim() : '';

  if (resultText) return resultText;
  if (typeof properties.content === 'string' && properties.content.trim()) return properties.content.trim();
  if (typeof properties.prompt === 'string' && properties.prompt.trim()) return properties.prompt.trim();
  if (typeof properties.note === 'string' && properties.note.trim()) return properties.note.trim();
  return '';
}

export function getPrimaryAssetMedia(nodeData: LinghuiNodeData, nodeRun?: LinghuiNodeRunState): LinghuiMediaItem | undefined {
  const properties = (nodeData.properties ?? {}) as Record<string, unknown>;
  const result = nodeRun?.result as any;
  const primary = result?.primary as LinghuiMediaItem | undefined;
  if (primary?.source || primary?.posterSource) {
    return primary;
  }

  const source = typeof properties.source === 'string' ? properties.source.trim() : '';
  const posterSource = typeof properties.posterSource === 'string' ? properties.posterSource.trim() : '';
  if (!source && !posterSource) {
    return undefined;
  }

  const inferredKind = nodeData.linghuiType === 'linghui/video'
    ? 'video'
    : nodeData.linghuiType === 'linghui/audio'
      ? 'audio'
      : 'image';

  return {
    kind: inferredKind,
    source: source || undefined,
    posterSource: posterSource || undefined,
    label: nodeData.label,
  };
}

export function resolveLinghuiLibraryRecordKind(
  nodeData: LinghuiNodeData,
  nodeRun?: LinghuiNodeRunState,
): LinghuiWorkspaceAssetRecord['kind'] {
  const textValue = getNodeAssetTextValue(nodeData, nodeRun);
  const media = getPrimaryAssetMedia(nodeData, nodeRun);

  if (nodeData.linghuiType === 'linghui/text') return 'text';
  if (media?.kind === 'video') return 'video';
  if (media?.kind === 'audio') return 'audio';
  if (textValue && !media) return 'text';
  return 'image';
}

export function getLinghuiResultItemCount(result?: LinghuiNodeResult): number {
  const maybeItems = result && (result as any).items;
  return Array.isArray(maybeItems) ? maybeItems.length : 0;
}

export function getLinghuiResultItems(result?: LinghuiNodeResult): LinghuiMediaItem[] {
  const maybeItems = result && (result as any).items;
  return Array.isArray(maybeItems) ? maybeItems : [];
}

export function getLinghuiResultShots(result?: LinghuiNodeResult): Array<{
  id: string;
  title: string;
  description: string;
  durationSec: number;
  image?: LinghuiMediaItem;
}> {
  const maybeShots = result && (result as any).shots;
  return Array.isArray(maybeShots) ? maybeShots : [];
}

export function assignLinghuiResultPrimary(result: LinghuiNodeResult, primary: LinghuiMediaItem): void {
  (result as any).primary = primary;
}

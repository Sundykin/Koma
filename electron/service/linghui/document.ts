import type {
  LinghuiExecutionLogEntry,
  LinghuiGraphSnapshot,
  LinghuiNodeRunState,
  LinghuiNodeType,
  LinghuiRFNodeSnapshot,
  LinghuiRFNodeTypeKey,
  LinghuiViewportState,
  LinghuiWorkspaceDocument,
} from '../../../frontend/src/types/linghui';
import { DEFAULT_LINGHUI_WORKSPACE_NAME } from './persistenceHelpers';

const CURRENT_LINGHUI_TYPES: readonly LinghuiNodeType[] = [
  'linghui/text',
  'linghui/agent',
  'linghui/image',
  'linghui/video',
  'linghui/audio',
  'linghui/script',
] as const;

const CURRENT_RF_TYPES: readonly LinghuiRFNodeTypeKey[] = [
  'linghui-text',
  'linghui-agent',
  'linghui-image',
  'linghui-video',
  'linghui-audio',
  'linghui-script',
] as const;

const DEFAULT_LINGHUI_VIEWPORT: LinghuiViewportState = {
  x: 0,
  y: 0,
  zoom: 1,
};

const EMPTY_LINGHUI_GRAPH: LinghuiGraphSnapshot = {
  version: 2,
  nodes: [],
  edges: [],
  groups: [],
};

const EMPTY_LINGHUI_NODE_RUNS: Record<string, LinghuiNodeRunState> = {};
const EMPTY_LINGHUI_EXECUTION_LOGS: LinghuiExecutionLogEntry[] = [];

const LINGHUI_TYPE_TO_RF_TYPE_MAP: Record<LinghuiNodeType, LinghuiRFNodeTypeKey> = {
  'linghui/text': 'linghui-text',
  'linghui/agent': 'linghui-agent',
  'linghui/image': 'linghui-image',
  'linghui/video': 'linghui-video',
  'linghui/audio': 'linghui-audio',
  'linghui/script': 'linghui-script',
};

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function sanitizeWorkspaceName(name?: string): string {
  const trimmed = name?.trim();
  return trimmed || DEFAULT_LINGHUI_WORKSPACE_NAME;
}

function buildStats(graphData?: LinghuiGraphSnapshot): {
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

function isCurrentLinghuiType(value: unknown): value is LinghuiNodeType {
  return typeof value === 'string' && (CURRENT_LINGHUI_TYPES as readonly string[]).includes(value);
}

function isCurrentRFType(value: unknown): value is LinghuiRFNodeTypeKey {
  return typeof value === 'string' && (CURRENT_RF_TYPES as readonly string[]).includes(value);
}

function linghuiTypeToRFType(type: LinghuiNodeType): LinghuiRFNodeTypeKey {
  return LINGHUI_TYPE_TO_RF_TYPE_MAP[type];
}

function normalizeViewport(viewport?: LinghuiViewportState): LinghuiViewportState {
  if (!viewport) {
    return clone(DEFAULT_LINGHUI_VIEWPORT);
  }
  if (
    typeof viewport.x !== 'number'
    || typeof viewport.y !== 'number'
    || typeof viewport.zoom !== 'number'
  ) {
    throw new Error('Linghui workspace viewport 必须是当前结构');
  }
  return clone(viewport);
}

function assertCurrentNode(node: LinghuiRFNodeSnapshot, index: number): void {
  if (!isCurrentRFType(node.type)) {
    throw new Error(`Linghui workspace 包含不受支持的节点类型: node[${index}].type=${String(node.type)}`);
  }
  if (!isCurrentLinghuiType(node.data?.linghuiType)) {
    throw new Error(`Linghui workspace 包含不受支持的灵绘节点语义: node[${index}].data.linghuiType=${String(node.data?.linghuiType)}`);
  }

  const expectedRFType = linghuiTypeToRFType(node.data.linghuiType);
  if (node.type !== expectedRFType) {
    throw new Error(
      `Linghui workspace 节点类型不匹配: node[${index}] expects ${expectedRFType} but received ${node.type}`,
    );
  }
}

function assertCurrentGraph(graphData: LinghuiGraphSnapshot): void {
  if (graphData.version !== 2) {
    throw new Error(`Linghui workspace graph 版本不受支持: ${String(graphData.version)}`);
  }
  if (!Array.isArray(graphData.nodes) || !Array.isArray(graphData.edges) || !Array.isArray(graphData.groups)) {
    throw new Error('Linghui workspace graphData 必须使用当前 nodes/edges/groups 结构');
  }

  graphData.nodes.forEach(assertCurrentNode);
}

export function normalizeLinghuiWorkspaceDocument(
  input: Partial<LinghuiWorkspaceDocument> & Pick<LinghuiWorkspaceDocument, 'id' | 'name'>,
): LinghuiWorkspaceDocument {
  const now = Date.now();
  const graphData = clone(input.graphData ?? EMPTY_LINGHUI_GRAPH);
  assertCurrentGraph(graphData);

  const stats = buildStats(graphData);
  const nodeRuns = clone(input.nodeRuns ?? EMPTY_LINGHUI_NODE_RUNS) as Record<string, LinghuiNodeRunState>;
  const executionLogs = clone(input.executionLogs ?? EMPTY_LINGHUI_EXECUTION_LOGS) as LinghuiExecutionLogEntry[];

  return {
    id: input.id,
    name: sanitizeWorkspaceName(input.name),
    description: input.description ?? '',
    createdAt: input.createdAt ?? now,
    updatedAt: input.updatedAt ?? now,
    lastOpenedAt: input.lastOpenedAt ?? now,
    viewport: normalizeViewport(input.viewport),
    graphData,
    nodeRuns,
    executionLogs,
    nodeCount: input.nodeCount ?? stats.nodeCount,
    linkCount: input.linkCount ?? stats.linkCount,
    groupCount: input.groupCount ?? stats.groupCount,
  };
}

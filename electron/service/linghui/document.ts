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
  'linghui/panorama',
  'linghui/video',
  'linghui/audio',
  'linghui/script',
  'linghui/storyboard',
  'linghui/director3d',
] as const;

const CURRENT_RF_TYPES: readonly LinghuiRFNodeTypeKey[] = [
  'linghui-text',
  'linghui-agent',
  'linghui-image',
  'linghui-panorama',
  'linghui-video',
  'linghui-audio',
  'linghui-script',
  'linghui-storyboard',
  'linghui-director3d',
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

// 旧持久化迁移：linghui-image-generator → linghui-image (mode='generate')。
// document normalize 时把不在 CURRENT_RF_TYPES 中的旧 type 映射到 linghui-image。
const LEGACY_RF_TYPE_MIGRATION: Record<string, LinghuiRFNodeTypeKey> = {
  'linghui-image-generator': 'linghui-image',
};
const LEGACY_LINGHUI_TYPE_MIGRATION: Record<string, LinghuiNodeType> = {
  'linghui/image-generator': 'linghui/image',
};
// 抑制未使用警告（迁移映射可能在未来添加更多 case）。
void LEGACY_RF_TYPE_MIGRATION;
void LEGACY_LINGHUI_TYPE_MIGRATION;

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

function normalizeCurrentNode(node: LinghuiRFNodeSnapshot, index: number): LinghuiRFNodeSnapshot | null {
  if (!isCurrentRFType(node.type)) {
    if (!node.type && !node.data?.linghuiType) {
      return null;
    }
    throw new Error(`Linghui workspace 包含不受支持的节点类型: node[${index}].type=${String(node.type)}`);
  }

  const fallbackLinghuiType = RF_TYPE_TO_LINGHUI_TYPE_MAP[node.type];
  if (!isCurrentLinghuiType(node.data?.linghuiType)) {
    if (!node.data?.linghuiType && fallbackLinghuiType) {
      return {
        ...node,
        data: {
          ...node.data,
          linghuiType: fallbackLinghuiType,
          label: node.data?.label || fallbackLinghuiType.replace('linghui/', ''),
          accent: node.data?.accent || 'var(--token-accent-base)',
          background: node.data?.background || 'var(--token-bg-card)',
          properties: node.data?.properties ?? {},
          inputs: Array.isArray(node.data?.inputs) ? node.data.inputs : [],
          outputs: Array.isArray(node.data?.outputs) ? node.data.outputs : [],
          active: false,
        },
      };
    }
    throw new Error(`Linghui workspace 包含不受支持的灵绘节点语义: node[${index}].data.linghuiType=${String(node.data?.linghuiType)}`);
  }

  const expectedRFType = linghuiTypeToRFType(node.data.linghuiType);

  return {
    ...node,
    type: expectedRFType,
    data: {
      ...node.data,
      properties: node.data.properties ?? {},
      inputs: Array.isArray(node.data.inputs) ? node.data.inputs : [],
      outputs: Array.isArray(node.data.outputs) ? node.data.outputs : [],
      active: false,
    },
  };
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

function normalizeCurrentGraph(graphData: LinghuiGraphSnapshot): LinghuiGraphSnapshot {
  if (graphData.version !== 2) {
    throw new Error(`Linghui workspace graph 版本不受支持: ${String(graphData.version)}`);
  }
  if (!Array.isArray(graphData.nodes) || !Array.isArray(graphData.edges) || !Array.isArray(graphData.groups)) {
    throw new Error('Linghui workspace graphData 必须使用当前 nodes/edges/groups 结构');
  }

  const nodes = graphData.nodes
    .map((node, index) => normalizeCurrentNode(node, index))
    .filter((node): node is LinghuiRFNodeSnapshot => Boolean(node));
  const nodeIds = new Set(nodes.map(node => node.id));

  return {
    version: graphData.version,
    nodes,
    edges: graphData.edges.filter(edge => nodeIds.has(edge.source) && nodeIds.has(edge.target)),
    groups: graphData.groups,
  };
}

export function normalizeLinghuiWorkspaceDocument(
  input: Partial<LinghuiWorkspaceDocument> & Pick<LinghuiWorkspaceDocument, 'id' | 'name'>,
): LinghuiWorkspaceDocument {
  const now = Date.now();
  const graphData = normalizeCurrentGraph(clone(input.graphData ?? EMPTY_LINGHUI_GRAPH));
  assertCurrentGraph(graphData);

  const stats = buildStats(graphData);
  const nodeRuns = clone(input.nodeRuns ?? EMPTY_LINGHUI_NODE_RUNS) as Record<string, LinghuiNodeRunState>;
  const executionLogs = clone(input.executionLogs ?? EMPTY_LINGHUI_EXECUTION_LOGS) as LinghuiExecutionLogEntry[];
  // 3D 导演 split-view 绑定：把已删除节点的绑定一并清掉，避免 dangling 引用
  const liveNodeIds = new Set(graphData.nodes.map(node => node.id));
  const rawBindings = (input.directorPreviewBindings ?? {}) as Record<string, string>;
  const directorPreviewBindings: Record<string, string> = {};
  for (const [directorId, previewId] of Object.entries(rawBindings)) {
    if (typeof directorId !== 'string' || typeof previewId !== 'string') continue;
    if (liveNodeIds.has(directorId) && liveNodeIds.has(previewId)) {
      directorPreviewBindings[directorId] = previewId;
    }
  }

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
    directorPreviewBindings,
    nodeCount: input.nodeCount ?? stats.nodeCount,
    linkCount: input.linkCount ?? stats.linkCount,
    groupCount: input.groupCount ?? stats.groupCount,
  };
}

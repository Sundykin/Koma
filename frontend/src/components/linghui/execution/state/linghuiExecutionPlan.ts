import type {
  LinghuiExecutionContext,
  LinghuiNodeRunState,
  LinghuiNodeType,
} from '../../../../types/linghui';
import {
  buildTopologicalLayers,
  collectRequiredNodeIds,
  getDirectUpstreamNodeIds,
} from './linghuiExecutionGraph';

const DEFAULT_NODE_DURATION_SEC: Record<LinghuiNodeType, number> = {
  'linghui/text': 10,
  'linghui/agent': 18,
  'linghui/image': 28,
  'linghui/panorama': 32,
  'linghui/video': 45,
  'linghui/audio': 15,
  'linghui/script': 14,
  // 故事板节点与脚本节点同条 LLM 链路，估时一致
  'linghui/storyboard': 14,
  // 3D 导演节点本地导出 lineart，几乎瞬时完成
  'linghui/director3d': 2,
  // 宫格切分中间节点纯本地 canvas 切片，瞬时
  'linghui/image-grid-slice': 1,
  // 视频合成节点：本地 FFmpeg concat，按片段总数估时（典型 5 段 ~10s）
  'linghui/video-clip': 12,
};

export type LinghuiExecutionPlanCostStatus = 'available' | 'unavailable';
export type LinghuiExecutionPlanEstimateSource = 'history' | 'heuristic';

export interface LinghuiExecutionPlanNodeSummary {
  nodeId: string;
  label: string;
  nodeType: LinghuiNodeType;
  layerIndex: number;
  upstreamIds: string[];
  estimatedDurationSec: number;
  estimateSource: LinghuiExecutionPlanEstimateSource;
  isBottleneck: boolean;
}

export interface LinghuiExecutionPlanWaveSummary {
  index: number;
  nodeIds: string[];
  nodeLabels: string[];
  estimatedDurationSec: number;
  parallelism: number;
  bottleneckNodeIds: string[];
}

export interface LinghuiExecutionPlan {
  targetNodeIds: string[];
  requiredNodeIds: string[];
  dependencyNodeCount: number;
  totalNodes: number;
  waveCount: number;
  maxParallelism: number;
  estimatedTotalDurationSec: number;
  estimatedCostStatus: LinghuiExecutionPlanCostStatus;
  estimatedCostCny: number | null;
  costUnavailableReason?: string;
  bottleneckNodeIds: string[];
  nodes: LinghuiExecutionPlanNodeSummary[];
  waves: LinghuiExecutionPlanWaveSummary[];
}

function resolveHistoricalDurationSec(runState?: LinghuiNodeRunState): number | null {
  if (!runState) return null;
  if (runState.status !== 'succeeded' && runState.status !== 'stale') {
    return null;
  }

  const startedAt = Number(runState.startedAt ?? 0);
  const updatedAt = Number(runState.updatedAt ?? 0);
  if (!Number.isFinite(startedAt) || !Number.isFinite(updatedAt) || updatedAt <= startedAt) {
    return null;
  }

  return Math.max(1, Math.round((updatedAt - startedAt) / 1000));
}

function resolveNodeDurationEstimate(
  nodeType: LinghuiNodeType,
  runState?: LinghuiNodeRunState,
): { estimatedDurationSec: number; estimateSource: LinghuiExecutionPlanEstimateSource } {
  const historical = resolveHistoricalDurationSec(runState);
  if (historical != null) {
    return {
      estimatedDurationSec: historical,
      estimateSource: 'history',
    };
  }

  return {
    estimatedDurationSec: DEFAULT_NODE_DURATION_SEC[nodeType] ?? 12,
    estimateSource: 'heuristic',
  };
}

export function buildLinghuiExecutionPlan(params: {
  context: LinghuiExecutionContext;
  targetNodeIds?: string[];
  previousRuns?: Record<string, LinghuiNodeRunState>;
}): LinghuiExecutionPlan {
  const normalizedTargetNodeIds = params.targetNodeIds?.length
    ? [...new Set(params.targetNodeIds)]
    : params.context.nodes.map(node => node.id);
  const requiredNodeIds = collectRequiredNodeIds(params.context.edges, normalizedTargetNodeIds);
  const requiredNodeIdSet = new Set(requiredNodeIds);
  const layers = buildTopologicalLayers(params.context.nodes, params.context.edges, requiredNodeIdSet);
  const previousRuns = params.previousRuns ?? {};
  const nodeSummaries: LinghuiExecutionPlanNodeSummary[] = [];

  for (const [layerIndex, layer] of layers.entries()) {
    for (const node of layer) {
      const duration = resolveNodeDurationEstimate(node.data.linghuiType, previousRuns[node.id]);
      nodeSummaries.push({
        nodeId: node.id,
        label: String(node.data.label || node.id),
        nodeType: node.data.linghuiType,
        layerIndex,
        upstreamIds: getDirectUpstreamNodeIds(params.context.edges, node.id),
        estimatedDurationSec: duration.estimatedDurationSec,
        estimateSource: duration.estimateSource,
        isBottleneck: false,
      });
    }
  }

  const nodeSummaryById = new Map(nodeSummaries.map(item => [item.nodeId, item] as const));
  const waves: LinghuiExecutionPlanWaveSummary[] = layers.map((layer, index) => {
    const waveNodes = layer
      .map(node => nodeSummaryById.get(node.id))
      .filter((item): item is LinghuiExecutionPlanNodeSummary => Boolean(item));
    const estimatedDurationSec = Math.max(...waveNodes.map(item => item.estimatedDurationSec), 0);
    const bottleneckNodeIds = waveNodes
      .filter(item => item.estimatedDurationSec === estimatedDurationSec)
      .map(item => item.nodeId);

    return {
      index,
      nodeIds: waveNodes.map(item => item.nodeId),
      nodeLabels: waveNodes.map(item => item.label),
      estimatedDurationSec,
      parallelism: waveNodes.length,
      bottleneckNodeIds,
    };
  });

  const bottleneckNodeIds = [...new Set(waves.flatMap(wave => wave.bottleneckNodeIds))];
  for (const nodeId of bottleneckNodeIds) {
    const summary = nodeSummaryById.get(nodeId);
    if (summary) {
      summary.isBottleneck = true;
    }
  }

  return {
    targetNodeIds: normalizedTargetNodeIds,
    requiredNodeIds,
    dependencyNodeCount: Math.max(0, requiredNodeIds.length - normalizedTargetNodeIds.length),
    totalNodes: requiredNodeIds.length,
    waveCount: waves.length,
    maxParallelism: Math.max(...waves.map(wave => wave.parallelism), 0),
    estimatedTotalDurationSec: waves.reduce((total, wave) => total + wave.estimatedDurationSec, 0),
    estimatedCostStatus: 'unavailable',
    estimatedCostCny: null,
    costUnavailableReason: '当前运行时缺少稳定的 Provider 定价元数据',
    bottleneckNodeIds,
    nodes: nodeSummaries,
    waves,
  };
}

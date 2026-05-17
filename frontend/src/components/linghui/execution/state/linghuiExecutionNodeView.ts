import type {
  LinghuiAudioNodeProperties,
  LinghuiExecutionContext,
  LinghuiImageNodeProperties,
  LinghuiNodeResult,
  LinghuiNodeType,
  LinghuiRFNodeSnapshot,
  LinghuiScriptNodeProperties,
  LinghuiSlotDataType,
  LinghuiTextNodeProperties,
  LinghuiVideoNodeProperties,
} from '../../../../types/linghui';
import {
  getLinghuiResultDescriptionText,
  getLinghuiResultItems,
  getLinghuiResultPrimaryMedia,
  getLinghuiResultText,
} from '../../../../types/linghui';
import {
  buildLinghuiPromptReferenceItems,
  getOrderedIncomingReferenceEdges,
  type LinghuiPromptReferenceItem,
} from '../../editors/state/linghuiPromptReferences';
import {
  resolveLinghuiImageCollection,
  resolveLinghuiImageResultWithSelectedPrimary,
} from '../../editors/state/linghuiImageCollections';
import { parseLinghuiScriptContent } from '../../editors/state/linghuiScriptNodeUtils';
import { buildMediaItem } from './linghuiExecutionCore';

export interface ExecutionNodeView {
  id: string;
  type: LinghuiNodeType;
  properties: Record<string, unknown>;
  title: string;
  settingsSnapshot?: LinghuiExecutionContext['settingsSnapshot'];
  getAllInputResults: (slot: number) => LinghuiNodeResult[];
  getAllInputImages: () => LinghuiNodeResult[];
  getInputResult: (slot: number) => LinghuiNodeResult | undefined;
  getPromptReferences: () => LinghuiPromptReferenceItem[];
}

function resolveNodeResultForInput(context: LinghuiExecutionContext, sourceNode: LinghuiRFNodeSnapshot | undefined): LinghuiNodeResult | undefined {
  if (!sourceNode) {
    return undefined;
  }

  const result = context.nodeOutputs[sourceNode.id] ?? resolveStaticNodeResult(sourceNode);
  if (result && !context.nodeOutputs[sourceNode.id]) {
    context.nodeOutputs[sourceNode.id] = result;
  }
  if (!result) {
    return undefined;
  }

  if (sourceNode.data.linghuiType !== 'linghui/image' && sourceNode.data.linghuiType !== 'linghui/panorama') {
    return result;
  }

  return resolveLinghuiImageResultWithSelectedPrimary(
    sourceNode.data.properties as unknown as LinghuiImageNodeProperties,
    result,
  );
}

function resolveAllUpstreamResults(context: LinghuiExecutionContext, nodeId: string): LinghuiNodeResult[] {
  const nodeMap = new Map(context.nodes.map(node => [node.id, node] as const));
  const queue = getOrderedIncomingReferenceEdges(nodeId, context.edges).map(edge => edge.source);
  const seenNodes = new Set<string>();
  const seenResults = new Set<string>();
  const results: LinghuiNodeResult[] = [];

  while (queue.length > 0) {
    const sourceNodeId = queue.shift()!;
    if (seenNodes.has(sourceNodeId)) {
      continue;
    }
    seenNodes.add(sourceNodeId);

    const sourceNode = nodeMap.get(sourceNodeId);
    const result = resolveNodeResultForInput(context, sourceNode);
    if (result) {
      const resultKey = JSON.stringify({
        kind: result.kind,
        text: getLinghuiResultText(result),
        media: getLinghuiResultPrimaryMedia(result)?.source,
        items: getLinghuiResultItems(result).map(item => item.source).filter(Boolean),
      });
      if (!seenResults.has(resultKey)) {
        seenResults.add(resultKey);
        results.push(result);
      }
    }

    queue.push(...getOrderedIncomingReferenceEdges(sourceNodeId, context.edges).map(edge => edge.source));
  }

  return results;
}

function resultMatchesSlotDataType(result: LinghuiNodeResult, dataType?: string): boolean {
  if (!dataType) return true;
  if (dataType === 'text') {
    return Boolean(String(getLinghuiResultText(result) || getLinghuiResultDescriptionText(result) || '').trim());
  }
  if (dataType === 'storyboard') {
    return result.kind === 'storyboard';
  }
  if (dataType === 'shot') {
    return result.kind === 'shot';
  }
  if (dataType === 'images') {
    return result.kind === 'images' || result.kind === 'grid';
  }

  const primary = getLinghuiResultPrimaryMedia(result);
  if (primary?.kind === dataType) {
    return true;
  }
  // image 槽位也接受"带首帧的视频"：3D 导演时间轴动画 / 视频节点的输出
  // 都能通过 posterSource 作为图片参考被下游消费，否则就只能丢弃
  if (dataType === 'image' && primary?.kind === 'video' && primary.posterSource) {
    return true;
  }
  return getLinghuiResultItems(result).some(item => (
    item.kind === dataType
    || (dataType === 'image' && item.kind === 'video' && item.posterSource)
  ));
}

function resolveInputResults(
  snapshot: LinghuiRFNodeSnapshot,
  upstreamResults: LinghuiNodeResult[],
  inputSlotIndex: number,
): LinghuiNodeResult[] {
  const dataType = snapshot.data.inputs[inputSlotIndex]?.dataType;
  if (!dataType) {
    return [];
  }
  return upstreamResults.filter(result => resultMatchesSlotDataType(result, dataType));
}

function resolveResultsByDataType(
  upstreamResults: LinghuiNodeResult[],
  dataType: LinghuiSlotDataType,
): LinghuiNodeResult[] {
  return upstreamResults.filter(result => resultMatchesSlotDataType(result, dataType));
}

function resolveInputData(
  snapshot: LinghuiRFNodeSnapshot,
  upstreamResults: LinghuiNodeResult[],
  inputSlotIndex: number,
): LinghuiNodeResult | undefined {
  return resolveInputResults(snapshot, upstreamResults, inputSlotIndex)[0];
}

export function createNodeView(context: LinghuiExecutionContext, snapshot: LinghuiRFNodeSnapshot): ExecutionNodeView {
  const nodeId = snapshot.id;
  let upstreamResultsCache: LinghuiNodeResult[] | null = null;
  const getUpstreamResults = () => {
    if (!upstreamResultsCache) {
      upstreamResultsCache = resolveAllUpstreamResults(context, nodeId);
    }
    return upstreamResultsCache;
  };

  return {
    id: nodeId,
    type: snapshot.data.linghuiType,
    properties: snapshot.data.properties,
    title: snapshot.data.label,
    settingsSnapshot: context.settingsSnapshot,
    getAllInputResults(slot) {
      return resolveInputResults(snapshot, getUpstreamResults(), slot);
    },
    getAllInputImages() {
      return resolveResultsByDataType(getUpstreamResults(), 'image');
    },
    getInputResult(slot) {
      return resolveInputData(snapshot, getUpstreamResults(), slot);
    },
    getPromptReferences() {
      return buildLinghuiPromptReferenceItems({
        nodeId,
        nodes: context.nodes.map(node => ({
          id: node.id,
          data: node.data,
        })),
        edges: context.edges.map(edge => ({
          source: edge.source,
          target: edge.target,
          sourceHandle: edge.sourceHandle,
          targetHandle: edge.targetHandle,
        })),
        getNodeResult(upstreamNodeId) {
          return context.nodeOutputs[upstreamNodeId];
        },
      });
    },
  };
}

function resolveStaticNodeResult(snapshot?: LinghuiRFNodeSnapshot): LinghuiNodeResult | undefined {
  if (!snapshot) {
    return undefined;
  }

  if (snapshot.data.linghuiType === 'linghui/image' || snapshot.data.linghuiType === 'linghui/panorama') {
    const properties = snapshot.data.properties as unknown as LinghuiImageNodeProperties;
    const collection = resolveLinghuiImageCollection(properties);
    if (!collection.primary) {
      return undefined;
    }

    const items = collection.items.map(item => buildMediaItem(item));
    const primary = buildMediaItem(collection.primary);
    const metadata = {
      source: primary.source,
      mode: collection.mode,
      itemCount: items.length,
    };
    if (items.length > 1) {
      return {
        kind: 'images',
        primary,
        items,
        metadata,
      };
    }

    return {
      kind: 'image',
      primary,
      metadata,
    };
  }

  if (snapshot.data.linghuiType === 'linghui/text') {
    const properties = snapshot.data.properties as unknown as LinghuiTextNodeProperties;
    const content = String(properties.content ?? '').trim();
    if (properties.mode !== 'manual' || !content) {
      return undefined;
    }

    return {
      kind: 'text',
      text: content,
      metadata: { mode: 'manual' },
    };
  }

  if (snapshot.data.linghuiType === 'linghui/script') {
    const properties = snapshot.data.properties as unknown as LinghuiScriptNodeProperties;
    const content = String(properties.content ?? '').trim();
    if (properties.mode !== 'manual' || !content) {
      return undefined;
    }

    const parsed = parseLinghuiScriptContent(content);
    if (!parsed.shots.length) {
      return undefined;
    }

    return {
      kind: 'storyboard',
      text: parsed.formattedText || content,
      primary: parsed.shots[0]?.image,
      shots: parsed.shots,
      metadata: {
        mode: 'manual',
        parseSource: parsed.source,
        rawContent: content,
      },
    };
  }

  if (snapshot.data.linghuiType === 'linghui/audio') {
    const properties = snapshot.data.properties as unknown as LinghuiAudioNodeProperties;
    const source = String(properties.source ?? '').trim();
    if (!source) {
      return undefined;
    }

    return {
      kind: 'audio',
      primary: buildMediaItem({
        kind: 'audio',
        source,
        label: snapshot.data.label,
      }),
      text: String(properties.prompt ?? '').trim() || undefined,
      metadata: { source, mode: 'upload' },
    };
  }

  if (snapshot.data.linghuiType === 'linghui/video') {
    const properties = snapshot.data.properties as unknown as LinghuiVideoNodeProperties;
    const source = String(properties.source ?? '').trim();
    const posterSource = String(properties.posterSource ?? '').trim();
    if (!source && !posterSource) {
      return undefined;
    }

    return {
      kind: 'video',
      primary: buildMediaItem({
        kind: 'video',
        source: source || undefined,
        posterSource: posterSource || undefined,
        label: snapshot.data.label,
      }),
      metadata: {
        source: source || undefined,
        posterSource: posterSource || undefined,
        mode: 'upload',
      },
    };
  }

  return undefined;
}

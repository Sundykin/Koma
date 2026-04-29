import type { MediaAssetSource, ProviderAssetInput } from '../../../../types';
import type {
  LinghuiImageNodeProperties,
  LinghuiNodeData,
  LinghuiNodeResult,
  LinghuiScriptNodeProperties,
  LinghuiTextNodeProperties,
  LinghuiVideoNodeProperties,
} from '../../../../types/linghui';
import {
  getLinghuiResultDescriptionText,
  getLinghuiResultItems,
  getLinghuiResultPrimaryMedia,
  getLinghuiResultShots,
  getLinghuiResultText,
} from '../../../../types/linghui';
import {
  compilePromptReferences,
  parsePromptReferences,
  type ParsedPromptReference,
} from '../../../../services/promptCompilation/promptReferenceCompiler';
import { resolveLinghuiImageResultWithSelectedPrimary } from './linghuiImageCollections';

export type LinghuiPromptReferenceKind = 'image' | 'video' | 'audio' | 'text';

export interface LinghuiPromptReferenceItem {
  id: string;
  nodeId: string;
  kind: LinghuiPromptReferenceKind;
  name: string;
  description?: string;
  source?: MediaAssetSource;
  previewSource?: string;
  textValue?: string;
}

export interface LinghuiPromptReferenceEdge {
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
}

export type ParsedLinghuiPromptReference = ParsedPromptReference;

export const LINGHUI_PROMPT_REFERENCE_REGEX = /@ref_([a-zA-Z0-9_-]+)/g;

function resolveImageFallbackMode(properties: LinghuiImageNodeProperties): 'import' | 'generate' {
  if (properties.mode === 'import' || properties.mode === 'generate') {
    return properties.mode;
  }
  return String(properties.source ?? '').trim() ? 'import' : 'generate';
}

export function parseLinghuiPromptReferences(text: string): ParsedLinghuiPromptReference[] {
  return parsePromptReferences(text);
}

export function createLinghuiPromptReferenceString(id: string): string {
  return `@ref_${id}`;
}

function resolvePromptReferenceSourceValue(source?: MediaAssetSource): string | undefined {
  if (!source) return undefined;
  if (typeof source === 'string') {
    const normalized = source.trim();
    return normalized || undefined;
  }

  const remoteUrl = typeof source.remoteUrl === 'string' ? source.remoteUrl.trim() : '';
  if (remoteUrl) {
    return remoteUrl;
  }

  const localPath = typeof source.localPath === 'string' ? source.localPath.trim() : '';
  return localPath || undefined;
}

export function collectLinghuiPromptReferenceImageSources(
  references: LinghuiPromptReferenceItem[],
): string[] {
  const sources: string[] = [];
  const dedupe = new Set<string>();
  const pushSource = (candidate?: string) => {
    const normalized = String(candidate ?? '').trim();
    if (!normalized || dedupe.has(normalized)) return;
    dedupe.add(normalized);
    sources.push(normalized);
  };

  for (const item of references) {
    if (item.kind !== 'image') {
      continue;
    }

    pushSource(resolvePromptReferenceSourceValue(item.source) ?? item.previewSource);
  }

  return sources;
}

function buildRefKey(ref: MediaAssetSource | ProviderAssetInput): string {
  if (typeof ref === 'string') return ref;
  if (ref && typeof ref === 'object' && 'transport' in ref && 'value' in ref) {
    return `${ref.transport}:${ref.value}`;
  }

  const anyRef = ref as unknown as Record<string, unknown> | undefined;
  const remoteUrl = typeof anyRef?.remoteUrl === 'string' ? anyRef.remoteUrl : '';
  const localPath = typeof anyRef?.localPath === 'string' ? anyRef.localPath : '';
  return remoteUrl || localPath || JSON.stringify(ref);
}

function getMediaReferenceSource(media?: {
  kind?: string;
  source?: string;
  posterSource?: string;
}): string | undefined {
  if (!media) return undefined;
  if (media.kind === 'video') {
    return media.posterSource || undefined;
  }
  if (media.kind === 'audio') {
    return undefined;
  }
  return media.source || undefined;
}

function getDescriptionText(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value.trim() : fallback;
}

function pushVisualReference(
  bucket: LinghuiPromptReferenceItem[],
  params: {
    id: string;
    nodeId: string;
    kind: LinghuiPromptReferenceKind;
    name: string;
    description?: string;
    source?: string;
    previewSource?: string;
  },
) {
  if (!params.source) return;

  bucket.push({
    id: params.id,
    nodeId: params.nodeId,
    kind: params.kind,
    name: params.name,
    description: params.description,
    source: params.source,
    previewSource: params.previewSource ?? params.source,
  });
}

function pushTextReference(
  bucket: LinghuiPromptReferenceItem[],
  params: {
    id: string;
    nodeId: string;
    name: string;
    description?: string;
    textValue?: string;
  },
) {
  const textValue = getDescriptionText(params.textValue);
  if (!textValue) return;

  bucket.push({
    id: params.id,
    nodeId: params.nodeId,
    kind: 'text',
    name: params.name,
    description: params.description,
    textValue,
  });
}

function buildResultReferences(
  nodeId: string,
  nodeData: LinghuiNodeData,
  result?: LinghuiNodeResult,
): LinghuiPromptReferenceItem[] {
  const refs: LinghuiPromptReferenceItem[] = [];
  if (!result) return refs;

  const normalizedResult = nodeData.linghuiType === 'linghui/image'
    ? resolveLinghuiImageResultWithSelectedPrimary(
        nodeData.properties as unknown as LinghuiImageNodeProperties,
        result,
      ) ?? result
    : result;
  const primary = getLinghuiResultPrimaryMedia(normalizedResult);
  const items = getLinghuiResultItems(normalizedResult);
  const shots = getLinghuiResultShots(normalizedResult);
  const textValue = getLinghuiResultText(normalizedResult);
  const baseName = getDescriptionText(primary?.label, nodeData.label) || nodeData.label;
  const baseDescription = `来自上游节点：${nodeData.label}`;
  const primaryKind = primary?.kind;

  if (primaryKind === 'audio') {
    refs.push({
      id: nodeId,
      nodeId,
      kind: 'audio',
      name: baseName,
      description: baseDescription,
      textValue:
        getDescriptionText(textValue) ||
        getDescriptionText(getLinghuiResultDescriptionText(normalizedResult)) ||
        baseName,
    });
  } else if (primaryKind === 'video' && !getMediaReferenceSource(primary)) {
    refs.push({
      id: nodeId,
      nodeId,
      kind: 'video',
      name: baseName,
      description: baseDescription,
      textValue: baseName,
    });
  } else {
    const primarySource = getMediaReferenceSource(primary);
    pushVisualReference(refs, {
      id: nodeId,
      nodeId,
      kind: primary?.kind === 'video' ? 'video' : 'image',
      name: baseName,
      description: baseDescription,
      source: primarySource,
      previewSource: primarySource,
    });
  }

  if (nodeData.linghuiType !== 'linghui/image') {
    items.forEach((item, index) => {
      const itemSource = getMediaReferenceSource(item);
      if (primaryKind !== 'audio' && index === 0 && itemSource && getMediaReferenceSource(primary) === itemSource) {
        return;
      }

      if (item.kind === 'audio') {
        refs.push({
          id: `${nodeId}__item_${index + 1}`,
          nodeId,
          kind: 'audio',
          name: getDescriptionText(item.label, `${baseName} ${index + 1}`) || `${baseName} ${index + 1}`,
          description: `${baseDescription} · 产物 ${index + 1}`,
          textValue: getDescriptionText(item.label, `${baseName} ${index + 1}`) || `${baseName} ${index + 1}`,
        });
        return;
      }

      if (item.kind === 'video' && !itemSource) {
        refs.push({
          id: `${nodeId}__item_${index + 1}`,
          nodeId,
          kind: 'video',
          name: getDescriptionText(item.label, `${baseName} ${index + 1}`) || `${baseName} ${index + 1}`,
          description: `${baseDescription} · 产物 ${index + 1}`,
          textValue: getDescriptionText(item.label, `${baseName} ${index + 1}`) || `${baseName} ${index + 1}`,
        });
        return;
      }

      pushVisualReference(refs, {
        id: `${nodeId}__item_${index + 1}`,
        nodeId,
        kind: item.kind === 'video' ? 'video' : 'image',
        name: getDescriptionText(item.label, `${baseName} ${index + 1}`) || `${baseName} ${index + 1}`,
        description: `${baseDescription} · 产物 ${index + 1}`,
        source: itemSource,
        previewSource: itemSource,
      });
    });
  }

  shots.forEach((shot, index) => {
    const shotSource = getMediaReferenceSource(shot.image);
    const shotId = `${nodeId}__shot_${index + 1}`;
    const shotName = getDescriptionText(shot.title, `${baseName} 分镜 ${index + 1}`) || `${baseName} 分镜 ${index + 1}`;
    const shotDescription = getDescriptionText(shot.description, `${baseDescription} · 分镜 ${index + 1}`);

    if (shotSource) {
      pushVisualReference(refs, {
        id: shotId,
        nodeId,
        kind: 'image',
        name: shotName,
        description: shotDescription,
        source: shotSource,
        previewSource: shotSource,
      });
      return;
    }

    pushTextReference(refs, {
      id: shotId,
      nodeId,
      name: shotName,
      description: shotDescription,
      textValue: shot.description || shot.title,
    });
  });

  pushTextReference(refs, {
    id: `${nodeId}__text`,
    nodeId,
    name: `${baseName} 文本`,
    description: baseDescription,
    textValue:
      getDescriptionText(textValue) ||
      getDescriptionText(getLinghuiResultDescriptionText(normalizedResult)),
  });

  return refs;
}

function buildFallbackReference(
  nodeId: string,
  nodeData: LinghuiNodeData,
): LinghuiPromptReferenceItem[] {
  if (nodeData.linghuiType === 'linghui/audio') {
    const source = getDescriptionText((nodeData.properties as Record<string, unknown>)?.source);
    if (!source) {
      return [];
    }

    return [{
      id: nodeId,
      nodeId,
      kind: 'audio',
      name: nodeData.label,
      description: `来自上游节点：${nodeData.label}`,
      textValue: nodeData.label,
    }];
  }

  if (nodeData.linghuiType === 'linghui/image') {
    const properties = nodeData.properties as unknown as LinghuiImageNodeProperties;
    const mode = resolveImageFallbackMode(properties);
    const source = getDescriptionText(properties.source);
    if (!source || mode !== 'import') {
      return [];
    }

    return [{
      id: nodeId,
      nodeId,
      kind: 'image',
      name: nodeData.label,
      description: `来自上游节点：${nodeData.label}`,
      source,
      previewSource: source,
    }];
  }

  if (nodeData.linghuiType === 'linghui/video') {
    const properties = nodeData.properties as unknown as LinghuiVideoNodeProperties;
    const source = getDescriptionText(properties.source);
    const posterSource = getDescriptionText(properties.posterSource);
    if (!source && !posterSource) {
      return [];
    }

    return [{
      id: nodeId,
      nodeId,
      kind: 'video',
      name: nodeData.label,
      description: `来自上游节点：${nodeData.label}`,
      ...(posterSource
        ? {
            source: posterSource,
            previewSource: posterSource,
          }
        : {
            textValue: nodeData.label,
          }),
    }];
  }

  if (nodeData.linghuiType === 'linghui/text') {
    const properties = nodeData.properties as unknown as LinghuiTextNodeProperties;
    if (properties.mode !== 'manual') {
      return [];
    }

    const content = getDescriptionText(properties.content);
    if (!content) {
      return [];
    }

    return [{
      id: `${nodeId}__text`,
      nodeId,
      kind: 'text',
      name: nodeData.label,
      description: `来自上游节点：${nodeData.label}`,
      textValue: content,
    }];
  }

  if (nodeData.linghuiType === 'linghui/script') {
    const properties = nodeData.properties as unknown as LinghuiScriptNodeProperties;
    const content = getDescriptionText(
      properties.mode === 'manual' ? properties.content : properties.prompt,
    );
    if (!content) {
      return [];
    }

    return [{
      id: `${nodeId}__text`,
      nodeId,
      kind: 'text',
      name: nodeData.label,
      description: `来自上游节点：${nodeData.label}`,
      textValue: content,
    }];
  }

  return [];
}

function getHandleIndex(handleId: string | null | undefined, prefix: 'input' | 'output'): number {
  if (!handleId) return 0;
  const match = handleId.match(new RegExp(`^${prefix}-(\\d+)$`));
  return match ? Number(match[1]) : 0;
}

export function getOrderedIncomingReferenceEdges(
  nodeId: string,
  edges: LinghuiPromptReferenceEdge[],
): LinghuiPromptReferenceEdge[] {
  return edges
    .map((edge, index) => ({ edge, index }))
    .filter(item => item.edge.target === nodeId)
    .sort((left, right) => (
      getHandleIndex(left.edge.targetHandle, 'input') - getHandleIndex(right.edge.targetHandle, 'input')
      || getHandleIndex(left.edge.sourceHandle, 'output') - getHandleIndex(right.edge.sourceHandle, 'output')
      || left.index - right.index
    ))
    .map(item => item.edge);
}

function collectUpstreamNodeIds(
  nodeId: string,
  edges: LinghuiPromptReferenceEdge[],
): string[] {
  const queue = getOrderedIncomingReferenceEdges(nodeId, edges).map(edge => edge.source);
  const seen = new Set<string>();
  const ordered: string[] = [];

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    if (seen.has(currentId)) continue;

    seen.add(currentId);
    ordered.push(currentId);

    const parents = getOrderedIncomingReferenceEdges(currentId, edges).map(edge => edge.source);
    queue.push(...parents);
  }

  return ordered;
}

export function buildLinghuiPromptReferenceItems(params: {
  nodeId: string;
  nodes: Array<{ id: string; data: LinghuiNodeData }>;
  edges: LinghuiPromptReferenceEdge[];
  getNodeResult?: (nodeId: string) => LinghuiNodeResult | undefined;
}): LinghuiPromptReferenceItem[] {
  const { nodeId, nodes, edges, getNodeResult } = params;
  const nodeMap = new Map(nodes.map(node => [node.id, node.data]));
  const upstreamIds = collectUpstreamNodeIds(nodeId, edges);
  const refs: LinghuiPromptReferenceItem[] = [];
  const seenRefIds = new Set<string>();

  for (const upstreamId of upstreamIds) {
    const nodeData = nodeMap.get(upstreamId);
    if (!nodeData) continue;

    const candidates = [
      ...buildResultReferences(upstreamId, nodeData, getNodeResult?.(upstreamId)),
      ...buildFallbackReference(upstreamId, nodeData),
    ];

    for (const item of candidates) {
      if (seenRefIds.has(item.id)) continue;
      seenRefIds.add(item.id);
      refs.push(item);
    }
  }

  return refs;
}

export interface CompileLinghuiPromptReferencesResult {
  compiledPrompt: string;
  compiledReferences: Array<MediaAssetSource | ProviderAssetInput>;
  unresolvedMentions: string[];
}

export function compileLinghuiPromptReferences(params: {
  prompt: string;
  references: LinghuiPromptReferenceItem[];
  extraReferences?: Array<MediaAssetSource | ProviderAssetInput>;
  replacementStrategy: 'image-index' | 'readable-name';
  primaryReferenceId?: string;
  ensurePrimaryReference?: boolean;
}): CompileLinghuiPromptReferencesResult {
  const {
    references,
  } = params;
  return compilePromptReferences({
    ...params,
    references: references.map(item => ({
      id: item.id,
      name: item.name,
      textValue: item.textValue,
      source: item.source,
    })),
  });
}

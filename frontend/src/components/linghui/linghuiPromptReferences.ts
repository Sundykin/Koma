import type { MediaAssetSource, ProviderAssetInput } from '../../types';
import type {
  LinghuiNodeData,
  LinghuiNodeResult,
  LinghuiReferenceNodeProperties,
} from '../../types/linghui';

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

export interface ParsedLinghuiPromptReference {
  id: string;
  fullMatch: string;
  from: number;
  to: number;
}

export const LINGHUI_PROMPT_REFERENCE_REGEX = /@ref_([a-zA-Z0-9_-]+)/g;

export function parseLinghuiPromptReferences(text: string): ParsedLinghuiPromptReference[] {
  const refs: ParsedLinghuiPromptReference[] = [];
  let match: RegExpExecArray | null;
  const regex = new RegExp(LINGHUI_PROMPT_REFERENCE_REGEX.source, 'g');

  while ((match = regex.exec(text)) !== null) {
    refs.push({
      id: match[1],
      fullMatch: match[0],
      from: match.index,
      to: match.index + match[0].length,
    });
  }

  return refs;
}

export function createLinghuiPromptReferenceString(id: string): string {
  return `@ref_${id}`;
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

  const baseName = getDescriptionText(result.primary?.label, nodeData.label) || nodeData.label;
  const baseDescription = `来自上游节点：${nodeData.label}`;

  const primarySource = getMediaReferenceSource(result.primary);
  pushVisualReference(refs, {
    id: nodeId,
    nodeId,
    kind: result.primary?.kind === 'video' ? 'video' : 'image',
    name: baseName,
    description: baseDescription,
    source: primarySource,
    previewSource: primarySource,
  });

  result.items?.forEach((item, index) => {
    if (index === 0 && primarySource && getMediaReferenceSource(item) === primarySource) {
      return;
    }

    const itemSource = getMediaReferenceSource(item);
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

  result.shots?.forEach((shot, index) => {
    const shotSource = getMediaReferenceSource(shot.image);
    pushVisualReference(refs, {
      id: `${nodeId}__shot_${index + 1}`,
      nodeId,
      kind: 'image',
      name: getDescriptionText(shot.title, `${baseName} 分镜 ${index + 1}`) || `${baseName} 分镜 ${index + 1}`,
      description: getDescriptionText(shot.description, `${baseDescription} · 分镜 ${index + 1}`),
      source: shotSource,
      previewSource: shotSource,
    });
  });

  pushTextReference(refs, {
    id: `${nodeId}__text`,
    nodeId,
    name: `${baseName} 文本`,
    description: baseDescription,
    textValue:
      getDescriptionText(result.text) ||
      getDescriptionText(result.metadata?.description) ||
      getDescriptionText(result.metadata?.note),
  });

  return refs;
}

function buildFallbackReference(
  nodeId: string,
  nodeData: LinghuiNodeData,
): LinghuiPromptReferenceItem[] {
  if (nodeData.linghuiType !== 'linghui/reference') {
    return [];
  }

  const properties = nodeData.properties as unknown as LinghuiReferenceNodeProperties;
  const source = getDescriptionText(properties.source);
  if (!source) {
    return [];
  }

  const note = getDescriptionText(properties.note, nodeData.label) || nodeData.label;
  return [{
    id: nodeId,
    nodeId,
    kind: 'image',
    name: note,
    description: `来自上游节点：${nodeData.label}`,
    source,
    previewSource: source,
  }];
}

function collectUpstreamNodeIds(
  nodeId: string,
  edges: Array<{ source: string; target: string }>,
): string[] {
  const queue = edges.filter(edge => edge.target === nodeId).map(edge => edge.source);
  const seen = new Set<string>();
  const ordered: string[] = [];

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    if (seen.has(currentId)) continue;

    seen.add(currentId);
    ordered.push(currentId);

    const parents = edges
      .filter(edge => edge.target === currentId)
      .map(edge => edge.source);
    queue.push(...parents);
  }

  return ordered;
}

export function buildLinghuiPromptReferenceItems(params: {
  nodeId: string;
  nodes: Array<{ id: string; data: LinghuiNodeData }>;
  edges: Array<{ source: string; target: string }>;
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
    prompt,
    references,
    extraReferences = [],
    replacementStrategy,
    primaryReferenceId,
    ensurePrimaryReference = false,
  } = params;

  const parsedRefs = parseLinghuiPromptReferences(prompt);
  const refMap = new Map(references.map(item => [item.id, item]));
  const visualRefs: Array<MediaAssetSource | ProviderAssetInput> = [];
  const visualKeys = new Set<string>();
  const imageIndexByRefId = new Map<string, number>();
  const unresolvedMentions: string[] = [];
  let compiledPrompt = prompt;
  let nextImageIndex = primaryReferenceId && replacementStrategy === 'image-index' ? 2 : 1;

  const replacements = parsedRefs.map(parsed => {
    const item = refMap.get(parsed.id);
    if (!item) {
      unresolvedMentions.push(parsed.fullMatch);
      return null;
    }

    const isPrimaryReference = Boolean(item.source && item.id === primaryReferenceId);
    if (isPrimaryReference) {
      if (replacementStrategy === 'image-index') {
        imageIndexByRefId.set(item.id, 1);
        return { ...parsed, replacement: '@Image 1' };
      }
      return { ...parsed, replacement: item.name };
    }

    if (item.source) {
      if (!visualKeys.has(buildRefKey(item.source))) {
        visualRefs.push(item.source);
        visualKeys.add(buildRefKey(item.source));
      }

      if (replacementStrategy === 'image-index') {
        const existing = imageIndexByRefId.get(item.id);
        const index = existing ?? nextImageIndex++;
        imageIndexByRefId.set(item.id, index);
        return { ...parsed, replacement: `@Image ${index}` };
      }

      return { ...parsed, replacement: item.name };
    }

    return {
      ...parsed,
      replacement: item.textValue || item.name,
    };
  }).filter(Boolean) as Array<ParsedLinghuiPromptReference & { replacement: string }>;

  const sorted = [...replacements].sort((left, right) => right.from - left.from);
  for (const item of sorted) {
    compiledPrompt = compiledPrompt.slice(0, item.from) + item.replacement + compiledPrompt.slice(item.to);
  }

  if (
    replacementStrategy === 'image-index' &&
    ensurePrimaryReference &&
    primaryReferenceId &&
    !/\@Image\s+1\b/.test(compiledPrompt)
  ) {
    compiledPrompt = `@Image 1 ${compiledPrompt}`.trim();
  }

  const compiledReferences = [...visualRefs];
  const compiledReferenceKeys = new Set(compiledReferences.map(buildRefKey));
  for (const ref of extraReferences) {
    const key = buildRefKey(ref);
    if (compiledReferenceKeys.has(key)) continue;
    compiledReferenceKeys.add(key);
    compiledReferences.push(ref);
  }

  return {
    compiledPrompt,
    compiledReferences,
    unresolvedMentions,
  };
}

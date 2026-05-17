import type { MediaAssetSource, ProviderAssetInput } from '../../../../types';
import type { LinghuiNodeData, LinghuiNodeResult } from '../../../../types/linghui';
import {
  compilePromptReferences,
  parsePromptReferences,
  type ParsedPromptReference,
} from '../../../../services/promptCompilation/promptReferenceCompiler';
import { buildLinghuiVisualSourceKey } from '../../utils/linghuiMediaAssetSource';
import {
  buildResultReferences,
  buildFallbackReference,
  resolvePromptReferenceSourceValue,
} from './linghuiPromptReferenceHelpers';
import { collectOrderedUpstreamReferenceNodeIds, getOrderedIncomingReferenceEdges } from './linghuiPromptReferenceEdges';

export type LinghuiPromptReferenceKind = 'image' | 'video' | 'audio' | 'text';

export interface LinghuiPromptReferenceItem {
  id: string; nodeId: string; kind: LinghuiPromptReferenceKind; name: string;
  description?: string; source?: MediaAssetSource; previewSource?: string; textValue?: string;
}

export interface LinghuiPromptReferenceEdge {
  source: string; target: string; sourceHandle?: string | null; targetHandle?: string | null;
}

export type ParsedLinghuiPromptReference = ParsedPromptReference;

export const LINGHUI_PROMPT_REFERENCE_REGEX = /@ref_([a-zA-Z0-9_-]+)/g;

export function parseLinghuiPromptReferences(text: string): ParsedLinghuiPromptReference[] {
  return parsePromptReferences(text);
}

export function createLinghuiPromptReferenceString(id: string): string {
  return `@ref_${id}`;
}

export function collectLinghuiPromptReferenceImageSources(references: LinghuiPromptReferenceItem[]): MediaAssetSource[] {
  const sources: MediaAssetSource[] = [];
  const dedupe = new Set<string>();
  const pushSource = (candidate?: MediaAssetSource) => {
    const key = buildLinghuiVisualSourceKey(candidate);
    if (!candidate || !key || dedupe.has(key)) return;
    dedupe.add(key); sources.push(candidate);
  };
  for (const item of references) {
    if (item.kind !== 'image') continue;
    pushSource(item.source ?? item.previewSource);
  }
  return sources;
}

export { getOrderedIncomingReferenceEdges, collectOrderedUpstreamReferenceNodeIds };

export function buildLinghuiPromptReferenceItems(params: {
  nodeId: string; nodes: Array<{ id: string; data: LinghuiNodeData }>;
  edges: LinghuiPromptReferenceEdge[]; getNodeResult?: (nodeId: string) => LinghuiNodeResult | undefined;
}): LinghuiPromptReferenceItem[] {
  const { nodeId, nodes, edges, getNodeResult } = params;
  const nodeMap = new Map(nodes.map(node => [node.id, node.data]));
  const upstreamIds = collectOrderedUpstreamReferenceNodeIds(nodeId, edges);
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
      seenRefIds.add(item.id); refs.push(item as LinghuiPromptReferenceItem);
    }
  }
  return refs;
}

export interface CompileLinghuiPromptReferencesResult {
  compiledPrompt: string; compiledReferences: Array<MediaAssetSource | ProviderAssetInput>; unresolvedMentions: string[];
}

export function compileLinghuiPromptReferences(params: {
  prompt: string; references: LinghuiPromptReferenceItem[];
  extraReferences?: Array<MediaAssetSource | ProviderAssetInput>;
  replacementStrategy: 'image-index' | 'readable-name'; primaryReferenceId?: string; ensurePrimaryReference?: boolean;
}): CompileLinghuiPromptReferencesResult {
  return compilePromptReferences({
    ...params,
    references: params.references.map(item => ({
      id: item.id, name: item.name,
      kind: item.kind === 'image' || item.kind === 'video' || item.kind === 'audio' ? item.kind : undefined,
      textValue: item.textValue, source: item.source,
    })),
  });
}

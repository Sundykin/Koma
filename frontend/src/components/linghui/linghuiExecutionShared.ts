import { nanoid } from 'nanoid';
import { electronService } from '../../services/electronService';
import type {
  LinghuiAudioNodeProperties,
  LinghuiExecutionContext,
  LinghuiImageNodeProperties,
  LinghuiExecutionLogEntry,
  LinghuiImageNodeMode,
  LinghuiMediaItem,
  LinghuiNodeResult,
  LinghuiNodeType,
  LinghuiRFNodeSnapshot,
  LinghuiScriptNodeProperties,
  LinghuiTextNodeProperties,
  LinghuiVideoNodeProperties,
} from '../../types/linghui';
import {
  buildLinghuiPromptReferenceItems,
  getOrderedIncomingReferenceEdges,
  parseLinghuiPromptReferences,
  type LinghuiPromptReferenceItem,
} from './linghuiPromptReferences';
import {
  resolveLinghuiImageCollection,
  resolveLinghuiImageResultWithSelectedPrimary,
} from './linghuiImageCollections';

export const EXECUTION_PROJECT_ID = 'linghui';

export class LinghuiExecutionCancelledError extends Error {
  constructor(message = '执行已取消') {
    super(message);
    this.name = 'LinghuiExecutionCancelledError';
  }
}

export function isLinghuiExecutionCancelledError(error: unknown): error is LinghuiExecutionCancelledError {
  return error instanceof LinghuiExecutionCancelledError;
}

export function throwIfExecutionAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  const reason = typeof signal.reason === 'string' && signal.reason.trim()
    ? signal.reason
    : '执行已取消';
  throw new LinghuiExecutionCancelledError(reason);
}

export function delay(ms: number, signal?: AbortSignal): Promise<void> {
  throwIfExecutionAborted(signal);

  return new Promise((resolve, reject) => {
    const timerId = window.setTimeout(() => {
      signal?.removeEventListener('abort', handleAbort);
      resolve();
    }, ms);

    const handleAbort = () => {
      window.clearTimeout(timerId);
      signal?.removeEventListener('abort', handleAbort);
      reject(new LinghuiExecutionCancelledError(
        typeof signal?.reason === 'string' && signal.reason.trim()
          ? signal.reason
          : '执行已取消',
      ));
    };

    signal?.addEventListener('abort', handleAbort, { once: true });
  });
}

export function toPreviewSource(source?: string): string | undefined {
  if (!source) return undefined;
  if (
    source.startsWith('http://') ||
    source.startsWith('https://') ||
    source.startsWith('data:') ||
    source.startsWith('blob:') ||
    source.startsWith('koma-local://')
  ) {
    return source;
  }
  return electronService.fs.toLocalUrl(source);
}

function escapeSvgText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function createPlaceholderImage(params: {
  title: string;
  subtitle?: string;
  accent?: string;
  background?: string;
}): string {
  const { title, subtitle, accent = '#4ade80', background = '#0b1220' } = params;
  const lines = [escapeSvgText(title), escapeSvgText(subtitle ?? '')].filter(Boolean);
  const subtitleSvg = lines[1] ? `<text x="40" y="178" font-size="18" fill="#cbd5e1" opacity="0.9">${lines[1]}</text>` : '';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="640" viewBox="0 0 960 640">
    <defs><linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="${background}" /><stop offset="100%" stop-color="#020617" /></linearGradient></defs>
    <rect width="960" height="640" rx="36" fill="url(#bg)" />
    <circle cx="760" cy="120" r="150" fill="${accent}" opacity="0.18" />
    <rect x="40" y="40" width="880" height="560" rx="28" fill="none" stroke="${accent}" stroke-opacity="0.55" stroke-width="4" />
    <text x="40" y="132" font-size="34" font-weight="700" fill="#f8fafc">${lines[0] ?? ''}</text>
    ${subtitleSvg}
  </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function buildMediaItem(params: Partial<LinghuiMediaItem> & Pick<LinghuiMediaItem, 'kind'>): LinghuiMediaItem {
  return {
    ...params,
    source: toPreviewSource(params.source),
    posterSource: toPreviewSource(params.posterSource),
  };
}

export function createLog(level: LinghuiExecutionLogEntry['level'], message: string, nodeId?: string): LinghuiExecutionLogEntry {
  return { id: nanoid(10), level, message, nodeId, createdAt: Date.now() };
}

export interface ExecutionNodeView {
  id: string;
  type: LinghuiNodeType;
  properties: Record<string, unknown>;
  title: string;
  getAllInputResults: (slot: number) => LinghuiNodeResult[];
  getAllInputImages: () => LinghuiNodeResult[];
  getInputResult: (slot: number) => LinghuiNodeResult | undefined;
  getPromptReferences: () => LinghuiPromptReferenceItem[];
}

function resolveAllInputResults(context: LinghuiExecutionContext, nodeId: string, handleId = 'input-0'): LinghuiNodeResult[] {
  return getOrderedIncomingReferenceEdges(nodeId, context.edges)
    .filter(edge => edge.targetHandle === handleId)
    .map(edge => {
      const sourceNode = context.nodes.find(node => node.id === edge.source);
      const result = context.nodeOutputs[edge.source] ?? resolveStaticNodeResult(sourceNode);
      if (result && !context.nodeOutputs[edge.source]) {
        context.nodeOutputs[edge.source] = result;
      }
      if (!result) {
        return undefined;
      }

      if (sourceNode?.data.linghuiType !== 'linghui/image') {
        return result;
      }

      return resolveLinghuiImageResultWithSelectedPrimary(
        sourceNode.data.properties as unknown as LinghuiImageNodeProperties,
        result,
      );
    })
    .filter(Boolean) as LinghuiNodeResult[];
}

function resolveInputData(context: LinghuiExecutionContext, nodeId: string, inputSlotIndex: number): LinghuiNodeResult | undefined {
  const targetHandle = `input-${inputSlotIndex}`;
  const edge = getOrderedIncomingReferenceEdges(nodeId, context.edges)
    .find(item => item.targetHandle === targetHandle);
  if (!edge) {
    return undefined;
  }

  const sourceNode = context.nodes.find(node => node.id === edge.source);
  const result = context.nodeOutputs[edge.source] ?? resolveStaticNodeResult(sourceNode);
  if (result && !context.nodeOutputs[edge.source]) {
    context.nodeOutputs[edge.source] = result;
  }
  if (!result) {
    return undefined;
  }

  if (sourceNode?.data.linghuiType !== 'linghui/image') {
    return result;
  }

  return resolveLinghuiImageResultWithSelectedPrimary(
    sourceNode.data.properties as unknown as LinghuiImageNodeProperties,
    result,
  );
}

export function createNodeView(context: LinghuiExecutionContext, snapshot: LinghuiRFNodeSnapshot): ExecutionNodeView {
  const nodeId = snapshot.id;
  return {
    id: nodeId,
    type: snapshot.data.linghuiType,
    properties: snapshot.data.properties,
    title: snapshot.data.label,
    getAllInputResults(slot) {
      return resolveAllInputResults(context, nodeId, `input-${slot}`);
    },
    getAllInputImages() {
      return resolveAllInputResults(context, nodeId);
    },
    getInputResult(slot) {
      return resolveInputData(context, nodeId, slot);
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

  if (snapshot.data.linghuiType === 'linghui/image') {
    const properties = snapshot.data.properties as unknown as LinghuiImageNodeProperties;
    const collection = resolveLinghuiImageCollection(properties);
    if (!collection.primary) {
      return undefined;
    }

    const items = collection.items.map(item => buildMediaItem(item));
    const primary = collection.primary ? buildMediaItem(collection.primary) : undefined;
    return {
      kind: items.length > 1 ? 'images' : 'image',
      primary,
      items: items.length > 1 ? items : undefined,
      metadata: {
        source: primary?.source,
        mode: collection.mode,
        itemCount: items.length,
      },
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

    return {
      kind: 'storyboard',
      text: content,
      metadata: {
        mode: 'manual',
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

export function collectReferenceSources(results: LinghuiNodeResult[]): string[] {
  const sources: string[] = [];
  const dedupe = new Set<string>();
  const pushSource = (candidate?: string) => {
    if (!candidate || dedupe.has(candidate)) return;
    dedupe.add(candidate);
    sources.push(candidate);
  };

  for (const result of results) {
    if (result.primary?.kind === 'image') {
      pushSource(result.primary.source);
    }
  }

  return sources;
}

export function collectVideoPosterSources(results: LinghuiNodeResult[]): string[] {
  const sources: string[] = [];
  const dedupe = new Set<string>();
  const pushSource = (candidate?: string) => {
    if (!candidate || dedupe.has(candidate)) return;
    dedupe.add(candidate);
    sources.push(candidate);
  };

  for (const result of results) {
    if (result.primary?.kind === 'video') {
      pushSource(result.primary.posterSource);
    }

    for (const item of result.items ?? []) {
      if (item.kind === 'video') {
        pushSource(item.posterSource);
      }
    }
  }

  return sources;
}

export function mergeUniqueSources(...groups: string[][]): string[] {
  const merged: string[] = [];
  const dedupe = new Set<string>();

  for (const group of groups) {
    for (const source of group) {
      if (!source || dedupe.has(source)) continue;
      dedupe.add(source);
      merged.push(source);
    }
  }

  return merged;
}

export function collectTextSnippets(results: LinghuiNodeResult[]): string[] {
  const snippets: string[] = [];
  const dedupe = new Set<string>();

  for (const result of results) {
    const candidate = String(
      result.text ??
      result.metadata?.description ??
      result.metadata?.note ??
      '',
    ).trim();

    if (!candidate || dedupe.has(candidate)) continue;
    dedupe.add(candidate);
    snippets.push(candidate);
  }

  return snippets;
}

export function mergePromptWithTextInputs(prompt: string, textSnippets: string[]): string {
  const normalizedPrompt = prompt.trim();
  if (!textSnippets.length) {
    return normalizedPrompt;
  }

  if (parseLinghuiPromptReferences(normalizedPrompt).length > 0) {
    return normalizedPrompt;
  }

  const contextBlock = textSnippets.join('\n\n');
  return normalizedPrompt ? `${contextBlock}\n\n${normalizedPrompt}` : contextBlock;
}

export function resolveImageNodeMode(params: { source?: string; mode?: unknown }): LinghuiImageNodeMode {
  if (params.mode === 'import' || params.mode === 'generate') {
    return params.mode;
  }
  return String(params.source ?? '').trim() ? 'import' : 'generate';
}

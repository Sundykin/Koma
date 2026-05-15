import { nanoid } from 'nanoid';
import { toFileSystemDisplayUrl } from '../../../../services/fileSystemPort';
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
  parseLinghuiPromptReferences,
  type LinghuiPromptReferenceItem,
} from '../../editors/state/linghuiPromptReferences';
import { DEFAULT_THEME_ID, getThemeById } from '../../../../theme/themes';
import {
  resolveLinghuiImageCollection,
  resolveLinghuiImageResultWithSelectedPrimary,
} from '../../editors/state/linghuiImageCollections';
import { parseLinghuiScriptContent } from '../../editors/state/linghuiScriptNodeUtils';
import type { MediaAssetSource } from '../../../../types';
import {
  buildLinghuiVisualSourceKey,
  resolveLinghuiMediaAssetSource,
} from '../../utils/linghuiMediaAssetSource';

export const EXECUTION_PROJECT_ID = 'linghui';
const placeholderThemeTokens = getThemeById(DEFAULT_THEME_ID).tokens;
const PLACEHOLDER_COLORS = {
  accent: placeholderThemeTokens.status.success,
  backgroundStart: placeholderThemeTokens.bg.surface,
  backgroundEnd: placeholderThemeTokens.bg.app,
  title: placeholderThemeTokens.text.primary,
  subtitle: placeholderThemeTokens.text.secondary,
} as const;

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
  return toFileSystemDisplayUrl(source);
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
  const { title, subtitle, accent = PLACEHOLDER_COLORS.accent, background = PLACEHOLDER_COLORS.backgroundStart } = params;
  const lines = [escapeSvgText(title), escapeSvgText(subtitle ?? '')].filter(Boolean);
  const subtitleSvg = lines[1] ? `<text x="40" y="178" font-size="18" fill="${PLACEHOLDER_COLORS.subtitle}" opacity="0.9">${lines[1]}</text>` : '';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="640" viewBox="0 0 960 640">
    <defs><linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="${background}" /><stop offset="100%" stop-color="${PLACEHOLDER_COLORS.backgroundEnd}" /></linearGradient></defs>
    <rect width="960" height="640" rx="36" fill="url(#bg)" />
    <circle cx="760" cy="120" r="150" fill="${accent}" opacity="0.18" />
    <rect x="40" y="40" width="880" height="560" rx="28" fill="none" stroke="${accent}" stroke-opacity="0.55" stroke-width="4" />
    <text x="40" y="132" font-size="34" font-weight="700" fill="${PLACEHOLDER_COLORS.title}">${lines[0] ?? ''}</text>
    ${subtitleSvg}
  </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function buildMediaItem<TKind extends LinghuiMediaItem['kind']>(
  params: Partial<LinghuiMediaItem> & { kind: TKind },
): LinghuiMediaItem & { kind: TKind } {
  return {
    ...params,
    source: toPreviewSource(params.source),
    posterSource: toPreviewSource(params.posterSource),
  } as LinghuiMediaItem & { kind: TKind };
}

export function createLog(level: LinghuiExecutionLogEntry['level'], message: string, nodeId?: string): LinghuiExecutionLogEntry {
  return { id: nanoid(10), level, message, nodeId, createdAt: Date.now() };
}

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

export function collectReferenceSources(results: LinghuiNodeResult[]): MediaAssetSource[] {
  const sources: MediaAssetSource[] = [];
  const dedupe = new Set<string>();
  const pushSource = (candidate?: MediaAssetSource) => {
    const key = buildLinghuiVisualSourceKey(candidate);
    if (!candidate || !key || dedupe.has(key)) return;
    dedupe.add(key);
    sources.push(candidate);
  };

  for (const result of results) {
    const primary = getLinghuiResultPrimaryMedia(result);
    if (primary?.kind === 'image') {
      pushSource(resolveLinghuiMediaAssetSource(primary));
    }
    // 上游视频也算图片参考：用其首帧 posterSource 作为下游图片节点的参考图，
    // 否则 3D 导演台 / 视频节点的输出在 image 槽位被无效化（减产）
    if (primary?.kind === 'video' && primary.posterSource) {
      pushSource(resolveLinghuiMediaAssetSource(primary, {
        kind: 'image',
        sourceOverride: primary.posterSource,
        usePersist: false,
      }));
    }

    for (const item of getLinghuiResultItems(result)) {
      if (item.kind === 'image') {
        pushSource(resolveLinghuiMediaAssetSource(item));
      } else if (item.kind === 'video' && item.posterSource) {
        pushSource(resolveLinghuiMediaAssetSource(item, {
          kind: 'image',
          sourceOverride: item.posterSource,
          usePersist: false,
        }));
      }
    }
  }

  return sources;
}

/**
 * 收集上游结果里的真实视频源（.mp4 / .mov URL），用于下游 video 节点做 video-to-video。
 * 与 collectVideoPosterSources（取首帧静态图）正交：前者用于 video provider 的 video reference，
 * 后者用于 image-to-video provider 的首帧驱动。
 */
export function collectVideoSources(results: LinghuiNodeResult[]): string[] {
  const sources: string[] = [];
  const dedupe = new Set<string>();
  const pushSource = (candidate?: string) => {
    if (!candidate || dedupe.has(candidate)) return;
    dedupe.add(candidate);
    sources.push(candidate);
  };

  for (const result of results) {
    const primary = getLinghuiResultPrimaryMedia(result);
    if (primary?.kind === 'video') {
      pushSource(primary.source);
    }
    for (const item of getLinghuiResultItems(result)) {
      if (item.kind === 'video') {
        pushSource(item.source);
      }
    }
  }

  return sources;
}

export function collectVideoPosterSources(results: LinghuiNodeResult[]): MediaAssetSource[] {
  const sources: MediaAssetSource[] = [];
  const dedupe = new Set<string>();
  const pushSource = (candidate?: MediaAssetSource) => {
    const key = buildLinghuiVisualSourceKey(candidate);
    if (!candidate || !key || dedupe.has(key)) return;
    dedupe.add(key);
    sources.push(candidate);
  };

  for (const result of results) {
    const primary = getLinghuiResultPrimaryMedia(result);
    if (primary?.kind === 'video') {
      pushSource(resolveLinghuiMediaAssetSource(primary, {
        kind: 'image',
        sourceOverride: primary.posterSource,
        usePersist: false,
      }));
    }

    for (const item of getLinghuiResultItems(result)) {
      if (item.kind === 'video') {
        pushSource(resolveLinghuiMediaAssetSource(item, {
          kind: 'image',
          sourceOverride: item.posterSource,
          usePersist: false,
        }));
      }
    }
  }

  return sources;
}

export function mergeUniqueSources<TSource extends MediaAssetSource>(...groups: TSource[][]): TSource[] {
  const merged: TSource[] = [];
  const dedupe = new Set<string>();

  for (const group of groups) {
    for (const source of group) {
      const key = buildLinghuiVisualSourceKey(source);
      if (!source || !key || dedupe.has(key)) continue;
      dedupe.add(key);
      merged.push(source);
    }
  }

  return merged;
}

export function collectTextSnippets(results: LinghuiNodeResult[]): string[] {
  const snippets: string[] = [];
  const dedupe = new Set<string>();

  for (const result of results) {
    const candidate = String(getLinghuiResultText(result) ?? getLinghuiResultDescriptionText(result) ?? '').trim();

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

import { nanoid } from 'nanoid';
import type { MediaAssetSource, ProviderAssetInput } from '../../types';
import { DEFAULT_POLLING_CONFIG } from '../../providers/polling';
import { getProjectITVProvider, getProjectTTIProvider } from '../../providers';
import type { ITVProvider, ITVResult } from '../../providers/itv/types';
import type { ImageResult } from '../../providers/tti/types';
import { ensureRemoteUrlForImageSource } from '../../services/mediaRemoteUrlService';
import { resolveProviderAssetInput } from '../../services/mediaAssetResolver';
import { electronService } from '../../services/electronService';
import type {
  LinghuiExecutionContext,
  LinghuiExecutionLogEntry,
  LinghuiGridType,
  LinghuiMediaItem,
  LinghuiNodeResult,
  LinghuiNodeRunState,
  LinghuiNodeType,
  LinghuiRFEdgeSnapshot,
  LinghuiRFNodeSnapshot,
  LinghuiReferenceNodeProperties,
  LinghuiVideoRefMode,
} from '../../types/linghui';
import { gridTypeToCount } from '../../types/linghui';
import {
  buildLinghuiPromptReferenceItems,
  compileLinghuiPromptReferences,
  type LinghuiPromptReferenceItem,
} from './linghuiPromptReferences';

const EXECUTION_PROJECT_ID = 'linghui';

function delay(ms: number): Promise<void> {
  return new Promise(resolve => window.setTimeout(resolve, ms));
}

function toPreviewSource(source?: string): string | undefined {
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

function createPlaceholderImage(params: {
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

function buildMediaItem(params: Partial<LinghuiMediaItem> & Pick<LinghuiMediaItem, 'kind'>): LinghuiMediaItem {
  return {
    ...params,
    source: toPreviewSource(params.source),
    posterSource: toPreviewSource(params.posterSource),
  };
}

function createLog(level: LinghuiExecutionLogEntry['level'], message: string, nodeId?: string): LinghuiExecutionLogEntry {
  return { id: nanoid(10), level, message, nodeId, createdAt: Date.now() };
}

interface ExecutionNodeView {
  id: string;
  type: LinghuiNodeType;
  properties: Record<string, unknown>;
  title: string;
  getAllInputImages: () => LinghuiNodeResult[];
  getInputResult: (slot: number) => LinghuiNodeResult | undefined;
  getPromptReferences: () => LinghuiPromptReferenceItem[];
}

function resolveAllInputResults(context: LinghuiExecutionContext, nodeId: string, handleId = 'input-0'): LinghuiNodeResult[] {
  return context.edges
    .filter(edge => edge.target === nodeId && edge.targetHandle === handleId)
    .map(edge => context.nodeOutputs[edge.source])
    .filter(Boolean);
}

function resolveInputData(context: LinghuiExecutionContext, nodeId: string, inputSlotIndex: number): LinghuiNodeResult | undefined {
  const targetHandle = `input-${inputSlotIndex}`;
  const edge = context.edges.find(item => item.target === nodeId && item.targetHandle === targetHandle);
  return edge ? context.nodeOutputs[edge.source] : undefined;
}

function createNodeView(context: LinghuiExecutionContext, snapshot: LinghuiRFNodeSnapshot): ExecutionNodeView {
  const nodeId = snapshot.id;
  return {
    id: nodeId,
    type: snapshot.data.linghuiType,
    properties: snapshot.data.properties,
    title: snapshot.data.label,
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
        })),
        getNodeResult(upstreamNodeId) {
          return context.nodeOutputs[upstreamNodeId];
        },
      });
    },
  };
}

function getPromptProtocol(provider: any): string | undefined {
  return provider?.config?.promptProtocol as string | undefined;
}

function supportsDataUrl(transports: ReadonlyArray<'remote-url' | 'data-url'> | undefined): boolean {
  return Boolean(transports?.includes('data-url'));
}

function providerAllowsDataUrlForITV(provider: ITVProvider): { primary: boolean; additional: boolean } {
  const primaryTransports = provider.assetTransports?.primaryImage;
  const additionalTransports = provider.assetTransports?.additionalReferences;
  return {
    primary: supportsDataUrl(primaryTransports),
    additional: supportsDataUrl(additionalTransports ?? primaryTransports),
  };
}

function collectReferenceSources(results: LinghuiNodeResult[]): string[] {
  const sources: string[] = [];
  const dedupe = new Set<string>();

  for (const result of results) {
    const primarySource = result.primary?.source;
    if (!primarySource || dedupe.has(primarySource)) continue;
    dedupe.add(primarySource);
    sources.push(primarySource);
  }

  return sources;
}

async function ensureProviderAssetInputs(
  sources: Array<MediaAssetSource | ProviderAssetInput>,
): Promise<ProviderAssetInput[]> {
  const resolved = await Promise.all(
    sources.map(async source => {
      if (source && typeof source === 'object' && 'transport' in source && 'value' in source) {
        return source as ProviderAssetInput;
      }
      return resolveProviderAssetInput(source as MediaAssetSource);
    }),
  );

  return resolved.filter(Boolean) as ProviderAssetInput[];
}

async function resolveAsyncProviderResult<T>(
  taskId: string,
  getTaskSnapshot: ((taskId: string) => Promise<{ state: string; progress?: number; output?: T; error?: string }>) | undefined,
  onProgress?: (progress: number, message?: string) => void,
): Promise<T> {
  if (!getTaskSnapshot) throw new Error('当前 Provider 不支持任务状态查询');

  const startedAt = Date.now();
  await delay(DEFAULT_POLLING_CONFIG.initialDelay ?? 0);

  while (Date.now() - startedAt < DEFAULT_POLLING_CONFIG.maxDuration) {
    const snapshot = await getTaskSnapshot(taskId);
    if (snapshot.state === 'running' || snapshot.state === 'queued') {
      onProgress?.(snapshot.progress ?? 0, '生成中');
      await delay(DEFAULT_POLLING_CONFIG.interval);
      continue;
    }
    if (snapshot.state === 'failed') throw new Error(snapshot.error || '生成失败');
    if (snapshot.state === 'succeeded' && snapshot.output) {
      onProgress?.(100, '生成完成');
      return snapshot.output;
    }
    await delay(DEFAULT_POLLING_CONFIG.interval);
  }

  throw new Error('任务轮询超时');
}

async function generateImageWithProvider(params: {
  prompt: string;
  referenceSources?: string[];
  steps?: number;
  onProgress?: (progress: number, message?: string) => void;
  placeholderTitle: string;
  placeholderSubtitle?: string;
  accent?: string;
  ttiConfigId?: string;
  promptReferences?: LinghuiPromptReferenceItem[];
}): Promise<LinghuiMediaItem> {
  const provider = await getProjectTTIProvider(params.ttiConfigId || undefined);
  if (!provider || !provider.validate()) {
    return buildMediaItem({
      kind: 'image',
      source: createPlaceholderImage({
        title: params.placeholderTitle,
        subtitle: params.placeholderSubtitle ?? (params.prompt || '未配置 TTI 服务，已生成占位预览'),
        accent: params.accent,
      }),
      placeholder: true,
    });
  }

  let compiledPrompt = params.prompt || params.placeholderTitle;
  let referenceSources: Array<MediaAssetSource | ProviderAssetInput> = params.referenceSources ?? [];
  const replacementStrategy = getPromptProtocol(provider) === 'grok-image-index'
    ? 'image-index'
    : 'readable-name';

  if ((params.promptReferences?.length ?? 0) > 0) {
    const compiled = compileLinghuiPromptReferences({
      prompt: compiledPrompt,
      references: params.promptReferences ?? [],
      extraReferences: referenceSources,
      replacementStrategy,
    });
    compiledPrompt = compiled.compiledPrompt;
    referenceSources = compiled.compiledReferences;
  }

  const references = await ensureProviderAssetInputs(referenceSources);
  const started = await provider.start({
    prompt: compiledPrompt,
    references,
    options: { steps: params.steps },
  });
  const output = started.mode === 'immediate'
    ? started.output
    : await resolveAsyncProviderResult<ImageResult>(started.taskId, provider.getTaskSnapshot, params.onProgress);

  return buildMediaItem({
    kind: 'image',
    source: output.url || output.path,
    mimeType: output.mimeType,
    width: output.width,
    height: output.height,
    metadata: output.metadata,
  });
}

async function normalizeAdditionalITVSources(
  sources: Array<MediaAssetSource | ProviderAssetInput>,
  requiresRemoteUrl: boolean,
): Promise<Array<MediaAssetSource | ProviderAssetInput>> {
  if (!requiresRemoteUrl || sources.length === 0) {
    return sources;
  }

  return Promise.all(
    sources.map((source, index) => {
      const rawSource = typeof source === 'object' && source && 'transport' in source
        ? source.value
        : source;
      return ensureRemoteUrlForImageSource({
        projectId: EXECUTION_PROJECT_ID,
        source: rawSource as MediaAssetSource,
        policy: 'required',
        filenameHint: `linghui-additional-${index + 1}.png`,
      });
    }),
  );
}

async function normalizePrimaryITVSource(
  source: MediaAssetSource | undefined,
  requiresRemoteUrl: boolean,
): Promise<MediaAssetSource | undefined> {
  if (!source || !requiresRemoteUrl) {
    return source;
  }

  return await ensureRemoteUrlForImageSource({
    projectId: EXECUTION_PROJECT_ID,
    source,
    policy: 'required',
    filenameHint: 'linghui-primary.png',
  }) as MediaAssetSource | undefined;
}

async function generateVideoWithProvider(params: {
  prompt: string;
  imageSource?: string;
  additionalReferenceSources?: string[];
  duration?: number;
  aspectRatio?: string;
  onProgress?: (progress: number, message?: string) => void;
  itvConfigId?: string;
  promptReferences?: LinghuiPromptReferenceItem[];
  primaryReferenceId?: string;
}): Promise<LinghuiMediaItem> {
  const placeholderPoster = params.imageSource
    ? toPreviewSource(params.imageSource)
    : createPlaceholderImage({ title: '视频预览占位', subtitle: '未配置 ITV 服务', accent: '#22c55e' });

  const provider = await getProjectITVProvider(params.itvConfigId || undefined);
  if (!provider || !provider.validate() || !params.imageSource) {
    return buildMediaItem({
      kind: 'video',
      posterSource: placeholderPoster,
      placeholder: true,
      metadata: { note: params.imageSource ? '未配置 ITV 服务。' : '缺少主参考图。' },
    });
  }

  const allow = providerAllowsDataUrlForITV(provider);
  const normalizedPrimary = await normalizePrimaryITVSource(params.imageSource, !allow.primary);
  let compiledPrompt = params.prompt;
  let additionalSources: Array<MediaAssetSource | ProviderAssetInput> = params.additionalReferenceSources ?? [];
  const replacementStrategy = getPromptProtocol(provider) === 'grok-image-index'
    ? 'image-index'
    : 'readable-name';

  if ((params.promptReferences?.length ?? 0) > 0) {
    const compiled = compileLinghuiPromptReferences({
      prompt: compiledPrompt,
      references: params.promptReferences ?? [],
      extraReferences: additionalSources,
      replacementStrategy,
      primaryReferenceId: params.primaryReferenceId,
      ensurePrimaryReference: replacementStrategy === 'image-index',
    });
    compiledPrompt = compiled.compiledPrompt;
    additionalSources = compiled.compiledReferences;
  }

  const normalizedAdditionalSources = await normalizeAdditionalITVSources(additionalSources, !allow.additional);
  const primaryImage = await resolveProviderAssetInput(normalizedPrimary);
  if (!primaryImage) throw new Error('无法解析主参考图');

  const additionalReferences = await ensureProviderAssetInputs(normalizedAdditionalSources);
  if (!allow.primary && primaryImage.transport !== 'remote-url') {
    throw new Error('当前 ITV Provider 仅支持远程 URL 主图');
  }
  if (!allow.additional && additionalReferences.some(item => item.transport !== 'remote-url')) {
    throw new Error('当前 ITV Provider 仅支持远程 URL 附加参考图');
  }

  const started = await provider.start({
    prompt: compiledPrompt,
    primaryImage,
    additionalReferences,
    options: { duration: params.duration, aspectRatio: params.aspectRatio } as Record<string, unknown>,
  } as any);

  const output = started.mode === 'immediate'
    ? started.output
    : await resolveAsyncProviderResult<ITVResult>(started.taskId, provider.getTaskSnapshot, params.onProgress);

  return buildMediaItem({
    kind: 'video',
    source: output.source,
    posterSource: placeholderPoster,
    durationSec: output.durationSec,
    width: output.width,
    height: output.height,
    mimeType: output.mimeType,
    metadata: output.metadata,
  });
}

async function executeReferenceNode(node: ExecutionNodeView): Promise<LinghuiNodeResult> {
  const { source = '', note = '' } = node.properties as unknown as LinghuiReferenceNodeProperties;
  const normalizedSource = String(source).trim();
  if (!normalizedSource) {
    throw new Error('请先上传参考图');
  }

  return {
    kind: 'image',
    primary: buildMediaItem({
      kind: 'image',
      source: normalizedSource,
      label: String(note || node.title),
      metadata: { note: String(note ?? '') },
    }),
    metadata: { note: String(note ?? '') },
  };
}

async function executeImageNode(
  node: ExecutionNodeView,
  onProgress?: (progress: number, message?: string) => void,
): Promise<LinghuiNodeResult> {
  const prompt = String(node.properties.prompt ?? '').trim();
  const ttiConfigId = String(node.properties.ttiConfigId ?? '');
  const gridType = (node.properties.gridType ?? 'none') as LinghuiGridType;
  const batchCount = Number(node.properties.batchCount ?? 1);
  const referenceSources = collectReferenceSources(node.getAllInputImages());
  const promptReferences = node.getPromptReferences();
  const count = gridType !== 'none' ? gridTypeToCount(gridType) : batchCount;

  if (count > 1) {
    const items = await Promise.all(
      Array.from({ length: count }, (_, i) => i).map(async index => {
        const label = gridType !== 'none' ? `画面 ${index + 1}` : `#${index + 1}`;
        const image = await generateImageWithProvider({
          prompt: prompt || node.title,
          referenceSources,
          ttiConfigId,
          promptReferences,
          onProgress: progress => onProgress?.(Math.round((index / count) * 100 + progress / count), `${label} 生成中`),
          placeholderTitle: label,
          placeholderSubtitle: prompt || '占位预览',
          accent: '#4ade80',
        });
        return { ...image, label };
      }),
    );

    return {
      kind: gridType !== 'none' ? 'grid' : 'images',
      primary: items[0],
      items,
      metadata: { prompt, gridType, batchCount: count },
    };
  }

  const image = await generateImageWithProvider({
    prompt: prompt || node.title,
    referenceSources,
    ttiConfigId,
    promptReferences,
    onProgress,
    placeholderTitle: node.title,
    placeholderSubtitle: prompt || '图片占位预览',
    accent: '#4ade80',
  });

  return {
    kind: 'image',
    primary: image,
    metadata: { prompt },
  };
}

async function executeVideoNode(
  node: ExecutionNodeView,
  onProgress?: (progress: number, message?: string) => void,
): Promise<LinghuiNodeResult> {
  const prompt = String(node.properties.prompt ?? '').trim();
  const itvConfigId = String(node.properties.itvConfigId ?? '');
  const refMode = (node.properties.refMode ?? 'all-ref') as LinghuiVideoRefMode;
  const duration = Number(node.properties.duration ?? 5);
  const aspectRatio = String(node.properties.aspectRatio ?? '16:9');
  const referenceSources = collectReferenceSources(node.getAllInputImages());
  const promptReferences = node.getPromptReferences();
  const primarySource = referenceSources[0];
  const additionalReferenceSources = refMode === 'all-ref' ? referenceSources.slice(1) : referenceSources.slice(1, 2);
  const primaryReferenceId = promptReferences.find(item => item.source === primarySource)?.id;

  const video = await generateVideoWithProvider({
    prompt: prompt || node.title,
    imageSource: primarySource,
    additionalReferenceSources,
    duration,
    aspectRatio,
    itvConfigId,
    promptReferences,
    primaryReferenceId,
    onProgress,
  });

  return {
    kind: 'video',
    primary: video,
    metadata: { prompt, refMode, duration, aspectRatio },
  };
}

async function executeStoryboardShotNode(
  node: ExecutionNodeView,
  onProgress?: (progress: number, message?: string) => void,
): Promise<LinghuiNodeResult> {
  const description = String(node.properties.description ?? '').trim();
  const durationSec = Number(node.properties.duration ?? 3);
  const connectedImage = node.getInputResult(0)?.primary?.source;
  const prompt = description;
  const promptReferences = node.getPromptReferences();
  const primary = connectedImage
    ? buildMediaItem({ kind: 'image', source: connectedImage })
    : await generateImageWithProvider({
        prompt: prompt || node.title,
        referenceSources: [],
        promptReferences,
        onProgress,
        placeholderTitle: node.title,
        placeholderSubtitle: description || '分镜占位预览',
        accent: '#2dd4bf',
      });

  return {
    kind: 'shot',
    primary,
    metadata: { title: node.title, description, durationSec, prompt },
  };
}

async function executeStoryboardGroupNode(node: ExecutionNodeView): Promise<LinghuiNodeResult> {
  const shots: LinghuiNodeResult[] = [];
  for (let index = 0; ; index += 1) {
    const result = node.getInputResult(index);
    if (result === undefined) break;
    if (result.kind === 'shot') shots.push(result);
  }

  if (!shots.length) throw new Error('请至少连接一个分镜节点');

  const frames = shots.map((result, index) => ({
    id: `${node.id}-${index + 1}`,
    title: String(result.metadata?.title ?? `分镜 ${index + 1}`),
    description: String(result.metadata?.description ?? ''),
    durationSec: Number(result.metadata?.durationSec ?? 3),
    image: result.primary,
  }));

  return {
    kind: 'storyboard',
    primary: frames[0].image,
    shots: frames,
    metadata: {
      title: String(node.properties.title ?? node.title),
      notes: String(node.properties.notes ?? ''),
      totalDurationSec: frames.reduce((sum, frame) => sum + frame.durationSec, 0),
    },
  };
}

async function executeNode(
  node: ExecutionNodeView,
  onProgress?: (progress: number, message?: string) => void,
): Promise<LinghuiNodeResult> {
  switch (node.type) {
    case 'linghui/reference':
      return executeReferenceNode(node);
    case 'linghui/image':
      return executeImageNode(node, onProgress);
    case 'linghui/video':
      return executeVideoNode(node, onProgress);
    case 'linghui/storyboard-shot':
      return executeStoryboardShotNode(node, onProgress);
    case 'linghui/storyboard-group':
      return executeStoryboardGroupNode(node);
    default:
      throw new Error(`暂不支持执行节点类型：${node.type}`);
  }
}

function getDirectUpstreamNodeIds(edges: LinghuiRFEdgeSnapshot[], nodeId: string): string[] {
  const incoming = new Set<string>();
  for (const edge of edges) {
    if (edge.target === nodeId) incoming.add(edge.source);
  }
  return [...incoming];
}

export function collectLinghuiDependentNodeIds(edges: LinghuiRFEdgeSnapshot[], rootNodeIds: string[]): string[] {
  const adjacency = new Map<string, Set<string>>();
  for (const edge of edges) {
    if (!adjacency.has(edge.source)) adjacency.set(edge.source, new Set());
    adjacency.get(edge.source)?.add(edge.target);
  }

  const queue = [...new Set(rootNodeIds)];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const next of adjacency.get(current) ?? []) {
      if (visited.has(next)) continue;
      visited.add(next);
      queue.push(next);
    }
  }

  return [...visited];
}

function collectRequiredNodeIds(edges: LinghuiRFEdgeSnapshot[], targetNodeIds: string[]): string[] {
  const stack = [...targetNodeIds];
  const required = new Set<string>(targetNodeIds);

  while (stack.length > 0) {
    const current = stack.pop()!;
    for (const upstreamId of getDirectUpstreamNodeIds(edges, current)) {
      if (required.has(upstreamId)) continue;
      required.add(upstreamId);
      stack.push(upstreamId);
    }
  }

  return [...required];
}

function topologicalSort(
  nodes: LinghuiRFNodeSnapshot[],
  edges: LinghuiRFEdgeSnapshot[],
  requiredNodeIds: Set<string>,
): LinghuiRFNodeSnapshot[] {
  const filteredNodes = nodes.filter(node => requiredNodeIds.has(node.id));
  const indegree = new Map<string, number>();
  const adjacency = new Map<string, Set<string>>();

  for (const node of filteredNodes) {
    indegree.set(node.id, 0);
    adjacency.set(node.id, new Set());
  }

  for (const edge of edges) {
    if (!requiredNodeIds.has(edge.source) || !requiredNodeIds.has(edge.target)) continue;
    adjacency.get(edge.source)?.add(edge.target);
    indegree.set(edge.target, (indegree.get(edge.target) ?? 0) + 1);
  }

  const queue = filteredNodes
    .filter(node => (indegree.get(node.id) ?? 0) === 0)
    .sort((a, b) => a.position.x - b.position.x || a.position.y - b.position.y);
  const ordered: LinghuiRFNodeSnapshot[] = [];

  while (queue.length > 0) {
    const node = queue.shift()!;
    ordered.push(node);

    for (const nextId of adjacency.get(node.id) ?? []) {
      const nextDegree = (indegree.get(nextId) ?? 0) - 1;
      indegree.set(nextId, nextDegree);
      if (nextDegree === 0) {
        const nextNode = filteredNodes.find(item => item.id === nextId);
        if (nextNode) queue.push(nextNode);
      }
    }
  }

  if (ordered.length === filteredNodes.length) {
    return ordered;
  }

  const orderedSet = new Set(ordered.map(node => node.id));
  return [...ordered, ...filteredNodes.filter(node => !orderedSet.has(node.id))];
}

export interface ExecuteLinghuiWorkflowOptions {
  context: LinghuiExecutionContext;
  targetNodeIds?: string[];
  previousRuns?: Record<string, LinghuiNodeRunState>;
  resolveTargetsOnly?: boolean;
  seedPreviousOutputs?: boolean;
  onNodeStateChange?: (nodeId: string, nextState: LinghuiNodeRunState) => void;
  onLog?: (entry: LinghuiExecutionLogEntry) => void;
}

function seedNodeOutputsFromRuns(
  previousRuns: Record<string, LinghuiNodeRunState>,
): Record<string, LinghuiNodeResult> {
  const outputs: Record<string, LinghuiNodeResult> = {};

  for (const [nodeId, runState] of Object.entries(previousRuns)) {
    if (!runState?.result) continue;
    if (runState.status !== 'succeeded' && runState.status !== 'stale') continue;
    outputs[nodeId] = runState.result;
  }

  return outputs;
}

export async function executeLinghuiWorkflow(options: ExecuteLinghuiWorkflowOptions): Promise<Record<string, LinghuiNodeRunState>> {
  const {
    context,
    targetNodeIds,
    previousRuns = {},
    resolveTargetsOnly = false,
    seedPreviousOutputs = true,
    onNodeStateChange,
    onLog,
  } = options;
  const normalizedTargetIds = targetNodeIds?.length ? targetNodeIds : context.nodes.map(node => node.id);
  const requiredNodeIds = new Set(
    resolveTargetsOnly
      ? normalizedTargetIds
      : collectRequiredNodeIds(context.edges, normalizedTargetIds),
  );
  const orderedNodes = topologicalSort(context.nodes, context.edges, requiredNodeIds);
  const nextRuns: Record<string, LinghuiNodeRunState> = { ...previousRuns };

  if (seedPreviousOutputs) {
    context.nodeOutputs = {
      ...seedNodeOutputsFromRuns(previousRuns),
      ...context.nodeOutputs,
    };
  }

  for (const snapshot of orderedNodes) {
    const nodeId = snapshot.id;
    const upstreamIds = getDirectUpstreamNodeIds(context.edges, nodeId);
    const upstreamFailure = upstreamIds.find(upstreamId => nextRuns[upstreamId]?.status === 'failed');

    if (upstreamFailure) {
      const failedState: LinghuiNodeRunState = {
        status: 'failed',
        error: '上游节点执行失败',
        updatedAt: Date.now(),
        upstreamIds,
      };
      nextRuns[nodeId] = failedState;
      onNodeStateChange?.(nodeId, failedState);
      onLog?.(createLog('error', `${snapshot.data.label} 未执行：上游依赖失败`, nodeId));
      continue;
    }

    const runningState: LinghuiNodeRunState = {
      status: 'running',
      progress: 0,
      message: '准备执行',
      startedAt: Date.now(),
      updatedAt: Date.now(),
      upstreamIds,
      result: previousRuns[nodeId]?.result,
    };
    nextRuns[nodeId] = runningState;
    onNodeStateChange?.(nodeId, runningState);
    onLog?.(createLog('info', `开始执行 ${snapshot.data.label}`, nodeId));

    const nodeView = createNodeView(context, snapshot);

    try {
      const result = await executeNode(nodeView, (progress, message) => {
        const nextState: LinghuiNodeRunState = {
          ...nextRuns[nodeId],
          status: 'running',
          progress,
          message,
          updatedAt: Date.now(),
          upstreamIds,
        };
        nextRuns[nodeId] = nextState;
        onNodeStateChange?.(nodeId, nextState);
      });

      context.nodeOutputs[nodeId] = result;
      const successState: LinghuiNodeRunState = {
        status: 'succeeded',
        progress: 100,
        message: '执行完成',
        result,
        startedAt: runningState.startedAt,
        updatedAt: Date.now(),
        upstreamIds,
      };
      nextRuns[nodeId] = successState;
      onNodeStateChange?.(nodeId, successState);
      onLog?.(createLog('success', `${snapshot.data.label} 执行完成`, nodeId));
    } catch (error: any) {
      const failedState: LinghuiNodeRunState = {
        status: 'failed',
        progress: 100,
        error: error?.message || '执行失败',
        message: '执行失败',
        result: previousRuns[nodeId]?.result,
        startedAt: runningState.startedAt,
        updatedAt: Date.now(),
        upstreamIds,
      };
      nextRuns[nodeId] = failedState;
      onNodeStateChange?.(nodeId, failedState);
      onLog?.(createLog('error', `${snapshot.data.label} 执行失败：${failedState.error}`, nodeId));
    }
  }

  return nextRuns;
}

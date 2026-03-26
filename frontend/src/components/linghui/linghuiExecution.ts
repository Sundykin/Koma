import { nanoid } from 'nanoid';
import type { LGraph, LGraphNode } from '@litegraph-ts/core';
import { DEFAULT_POLLING_CONFIG } from '../../providers/polling';
import { getProjectITVProvider, getProjectTTIProvider } from '../../providers';
import type { ITVProvider, ITVResult } from '../../providers/itv/types';
import type { ImageResult, TTIProvider } from '../../providers/tti/types';
import { ensureRemoteUrlForImageSource } from '../../services/mediaRemoteUrlService';
import { resolveProviderAssetInput } from '../../services/mediaAssetResolver';
import { electronService } from '../../services/electronService';
import type {
  LinghuiExecutionLogEntry,
  LinghuiMediaItem,
  LinghuiNodeResult,
  LinghuiNodeRunState,
} from '../../types/linghui';

const EXECUTION_PROJECT_ID = 'linghui';

function delay(ms: number): Promise<void> {
  return new Promise(resolve => window.setTimeout(resolve, ms));
}

function normalizeNodeId(nodeId: string | number): string {
  return String(nodeId);
}

function getGraphNodes(graph: LGraph): LGraphNode[] {
  return (((graph as any)._nodes as LGraphNode[] | undefined) ?? []);
}

function getGraphLinks(graph: LGraph) {
  return Object.values((graph.links ?? {}) as Record<string, any>).filter(Boolean) as Array<{
    origin_id: string | number;
    target_id: string | number;
  }>;
}

function getDirectUpstreamNodeIds(graph: LGraph, nodeId: string): string[] {
  const incoming = new Set<string>();
  for (const link of getGraphLinks(graph)) {
    if (normalizeNodeId(link.target_id) === nodeId) {
      incoming.add(normalizeNodeId(link.origin_id));
    }
  }
  return [...incoming];
}

function getNodeById(graph: LGraph, nodeId: string): LGraphNode | null {
  const found = graph.getNodeById(nodeId as any);
  if (found) return found as LGraphNode;
  return getGraphNodes(graph).find(node => normalizeNodeId(node.id) === nodeId) ?? null;
}

function escapeSvgText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
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

function createPlaceholderImage(params: {
  title: string;
  subtitle?: string;
  accent?: string;
  background?: string;
}): string {
  const { title, subtitle, accent = '#4ade80', background = '#0b1220' } = params;
  const lines = [escapeSvgText(title), escapeSvgText(subtitle ?? '')].filter(Boolean);
  const subtitleSvg = lines[1]
    ? `<text x="40" y="178" font-size="18" fill="#cbd5e1" opacity="0.9">${lines[1]}</text>`
    : '';

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="960" height="640" viewBox="0 0 960 640">
      <defs>
        <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="${background}" />
          <stop offset="100%" stop-color="#020617" />
        </linearGradient>
      </defs>
      <rect width="960" height="640" rx="36" fill="url(#bg)" />
      <circle cx="760" cy="120" r="150" fill="${accent}" opacity="0.18" />
      <circle cx="190" cy="520" r="180" fill="${accent}" opacity="0.10" />
      <rect x="40" y="40" width="880" height="560" rx="28" fill="none" stroke="${accent}" stroke-opacity="0.55" stroke-width="4" />
      <text x="40" y="132" font-size="34" font-weight="700" fill="#f8fafc">${lines[0] ?? ''}</text>
      ${subtitleSvg}
      <text x="40" y="585" font-size="16" fill="#94a3b8">Linghui Placeholder Preview</text>
    </svg>
  `;

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function createGridPlaceholder(items: LinghuiMediaItem[], accent: string): string {
  const labels = items.map((item, index) => escapeSvgText(item.label || `#${index + 1}`));
  const cells = [
    { x: 48, y: 96 },
    { x: 486, y: 96 },
    { x: 48, y: 366 },
    { x: 486, y: 366 },
  ];
  const cellSvg = cells.map((cell, index) => `
    <rect x="${cell.x}" y="${cell.y}" width="390" height="210" rx="24" fill="#111827" stroke="${accent}" stroke-opacity="0.35" />
    <text x="${cell.x + 24}" y="${cell.y + 44}" font-size="24" font-weight="700" fill="#f8fafc">${labels[index] ?? `#${index + 1}`}</text>
  `).join('');
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="960" height="640" viewBox="0 0 960 640">
      <rect width="960" height="640" rx="36" fill="#050816" />
      <text x="48" y="56" font-size="28" font-weight="700" fill="#f8fafc">4 宫格结果</text>
      ${cellSvg}
    </svg>
  `;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function buildMediaItem(params: Partial<LinghuiMediaItem> & Pick<LinghuiMediaItem, 'kind'>): LinghuiMediaItem {
  return {
    ...params,
    source: toPreviewSource(params.source),
    posterSource: toPreviewSource(params.posterSource),
  };
}

function getNodePrompt(node: LGraphNode, fallback = ''): string {
  return String(node.properties?.prompt ?? fallback).trim();
}

function getNodeTitle(node: LGraphNode): string {
  return String(node.title || node.type || '节点');
}

function splitAngles(value: string): string[] {
  return value
    .split(/[\n,]/)
    .map(item => item.trim())
    .filter(Boolean);
}

function combinePrompt(parts: Array<string | undefined>): string {
  return parts
    .map(part => part?.trim())
    .filter(Boolean)
    .join('\n');
}

async function resolveAsyncProviderResult<T>(
  taskId: string,
  getTaskSnapshot: ((taskId: string) => Promise<{ state: string; progress?: number; output?: T; error?: string }>) | undefined,
  onProgress?: (progress: number, message?: string) => void,
): Promise<T> {
  if (!getTaskSnapshot) {
    throw new Error('当前 Provider 不支持任务状态查询');
  }

  const startedAt = Date.now();
  await delay(DEFAULT_POLLING_CONFIG.initialDelay ?? 0);

  while (Date.now() - startedAt < DEFAULT_POLLING_CONFIG.maxDuration) {
    const snapshot = await getTaskSnapshot(taskId);

    if (snapshot.state === 'running' || snapshot.state === 'queued') {
      onProgress?.(snapshot.progress ?? 0, '生成中');
      await delay(DEFAULT_POLLING_CONFIG.interval);
      continue;
    }

    if (snapshot.state === 'failed') {
      throw new Error(snapshot.error || '生成失败');
    }

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
  referenceSource?: string;
  steps?: number;
  onProgress?: (progress: number, message?: string) => void;
  placeholderTitle: string;
  placeholderSubtitle?: string;
  accent?: string;
}): Promise<LinghuiMediaItem> {
  const provider = await getProjectTTIProvider();
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

  const reference = params.referenceSource
    ? await resolveProviderAssetInput(params.referenceSource)
    : undefined;

  const started = await provider.start({
    prompt: params.prompt || params.placeholderTitle,
    references: reference ? [reference] : undefined,
    options: {
      steps: params.steps,
    },
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

function providerAllowsDataUrlForITV(provider: ITVProvider): boolean {
  const transports = provider.assetTransports?.primaryImage;
  if (!transports || transports.length === 0) {
    return false;
  }
  return transports.includes('data-url');
}

async function generateVideoWithProvider(params: {
  prompt: string;
  imageSource?: string;
  duration?: number;
  aspectRatio?: string;
  motion?: string;
  onProgress?: (progress: number, message?: string) => void;
}): Promise<LinghuiMediaItem> {
  const placeholderPoster = params.imageSource
    ? toPreviewSource(params.imageSource)
    : createPlaceholderImage({
      title: '视频预览占位',
      subtitle: '未配置 ITV 服务',
      accent: '#22c55e',
    });

  const provider = await getProjectITVProvider();
  if (!provider || !provider.validate() || !params.imageSource) {
    return buildMediaItem({
      kind: 'video',
      posterSource: placeholderPoster,
      placeholder: true,
      metadata: {
        note: params.imageSource ? '未配置 ITV 服务，已返回占位预览。' : '缺少主参考图，已返回占位预览。',
      },
    });
  }

  const allowDataUrl = providerAllowsDataUrlForITV(provider);
  const normalizedSource = allowDataUrl
    ? params.imageSource
    : await ensureRemoteUrlForImageSource({
      projectId: EXECUTION_PROJECT_ID,
      source: params.imageSource,
      policy: 'required',
      filenameHint: 'linghui-primary.png',
    });
  const primaryImage = await resolveProviderAssetInput(normalizedSource as string);

  if (!primaryImage) {
    throw new Error('无法解析图生视频主图');
  }

  if (!allowDataUrl && primaryImage.transport !== 'remote-url') {
    throw new Error('当前 ITV Provider 仅支持远程 URL 主图，请启用图床后重试');
  }

  const started = await provider.start({
    prompt: params.prompt,
    primaryImage,
    options: {
      duration: params.duration,
      aspectRatio: params.aspectRatio,
      motionStrength: params.motion,
    } as Record<string, unknown>,
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

function getInputResult(node: LGraphNode, slot: number): LinghuiNodeResult | undefined {
  return node.getInputData<LinghuiNodeResult>(slot);
}

function getInputImageSource(node: LGraphNode, slot: number): string | undefined {
  const result = getInputResult(node, slot);
  return result?.primary?.source;
}

function getInputText(node: LGraphNode, slot: number): string {
  return getInputResult(node, slot)?.text?.trim() ?? '';
}

function createLog(level: LinghuiExecutionLogEntry['level'], message: string, nodeId?: string): LinghuiExecutionLogEntry {
  return {
    id: nanoid(10),
    level,
    message,
    nodeId,
    createdAt: Date.now(),
  };
}

async function executeReferenceImageNode(node: LGraphNode): Promise<LinghuiNodeResult> {
  const source = String(node.properties?.source ?? '').trim();
  if (!source) {
    throw new Error('请先填写参考图路径或 URL');
  }

  return {
    kind: 'image',
    primary: buildMediaItem({
      kind: 'image',
      source,
      metadata: {
        note: String(node.properties?.note ?? ''),
      },
    }),
  };
}

async function executePromptNode(node: LGraphNode): Promise<LinghuiNodeResult> {
  const prompt = getNodePrompt(node);
  const style = String(node.properties?.style ?? '').trim();

  return {
    kind: 'text',
    text: combinePrompt([prompt, style ? `风格：${style}` : '']),
    metadata: {
      prompt,
      style,
    },
  };
}

async function executeImageToImageNode(
  node: LGraphNode,
  onProgress?: (progress: number, message?: string) => void,
): Promise<LinghuiNodeResult> {
  const referenceSource = getInputImageSource(node, 0);
  const prompt = combinePrompt([getInputText(node, 1), getNodePrompt(node)]);
  const image = await generateImageWithProvider({
    prompt,
    referenceSource,
    steps: Number(node.properties?.steps ?? 28),
    onProgress,
    placeholderTitle: getNodeTitle(node),
    placeholderSubtitle: prompt || '图生图占位预览',
    accent: '#4ade80',
  });

  return {
    kind: 'image',
    primary: image,
    metadata: {
      prompt,
      strength: Number(node.properties?.strength ?? 0.65),
    },
  };
}

async function executeImageToVideoNode(
  node: LGraphNode,
  onProgress?: (progress: number, message?: string) => void,
): Promise<LinghuiNodeResult> {
  const imageSource = getInputImageSource(node, 0);
  const prompt = combinePrompt([getInputText(node, 1), getNodePrompt(node)]);
  const video = await generateVideoWithProvider({
    prompt: prompt || getNodeTitle(node),
    imageSource,
    duration: Number(node.properties?.duration ?? 4),
    aspectRatio: String(node.properties?.aspectRatio ?? '16:9'),
    motion: String(node.properties?.motion ?? 'medium'),
    onProgress,
  });

  return {
    kind: 'video',
    primary: video,
    metadata: {
      prompt,
      duration: Number(node.properties?.duration ?? 4),
      motion: String(node.properties?.motion ?? 'medium'),
    },
  };
}

async function executeFourGridNode(
  node: LGraphNode,
  onProgress?: (progress: number, message?: string) => void,
): Promise<LinghuiNodeResult> {
  const basePrompt = combinePrompt([getInputText(node, 1), getNodePrompt(node), String(node.properties?.tilePrompt ?? '')]);
  const referenceSource = getInputImageSource(node, 0);
  const tileLabels = ['画面 1', '画面 2', '画面 3', '画面 4'];
  const accent = '#fb923c';

  const items = await Promise.all(tileLabels.map(async (label, index) => {
    const image = await generateImageWithProvider({
      prompt: combinePrompt([basePrompt, `${label}`]),
      referenceSource,
      steps: 22,
      onProgress: progress => onProgress?.(Math.round((index / tileLabels.length) * 100 + progress / tileLabels.length), `${label} 生成中`),
      placeholderTitle: label,
      placeholderSubtitle: basePrompt || '4 宫格占位预览',
      accent,
    });
    return {
      ...image,
      label,
    };
  }));

  return {
    kind: 'grid',
    primary: buildMediaItem({
      kind: 'image',
      source: createGridPlaceholder(items, accent),
      placeholder: items.every(item => item.placeholder),
      metadata: {
        layout: String(node.properties?.layout ?? '2x2'),
      },
    }),
    items,
    metadata: {
      layout: String(node.properties?.layout ?? '2x2'),
      styleMode: String(node.properties?.styleMode ?? 'unified'),
      prompt: basePrompt,
    },
  };
}

async function executeMultiAngleNode(
  node: LGraphNode,
  onProgress?: (progress: number, message?: string) => void,
): Promise<LinghuiNodeResult> {
  const referenceSource = getInputImageSource(node, 0);
  const basePrompt = combinePrompt([getInputText(node, 1), getNodePrompt(node)]);
  const angles = splitAngles(String(node.properties?.angles ?? 'front,left,right,top,back'));
  const accent = '#a78bfa';

  const items = await Promise.all(angles.map(async (angle, index) => {
    const image = await generateImageWithProvider({
      prompt: combinePrompt([basePrompt, `视角：${angle}`]),
      referenceSource,
      steps: 24,
      onProgress: progress => onProgress?.(Math.round((index / angles.length) * 100 + progress / angles.length), `${angle} 生成中`),
      placeholderTitle: angle,
      placeholderSubtitle: basePrompt || '多角度占位预览',
      accent,
    });
    return {
      ...image,
      label: angle,
    };
  }));

  return {
    kind: 'images',
    items,
    primary: items[0],
    metadata: {
      angles,
      consistency: Boolean(node.properties?.consistency ?? true),
      prompt: basePrompt,
    },
  };
}

async function executeStoryboardShotNode(
  node: LGraphNode,
  onProgress?: (progress: number, message?: string) => void,
): Promise<LinghuiNodeResult> {
  const description = String(node.properties?.description ?? '').trim();
  const durationSec = Number(node.properties?.duration ?? 3);
  const prompt = combinePrompt([getInputText(node, 1), description]);
  const connectedImage = getInputResult(node, 0)?.primary;
  const primary = connectedImage ?? await generateImageWithProvider({
    prompt: prompt || getNodeTitle(node),
    referenceSource: undefined,
    steps: 20,
    onProgress,
    placeholderTitle: getNodeTitle(node),
    placeholderSubtitle: description || '分镜占位预览',
    accent: '#2dd4bf',
  });

  return {
    kind: 'shot',
    primary,
    metadata: {
      title: getNodeTitle(node),
      description,
      durationSec,
      prompt,
    },
  };
}

async function executeStoryboardGroupNode(node: LGraphNode): Promise<LinghuiNodeResult> {
  const shots = (node.inputs ?? [])
    .map((_, index) => node.getInputData<LinghuiNodeResult>(index))
    .filter((result): result is LinghuiNodeResult => result?.kind === 'shot')
    .map((result, index) => ({
      id: `${normalizeNodeId(node.id)}-${index + 1}`,
      title: String(result.metadata?.title ?? `分镜 ${index + 1}`),
      description: String(result.metadata?.description ?? ''),
      durationSec: Number(result.metadata?.durationSec ?? 3),
      image: result.primary,
    }));

  if (!shots.length) {
    throw new Error('请至少连接一个分镜节点');
  }

  return {
    kind: 'storyboard',
    primary: shots[0].image,
    shots,
    metadata: {
      title: String(node.properties?.title ?? getNodeTitle(node)),
      notes: String(node.properties?.notes ?? ''),
      totalDurationSec: shots.reduce((sum, shot) => sum + shot.durationSec, 0),
    },
  };
}

async function executeNode(
  node: LGraphNode,
  onProgress?: (progress: number, message?: string) => void,
): Promise<LinghuiNodeResult> {
  switch (node.type) {
    case 'linghui/reference-image':
      return executeReferenceImageNode(node);
    case 'linghui/prompt':
      return executePromptNode(node);
    case 'linghui/image-to-image':
      return executeImageToImageNode(node, onProgress);
    case 'linghui/image-to-video':
      return executeImageToVideoNode(node, onProgress);
    case 'linghui/four-grid':
      return executeFourGridNode(node, onProgress);
    case 'linghui/multi-angle':
      return executeMultiAngleNode(node, onProgress);
    case 'linghui/storyboard-shot':
      return executeStoryboardShotNode(node, onProgress);
    case 'linghui/storyboard-group':
      return executeStoryboardGroupNode(node);
    default:
      throw new Error(`暂不支持执行节点类型：${node.type}`);
  }
}

export function collectLinghuiDependentNodeIds(
  graph: LGraph,
  rootNodeIds: Array<string | number>,
): string[] {
  const adjacency = new Map<string, Set<string>>();
  for (const link of getGraphLinks(graph)) {
    const from = normalizeNodeId(link.origin_id);
    const to = normalizeNodeId(link.target_id);
    if (!adjacency.has(from)) adjacency.set(from, new Set());
    adjacency.get(from)!.add(to);
  }

  const queue = [...new Set(rootNodeIds.map(normalizeNodeId))];
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

function collectRequiredNodeIds(graph: LGraph, targetNodeIds: string[]): string[] {
  const stack = [...targetNodeIds];
  const required = new Set<string>(targetNodeIds);

  while (stack.length > 0) {
    const current = stack.pop()!;
    for (const upstreamId of getDirectUpstreamNodeIds(graph, current)) {
      if (required.has(upstreamId)) continue;
      required.add(upstreamId);
      stack.push(upstreamId);
    }
  }

  return [...required];
}

function topologicalSort(graph: LGraph, requiredNodeIds: Set<string>): LGraphNode[] {
  const nodes = getGraphNodes(graph).filter(node => requiredNodeIds.has(normalizeNodeId(node.id)));
  const indegree = new Map<string, number>();
  const adjacency = new Map<string, Set<string>>();

  for (const node of nodes) {
    indegree.set(normalizeNodeId(node.id), 0);
    adjacency.set(normalizeNodeId(node.id), new Set());
  }

  for (const link of getGraphLinks(graph)) {
    const from = normalizeNodeId(link.origin_id);
    const to = normalizeNodeId(link.target_id);
    if (!requiredNodeIds.has(from) || !requiredNodeIds.has(to)) continue;
    adjacency.get(from)?.add(to);
    indegree.set(to, (indegree.get(to) ?? 0) + 1);
  }

  const queue = nodes
    .filter(node => (indegree.get(normalizeNodeId(node.id)) ?? 0) === 0)
    .sort((left, right) => left.pos[0] - right.pos[0] || left.pos[1] - right.pos[1]);
  const ordered: LGraphNode[] = [];

  while (queue.length > 0) {
    const node = queue.shift()!;
    ordered.push(node);

    for (const nextId of adjacency.get(normalizeNodeId(node.id)) ?? []) {
      const nextDegree = (indegree.get(nextId) ?? 0) - 1;
      indegree.set(nextId, nextDegree);
      if (nextDegree === 0) {
        const nextNode = nodes.find(item => normalizeNodeId(item.id) === nextId);
        if (nextNode) queue.push(nextNode);
      }
    }
  }

  if (ordered.length === nodes.length) {
    return ordered;
  }

  const orderedSet = new Set(ordered.map(node => normalizeNodeId(node.id)));
  return [
    ...ordered,
    ...nodes.filter(node => !orderedSet.has(normalizeNodeId(node.id))),
  ];
}

export interface ExecuteLinghuiWorkflowOptions {
  graph: LGraph;
  targetNodeIds?: Array<string | number>;
  previousRuns?: Record<string, LinghuiNodeRunState>;
  onNodeStateChange?: (nodeId: string, nextState: LinghuiNodeRunState) => void;
  onLog?: (entry: LinghuiExecutionLogEntry) => void;
}

export async function executeLinghuiWorkflow(
  options: ExecuteLinghuiWorkflowOptions,
): Promise<Record<string, LinghuiNodeRunState>> {
  const {
    graph,
    targetNodeIds,
    previousRuns = {},
    onNodeStateChange,
    onLog,
  } = options;

  const allNodes = getGraphNodes(graph);
  const normalizedTargetIds = (targetNodeIds?.length
    ? targetNodeIds
    : allNodes.map(node => node.id)
  ).map(normalizeNodeId);
  const requiredNodeIds = new Set(collectRequiredNodeIds(graph, normalizedTargetIds));
  const orderedNodes = topologicalSort(graph, requiredNodeIds);
  const nextRuns: Record<string, LinghuiNodeRunState> = {
    ...previousRuns,
  };

  for (const node of orderedNodes) {
    const nodeId = normalizeNodeId(node.id);
    const upstreamIds = getDirectUpstreamNodeIds(graph, nodeId);
    const upstreamFailure = upstreamIds.find(upstreamId => nextRuns[upstreamId]?.status === 'failed');

    if (upstreamFailure) {
      const failedState: LinghuiNodeRunState = {
        status: 'failed',
        error: '上游节点执行失败，请先修复依赖节点后重试。',
        updatedAt: Date.now(),
        upstreamIds,
      };
      nextRuns[nodeId] = failedState;
      onNodeStateChange?.(nodeId, failedState);
      onLog?.(createLog('error', `${getNodeTitle(node)} 未执行：上游依赖失败`, nodeId));
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
    onLog?.(createLog('info', `开始执行 ${getNodeTitle(node)}`, nodeId));

    try {
      const result = await executeNode(node, (progress, message) => {
        const progressState: LinghuiNodeRunState = {
          ...nextRuns[nodeId],
          status: 'running',
          progress,
          message,
          updatedAt: Date.now(),
          upstreamIds,
        };
        nextRuns[nodeId] = progressState;
        onNodeStateChange?.(nodeId, progressState);
      });

      node.setOutputData(0, result);

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
      onLog?.(createLog('success', `${getNodeTitle(node)} 执行完成`, nodeId));
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
      onLog?.(createLog('error', `${getNodeTitle(node)} 执行失败：${failedState.error}`, nodeId));
    }
  }

  return nextRuns;
}

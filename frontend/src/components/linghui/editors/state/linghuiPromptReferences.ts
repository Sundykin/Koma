import type { MediaAssetSource, ProviderAssetInput } from '../../../../types';
import type {
  LinghuiImageNodeProperties,
  LinghuiMediaItem,
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
import {
  buildLinghuiVisualSourceKey,
  resolveLinghuiMediaAssetSource,
} from '../../utils/linghuiMediaAssetSource';

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
): MediaAssetSource[] {
  const sources: MediaAssetSource[] = [];
  const dedupe = new Set<string>();
  const pushSource = (candidate?: MediaAssetSource) => {
    const key = buildLinghuiVisualSourceKey(candidate);
    if (!candidate || !key || dedupe.has(key)) return;
    dedupe.add(key);
    sources.push(candidate);
  };

  for (const item of references) {
    if (item.kind !== 'image') {
      continue;
    }

    pushSource(item.source ?? item.previewSource);
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

/**
 * 上传/编译用源：image → 原图；video → 真实 mp4；audio → 真实 mp3。
 * 这是参与图床上传和 prompt `@kind N` 编号的 URL。
 */
function getMediaUploadSource(media?: {
  kind?: string;
  source?: string;
  posterSource?: string;
  mimeType?: string;
  width?: number;
  height?: number;
  durationSec?: number;
  metadata?: Record<string, unknown>;
}): MediaAssetSource | undefined {
  if (!media) return undefined;
  return resolveLinghuiMediaAssetSource(media as LinghuiMediaItem);
}

/**
 * UI 预览用源：video → 首帧 poster；audio → 波形/封面（若有）；image → 自身。
 * 仅给参考面板缩略图，不进上传链。
 */
function getMediaPreviewSource(media?: {
  kind?: string;
  source?: string;
  posterSource?: string;
}): string | undefined {
  if (!media) return undefined;
  if (media.kind === 'video') {
    return media.posterSource || media.source || undefined;
  }
  if (media.kind === 'audio') {
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
    source?: MediaAssetSource;
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
    previewSource: params.previewSource ?? resolvePromptReferenceSourceValue(params.source),
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

  const normalizedResult = nodeData.linghuiType === 'linghui/image' || nodeData.linghuiType === 'linghui/panorama'
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
    const audioSource = getMediaUploadSource(primary);
    if (audioSource) {
      // 真实 mp3 → 走全能参考通道，编号成 @Audio N
      pushVisualReference(refs, {
        id: nodeId,
        nodeId,
        kind: 'audio',
        name: baseName,
        description: baseDescription,
        source: audioSource,
        previewSource: getMediaPreviewSource(primary) ?? resolvePromptReferenceSourceValue(audioSource),
      });
    } else {
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
    }
  } else if (primaryKind === 'video' && !getMediaUploadSource(primary)) {
    refs.push({
      id: nodeId,
      nodeId,
      kind: 'video',
      name: baseName,
      description: baseDescription,
      textValue: baseName,
    });
  } else {
    const primarySource = getMediaUploadSource(primary);
    const primaryPreview = getMediaPreviewSource(primary);
    pushVisualReference(refs, {
      id: nodeId,
      nodeId,
      kind: primary?.kind === 'video' ? 'video' : 'image',
      name: baseName,
      description: baseDescription,
      source: primarySource,
      previewSource: primaryPreview ?? resolvePromptReferenceSourceValue(primarySource),
    });
  }

  if (nodeData.linghuiType !== 'linghui/image') {
    items.forEach((item, index) => {
      const itemSource = getMediaUploadSource(item);
      const itemPreview = getMediaPreviewSource(item);
      const primarySourceKey = buildLinghuiVisualSourceKey(getMediaUploadSource(primary));
      const itemSourceKey = buildLinghuiVisualSourceKey(itemSource);
      if (primaryKind !== 'audio' && index === 0 && itemSourceKey && primarySourceKey === itemSourceKey) {
        return;
      }

      if (item.kind === 'audio') {
        const audioName = getDescriptionText(item.label, `${baseName} ${index + 1}`) || `${baseName} ${index + 1}`;
        if (itemSource) {
          pushVisualReference(refs, {
            id: `${nodeId}__item_${index + 1}`,
            nodeId,
            kind: 'audio',
            name: audioName,
            description: `${baseDescription} · 产物 ${index + 1}`,
            source: itemSource,
            previewSource: itemPreview ?? resolvePromptReferenceSourceValue(itemSource),
          });
        } else {
          refs.push({
            id: `${nodeId}__item_${index + 1}`,
            nodeId,
            kind: 'audio',
            name: audioName,
            description: `${baseDescription} · 产物 ${index + 1}`,
            textValue: audioName,
          });
        }
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
        previewSource: itemPreview ?? resolvePromptReferenceSourceValue(itemSource),
      });
    });
  }

  shots.forEach((shot, index) => {
    const shotSource = getMediaUploadSource(shot.image);
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
        previewSource: resolvePromptReferenceSourceValue(shotSource),
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
      // 真实 mp3 走全能参考通道（@Audio N），不再仅作 textValue
      source,
      previewSource: source,
    }];
  }

  if (nodeData.linghuiType === 'linghui/image' || nodeData.linghuiType === 'linghui/panorama') {
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
      // 优先把真实 mp4 作为上传源；只有 poster 时回退到 textValue（无内容可上传给视频通道）
      ...(source
        ? {
            source,
            previewSource: posterSource || source,
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

  if (nodeData.linghuiType === 'linghui/storyboard') {
    const properties = nodeData.properties as Record<string, unknown> | undefined;
    const content = getDescriptionText(properties?.prompt);
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

  if (nodeData.linghuiType === 'linghui/director3d') {
    // 3D 导演台：用户导出时间轴视频或线稿后 properties 就有数据，不需要等节点 run 完。
    // outputMode='video' → 视频引用（source=mp4, preview=首帧）
    // outputMode='lineart' → 线稿图引用
    const props = nodeData.properties as Record<string, unknown> | undefined;
    const outputMode = props?.outputMode === 'video' ? 'video' : 'lineart';
    const timelineVideoUrl = getDescriptionText(props?.timelineVideoUrl);
    const timelineVideoPoster = getDescriptionText(props?.timelineVideoPosterUrl);
    const lineart = getDescriptionText(props?.lineartDataUrl);

    if (outputMode === 'video' && timelineVideoUrl) {
      return [{
        id: nodeId,
        nodeId,
        kind: 'video',
        name: nodeData.label,
        description: `来自上游节点：${nodeData.label}（3D 导演时间轴动画）`,
        // 真实 mp4 进上传/编译链，poster 仅作 UI 预览
        source: timelineVideoUrl,
        previewSource: timelineVideoPoster || timelineVideoUrl,
      }];
    }
    if (lineart && (lineart.startsWith('koma-local://') || lineart.startsWith('http'))) {
      return [{
        id: nodeId,
        nodeId,
        kind: 'image',
        name: nodeData.label,
        description: `来自上游节点：${nodeData.label}（3D 线稿）`,
        source: lineart,
        previewSource: lineart,
      }];
    }
    return [];
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

export function collectOrderedUpstreamReferenceNodeIds(
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
      // 把灵绘的 kind 透传到协议层，让 @ref_xxx 按 image/video/audio 各自命名空间编号
      // （image=@Image N 不限，video=@Video N 上限 3，audio=@Audio N 上限 3）
      kind: item.kind === 'image' || item.kind === 'video' || item.kind === 'audio' ? item.kind : undefined,
      textValue: item.textValue,
      source: item.source,
    })),
  });
}

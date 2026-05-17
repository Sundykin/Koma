import type { LinghuiNodeResult } from '../../../../types/linghui';
import {
  LIBTV_PANORAMA_SLASH_LABEL,
  LIBTV_PANORAMA_SLASH_QUALITY,
  LIBTV_PANORAMA_SLASH_SCENE,
  LIBTV_PANORAMA_SUBMIT_MODEL_KEY,
  LIBTV_PANORAMA_WITH_PROMPT_SCENE,
  compilePanoramaPrompt,
  getLibTVPanoramaRatioForModel,
  type PanoramaTemplateKind,
} from '../../panorama/panoramaPromptTemplate';
import { resolvePanoramaProjectionMode } from '../../panorama/panoramaProjection';
import type { ExecutionNodeView } from './linghuiExecutionShared';
import { persistDirectorMediaSource } from './linghuiDirectorMediaPersistence';

type NodeExecutionProgressHandler = (progress: number, message?: string, partialResult?: LinghuiNodeResult) => void;
type ExecuteImageNode = (
  node: ExecutionNodeView,
  onProgress?: NodeExecutionProgressHandler,
  signal?: AbortSignal,
) => Promise<LinghuiNodeResult>;

interface DetailItem {
  kind: 'image';
  source: string;
  label?: string;
  width?: number;
  height?: number;
  mimeType?: string;
}

async function collectPanoramaDetailItems(params: {
  node: ExecutionNodeView;
  propertyKey: 'detailCrops' | 'perspectiveViews';
  slotPrefix: string;
  fallbackLabel: string;
  defaultMimeType: string;
}): Promise<DetailItem[]> {
  const rawValue = params.node.properties[params.propertyKey];
  const rawItems: unknown[] = Array.isArray(rawValue)
    ? rawValue
    : [];
  return (await Promise.all(
    rawItems.map(async (item, index): Promise<DetailItem | null> => {
      const source = typeof (item as { source?: unknown })?.source === 'string' ? (item as { source: string }).source : '';
      if (!source) return null;
      const label = typeof (item as { label?: unknown })?.label === 'string'
        ? (item as { label: string }).label
        : `${params.fallbackLabel} ${index + 1}`;
      const width = typeof (item as { width?: unknown })?.width === 'number' ? (item as { width: number }).width : undefined;
      const height = typeof (item as { height?: unknown })?.height === 'number' ? (item as { height: number }).height : undefined;
      const mimeType = typeof (item as { mimeType?: unknown })?.mimeType === 'string'
        ? (item as { mimeType: string }).mimeType
        : params.defaultMimeType;
      const persistedSource = await persistDirectorMediaSource({
        source,
        nodeId: params.node.id,
        slot: `${params.slotPrefix}-${index}`,
        mimeType,
      });
      return { kind: 'image', source: persistedSource, label, width, height, mimeType };
    }),
  )).filter((value): value is DetailItem => value !== null);
}

function mergePanoramaExtraItems(
  result: LinghuiNodeResult,
  extraItems: DetailItem[],
): LinghuiNodeResult {
  if (extraItems.length === 0 || (result.kind !== 'image' && result.kind !== 'images')) {
    return result;
  }

  const baseItems = result.kind === 'images' ? result.items : [result.primary];
  const dedupe = new Set<string>();
  const items = [...baseItems, ...extraItems].filter(item => {
    const source = item.source || '';
    if (!source || dedupe.has(source)) return false;
    dedupe.add(source);
    return true;
  });

  return {
    ...result,
    kind: 'images',
    primary: result.primary,
    items,
  } as LinghuiNodeResult;
}

export async function executePanoramaNodeWithImageExecutor(
  node: ExecutionNodeView,
  executeImageNode: ExecuteImageNode,
  onProgress?: NodeExecutionProgressHandler,
  signal?: AbortSignal,
): Promise<LinghuiNodeResult> {
  const originalPrompt = String(node.properties.prompt ?? '');
  const rawTemplate = String(node.properties.panoramaTemplate ?? 'auto');
  const templateKind: PanoramaTemplateKind = rawTemplate === 'indoor' || rawTemplate === 'outdoor'
    ? rawTemplate
    : 'auto';
  const panoramaModelKey = String(node.properties.panoramaModelKey ?? LIBTV_PANORAMA_SUBMIT_MODEL_KEY);
  const panoramaRatio = String(node.properties.aspectRatio ?? '').trim()
    || getLibTVPanoramaRatioForModel(panoramaModelKey);
  const panoramaQuality = String(node.properties.panoramaQuality ?? LIBTV_PANORAMA_SLASH_QUALITY);
  const panoramaSlashScene = String(node.properties.panoramaSlashScene ?? LIBTV_PANORAMA_SLASH_SCENE);
  const panoramaWithPromptScene = String(node.properties.panoramaWithPromptScene ?? LIBTV_PANORAMA_WITH_PROMPT_SCENE);
  const panoramaSlashLabel = String(node.properties.panoramaSlashLabel ?? LIBTV_PANORAMA_SLASH_LABEL);
  const projectionMode = resolvePanoramaProjectionMode(node.properties.projectionMode);
  const wrappedPrompt = compilePanoramaPrompt(originalPrompt, { templateKind, projectionMode });
  const wrappedNode: ExecutionNodeView = {
    ...node,
    properties: {
      ...node.properties,
      prompt: wrappedPrompt,
      aspectRatio: panoramaRatio,
      panoramaSlashScene,
      panoramaWithPromptScene,
      panoramaSlashLabel,
      panoramaModelKey,
      panoramaQuality,
    },
  };

  const result = await executeImageNode(wrappedNode, onProgress, signal);
  const detailItems = await collectPanoramaDetailItems({
    node,
    propertyKey: 'detailCrops',
    slotPrefix: 'panorama-detail',
    fallbackLabel: '方向',
    defaultMimeType: 'image/png',
  });
  const perspectiveItems = await collectPanoramaDetailItems({
    node,
    propertyKey: 'perspectiveViews',
    slotPrefix: 'panorama-view',
    fallbackLabel: '视角',
    defaultMimeType: 'image/png',
  });
  const merged = mergePanoramaExtraItems(result, [...detailItems, ...perspectiveItems]);

  return {
    ...merged,
    metadata: {
      ...(merged.metadata ?? {}),
      mode: 'panorama',
      panoramaTemplate: templateKind,
      panoramaProjection: projectionMode,
      panoramaSlashScene,
      panoramaWithPromptScene,
      panoramaSlashLabel,
      panoramaModelKey,
      panoramaQuality,
      panoramaRatio,
      originalPrompt: originalPrompt.trim(),
      detailCropCount: detailItems.length,
      perspectiveViewCount: perspectiveItems.length,
    },
  } as LinghuiNodeResult;
}

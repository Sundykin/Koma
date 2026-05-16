import { useCallback, useMemo } from 'react';
import type { MutableRefObject } from 'react';
import { nanoid } from 'nanoid';
import type { MessageInstance } from 'antd/es/message/interface';
import { Modal } from 'antd';
import type { ReactFlowInstance } from '@xyflow/react';
import type {
  LinghuiCanvasSelection,
  LinghuiExecutionQueueState,
  LinghuiExecuteMultiAngleOptions,
  LinghuiImageAssetItem,
  LinghuiGridType,
  LinghuiImageNodeProperties,
  LinghuiMediaItem,
  LinghuiMultiAngleConfig,
  LinghuiNodeCatalogItem,
  LinghuiNodeData,
  LinghuiNodeRunState,
  LinghuiNodeToolState,
  LinghuiNodeType,
  LinghuiStoryboardFrame,
  LinghuiVideoNodeProperties,
} from '../../../../types/linghui';
import { normalizeLinghuiMultiAngleConfig } from '../../../../types/linghui';
import {
  createLinghuiWorkflowTemplate,
  createLinghuiWorkspaceAsset,
  getLinghuiWorkspaceDir,
} from '../../../../store/linghuiStorage';
import { saveLinghuiGlobalAsset } from '../../../../store/linghuiGlobalAssets';
import type { CssVarStyle } from '../../../../theme/runtime';
import { getFileSystemPort, toFileSystemDisplayUrl } from '../../../../services/fileSystemPort';
import { ffmpegManager } from '../../../../services/ffmpegManager';
import { fromKomaLocalUrl } from '../../../../utils/urlUtils';
import { createLogger } from '../../../../store/logger';
import { base64ToBytes, parseDataUrl, stripDataHeader } from '../../../../utils/encoding';
import { LINGHUI_CANVAS_CREATE_MENU_CATALOG } from '../state/linghuiCanvasQuickCreateCatalog';
import type { LinghuiCanvasMenuState, LinghuiClipboardSnapshot, QuickCreateState } from '../state/linghuiCanvasShared';
import type { LinghuiCanvasOverlaysProps } from '../components/LinghuiCanvasOverlays';
import {
  resolveLinghuiCanvasResultCopyPayload,
  resolveLinghuiCanvasResultCopyState,
  type LinghuiCanvasResultCopyKind,
} from '../state/linghuiCanvasResultActions';
import {
  createLinghuiImageImportProperties,
  resolveImageAspectRatioLabel,
  resolveLinghuiImageCollection,
  resolveLinghuiImagePrimaryForNode,
} from '../../editors/state/linghuiImageCollections';
import {
  getLinghuiResultItems,
  getLinghuiResultPrimaryMedia,
} from '../../../../types/linghui';

const logger = createLogger('LinghuiImageExecution');
const MULTI_ANGLE_RUN_SYNC_RETRY_LIMIT = 12;

const GRID_SPLIT_SIZE_MAP: Record<Exclude<LinghuiGridType, 'none'>, 2 | 3 | 4 | 5> = {
  '2x2': 2,
  '3x3': 3,
  '4x4': 4,
  '5x5': 5,
};

function mergePromptSnippet(currentPrompt: string, snippet: string): string {
  const normalizedCurrent = currentPrompt.trim();
  const normalizedSnippet = snippet.trim();
  if (!normalizedSnippet) return normalizedCurrent;
  if (normalizedCurrent.includes(normalizedSnippet)) return normalizedCurrent;
  return normalizedCurrent ? `${normalizedCurrent}\n${normalizedSnippet}` : normalizedSnippet;
}

function getPreviewSource(source?: string): string {
  return toFileSystemDisplayUrl(source) || '';
}

const decodeLinghuiLocalSource = fromKomaLocalUrl;

function getFileExtension(source: string, fallback = 'png'): string {
  const normalized = decodeLinghuiLocalSource(source).split('?')[0].split('#')[0];
  const matched = normalized.match(/\.([a-zA-Z0-9]+)$/);
  if (!matched?.[1]) {
    return fallback;
  }
  const ext = matched[1].toLowerCase();
  return ext === 'jpeg' ? 'jpg' : ext;
}

function getExtensionFromMimeType(mimeType?: string, fallback = 'png'): string {
  const normalized = String(mimeType ?? '').toLowerCase();
  if (normalized.includes('jpeg') || normalized.includes('jpg')) return 'jpg';
  if (normalized.includes('png')) return 'png';
  if (normalized.includes('webp')) return 'webp';
  return fallback;
}

function sanitizeAssetBaseName(label: string, fallback: string): string {
  return String(label || fallback)
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    || fallback;
}

function resolveMediaAspectRatio(media: LinghuiMediaItem): string | undefined {
  const metadata = media.metadata;
  if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) {
    const aspectRatio = (metadata as Record<string, unknown>).aspectRatio;
    if (typeof aspectRatio === 'string' && aspectRatio.trim()) {
      return aspectRatio.trim();
    }
  }
  return resolveImageAspectRatioLabel(media.width, media.height);
}

function imageMediaToAssetItem(media: LinghuiMediaItem, index: number): LinghuiImageAssetItem | null {
  if (media.kind !== 'image') {
    return null;
  }

  const source = String(media.source ?? '').trim();
  if (!source) {
    return null;
  }

  return {
    id: `media:${source}`,
    source,
    label: media.label || `图片 ${index + 1}`,
    width: media.width,
    height: media.height,
    mimeType: media.mimeType,
    aspectRatio: resolveMediaAspectRatio(media),
  };
}

function collectVideoItemsFromResult(runState?: LinghuiNodeRunState): LinghuiMediaItem[] {
  const result = runState?.result;
  if (!result) {
    return [];
  }

  const items: LinghuiMediaItem[] = [];
  const primary = getLinghuiResultPrimaryMedia(result);
  if (primary?.kind === 'video') {
    items.push(primary);
  }
  items.push(...getLinghuiResultItems(result).filter(item => item.kind === 'video'));

  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.source ?? ''}|${item.posterSource ?? ''}`;
    if (!key.trim() || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function isLocalVideoSourceForAudioSplit(source?: string): boolean {
  const videoSource = decodeLinghuiLocalSource(String(source ?? '').trim());
  return Boolean(videoSource) && (
    !videoSource.startsWith('http://') &&
    !videoSource.startsWith('https://') &&
    !videoSource.startsWith('data:') &&
    !videoSource.startsWith('blob:')
  );
}

function uniqueVideoItems(items: LinghuiMediaItem[]): LinghuiMediaItem[] {
  const seen = new Set<string>();
  return items.filter(item => {
    if (item.kind !== 'video') return false;
    const key = `${item.source ?? ''}|${item.posterSource ?? ''}`;
    if (!key.trim() || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function writeTextToClipboard(text: string): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  if (typeof document === 'undefined') {
    throw new Error('当前环境不支持剪贴板');
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', 'true');
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  textarea.style.top = '0';
  document.body.appendChild(textarea);
  textarea.select();

  try {
    const copied = document.execCommand('copy');
    if (!copied) {
      throw new Error('复制失败');
    }
  } finally {
    document.body.removeChild(textarea);
  }
}

function inferImageClipboardMimeType(source: string): string {
  const normalized = source.split('?')[0].split('#')[0].toLowerCase();
  if (normalized.endsWith('.jpg') || normalized.endsWith('.jpeg')) return 'image/jpeg';
  if (normalized.endsWith('.webp')) return 'image/webp';
  if (normalized.endsWith('.gif')) return 'image/gif';
  return 'image/png';
}

function getClipboardItemConstructor(): typeof ClipboardItem | undefined {
  if (typeof ClipboardItem !== 'undefined') {
    return ClipboardItem;
  }
  const globalClipboardItem = (globalThis as unknown as { ClipboardItem?: typeof ClipboardItem }).ClipboardItem;
  return globalClipboardItem;
}

async function readImageBlobFromSource(source: string): Promise<Blob> {
  const trimmedSource = source.trim();
  if (!trimmedSource) {
    throw new Error('缺少可复制的图片');
  }

  if (trimmedSource.startsWith('data:')) {
    const { mimeType, bytes } = parseDataUrl(trimmedSource);
    return new Blob([bytes], { type: mimeType || 'image/png' });
  }

  if (trimmedSource.startsWith('http://') || trimmedSource.startsWith('https://') || trimmedSource.startsWith('blob:')) {
    const response = await fetch(trimmedSource);
    if (!response.ok) {
      throw new Error('图片读取失败');
    }
    return response.blob();
  }

  const localPath = decodeLinghuiLocalSource(trimmedSource);
  const base64 = await getFileSystemPort().readBase64(localPath);
  return new Blob([base64ToBytes(base64)], { type: inferImageClipboardMimeType(localPath) });
}

async function normalizeImageBlobForClipboard(blob: Blob): Promise<Blob> {
  if (blob.type === 'image/png') {
    return blob;
  }

  const bitmap = await createImageBitmap(blob);
  try {
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('无法创建图片复制画布');
    }
    context.drawImage(bitmap, 0, 0);
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((nextBlob) => {
        nextBlob ? resolve(nextBlob) : reject(new Error('图片转换失败'));
      }, 'image/png');
    });
  } finally {
    bitmap.close();
  }
}

async function writeImageToClipboard(source: string): Promise<void> {
  if (typeof navigator === 'undefined' || !navigator.clipboard?.write) {
    throw new Error('当前环境不支持复制图片');
  }

  const ClipboardItemCtor = getClipboardItemConstructor();
  if (!ClipboardItemCtor) {
    throw new Error('当前环境不支持复制图片');
  }

  const sourceBlob = await readImageBlobFromSource(source);
  const imageBlob = await normalizeImageBlobForClipboard(sourceBlob);
  await navigator.clipboard.write([
    new ClipboardItemCtor({ 'image/png': imageBlob }),
  ]);
}

async function materializeGridSplitInputSource(params: {
  source: string;
  workspaceId: string;
  baseName: string;
}): Promise<string> {
  const { source, workspaceId, baseName } = params;
  const fileSystemPort = getFileSystemPort();
  const trimmedSource = String(source).trim();
  if (!trimmedSource) {
    throw new Error('缺少可拆分的图片');
  }

  if (trimmedSource.startsWith('koma-local://')) {
    return decodeLinghuiLocalSource(trimmedSource);
  }

  if (
    !trimmedSource.startsWith('http://') &&
    !trimmedSource.startsWith('https://') &&
    !trimmedSource.startsWith('data:') &&
    !trimmedSource.startsWith('blob:')
  ) {
    return trimmedSource;
  }

  const workspaceDir = await getLinghuiWorkspaceDir(workspaceId);
  const inputDir = `${workspaceDir}/assets/grid-split-sources`;
  await fileSystemPort.mkdir(inputDir);

  if (trimmedSource.startsWith('http://') || trimmedSource.startsWith('https://')) {
    const ext = getFileExtension(trimmedSource, 'png');
    const inputPath = `${inputDir}/${Date.now()}-${baseName}.${ext}`;
    await fileSystemPort.download(trimmedSource, inputPath);
    return inputPath;
  }

  if (trimmedSource.startsWith('data:')) {
    const { mimeType, base64 } = stripDataHeader(trimmedSource);
    const ext = getExtensionFromMimeType(mimeType, 'png');
    const inputPath = `${inputDir}/${Date.now()}-${baseName}.${ext}`;
    await fileSystemPort.writeBase64(inputPath, base64);
    return inputPath;
  }

  const response = await fetch(trimmedSource);
  const bytes = new Uint8Array(await response.arrayBuffer());
  const ext = getExtensionFromMimeType(response.headers.get('content-type') ?? undefined, 'png');
  const inputPath = `${inputDir}/${Date.now()}-${baseName}.${ext}`;
  await fileSystemPort.writeBytes(inputPath, bytes);
  return inputPath;
}

async function createLinghuiImageAssetItemFromSource(params: {
  source: string;
  label: string;
}): Promise<LinghuiImageAssetItem> {
  const previewSource = getPreviewSource(params.source);
  const metadata = await new Promise<{ width?: number; height?: number; aspectRatio?: string }>(resolve => {
    const image = new Image();
    image.onload = () => resolve({
      width: image.naturalWidth,
      height: image.naturalHeight,
      aspectRatio: resolveImageAspectRatioLabel(image.naturalWidth, image.naturalHeight),
    });
    image.onerror = () => resolve({});
    image.src = previewSource;
  });

  return {
    id: nanoid(10),
    source: params.source,
    label: params.label,
    width: metadata.width,
    height: metadata.height,
    aspectRatio: metadata.aspectRatio,
  };
}

interface UseLinghuiCanvasOverlayPropsParams {
  editorSelection: LinghuiCanvasSelection;
  activeNodeTool: LinghuiNodeToolState;
  setActiveNodeTool: (tool: LinghuiNodeToolState) => void;
  revertGridSplitTool: () => void;
  onCloseEditor: () => void;
  nodeRuns: Record<string, LinghuiNodeRunState>;
  executionQueue?: LinghuiExecutionQueueState | null;
  workspaceId: string | null;
  updateNodeData: (
    nodeId: string,
    updater: (prev: LinghuiNodeData) => LinghuiNodeData,
    options?: { markStale?: boolean },
  ) => void;
  onClearNodeRunState?: (nodeId: string) => void;
  canvasRect: DOMRect | null;
  gridSplitType: LinghuiGridType;
  setGridSplitType: (type: LinghuiGridType) => void;
  gridSplitSelectedCells: number[];
  setGridSplitSelectedCells: (cells: number[]) => void;
  gridSplitUpscaleFactor: 2 | 4;
  setGridSplitUpscaleFactor: (factor: 2 | 4) => void;
  pendingGroupFrameStyle: CssVarStyle | null;
  pendingGroupActionsStyle: CssVarStyle | null;
  pendingGroupCreatableIds: string[];
  createGroupFromSelection: (selectionIds?: string[]) => void;
  clearPendingGroupFrame: () => void;
  quickCreate: QuickCreateState | null;
  quickCreateCatalog: LinghuiCanvasOverlaysProps['quickCreateCatalog'];
  contextMenu: LinghuiCanvasMenuState | null;
  contextMenuSelectionIds: string[];
  hasClipboardData: boolean;
  canUndo: boolean;
  canRedo: boolean;
  reactFlow: ReactFlowInstance;
  message: MessageInstance;
  onAssetLibraryMutate?: () => void;
  onWorkflowTemplateMutate?: () => void;
  onRunSelection?: (selectionIds?: string[]) => void;
  onRunAll?: () => void;
  onExportSelection?: (selectionIds?: string[]) => void;
  onFormatLayout: () => void;
  onOpenShortcutPanel: () => void;
  onRunSingleNodeRef: MutableRefObject<((nodeId: string) => void) | undefined>;
  openQuickCreateAt: (
    clientX: number,
    clientY: number,
    options?: { sourceConnection?: QuickCreateState['sourceConnection'] },
  ) => void;
  closeContextMenu: () => void;
  insertNodeAtScreenPosition: (
    type: LinghuiNodeType,
    screenX: number,
    screenY: number,
    options?: {
      openEditor?: boolean;
      sourceConnection?: QuickCreateState['sourceConnection'];
      label?: string;
      initialProperties?: Record<string, unknown>;
    },
  ) => void;
  deriveStoryboardShotsFromScript: (nodeId: string, shots: LinghuiStoryboardFrame[]) => boolean;
  deriveStoryboardImagesFromScript: (nodeId: string, shots: LinghuiStoryboardFrame[]) => string[];
  deriveStoryboardVideosFromScript: (nodeId: string, shots: LinghuiStoryboardFrame[]) => string[];
  createDerivedImageNodesFromNode: (sourceNodeId: string, items: LinghuiImageAssetItem[]) => string[];
  createDerivedVideoNodesFromNode: (sourceNodeId: string, items: LinghuiMediaItem[]) => string[];
  createDerivedPanoramaNodeFromNode: (sourceNodeId: string, item: LinghuiImageAssetItem) => string | null;
  createDerivedAudioNodeFromVideo: (
    sourceNodeId: string,
    options: { source: string; label?: string; prompt?: string },
  ) => string | null;
  createDerivedMultiAngleImageNodeFromNode: (sourceNodeId: string, options?: LinghuiExecuteMultiAngleOptions) => string | null;
  createDerivedImageToolNodeFromNode: (sourceNodeId: string, options: {
    label?: string;
    prompt: string;
    properties?: Partial<LinghuiImageNodeProperties>;
  }) => string | null;
  copySelectionToClipboard: (requestedIds?: string[]) => boolean;
  duplicateSelection: (
    requestedIds?: string[],
    options?: { screenX?: number; screenY?: number },
  ) => boolean;
  pasteClipboardSnapshot: (options?: { screenX?: number; screenY?: number }) => boolean;
  deleteNodesByIds: (nodeIds: string[]) => void;
  deleteEdgesByIds: (edgeIds: string[]) => void;
  ungroupGroupsByIds: (groupIds: string[]) => void;
  handleUploadImagesToCanvas: (screenX?: number, screenY?: number) => Promise<void>;
  handleUploadVideosToCanvas: (screenX?: number, screenY?: number) => Promise<void>;
  handleUploadAudiosToCanvas: (screenX?: number, screenY?: number) => Promise<void>;
  buildClipboardSnapshot: (requestedIds?: string[]) => LinghuiClipboardSnapshot | null;
  undoHistory: () => void;
  redoHistory: () => void;
}

export function useLinghuiCanvasOverlayProps({
  editorSelection,
  activeNodeTool,
  setActiveNodeTool,
  revertGridSplitTool,
  onCloseEditor,
  nodeRuns,
  executionQueue,
  workspaceId,
  updateNodeData,
  onClearNodeRunState,
  canvasRect,
  gridSplitType,
  setGridSplitType,
  gridSplitSelectedCells,
  setGridSplitSelectedCells,
  gridSplitUpscaleFactor,
  setGridSplitUpscaleFactor,
  pendingGroupFrameStyle,
  pendingGroupActionsStyle,
  pendingGroupCreatableIds,
  createGroupFromSelection,
  clearPendingGroupFrame,
  quickCreate,
  quickCreateCatalog,
  contextMenu,
  contextMenuSelectionIds,
  hasClipboardData,
  canUndo,
  canRedo,
  reactFlow,
  message,
  onAssetLibraryMutate,
  onWorkflowTemplateMutate,
  onRunSelection,
  onRunAll,
  onExportSelection,
  onFormatLayout,
  onOpenShortcutPanel,
  onRunSingleNodeRef,
  openQuickCreateAt,
  closeContextMenu,
  insertNodeAtScreenPosition,
  deriveStoryboardShotsFromScript,
  deriveStoryboardImagesFromScript,
  deriveStoryboardVideosFromScript,
  createDerivedImageNodesFromNode,
  createDerivedVideoNodesFromNode,
  createDerivedPanoramaNodeFromNode,
  createDerivedAudioNodeFromVideo,
  createDerivedMultiAngleImageNodeFromNode,
  createDerivedImageToolNodeFromNode,
  copySelectionToClipboard,
  duplicateSelection,
  pasteClipboardSnapshot,
  deleteNodesByIds,
  deleteEdgesByIds,
  ungroupGroupsByIds,
  handleUploadImagesToCanvas,
  handleUploadVideosToCanvas,
  handleUploadAudiosToCanvas,
  buildClipboardSnapshot,
  undoHistory,
  redoHistory,
}: UseLinghuiCanvasOverlayPropsParams): LinghuiCanvasOverlaysProps {
  const runNodeWhenReady = useCallback((nodeId: string, attemptsLeft = MULTI_ANGLE_RUN_SYNC_RETRY_LIMIT) => {
    requestAnimationFrame(() => {
      const targetNode = reactFlow.getNode(nodeId);
      if (targetNode && targetNode.type !== 'group') {
        logger.info('灵绘多角度节点已同步到画布，准备执行', {
          nodeId,
          attemptsUsed: MULTI_ANGLE_RUN_SYNC_RETRY_LIMIT - attemptsLeft + 1,
        });
        requestAnimationFrame(() => {
          if (onRunSingleNodeRef.current) {
            logger.info('灵绘多角度节点走单节点执行通道', {
              nodeId,
            });
            onRunSingleNodeRef.current(nodeId);
            return;
          }

          logger.warn('灵绘多角度缺少单节点执行通道，回退到批量执行通道', {
            nodeId,
          });
          onRunSelection?.([nodeId]);
        });
        return;
      }

      if (attemptsLeft <= 1) {
        logger.error('灵绘多角度节点同步超时，未触发执行', {
          nodeId,
          attempts: MULTI_ANGLE_RUN_SYNC_RETRY_LIMIT,
        });
        message.error('多角度节点尚未完成同步，请重试');
        return;
      }

      runNodeWhenReady(nodeId, attemptsLeft - 1);
    });
  }, [message, onRunSelection, onRunSingleNodeRef, reactFlow]);

  const contextMenuNode = useMemo(() => {
    if (!contextMenu?.nodeId) {
      return null;
    }
    return reactFlow.getNode(contextMenu.nodeId) ?? null;
  }, [contextMenu, reactFlow]);

  const contextMenuNodeRun = contextMenu?.nodeId ? nodeRuns[contextMenu.nodeId] : undefined;

  const contextMenuResultCopyState = useMemo(
    () => resolveLinghuiCanvasResultCopyState(contextMenuNodeRun),
    [contextMenuNodeRun],
  );

  const contextMenuMediaActionState = useMemo(() => {
    if (!contextMenuNode || contextMenuNode.type === 'group') {
      return {
        imageItems: [] as LinghuiImageAssetItem[],
        primaryImage: null as LinghuiImageAssetItem | null,
        videoItems: [] as LinghuiMediaItem[],
      };
    }

    const nodeData = contextMenuNode.data as unknown as LinghuiNodeData;
    const imageItems = (() => {
      if (nodeData.linghuiType === 'linghui/image' || nodeData.linghuiType === 'linghui/panorama') {
        const collection = resolveLinghuiImageCollection(
          nodeData.properties as unknown as LinghuiImageNodeProperties,
          contextMenuNodeRun?.result,
        );
        return {
          items: collection.items
            .map((item, index) => imageMediaToAssetItem(item, index))
            .filter((item): item is LinghuiImageAssetItem => Boolean(item)),
          primary: collection.primary ? imageMediaToAssetItem(collection.primary, 0) : null,
        };
      }

      const primary = getLinghuiResultPrimaryMedia(contextMenuNodeRun?.result);
      const resultItems = [
        ...(primary?.kind === 'image' ? [primary] : []),
        ...getLinghuiResultItems(contextMenuNodeRun?.result).filter(item => item.kind === 'image'),
      ];
      const items = resultItems
        .map((item, index) => imageMediaToAssetItem(item, index))
        .filter((item): item is LinghuiImageAssetItem => Boolean(item));
      return { items, primary: items[0] ?? null };
    })();

    const propertyVideoItems = (() => {
      if (nodeData.linghuiType !== 'linghui/video') {
        return [] as LinghuiMediaItem[];
      }
      const props = nodeData.properties as unknown as LinghuiVideoNodeProperties;
      const source = String(props.source ?? '').trim();
      const posterSource = String(props.posterSource ?? '').trim();
      if (!source && !posterSource) {
        return [] as LinghuiMediaItem[];
      }
      return [{
        kind: 'video',
        source,
        posterSource,
        label: nodeData.label,
      } satisfies LinghuiMediaItem];
    })();

    const generatorNodeId = (() => {
      if (nodeData.linghuiType !== 'linghui/image') return null;
      // image-generator 控制器节点已废弃；统一图片节点没有"回控制器"流程，永远返回 null。
      // 历史 generatedFromNodeId 字段保留作为派生关系记录，但 UI 不再暴露"返回生成节点"。
      return null;
    })();

    return {
      imageItems: imageItems.items,
      primaryImage: imageItems.primary ?? imageItems.items[0] ?? null,
      videoItems: uniqueVideoItems([
        ...propertyVideoItems,
        ...collectVideoItemsFromResult(contextMenuNodeRun),
      ]),
      generatorNodeId,
    };
  }, [contextMenuNode, contextMenuNodeRun, reactFlow]);

  const addNodeFromMenu = useCallback((item: LinghuiNodeCatalogItem) => {
    if (!contextMenu) {
      return;
    }

    insertNodeAtScreenPosition(item.type, contextMenu.screenX, contextMenu.screenY, {
      label: item.nodeLabel,
      initialProperties: item.initialProperties,
    });
  }, [contextMenu, insertNodeAtScreenPosition]);

  const addNodeFromQuickCreate = useCallback((item: LinghuiNodeCatalogItem) => {
    if (!quickCreate) {
      return;
    }

    insertNodeAtScreenPosition(item.type, quickCreate.screenX, quickCreate.screenY, {
      openEditor: true,
      sourceConnection: quickCreate.sourceConnection,
      label: item.nodeLabel,
      initialProperties: item.initialProperties,
    });
  }, [insertNodeAtScreenPosition, quickCreate]);

  const openDownstreamQuickCreate = useCallback((nodeId: string, clientX: number, clientY: number) => {
    const sourceNode = reactFlow.getNode(nodeId);
    const sourceNodeData = sourceNode?.data as unknown as LinghuiNodeData | undefined;
    const sourceSlot = sourceNodeData?.outputs?.[0];

    if (!sourceNode || !sourceNodeData || !sourceSlot) {
      message.info('当前节点没有可继续发送到下游的输出');
      return;
    }

    openQuickCreateAt(clientX, clientY, {
      sourceConnection: {
        sourceNodeId: nodeId,
        sourceHandleId: 'output-0',
        sourceDataType: sourceSlot.dataType,
      },
    });
  }, [message, openQuickCreateAt, reactFlow]);

  const handleCreateAssetFromNode = useCallback(async (nodeId: string) => {
    if (!workspaceId) {
      message.warning('请先打开一个灵绘工作区，再创建资产');
      return;
    }

    const targetNode = reactFlow.getNode(nodeId);
    if (!targetNode || targetNode.type === 'group') {
      message.info('当前工作流块不支持直接创建资产');
      return;
    }

    try {
      const nodeData = targetNode.data as unknown as LinghuiNodeData;
      const asset = await createLinghuiWorkspaceAsset({
        workspaceId,
        nodeId,
        nodeData,
        nodeRun: nodeRuns[nodeId],
      });
      onAssetLibraryMutate?.();
      message.success(`已创建资产：${asset.name}`);
    } catch (error: any) {
      message.error(error?.message || '创建资产失败');
    }
  }, [message, nodeRuns, onAssetLibraryMutate, reactFlow, workspaceId]);

  const resolvePrimaryImageAssetForNode = useCallback((nodeId: string): LinghuiImageAssetItem | null => {
    const targetNode = reactFlow.getNode(nodeId);
    if (!targetNode || targetNode.type === 'group') {
      return null;
    }
    const nodeData = targetNode.data as unknown as LinghuiNodeData;
    const targetRun = nodeRuns[nodeId];
    if (nodeData.linghuiType === 'linghui/image' || nodeData.linghuiType === 'linghui/panorama') {
      const collection = resolveLinghuiImageCollection(
        nodeData.properties as unknown as LinghuiImageNodeProperties,
        targetRun?.result,
      );
      return collection.primary ? imageMediaToAssetItem(collection.primary, 0) : null;
    }
    const primary = getLinghuiResultPrimaryMedia(targetRun?.result);
    return primary?.kind === 'image' ? imageMediaToAssetItem(primary, 0) : null;
  }, [nodeRuns, reactFlow]);

  const handleOpenPanoramaPreviewFromNode = useCallback((nodeId: string) => {
    const primaryImage = resolvePrimaryImageAssetForNode(nodeId);
    if (!primaryImage) {
      message.info('当前节点没有可进入全景预览的图片');
      return;
    }

    const createdId = createDerivedPanoramaNodeFromNode(nodeId, primaryImage);
    if (!createdId) {
      message.info('当前节点暂时不能创建全景预览');
      return;
    }

    message.success('已创建全景预览节点');
  }, [createDerivedPanoramaNodeFromNode, message, resolvePrimaryImageAssetForNode]);

  const handleCreateSubjectFromNode = useCallback(async (nodeId: string) => {
    const targetNode = reactFlow.getNode(nodeId);
    if (!targetNode || targetNode.type === 'group') {
      message.info('当前工作流块不支持创建主体');
      return;
    }

    const nodeData = targetNode.data as unknown as LinghuiNodeData;
    const referenceImages = contextMenuMediaActionState.imageItems
      .map(item => item.source.trim())
      .filter(Boolean)
      .filter((source, index, all) => all.indexOf(source) === index)
      .slice(0, 4);

    if (!referenceImages.length) {
      message.info('当前节点没有可用于创建主体的图片');
      return;
    }

    const primaryLabel = contextMenuMediaActionState.primaryImage?.label?.trim();
    const baseLabel = String(nodeData.label || primaryLabel || '画布主体').trim();
    const label = /主体|角色|人物/.test(baseLabel) ? baseLabel : `${baseLabel} 主体`;
    const promptHint = resolveLinghuiCanvasResultCopyPayload(nodeRuns[nodeId], 'text')?.value
      ?? `由灵绘画布节点「${nodeData.label || nodeId}」创建。`;

    try {
      const asset = await saveLinghuiGlobalAsset({
        kind: 'character',
        label,
        hint: '从灵绘画布节点创建',
        promptHint: promptHint.slice(0, 1200),
        favorite: true,
        referenceImages,
      });
      message.success(`已创建主体：${asset.label}`);
    } catch (error: any) {
      message.error(error?.message || '创建主体失败');
    }
  }, [contextMenuMediaActionState.imageItems, contextMenuMediaActionState.primaryImage, message, nodeRuns, reactFlow]);

  const handleCopyResultFromNode = useCallback(async (
    nodeId: string,
    kind: LinghuiCanvasResultCopyKind,
  ) => {
    const payload = resolveLinghuiCanvasResultCopyPayload(nodeRuns[nodeId], kind);
    if (!payload) {
      message.info('当前节点还没有可复制的结果');
      return;
    }

    try {
      await writeTextToClipboard(payload.value);
      message.success(payload.successMessage);
    } catch (error: any) {
      message.error(error?.message || '复制失败，请稍后重试');
    }
  }, [message, nodeRuns]);

  const handleCopyPrimaryImageFromNode = useCallback(async () => {
    const primaryImage = contextMenuMediaActionState.primaryImage;
    const source = String(primaryImage?.source ?? '').trim();
    if (!source) {
      message.info('当前节点没有可复制的图片');
      return;
    }

    try {
      await writeImageToClipboard(source);
      message.success('图片已复制');
    } catch (error: any) {
      message.error(error?.message || '复制图片失败');
    }
  }, [contextMenuMediaActionState.primaryImage, message]);

  const handleExpandImagesFromNode = useCallback((nodeId: string) => {
    const createdIds = createDerivedImageNodesFromNode(nodeId, contextMenuMediaActionState.imageItems);
    if (!createdIds.length) {
      message.info('当前节点没有可展开的图片');
      return;
    }
    message.success(`已展开 ${createdIds.length} 个图片节点`);
  }, [contextMenuMediaActionState.imageItems, createDerivedImageNodesFromNode, message]);

  const handleKeepOnlyCurrentImage = useCallback((nodeId: string) => {
    const primaryImage = contextMenuMediaActionState.primaryImage;
    if (!primaryImage) {
      message.info('当前节点没有可保留的主图');
      return;
    }

    updateNodeData(nodeId, (previous) => {
      if (previous.linghuiType !== 'linghui/image' && previous.linghuiType !== 'linghui/panorama') {
        return previous;
      }

      return {
        ...previous,
        properties: createLinghuiImageImportProperties(
          previous.properties as unknown as LinghuiImageNodeProperties,
          [primaryImage],
          primaryImage.id,
        ) as unknown as Record<string, unknown>,
      };
    }, { markStale: false });
    onClearNodeRunState?.(nodeId);
    message.success('已删除其他图片，仅保留当前主图');
  }, [contextMenuMediaActionState.primaryImage, message, onClearNodeRunState, updateNodeData]);

  const handleExpandVideosFromNode = useCallback((nodeId: string) => {
    const createdIds = createDerivedVideoNodesFromNode(nodeId, contextMenuMediaActionState.videoItems);
    if (!createdIds.length) {
      message.info('当前节点没有可展开的视频');
      return;
    }
    message.success(`已展开 ${createdIds.length} 个视频节点`);
  }, [contextMenuMediaActionState.videoItems, createDerivedVideoNodesFromNode, message]);

  const handleKeepOnlyCurrentVideo = useCallback((nodeId: string) => {
    const primaryVideo = contextMenuMediaActionState.videoItems[0];
    if (!primaryVideo) {
      message.info('当前节点没有可保留的主视频');
      return;
    }

    updateNodeData(nodeId, (previous) => {
      if (previous.linghuiType !== 'linghui/video') {
        return previous;
      }
      const previousProps = previous.properties as unknown as LinghuiVideoNodeProperties;
      return {
        ...previous,
        properties: {
          ...previousProps,
          source: String(primaryVideo.source ?? ''),
          posterSource: String(primaryVideo.posterSource ?? ''),
        } as unknown as Record<string, unknown>,
      };
    }, { markStale: false });
    onClearNodeRunState?.(nodeId);
    message.success('已删除其他视频，仅保留当前主视频');
  }, [contextMenuMediaActionState.videoItems, message, onClearNodeRunState, updateNodeData]);

  /**
   * 视频工具栏调用入口：按任意 nodeId 分离音轨，自己解析视频源，不依赖右键菜单 contextMenuMediaActionState。
   * 对齐 LibTV "音频分离 → 音视频分离"：从节点 properties + 当前 run result 中找一个本地视频源，
   * FFmpeg 拆出音轨，并通过 createDerivedAudioNodeFromVideo 派生 audio 节点。
   */
  const handleSeparateVideoAudioForNode = useCallback(async (targetNodeId: string) => {
    const target = reactFlow.getNode(targetNodeId);
    if (!target) {
      message.error('未找到目标节点');
      return;
    }

    const targetData = target.data as unknown as LinghuiNodeData | undefined;
    if (targetData?.linghuiType !== 'linghui/video') {
      message.info('当前节点不是视频节点');
      return;
    }

    const videoProps = targetData.properties as unknown as LinghuiVideoNodeProperties | undefined;
    const runResult = nodeRuns[targetNodeId]?.result;
    const runVideo = getLinghuiResultPrimaryMedia(runResult);
    const candidateSource = String(
      runVideo?.source
      ?? videoProps?.source
      ?? '',
    ).trim();

    if (!candidateSource || !isLocalVideoSourceForAudioSplit(candidateSource)) {
      message.info('当前视频需要先保存为本地文件，才能分离音轨');
      return;
    }

    if (!workspaceId) {
      message.warning('请先打开一个灵绘工作区，再分离音轨');
      return;
    }

    try {
      const decodedSource = decodeLinghuiLocalSource(candidateSource);
      const mediaInfo = await ffmpegManager.getMediaInfo(decodedSource);
      if (!mediaInfo?.hasAudio) {
        message.info('当前视频没有可分离的音轨');
        return;
      }

      const workspaceDir = await getLinghuiWorkspaceDir(workspaceId);
      const outputDir = `${workspaceDir}/assets/extracted-audio`;
      const fileSystemPort = getFileSystemPort();
      await fileSystemPort.mkdir(outputDir);
      const ext = mediaInfo.audioCodec === 'aac' ? 'm4a' : 'mp3';
      const outputPath = `${outputDir}/${Date.now()}-${targetNodeId}.${ext}`;
      const audioPath = await ffmpegManager.splitAudio(decodedSource, outputPath);
      const createdId = createDerivedAudioNodeFromVideo(targetNodeId, {
        source: audioPath,
        label: `${String(targetData.label || '视频')} 音轨`,
        prompt: '从视频内嵌音轨分离',
      });
      if (!createdId) {
        message.info('音轨已分离，但未能创建音频节点');
        return;
      }
      message.success('已分离内嵌音轨为独立音频节点');
    } catch (error: any) {
      message.error(error?.message || '分离音轨失败');
    }
  }, [createDerivedAudioNodeFromVideo, message, nodeRuns, reactFlow, workspaceId]);

  /**
   * LibTV "返回生成节点"：派生 image 节点的右键菜单上的高频跳转项。
   * 选中控制器节点 + fitView 到该节点，让用户继续在控制器上调参再生成。
   */
  const handleReturnToGenerator = useCallback(() => {
    const generatorId = contextMenuMediaActionState.generatorNodeId;
    if (!generatorId) {
      message.info('当前节点不是派生展示节点，没有可返回的控制器');
      return;
    }
    const target = reactFlow.getNode(generatorId);
    if (!target) {
      message.error('生成器节点已删除');
      return;
    }
    reactFlow.setNodes(previous => previous.map(node => ({
      ...node,
      selected: node.id === generatorId,
    })));
    reactFlow.fitView({
      nodes: [{ id: generatorId }],
      duration: 220,
      maxZoom: 1.3,
      minZoom: 0.6,
    });
  }, [contextMenuMediaActionState.generatorNodeId, message, reactFlow]);

  const handleSeparateVideoAudioFromNode = useCallback(async (nodeId: string) => {
    const primaryVideo = contextMenuMediaActionState.videoItems[0];
    const videoSource = decodeLinghuiLocalSource(String(primaryVideo?.source ?? '').trim());
    if (!primaryVideo || !isLocalVideoSourceForAudioSplit(primaryVideo.source)) {
      message.info('当前视频需要先保存为本地文件，才能分离音轨');
      return;
    }

    if (!workspaceId) {
      message.warning('请先打开一个灵绘工作区，再分离音轨');
      return;
    }

    try {
      const mediaInfo = await ffmpegManager.getMediaInfo(videoSource);
      if (!mediaInfo?.hasAudio) {
        message.info('当前视频没有可分离的音轨');
        return;
      }

      const workspaceDir = await getLinghuiWorkspaceDir(workspaceId);
      const outputDir = `${workspaceDir}/assets/extracted-audio`;
      const fileSystemPort = getFileSystemPort();
      await fileSystemPort.mkdir(outputDir);
      const ext = mediaInfo.audioCodec === 'aac' ? 'm4a' : 'mp3';
      const outputPath = `${outputDir}/${Date.now()}-${nodeId}.${ext}`;
      const audioPath = await ffmpegManager.splitAudio(videoSource, outputPath);
      const createdId = createDerivedAudioNodeFromVideo(nodeId, {
        source: audioPath,
        label: `${contextMenuNode ? String((contextMenuNode.data as unknown as LinghuiNodeData).label || '视频') : '视频'} 音轨`,
        prompt: '从视频内嵌音轨分离',
      });
      if (!createdId) {
        message.info('音轨已分离，但未能创建音频节点');
        return;
      }
      message.success('已分离内嵌音轨为独立音频节点');
    } catch (error: any) {
      message.error(error?.message || '分离音轨失败');
    }
  }, [contextMenuMediaActionState.videoItems, contextMenuNode, createDerivedAudioNodeFromVideo, message, workspaceId]);

  const resolveWorkflowTemplateName = useCallback((requestedIds?: string[]) => {
    const selectionIds = requestedIds?.length ? requestedIds : contextMenuSelectionIds;
    const rfNodes = reactFlow.getNodes();
    const selectedGroups = rfNodes.filter(node => selectionIds.includes(node.id) && node.type === 'group');
    const selectedLeafNodes = rfNodes.filter(node => selectionIds.includes(node.id) && node.type !== 'group');

    if (selectedGroups.length === 1) {
      return String((selectedGroups[0].data as { label?: string } | undefined)?.label || '未命名工作流').trim();
    }
    if (selectedLeafNodes.length === 1) {
      const label = String((selectedLeafNodes[0].data as unknown as LinghuiNodeData | undefined)?.label || '节点工作流').trim();
      return label.includes('工作流') ? label : `${label} 工作流`;
    }
    if (selectedLeafNodes.length > 1) {
      return `工作流 ${selectedLeafNodes.length} 节点`;
    }
    return '未命名工作流';
  }, [contextMenuSelectionIds, reactFlow]);

  const handleCreateWorkflowTemplate = useCallback(async (requestedIds?: string[]) => {
    if (!workspaceId) {
      message.warning('请先打开一个灵绘工作区，再保存工作流');
      return;
    }

    const selectionIds = requestedIds?.length ? requestedIds : contextMenuSelectionIds;
    const snapshot = buildClipboardSnapshot(selectionIds);
    if (!snapshot) {
      message.info('请先选中一个工作流块或一组节点，再保存为工作流');
      return;
    }

    const sourceGroupId = selectionIds.find(selectionId => {
      const targetNode = reactFlow.getNode(selectionId);
      return targetNode?.type === 'group';
    });

    try {
      const template = await createLinghuiWorkflowTemplate({
        workspaceId,
        name: resolveWorkflowTemplateName(selectionIds),
        snapshot,
        sourceGroupId,
      });
      onWorkflowTemplateMutate?.();
      message.success(`已保存工作流：${template.name}`);
    } catch (error: any) {
      message.error(error?.message || '保存工作流失败');
    }
  }, [
    buildClipboardSnapshot,
    contextMenuSelectionIds,
    message,
    onWorkflowTemplateMutate,
    reactFlow,
    resolveWorkflowTemplateName,
    workspaceId,
  ]);

  const runDerivedTargets = useCallback((targetIds: string[], successMessage: string) => {
    if (!targetIds.length) {
      return;
    }

    requestAnimationFrame(() => {
      onRunSelection?.(targetIds);
      message.info(successMessage);
    });
  }, [message, onRunSelection]);

  const applyImageToolPreset = useCallback((preset: {
    label?: string;
    promptSnippet: string;
    properties?: Partial<LinghuiImageNodeProperties>;
  }) => {
    if (editorSelection?.kind !== 'node' || editorSelection.nodeType !== 'linghui/image') {
      return;
    }

    const sourceNode = reactFlow.getNode(editorSelection.nodeId);
    const sourceNodeData = sourceNode?.data as unknown as LinghuiNodeData | undefined;
    const sourceProps = sourceNodeData?.properties as unknown as LinghuiImageNodeProperties | undefined;
    const prompt = mergePromptSnippet(String(sourceProps?.prompt ?? ''), preset.promptSnippet);

    // LibTV 1:1：工具 preset 创建下游 IMAGE_EDIT 节点（showGenerator: false），
    // 连接 source → target edge，自动运行。与 LibTV `action: IMAGE_EDIT` 行为一致。
    const createdId = createDerivedImageToolNodeFromNode(editorSelection.nodeId, {
      label: preset.label
        ? `${sourceNodeData?.label || '图片'} ${preset.label}`
        : `${sourceNodeData?.label || '图片'} 工具生成`,
      prompt,
      properties: preset.properties,
    });

    if (!createdId) {
      message.info('创建图片工具节点失败');
      return;
    }

    requestAnimationFrame(() => {
      onRunSingleNodeRef.current?.(createdId);
      message.success(`已创建${preset.label ? `「${preset.label}」` : ''}工具节点并开始执行`);
    });
  }, [
    createDerivedImageToolNodeFromNode,
    editorSelection,
    message,
    onRunSingleNodeRef,
    reactFlow,
  ]);

  const executeGridSplit = useCallback(async () => {
    if (!activeNodeTool || activeNodeTool.kind !== 'image' || activeNodeTool.tool !== 'grid-split') {
      return;
    }
    if (!workspaceId) {
      message.warning('请先打开灵绘工作区，再执行宫格切分');
      return;
    }
    if (!getFileSystemPort().capabilities.nativeLocalPaths) {
      message.warning('当前文件系统实现不支持宫格切分');
      return;
    }
    if (!gridSplitSelectedCells.length) {
      message.info('请先在图片节点上选择要切出的宫格');
      return;
    }

    const gridSize = GRID_SPLIT_SIZE_MAP[gridSplitType === 'none' ? '2x2' : gridSplitType] ?? 2;
    const targetNode = reactFlow.getNode(activeNodeTool.nodeId);
    if (!targetNode || targetNode.type === 'group') {
      message.info('当前节点不可执行宫格切分');
      return;
    }

    const nodeData = targetNode.data as unknown as LinghuiNodeData;
    const primaryImage = resolveLinghuiImagePrimaryForNode(nodeData, nodeRuns[activeNodeTool.nodeId]?.result);
    const source = String(primaryImage?.source ?? '').trim();
    if (!source) {
      message.info('当前图片节点没有可切分的主图');
      return;
    }

    try {
      const nodeLabel = String(primaryImage?.label || nodeData.label || '图片').trim() || '图片';
      const baseName = sanitizeAssetBaseName(nodeLabel, 'grid-source');
      const inputPath = await materializeGridSplitInputSource({
        source,
        workspaceId,
        baseName,
      });
      const inputItem = await createLinghuiImageAssetItemFromSource({
        source: inputPath,
        label: nodeLabel,
      });
      const workspaceDir = await getLinghuiWorkspaceDir(workspaceId);
      const outputDir = `${workspaceDir}/assets/grid-splits/${activeNodeTool.nodeId}/${Date.now()}`;
      const targetWidth = inputItem.width ? Math.ceil(inputItem.width / gridSize) * gridSplitUpscaleFactor : undefined;
      const targetHeight = inputItem.height ? Math.ceil(inputItem.height / gridSize) * gridSplitUpscaleFactor : undefined;
      const outputs = await ffmpegManager.splitGridImage({
        input: inputPath,
        outputDir,
        aspectRatio: inputItem.aspectRatio || (inputItem.height && inputItem.width && inputItem.height > inputItem.width ? '9:16' : '16:9'),
        gridSize,
        targetWidth,
        targetHeight,
        format: 'png',
        sharpenAmount: 0.9,
      });

      if (!Array.isArray(outputs) || outputs.length !== gridSize * gridSize) {
        throw new Error('宫格切分失败：输出数量不正确');
      }

      const selectedIndices = [...gridSplitSelectedCells].sort((left, right) => left - right);
      const selectedItems = await Promise.all(selectedIndices.map(async cellIndex => {
        const outputPath = outputs[cellIndex];
        if (!outputPath) {
          throw new Error(`缺少第 ${cellIndex + 1} 格输出图片`);
        }
        return createLinghuiImageAssetItemFromSource({
          source: outputPath,
          label: `${nodeLabel} ${cellIndex + 1}`,
        });
      }));

      const createdIds = createDerivedImageNodesFromNode(activeNodeTool.nodeId, selectedItems);
      setGridSplitSelectedCells([]);
      if (createdIds.length) {
        message.success(`已创建 ${createdIds.length} 个图片节点，高清倍率 ${gridSplitUpscaleFactor}x`);
      } else {
        message.info('没有生成新的图片节点');
      }
    } catch (error: any) {
      message.error(error?.message || '宫格切分失败');
    }
  }, [
    activeNodeTool,
    createDerivedImageNodesFromNode,
    gridSplitSelectedCells,
    gridSplitType,
    gridSplitUpscaleFactor,
    message,
    nodeRuns,
    reactFlow,
    setGridSplitSelectedCells,
    workspaceId,
  ]);

  const executeImageUpscale = useCallback(async (nodeId: string, options?: { factor?: 2 | 4 }) => {
    const sourceNodeId = String(nodeId ?? '').trim();
    if (!sourceNodeId) {
      return;
    }
    if (!workspaceId) {
      message.warning('请先打开灵绘工作区，再执行高清放大');
      return;
    }
    if (!getFileSystemPort().capabilities.nativeLocalPaths) {
      message.warning('当前文件系统实现不支持高清放大');
      return;
    }

    setActiveNodeTool({ kind: 'image', nodeId: sourceNodeId, tool: 'upscale' });

    const targetNode = reactFlow.getNode(sourceNodeId);
    if (!targetNode || targetNode.type === 'group') {
      message.info('当前节点不可执行高清放大');
      return;
    }

    const nodeData = targetNode.data as unknown as LinghuiNodeData;
    const primaryImage = resolveLinghuiImagePrimaryForNode(nodeData, nodeRuns[sourceNodeId]?.result);
    const source = String(primaryImage?.source ?? '').trim();
    if (!source) {
      message.info('当前图片节点没有可放大的主图');
      return;
    }

    const factor = options?.factor ?? 2;

    try {
      const nodeLabel = String(primaryImage?.label || nodeData.label || '图片').trim() || '图片';
      const baseName = sanitizeAssetBaseName(nodeLabel, 'upscale-source');
      const inputPath = await materializeGridSplitInputSource({
        source,
        workspaceId,
        baseName,
      });
      const workspaceDir = await getLinghuiWorkspaceDir(workspaceId);
      const outputDir = `${workspaceDir}/assets/upscaled-images/${sourceNodeId}`;
      await getFileSystemPort().mkdir(outputDir);
      const outputPath = `${outputDir}/${Date.now()}-${baseName}-${factor}x.png`;
      const upscaledPath = await ffmpegManager.upscaleImage({
        input: inputPath,
        output: outputPath,
        factor,
        sharpenAmount: 0.9,
      });
      const upscaledItem = await createLinghuiImageAssetItemFromSource({
        source: upscaledPath,
        label: `${nodeLabel} 高清 ${factor}x`,
      });
      const createdIds = createDerivedImageNodesFromNode(sourceNodeId, [upscaledItem]);
      setActiveNodeTool(null);
      if (createdIds.length) {
        message.success(`已创建高清放大图片节点（${factor}x）`);
      } else {
        message.info('高清图片已生成，但未能创建新节点');
      }
    } catch (error: any) {
      message.error(error?.message || '高清放大失败');
    }
  }, [
    createDerivedImageNodesFromNode,
    message,
    nodeRuns,
    reactFlow,
    setActiveNodeTool,
    workspaceId,
  ]);

  const executeImageCrop = useCallback(async (nodeId: string, options: { aspectRatio: string; label?: string }) => {
    const sourceNodeId = String(nodeId ?? '').trim();
    if (!sourceNodeId) {
      return;
    }
    if (!workspaceId) {
      message.warning('请先打开灵绘工作区，再执行裁剪');
      return;
    }
    if (!getFileSystemPort().capabilities.nativeLocalPaths) {
      message.warning('当前文件系统实现不支持裁剪');
      return;
    }

    setActiveNodeTool({ kind: 'image', nodeId: sourceNodeId, tool: 'crop' });

    const targetNode = reactFlow.getNode(sourceNodeId);
    if (!targetNode || targetNode.type === 'group') {
      message.info('当前节点不可执行裁剪');
      return;
    }

    const nodeData = targetNode.data as unknown as LinghuiNodeData;
    const primaryImage = resolveLinghuiImagePrimaryForNode(nodeData, nodeRuns[sourceNodeId]?.result);
    const source = String(primaryImage?.source ?? '').trim();
    if (!source) {
      message.info('当前图片节点没有可裁剪的主图');
      return;
    }

    try {
      const nodeLabel = String(primaryImage?.label || nodeData.label || '图片').trim() || '图片';
      const cropLabel = String(options.label ?? '裁剪').trim() || '裁剪';
      const aspectRatio = String(options.aspectRatio ?? '1:1').trim() || '1:1';
      const baseName = sanitizeAssetBaseName(`${nodeLabel}-${cropLabel}`, 'crop-source');
      const inputPath = await materializeGridSplitInputSource({
        source,
        workspaceId,
        baseName,
      });
      const workspaceDir = await getLinghuiWorkspaceDir(workspaceId);
      const outputDir = `${workspaceDir}/assets/cropped-images/${sourceNodeId}`;
      await getFileSystemPort().mkdir(outputDir);
      const outputPath = `${outputDir}/${Date.now()}-${baseName}-${aspectRatio.replace(/[^0-9a-zA-Z]+/g, 'x')}.png`;
      const croppedPath = await ffmpegManager.cropImage({
        input: inputPath,
        output: outputPath,
        aspectRatio,
        sharpenAmount: 0.4,
      });
      const croppedItem = await createLinghuiImageAssetItemFromSource({
        source: croppedPath,
        label: `${nodeLabel} ${cropLabel}`,
      });
      const createdIds = createDerivedImageNodesFromNode(sourceNodeId, [croppedItem]);
      setActiveNodeTool(null);
      if (createdIds.length) {
        message.success(`已创建${cropLabel}图片节点（${aspectRatio}）`);
      } else {
        message.info('裁剪图片已生成，但未能创建新节点');
      }
    } catch (error: any) {
      message.error(error?.message || '裁剪失败');
    }
  }, [
    createDerivedImageNodesFromNode,
    message,
    nodeRuns,
    reactFlow,
    setActiveNodeTool,
    workspaceId,
  ]);

  const executeMultiAngle = useCallback((options?: LinghuiExecuteMultiAngleOptions) => {
    if (!activeNodeTool || activeNodeTool.kind !== 'image' || activeNodeTool.tool !== 'multi-angle') {
      return;
    }

    const targetNode = reactFlow.getNode(activeNodeTool.nodeId);
    if (!targetNode || targetNode.type === 'group') {
      message.info('当前节点不可执行多角度生图');
      return;
    }

    const nodeData = targetNode.data as unknown as LinghuiNodeData;
    const primaryImage = resolveLinghuiImagePrimaryForNode(nodeData, nodeRuns[activeNodeTool.nodeId]?.result);
    if (!String(primaryImage?.source ?? '').trim()) {
      message.info('当前图片节点没有可用于多角度的主图');
      return;
    }

    const props = nodeData.properties as unknown as LinghuiImageNodeProperties;
    const nextMultiAngle = normalizeLinghuiMultiAngleConfig({
      ...props.multiAngle,
      ...options?.multiAngle,
    });
    const createdId = createDerivedMultiAngleImageNodeFromNode(activeNodeTool.nodeId, {
      ttiSelection: String(options?.ttiSelection ?? props.multiAngle?.ttiSelection ?? props.ttiSelection ?? ''),
      multiAngle: nextMultiAngle,
      label: String(options?.label ?? `${nodeData.label} 多角度`),
    });

    if (!createdId) {
      message.info('创建多角度生图节点失败');
      return;
    }

    logger.info('灵绘多角度节点已创建', {
      sourceNodeId: activeNodeTool.nodeId,
      createdNodeId: createdId,
      selectionKey: String(options?.ttiSelection ?? props.multiAngle?.ttiSelection ?? props.ttiSelection ?? ''),
      sourceImage: String(primaryImage?.source ?? ''),
      multiAngle: {
        azimuth: nextMultiAngle.azimuth,
        elevation: nextMultiAngle.elevation,
        distance: nextMultiAngle.distance,
        promptProtocol: nextMultiAngle.promptProtocol,
        endpointPath: nextMultiAngle.endpointPath,
      },
    });

    runNodeWhenReady(createdId);
    message.success('已创建多角度生图节点并开始执行');
  }, [
    activeNodeTool,
    createDerivedMultiAngleImageNodeFromNode,
    message,
    nodeRuns,
    reactFlow,
    runNodeWhenReady,
  ]);

  return {
    editorSelection,
    activeNodeTool,
    setActiveNodeTool,
    onCloseEditor,
    nodeRuns,
    executionQueue,
    workspaceId,
    onAssetLibraryMutate,
    canvasRect,
    onRunNode(nodeId) {
      onRunSingleNodeRef.current?.(nodeId);
    },
    onDeriveScriptShots(nodeId, shots) {
      if (!shots.length) {
        message.info('当前脚本还没有可派生的镜头');
        return;
      }
      if (deriveStoryboardShotsFromScript(nodeId, shots)) {
        message.success('已派生镜头文本节点');
      }
    },
    onGenerateScriptImages(nodeId, shots) {
      if (!shots.length) {
        message.info('当前脚本还没有可生成的镜头');
        return;
      }
      const targetIds = deriveStoryboardImagesFromScript(nodeId, shots);
      runDerivedTargets(targetIds, '已开始生成选中分镜图');
    },
    onGenerateScriptVideos(nodeId, shots) {
      if (!shots.length) {
        message.info('当前脚本还没有可生成的视频镜头');
        return;
      }
      const targetIds = deriveStoryboardVideosFromScript(nodeId, shots);
      runDerivedTargets(targetIds, '已开始生成选中视频流程');
    },
    onCreateDerivedImportImages(nodeId, items) {
      createDerivedImageNodesFromNode(nodeId, items);
    },
    onCreateDerivedMultiAngleImage(nodeId, options) {
      return createDerivedMultiAngleImageNodeFromNode(nodeId, options);
    },
    onExecuteImageUpscale(nodeId, options) {
      void executeImageUpscale(nodeId, options);
    },
    onExecuteImageCrop(nodeId, options) {
      void executeImageCrop(nodeId, options);
    },
    onCreatePanoramaPreview: handleOpenPanoramaPreviewFromNode,
    onExecuteMultiAngle(options) {
      executeMultiAngle(options);
    },
    onApplyImageToolPreset: applyImageToolPreset,
    onSetGridSplitType(type) {
      setGridSplitType(type);
      setGridSplitSelectedCells([]);
    },
    onClearGridSplitCells() {
      setGridSplitSelectedCells([]);
    },
    onExecuteGridSplit() {
      void executeGridSplit();
    },
    gridSplitUpscaleFactor,
    onSetGridSplitUpscaleFactor: setGridSplitUpscaleFactor,
    onRevertGridSplit: revertGridSplitTool,
    onSeparateVideoAudio: handleSeparateVideoAudioForNode,
    pendingGroupFrameStyle,
    pendingGroupActionsStyle,
    pendingGroupCreatableIds,
    onCreateGroup: createGroupFromSelection,
    onDismissPendingGroup: clearPendingGroupFrame,
    quickCreate,
    quickCreateCatalog,
    onAddNodeFromQuickCreate: addNodeFromQuickCreate,
    contextMenu,
    contextMenuNodeIsGroup: contextMenuNode?.type === 'group',
    contextMenuResultCopyState,
    contextMenuMediaActionState: {
      imageCount: contextMenuMediaActionState.imageItems.length,
      videoCount: contextMenuMediaActionState.videoItems.length,
      canOpenPanoramaPreview: Boolean(contextMenuMediaActionState.primaryImage),
      canCreateSubject: contextMenuMediaActionState.imageItems.length > 0,
      canCopyPrimaryImage: Boolean(contextMenuMediaActionState.primaryImage?.source),
      canSeparateVideoAudio: (
        contextMenuMediaActionState.videoItems.some(item => isLocalVideoSourceForAudioSplit(item.source)) &&
        contextMenuNode?.type !== 'group' &&
        (contextMenuNode?.data as unknown as LinghuiNodeData | undefined)?.linghuiType === 'linghui/video'
      ),
      canExpandImages: contextMenuMediaActionState.imageItems.length > 1,
      canDeleteOtherImages: (
        contextMenuMediaActionState.imageItems.length > 1 &&
        Boolean(contextMenuMediaActionState.primaryImage) &&
        contextMenuNode?.type !== 'group' &&
        (
          ((contextMenuNode?.data as unknown as LinghuiNodeData | undefined)?.linghuiType === 'linghui/image') ||
          ((contextMenuNode?.data as unknown as LinghuiNodeData | undefined)?.linghuiType === 'linghui/panorama')
        )
      ),
      canExpandVideos: contextMenuMediaActionState.videoItems.length > 1,
      canDeleteOtherVideos: (
        contextMenuMediaActionState.videoItems.length > 1 &&
        contextMenuNode?.type !== 'group' &&
        (contextMenuNode?.data as unknown as LinghuiNodeData | undefined)?.linghuiType === 'linghui/video'
      ),
      canReturnToGenerator: Boolean(contextMenuMediaActionState.generatorNodeId),
    },
    contextMenuSelectionIds,
    nodeCatalog: LINGHUI_CANVAS_CREATE_MENU_CATALOG,
    hasClipboardData,
    canUndo,
    canRedo,
    onAddNodeFromMenu: addNodeFromMenu,
    onOpenAddNodePanel() {
      if (!contextMenu) {
        return;
      }
      // LibTV 行为：关闭当前右键菜单，在同一画布位置弹出 quickCreate 节点目录。
      const { screenX, screenY } = contextMenu;
      closeContextMenu();
      openQuickCreateAt(screenX, screenY);
    },
    onCopyNodeSelection() {
      if (contextMenuSelectionIds.length) {
        copySelectionToClipboard(contextMenuSelectionIds);
      }
      closeContextMenu();
    },
    onDuplicateNodeSelection() {
      if (!contextMenu) {
        return;
      }
      duplicateSelection(contextMenuSelectionIds, {
        screenX: contextMenu.screenX + 24,
        screenY: contextMenu.screenY + 18,
      });
      closeContextMenu();
    },
    onOpenDownstreamQuickCreate() {
      if (!contextMenu?.nodeId) {
        return;
      }
      void openDownstreamQuickCreate(contextMenu.nodeId, contextMenu.screenX + 18, contextMenu.screenY + 12);
    },
    onCreateAssetFromNode() {
      if (!contextMenu?.nodeId) {
        return;
      }
      void handleCreateAssetFromNode(contextMenu.nodeId);
      closeContextMenu();
    },
    onOpenPanoramaPreviewFromNode() {
      if (!contextMenu?.nodeId) {
        return;
      }
      handleOpenPanoramaPreviewFromNode(contextMenu.nodeId);
      closeContextMenu();
    },
    onCreateSubjectFromNode() {
      if (!contextMenu?.nodeId) {
        return;
      }
      void handleCreateSubjectFromNode(contextMenu.nodeId);
      closeContextMenu();
    },
    onCopyPrimaryImageFromNode() {
      void handleCopyPrimaryImageFromNode();
      closeContextMenu();
    },
    onSeparateVideoAudioFromNode() {
      if (!contextMenu?.nodeId) {
        return;
      }
      void handleSeparateVideoAudioFromNode(contextMenu.nodeId);
      closeContextMenu();
    },
    onReturnToGenerator() {
      handleReturnToGenerator();
      closeContextMenu();
    },
    onCopyCurrentNodeResult(kind) {
      if (!contextMenu?.nodeId) {
        return;
      }
      void handleCopyResultFromNode(contextMenu.nodeId, kind);
      closeContextMenu();
    },
    onExpandCurrentNodeImages() {
      if (!contextMenu?.nodeId) {
        return;
      }
      handleExpandImagesFromNode(contextMenu.nodeId);
      closeContextMenu();
    },
    onDeleteOtherCurrentNodeImages() {
      if (!contextMenu?.nodeId) {
        return;
      }
      handleKeepOnlyCurrentImage(contextMenu.nodeId);
      closeContextMenu();
    },
    onExpandCurrentNodeVideos() {
      if (!contextMenu?.nodeId) {
        return;
      }
      handleExpandVideosFromNode(contextMenu.nodeId);
      closeContextMenu();
    },
    onDeleteOtherCurrentNodeVideos() {
      if (!contextMenu?.nodeId) {
        return;
      }
      handleKeepOnlyCurrentVideo(contextMenu.nodeId);
      closeContextMenu();
    },
    onRunCurrentNode() {
      if (!contextMenu?.nodeId) {
        return;
      }
      onRunSingleNodeRef.current?.(contextMenu.nodeId);
      closeContextMenu();
    },
    onRunCurrentGroup() {
      if (!contextMenu?.nodeId) {
        return;
      }
      onRunSelection?.([contextMenu.nodeId]);
      closeContextMenu();
    },
    onExportCurrentSelection() {
      if (!contextMenu?.nodeId) {
        return;
      }
      onExportSelection?.([contextMenu.nodeId]);
      closeContextMenu();
    },
    onSaveCurrentGroupAsWorkflow() {
      if (!contextMenu?.nodeId) {
        return;
      }
      void handleCreateWorkflowTemplate([contextMenu.nodeId]);
      closeContextMenu();
    },
    onUngroupCurrentGroup() {
      if (!contextMenu?.nodeId) {
        return;
      }
      ungroupGroupsByIds([contextMenu.nodeId]);
      closeContextMenu();
    },
    onDeleteCurrentGroup() {
      if (!contextMenu?.nodeId) {
        return;
      }
      deleteNodesByIds([contextMenu.nodeId]);
      closeContextMenu();
    },
    onPasteNearNode() {
      if (!contextMenu || !hasClipboardData) {
        return;
      }
      pasteClipboardSnapshot({
        screenX: contextMenu.screenX + 32,
        screenY: contextMenu.screenY + 24,
      });
      closeContextMenu();
    },
    onDeleteCurrentNode() {
      if (!contextMenu?.nodeId) {
        return;
      }
      // LibTV 1:1：删除节点二次确认（"该节点包含已生成的内容，删除后可通过 ⌘Z 撤销。确定删除？"）
      const nodeRun = nodeRuns[contextMenu.nodeId];
      const hasContent = nodeRun?.status === 'succeeded' || nodeRun?.status === 'failed' || nodeRun?.status === 'stale';
      const onConfirm = () => {
        deleteNodesByIds([contextMenu.nodeId]);
        closeContextMenu();
      };
      if (hasContent) {
        Modal.confirm({
          title: '删除节点',
          content: '该节点包含已生成的内容，删除后可通过 ⌘Z 撤销。确定删除？',
          okText: '确定删除',
          cancelText: '取消',
          okButtonProps: { danger: true },
          onOk: onConfirm,
        });
      } else {
        onConfirm();
      }
    },
    onDeleteCurrentEdge() {
      if (!contextMenu?.edgeId) {
        return;
      }
      deleteEdgesByIds([contextMenu.edgeId]);
      closeContextMenu();
    },
    onUploadImages() {
      if (!contextMenu) {
        return;
      }
      void handleUploadImagesToCanvas(contextMenu.screenX, contextMenu.screenY);
      closeContextMenu();
    },
    onUploadVideos() {
      if (!contextMenu) {
        return;
      }
      void handleUploadVideosToCanvas(contextMenu.screenX, contextMenu.screenY);
      closeContextMenu();
    },
    onUploadAudios() {
      if (!contextMenu) {
        return;
      }
      void handleUploadAudiosToCanvas(contextMenu.screenX, contextMenu.screenY);
      closeContextMenu();
    },
    onFormatLayout() {
      onFormatLayout();
      closeContextMenu();
    },
    onOpenShortcutPanel() {
      onOpenShortcutPanel();
      closeContextMenu();
    },
    onPaste() {
      if (!contextMenu || !hasClipboardData) {
        return;
      }
      pasteClipboardSnapshot({
        screenX: contextMenu.screenX + 16,
        screenY: contextMenu.screenY + 16,
      });
      closeContextMenu();
    },
    onUndo() {
      if (!canUndo) {
        return;
      }
      undoHistory();
      closeContextMenu();
    },
    onRedo() {
      if (!canRedo) {
        return;
      }
      redoHistory();
      closeContextMenu();
    },
    onRunAll() {
      onRunAll?.();
      closeContextMenu();
    },
    onRunSelection() {
      if (!contextMenuSelectionIds.length) {
        return;
      }
      onRunSelection?.(contextMenuSelectionIds);
      closeContextMenu();
    },
    onExportSelection() {
      if (!contextMenuSelectionIds.length) {
        return;
      }
      onExportSelection?.(contextMenuSelectionIds);
      closeContextMenu();
    },
    onSaveSelectionAsWorkflow() {
      void handleCreateWorkflowTemplate(contextMenuSelectionIds);
      closeContextMenu();
    },
    onCopySelection() {
      copySelectionToClipboard(contextMenuSelectionIds);
      closeContextMenu();
    },
    onDuplicateSelection() {
      if (!contextMenu) {
        return;
      }
      duplicateSelection(contextMenuSelectionIds, {
        screenX: contextMenu.screenX + 24,
        screenY: contextMenu.screenY + 18,
      });
      closeContextMenu();
    },
    onDeleteSelection() {
      deleteNodesByIds(contextMenuSelectionIds);
      closeContextMenu();
    },
  };
}

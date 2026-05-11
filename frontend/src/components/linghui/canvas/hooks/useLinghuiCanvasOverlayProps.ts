import { useCallback, useMemo } from 'react';
import type { MutableRefObject } from 'react';
import { nanoid } from 'nanoid';
import type { MessageInstance } from 'antd/es/message/interface';
import type { ReactFlowInstance } from '@xyflow/react';
import type {
  LinghuiCanvasSelection,
  LinghuiExecutionQueueState,
  LinghuiExecuteMultiAngleOptions,
  LinghuiImageAssetItem,
  LinghuiGridType,
  LinghuiImageNodeProperties,
  LinghuiMultiAngleConfig,
  LinghuiNodeData,
  LinghuiNodeRunState,
  LinghuiNodeToolState,
  LinghuiNodeType,
  LinghuiStoryboardFrame,
} from '../../../../types/linghui';
import { normalizeLinghuiMultiAngleConfig } from '../../../../types/linghui';
import {
  createLinghuiWorkflowTemplate,
  createLinghuiWorkspaceAsset,
  getLinghuiWorkspaceDir,
} from '../../../../store/linghuiStorage';
import type { CssVarStyle } from '../../../../theme/runtime';
import { getFileSystemPort, toFileSystemDisplayUrl } from '../../../../services/fileSystemPort';
import { ffmpegManager } from '../../../../services/ffmpegManager';
import { fromKomaLocalUrl } from '../../../../utils/urlUtils';
import { createLogger } from '../../../../store/logger';
import { stripDataHeader } from '../../../../utils/encoding';
import { LINGHUI_NODE_CATALOG } from '../../library/state/linghuiNodeDefs';
import type { LinghuiCanvasMenuState, LinghuiClipboardSnapshot, QuickCreateState } from '../state/linghuiCanvasShared';
import type { LinghuiCanvasOverlaysProps } from '../components/LinghuiCanvasOverlays';
import {
  resolveImageAspectRatioLabel,
  resolveLinghuiImagePrimaryForNode,
} from '../../editors/state/linghuiImageCollections';

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
    },
  ) => void;
  deriveStoryboardShotsFromScript: (nodeId: string, shots: LinghuiStoryboardFrame[]) => boolean;
  deriveStoryboardImagesFromScript: (nodeId: string, shots: LinghuiStoryboardFrame[]) => string[];
  deriveStoryboardVideosFromScript: (nodeId: string, shots: LinghuiStoryboardFrame[]) => string[];
  createDerivedImageNodesFromNode: (sourceNodeId: string, items: LinghuiImageAssetItem[]) => string[];
  createDerivedMultiAngleImageNodeFromNode: (sourceNodeId: string, options?: LinghuiExecuteMultiAngleOptions) => string | null;
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
  /** 3D 导演 split-view 绑定（来自 workspace.directorPreviewBindings） */
  directorPreviewBindings?: Record<string, string>;
  setDirectorPreviewBinding?: (directorNodeId: string, previewNodeId: string | null) => void;
  onRunDirectorWithPreview?: (directorNodeId: string, previewNodeId: string) => Promise<void> | void;
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
  onRunSingleNodeRef,
  openQuickCreateAt,
  closeContextMenu,
  insertNodeAtScreenPosition,
  deriveStoryboardShotsFromScript,
  deriveStoryboardImagesFromScript,
  deriveStoryboardVideosFromScript,
  createDerivedImageNodesFromNode,
  createDerivedMultiAngleImageNodeFromNode,
  copySelectionToClipboard,
  duplicateSelection,
  pasteClipboardSnapshot,
  deleteNodesByIds,
  deleteEdgesByIds,
  ungroupGroupsByIds,
  handleUploadImagesToCanvas,
  handleUploadVideosToCanvas,
  handleUploadAudiosToCanvas,
  directorPreviewBindings,
  setDirectorPreviewBinding,
  onRunDirectorWithPreview,
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

  const addNodeFromMenu = useCallback((type: LinghuiNodeType) => {
    if (!contextMenu) {
      return;
    }

    insertNodeAtScreenPosition(type, contextMenu.screenX, contextMenu.screenY);
  }, [contextMenu, insertNodeAtScreenPosition]);

  const addNodeFromQuickCreate = useCallback((type: LinghuiNodeType) => {
    if (!quickCreate) {
      return;
    }

    insertNodeAtScreenPosition(type, quickCreate.screenX, quickCreate.screenY, {
      openEditor: true,
      sourceConnection: quickCreate.sourceConnection,
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
    promptSnippet: string;
    properties?: Partial<LinghuiImageNodeProperties>;
  }) => {
    if (editorSelection?.kind !== 'node' || editorSelection.nodeType !== 'linghui/image') {
      return;
    }

    updateNodeData(editorSelection.nodeId, prev => {
      const previousProps = prev.properties as unknown as LinghuiImageNodeProperties;
      return {
        ...prev,
        properties: {
          ...previousProps,
          ...preset.properties,
          prompt: mergePromptSnippet(String(previousProps.prompt ?? ''), preset.promptSnippet),
        } as unknown as Record<string, unknown>,
      };
    }, { markStale: true });
    message.success('已应用节点预设');
  }, [editorSelection, message, updateNodeData]);

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
      const baseName = nodeLabel.replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim() || 'grid-source';
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
    directorPreviewBindings,
    setDirectorPreviewBinding,
    onRunDirectorWithPreview,
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
    contextMenuSelectionIds,
    nodeCatalog: LINGHUI_NODE_CATALOG,
    hasClipboardData,
    canUndo,
    canRedo,
    onAddNodeFromMenu: addNodeFromMenu,
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
      deleteNodesByIds([contextMenu.nodeId]);
      closeContextMenu();
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

import { useCallback } from 'react';
import type { MutableRefObject } from 'react';
import type { MessageInstance } from 'antd/es/message/interface';
import type { ReactFlowInstance } from '@xyflow/react';
import type {
  LinghuiCanvasSelection,
  LinghuiExecuteMultiAngleOptions,
  LinghuiGridType,
  LinghuiImageAssetItem,
  LinghuiImageNodeProperties,
  LinghuiNodeData,
  LinghuiNodeRunState,
  LinghuiNodeToolState,
} from '../../../../types/linghui';
import { normalizeLinghuiMultiAngleConfig } from '../../../../types/linghui';
import { getLinghuiWorkspaceDir } from '../../../../store/linghuiStorage';
import { getFileSystemPort } from '../../../../services/fileSystemPort';
import { ffmpegManager } from '../../../../services/ffmpegManager';
import { createLogger } from '../../../../store/logger';
import { resolveLinghuiImagePrimaryForNode } from '../../editors/state/linghuiImageCollections';
import {
  GRID_SPLIT_SIZE_MAP,
  createLinghuiImageAssetItemFromSource,
  materializeGridSplitInputSource,
  mergePromptSnippet,
  sanitizeAssetBaseName,
} from './linghuiCanvasOverlayMediaHelpers';

const logger = createLogger('LinghuiImageExecution');
const MULTI_ANGLE_RUN_SYNC_RETRY_LIMIT = 12;

interface UseLinghuiCanvasImageToolExecutionsParams {
  editorSelection: LinghuiCanvasSelection;
  activeNodeTool: LinghuiNodeToolState;
  setActiveNodeTool: (tool: LinghuiNodeToolState) => void;
  nodeRuns: Record<string, LinghuiNodeRunState>;
  workspaceId: string | null;
  gridSplitType: LinghuiGridType;
  gridSplitSelectedCells: number[];
  setGridSplitSelectedCells: (cells: number[]) => void;
  gridSplitUpscaleFactor: 2 | 4;
  reactFlow: ReactFlowInstance;
  message: MessageInstance;
  onRunSelection?: (selectionIds?: string[]) => void;
  onRunSingleNodeRef: MutableRefObject<((nodeId: string) => void) | undefined>;
  createDerivedImageNodesFromNode: (sourceNodeId: string, items: LinghuiImageAssetItem[]) => string[];
  createDerivedMultiAngleImageNodeFromNode: (sourceNodeId: string, options?: LinghuiExecuteMultiAngleOptions) => string | null;
  createDerivedImageToolNodeFromNode: (sourceNodeId: string, options: {
    label?: string;
    prompt: string;
    properties?: Partial<LinghuiImageNodeProperties>;
  }) => string | null;
}

export function useLinghuiCanvasImageToolExecutions({
  editorSelection,
  activeNodeTool,
  setActiveNodeTool,
  nodeRuns,
  workspaceId,
  gridSplitType,
  gridSplitSelectedCells,
  setGridSplitSelectedCells,
  gridSplitUpscaleFactor,
  reactFlow,
  message,
  onRunSelection,
  onRunSingleNodeRef,
  createDerivedImageNodesFromNode,
  createDerivedMultiAngleImageNodeFromNode,
  createDerivedImageToolNodeFromNode,
}: UseLinghuiCanvasImageToolExecutionsParams) {
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

  const executeImageCrop = useCallback(async (nodeId: string, options: { aspectRatio: string; label?: string; anchorX?: number; anchorY?: number }) => {
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
        anchorX: options.anchorX,
        anchorY: options.anchorY,
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
    applyImageToolPreset,
    executeGridSplit,
    executeImageUpscale,
    executeImageCrop,
    executeMultiAngle,
  };
}

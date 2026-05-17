import { useCallback } from 'react';
import type { MessageInstance } from 'antd/es/message/interface';
import type { ReactFlowInstance } from '@xyflow/react';
import type {
  LinghuiImageAssetItem,
  LinghuiImageNodeProperties,
  LinghuiMediaItem,
  LinghuiNodeData,
  LinghuiNodeRunState,
  LinghuiVideoNodeProperties,
} from '../../../../types/linghui';
import { getLinghuiResultPrimaryMedia } from '../../../../types/linghui';
import {
  createLinghuiWorkflowTemplate,
  createLinghuiWorkspaceAsset,
  getLinghuiWorkspaceDir,
} from '../../../../store/linghuiStorage';
import { saveLinghuiGlobalAsset } from '../../../../store/linghuiGlobalAssets';
import { getFileSystemPort } from '../../../../services/fileSystemPort';
import { ffmpegManager } from '../../../../services/ffmpegManager';
import {
  createLinghuiImageImportProperties,
  resolveLinghuiImageCollection,
} from '../../editors/state/linghuiImageCollections';
import {
  resolveLinghuiCanvasResultCopyPayload,
  type LinghuiCanvasResultCopyKind,
} from '../state/linghuiCanvasResultActions';
import type { LinghuiClipboardSnapshot } from '../state/linghuiCanvasShared';
import {
  decodeLinghuiLocalSource,
  imageMediaToAssetItem,
  isLocalVideoSourceForAudioSplit,
  writeImageToClipboard,
  writeTextToClipboard,
} from './linghuiCanvasOverlayMediaHelpers';

interface UseLinghuiCanvasContextMenuActionsParams {
  workspaceId: string | null;
  nodeRuns: Record<string, LinghuiNodeRunState>;
  contextMenuNode: ReturnType<ReactFlowInstance['getNode']> | null;
  contextMenuMediaActionState: {
    imageItems: LinghuiImageAssetItem[];
    primaryImage: LinghuiImageAssetItem | null;
    videoItems: LinghuiMediaItem[];
    generatorNodeId?: string | null;
  };
  contextMenuSelectionIds: string[];
  reactFlow: ReactFlowInstance;
  message: MessageInstance;
  onAssetLibraryMutate?: () => void;
  onWorkflowTemplateMutate?: () => void;
  updateNodeData: (
    nodeId: string,
    updater: (prev: LinghuiNodeData) => LinghuiNodeData,
    options?: { markStale?: boolean },
  ) => void;
  onClearNodeRunState?: (nodeId: string) => void;
  buildClipboardSnapshot: (requestedIds?: string[]) => LinghuiClipboardSnapshot | null;
  createDerivedImageNodesFromNode: (sourceNodeId: string, items: LinghuiImageAssetItem[]) => string[];
  createDerivedVideoNodesFromNode: (sourceNodeId: string, items: LinghuiMediaItem[]) => string[];
  createDerivedPanoramaNodeFromNode: (sourceNodeId: string, item: LinghuiImageAssetItem) => string | null;
  createDerivedAudioNodeFromVideo: (
    sourceNodeId: string,
    options: { source: string; label?: string; prompt?: string },
  ) => string | null;
}

export function useLinghuiCanvasContextMenuActions({
  workspaceId,
  nodeRuns,
  contextMenuNode,
  contextMenuMediaActionState,
  contextMenuSelectionIds,
  reactFlow,
  message,
  onAssetLibraryMutate,
  onWorkflowTemplateMutate,
  updateNodeData,
  onClearNodeRunState,
  buildClipboardSnapshot,
  createDerivedImageNodesFromNode,
  createDerivedVideoNodesFromNode,
  createDerivedPanoramaNodeFromNode,
  createDerivedAudioNodeFromVideo,
}: UseLinghuiCanvasContextMenuActionsParams) {
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

  /** 视频工具栏入口：按 nodeId 解析本地视频源并分离音轨。 */
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

  /** LibTV "返回生成节点"：选中控制器节点并 fitView。 */
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

  return {
    handleCreateAssetFromNode,
    handleOpenPanoramaPreviewFromNode,
    handleCreateSubjectFromNode,
    handleCopyResultFromNode,
    handleCopyPrimaryImageFromNode,
    handleExpandImagesFromNode,
    handleKeepOnlyCurrentImage,
    handleExpandVideosFromNode,
    handleKeepOnlyCurrentVideo,
    handleSeparateVideoAudioForNode,
    handleReturnToGenerator,
    handleSeparateVideoAudioFromNode,
    handleCreateWorkflowTemplate,
  };
}

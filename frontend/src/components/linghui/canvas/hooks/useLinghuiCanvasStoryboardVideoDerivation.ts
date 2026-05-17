import { nanoid } from 'nanoid';
import { useCallback } from 'react';
import type {
  LinghuiImageNodeProperties,
  LinghuiNodeData,
  LinghuiStoryboardFrame,
  LinghuiVideoNodeProperties,
} from '../../../../types/linghui';
import {
  collectGroupPositions,
  createCanvasNode,
  getNodeAbsolutePosition,
  resolveParentExtent,
} from '../state/linghuiCanvasShared';
import { getDerivedNodeMeta, hasMatchingEdge } from './linghuiCanvasDocumentOpsShared';
import type { UseLinghuiCanvasStoryboardDerivationParams } from './linghuiCanvasStoryboardDerivationShared';

export function useLinghuiCanvasStoryboardVideoDerivation({
  reactFlow,
  setNodes,
  setEdges,
  setEditorSelection,
  setContextMenu,
  setQuickCreate,
  setPendingGroupFrame,
  scheduleSnapshot,
}: UseLinghuiCanvasStoryboardDerivationParams) {
  return useCallback((
    scriptNodeId: string,
    shots: LinghuiStoryboardFrame[],
  ): string[] => {
    const scriptNode = reactFlow.getNode(scriptNodeId);
    if (!scriptNode || scriptNode.type === 'group' || !shots.length) {
      return [];
    }

    const currentNodes = reactFlow.getNodes();
    const currentEdges = reactFlow.getEdges();
    const groupPositions = collectGroupPositions(currentNodes, scriptNode.parentId ? [scriptNode.parentId] : []);
    const scriptAbsolutePosition = getNodeAbsolutePosition(scriptNode, groupPositions);
    const parentPosition = scriptNode.parentId ? groupPositions.get(scriptNode.parentId) : undefined;
    const existingImageByShotId = new Map(
      currentNodes
        .filter(node => {
          if (node.type === 'group') return false;
          const nodeData = node.data as unknown as LinghuiNodeData | undefined;
          if (nodeData?.linghuiType !== 'linghui/image') return false;
          const meta = getDerivedNodeMeta(node);
          return meta.scriptSourceNodeId === scriptNodeId && meta.scriptDerivationKind === 'video-image' && Boolean(meta.scriptShotId);
        })
        .map(node => [getDerivedNodeMeta(node).scriptShotId!, node]),
    );
    const existingVideoByShotId = new Map(
      currentNodes
        .filter(node => {
          if (node.type === 'group') return false;
          const nodeData = node.data as unknown as LinghuiNodeData | undefined;
          if (nodeData?.linghuiType !== 'linghui/video') return false;
          const meta = getDerivedNodeMeta(node);
          return meta.scriptSourceNodeId === scriptNodeId && meta.scriptDerivationKind === 'video' && Boolean(meta.scriptShotId);
        })
        .map(node => [getDerivedNodeMeta(node).scriptShotId!, node]),
    );

    const nextNodeMap = new Map(currentNodes.map(node => [node.id, node]));
    const nextEdges = [...currentEdges];
    const targetIds: string[] = [];

    for (const [index, shot] of shots.entries()) {
      const row = Math.floor(index / 2);
      const column = index % 2;
      const imageAbsolutePosition = {
        x: scriptAbsolutePosition.x + 248 + column * 468,
        y: scriptAbsolutePosition.y + row * 196,
      };
      const videoAbsolutePosition = {
        x: imageAbsolutePosition.x + 228,
        y: imageAbsolutePosition.y,
      };
      const imagePosition = parentPosition
        ? {
            x: imageAbsolutePosition.x - parentPosition.x,
            y: imageAbsolutePosition.y - parentPosition.y,
          }
        : imageAbsolutePosition;
      const videoPosition = parentPosition
        ? {
            x: videoAbsolutePosition.x - parentPosition.x,
            y: videoAbsolutePosition.y - parentPosition.y,
          }
        : videoAbsolutePosition;
      const normalizedLabel = shot.title?.trim() || `镜头 ${index + 1}`;
      const normalizedSource = String(shot.image?.source ?? '').trim();
      const normalizedPrompt = shot.description?.trim() || normalizedLabel;
      const imageLabel = normalizedSource ? `${normalizedLabel} 首帧` : `${normalizedLabel} 分镜图`;
      const videoLabel = `${normalizedLabel} 视频`;

      let imageNode = existingImageByShotId.get(shot.id);
      if (imageNode) {
        const imageData = imageNode.data as unknown as LinghuiNodeData;
        const imageProps = imageData.properties as unknown as LinghuiImageNodeProperties;
        imageNode = {
          ...imageNode,
          selected: false,
          data: {
            ...imageData,
            label: imageLabel,
            properties: {
              ...imageProps,
              mode: normalizedSource ? 'import' : 'generate',
              source: normalizedSource,
              prompt: normalizedPrompt,
              gridType: 'none',
              batchCount: 1,
              scriptSourceNodeId: scriptNodeId,
              scriptShotId: shot.id,
              scriptShotTitle: normalizedLabel,
              scriptDerivationKind: 'video-image',
            } satisfies LinghuiImageNodeProperties,
          } as unknown as Record<string, unknown>,
        };
      } else {
        const createdImageNode = createCanvasNode('linghui/image', imagePosition, currentNodes);
        const imageData = createdImageNode.data as unknown as LinghuiNodeData;
        const imageProps = imageData.properties as unknown as LinghuiImageNodeProperties;
        imageNode = {
          ...createdImageNode,
          parentId: scriptNode.parentId,
          extent: resolveParentExtent(scriptNode.parentId),
          selected: false,
          data: {
            ...imageData,
            label: imageLabel,
            properties: {
              ...imageProps,
              mode: normalizedSource ? 'import' : 'generate',
              source: normalizedSource,
              prompt: normalizedPrompt,
              gridType: 'none',
              batchCount: 1,
              scriptSourceNodeId: scriptNodeId,
              scriptShotId: shot.id,
              scriptShotTitle: normalizedLabel,
              scriptDerivationKind: 'video-image',
            } satisfies LinghuiImageNodeProperties,
          } as unknown as Record<string, unknown>,
        };
      }
      nextNodeMap.set(imageNode.id, imageNode);

      let videoNode = existingVideoByShotId.get(shot.id);
      if (videoNode) {
        const videoData = videoNode.data as unknown as LinghuiNodeData;
        const videoProps = videoData.properties as unknown as LinghuiVideoNodeProperties;
        videoNode = {
          ...videoNode,
          selected: true,
          data: {
            ...videoData,
            label: videoLabel,
            properties: {
              ...videoProps,
              prompt: normalizedPrompt,
              duration: Math.max(3, Math.round(shot.durationSec || 5)),
              source: '',
              posterSource: '',
              scriptSourceNodeId: scriptNodeId,
              scriptShotId: shot.id,
              scriptShotTitle: normalizedLabel,
              scriptDerivationKind: 'video',
            } satisfies LinghuiVideoNodeProperties,
          } as unknown as Record<string, unknown>,
        };
      } else {
        const createdVideoNode = createCanvasNode('linghui/video', videoPosition, currentNodes);
        const videoData = createdVideoNode.data as unknown as LinghuiNodeData;
        const videoProps = videoData.properties as unknown as LinghuiVideoNodeProperties;
        videoNode = {
          ...createdVideoNode,
          parentId: scriptNode.parentId,
          extent: resolveParentExtent(scriptNode.parentId),
          selected: true,
          data: {
            ...videoData,
            label: videoLabel,
            properties: {
              ...videoProps,
              prompt: normalizedPrompt,
              duration: Math.max(3, Math.round(shot.durationSec || 5)),
              source: '',
              posterSource: '',
              scriptSourceNodeId: scriptNodeId,
              scriptShotId: shot.id,
              scriptShotTitle: normalizedLabel,
              scriptDerivationKind: 'video',
            } satisfies LinghuiVideoNodeProperties,
          } as unknown as Record<string, unknown>,
        };
      }
      nextNodeMap.set(videoNode.id, videoNode);
      targetIds.push(videoNode.id);

      const storyboardToImageEdge = {
        source: scriptNodeId,
        sourceHandle: 'output-0',
        target: imageNode.id,
        targetHandle: 'input-0',
      };
      if (!hasMatchingEdge(nextEdges, storyboardToImageEdge)) {
        nextEdges.push({
          id: `e-${nanoid(8)}`,
          ...storyboardToImageEdge,
          type: 'linghui-edge',
        });
      }

      const edgeShape = {
        source: imageNode.id,
        sourceHandle: 'output-0',
        target: videoNode.id,
        targetHandle: 'input-0',
      };
      if (!hasMatchingEdge(nextEdges, edgeShape)) {
        nextEdges.push({
          id: `e-${nanoid(8)}`,
          ...edgeShape,
          type: 'linghui-edge',
        });
      }
    }

    const nextNodes = currentNodes.map(node => {
      const mapped = nextNodeMap.get(node.id);
      if (!mapped) return node.selected ? { ...node, selected: false } : node;
      return targetIds.includes(node.id)
        ? mapped
        : (mapped.selected ? { ...mapped, selected: false } : mapped);
    });
    const appendedNodes = [...nextNodeMap.values()].filter(node => !currentNodes.some(current => current.id === node.id));

    setNodes([...nextNodes, ...appendedNodes]);
    setEdges(nextEdges);
    setEditorSelection(null);
    setContextMenu(null);
    setQuickCreate(null);
    setPendingGroupFrame(null);
    scheduleSnapshot();
    return targetIds;
  }, [reactFlow, scheduleSnapshot, setContextMenu, setEditorSelection, setEdges, setNodes, setPendingGroupFrame, setQuickCreate]);
}

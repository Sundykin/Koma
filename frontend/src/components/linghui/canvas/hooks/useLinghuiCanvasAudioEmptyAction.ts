import type { Edge, Node } from '@xyflow/react';
import { nanoid } from 'nanoid';
import { useCallback } from 'react';
import type {
  LinghuiAudioNodeProperties,
  LinghuiImageAssetItem,
  LinghuiImageNodeProperties,
  LinghuiNodeData,
} from '../../../../types/linghui';
import { createLinghuiImageImportProperties } from '../../editors/state/linghuiImageCollections';
import { LINGHUI_AUDIO_PRESETS } from '../../editors/state/linghuiAudioPresets';
import {
  collectGroupPositions,
  createCanvasNode,
  getNodeAbsolutePosition,
  resolveParentExtent,
} from '../state/linghuiCanvasShared';
import {
  hasMatchingEmptyActionEdge,
  type UseLinghuiCanvasEmptyActionParams,
} from './linghuiCanvasEmptyActionShared';
import type { LinghuiAudioEmptyAction } from './useLinghuiCanvasEmptyActions';

export function useLinghuiCanvasAudioEmptyAction({
  reactFlow,
  setNodes,
  setEdges,
  setEditorSelection,
  setContextMenu,
  setQuickCreate,
  setPendingGroupFrame,
  scheduleSnapshot,
}: UseLinghuiCanvasEmptyActionParams) {
  return useCallback((
    sourceNodeId: string,
    action: LinghuiAudioEmptyAction,
  ): string | null => {
    if (action !== 'audio-to-video') return null;
    const currentNodes = reactFlow.getNodes();
    const sourceNode = currentNodes.find(node => node.id === sourceNodeId);
    if (!sourceNode || sourceNode.type === 'group') return null;
    const sourceNodeData = sourceNode.data as unknown as LinghuiNodeData;
    if (sourceNodeData.linghuiType !== 'linghui/audio') return null;

    const sourceWidth = sourceNode.measured?.width ?? sourceNode.width ?? 320;
    const sourceHeight = sourceNode.measured?.height ?? sourceNode.height ?? 220;
    const groupPositions = collectGroupPositions(currentNodes, sourceNode.parentId ? [sourceNode.parentId] : []);
    const sourceAbsolutePosition = getNodeAbsolutePosition(sourceNode, groupPositions);
    const parentPosition = sourceNode.parentId ? groupPositions.get(sourceNode.parentId) : undefined;
    const toLocal = (x: number, y: number) => (parentPosition
      ? { x: x - parentPosition.x, y: y - parentPosition.y }
      : { x, y });

    const videoAbsoluteX = sourceAbsolutePosition.x + sourceWidth + 84;
    const videoAbsoluteY = sourceAbsolutePosition.y;
    const imageAbsoluteX = sourceAbsolutePosition.x;
    const imageAbsoluteY = sourceAbsolutePosition.y + sourceHeight + 56;

    const videoCreated = createCanvasNode(
      'linghui/video',
      toLocal(videoAbsoluteX, videoAbsoluteY),
      currentNodes,
    );
    const videoData = videoCreated.data as unknown as LinghuiNodeData;
    const videoNode: Node = {
      ...videoCreated,
      parentId: sourceNode.parentId,
      extent: resolveParentExtent(sourceNode.parentId),
      selected: true,
      data: {
        ...videoData,
        label: '视频',
        properties: {
          ...(videoData.properties as Record<string, unknown>),
          mode: 'generate',
          prompt: LINGHUI_AUDIO_PRESETS.audioToVideo.prompt,
        } as unknown as Record<string, unknown>,
      } as unknown as Record<string, unknown>,
    };

    const imageCreated = createCanvasNode(
      'linghui/image',
      toLocal(imageAbsoluteX, imageAbsoluteY),
      [...currentNodes, videoNode],
    );
    const imageData = imageCreated.data as unknown as LinghuiNodeData;
    const imageProps = imageData.properties as unknown as LinghuiImageNodeProperties;
    const imageImportProps = createLinghuiImageImportProperties(
      imageProps,
      LINGHUI_AUDIO_PRESETS.audioToVideo.imageUrl
        ? [{ id: 'preset-image', source: LINGHUI_AUDIO_PRESETS.audioToVideo.imageUrl, label: '图片' } as LinghuiImageAssetItem]
        : [],
      LINGHUI_AUDIO_PRESETS.audioToVideo.imageUrl ? 'preset-image' : '',
    );
    const imageNode: Node = {
      ...imageCreated,
      parentId: sourceNode.parentId,
      extent: resolveParentExtent(sourceNode.parentId),
      selected: false,
      data: {
        ...imageData,
        label: '图片',
        properties: imageImportProps as unknown as Record<string, unknown>,
      } as unknown as Record<string, unknown>,
    };

    const audioToVideoEdge: Edge = {
      id: `e-${nanoid(8)}`,
      source: sourceNodeId,
      target: videoNode.id,
      sourceHandle: 'output-0',
      targetHandle: 'input-0',
      type: 'linghui-edge',
      data: { sourceSlotType: 'audio', targetSlotType: 'audio' } as Record<string, unknown>,
    };
    const imageToVideoEdge: Edge = {
      id: `e-${nanoid(8)}`,
      source: imageNode.id,
      target: videoNode.id,
      sourceHandle: 'output-0',
      targetHandle: 'input-0',
      type: 'linghui-edge',
      data: { sourceSlotType: 'image', targetSlotType: 'image' } as Record<string, unknown>,
    };

    setNodes(existing => {
      const patched = existing.map(node => {
        if (node.id === sourceNodeId) {
          const data = node.data as unknown as LinghuiNodeData;
          const props = data.properties as unknown as LinghuiAudioNodeProperties;
          return {
            ...node,
            selected: false,
            data: {
              ...data,
              properties: {
                ...props,
                mode: 'import',
                source: LINGHUI_AUDIO_PRESETS.audioToVideo.audioUrl || props.source || '',
              } as unknown as Record<string, unknown>,
            } as unknown as Record<string, unknown>,
          };
        }
        return node.selected ? { ...node, selected: false } : node;
      });
      return [...patched, videoNode, imageNode];
    });
    setEdges(existing => {
      let next = existing;
      if (!hasMatchingEmptyActionEdge(next, audioToVideoEdge)) next = [...next, audioToVideoEdge];
      if (!hasMatchingEmptyActionEdge(next, imageToVideoEdge)) next = [...next, imageToVideoEdge];
      return next;
    });
    setEditorSelection({
      kind: 'node', nodeId: videoNode.id, nodeType: 'linghui/video', label: '视频',
    });
    setContextMenu(null);
    setQuickCreate(null);
    setPendingGroupFrame(null);
    scheduleSnapshot();
    return videoNode.id;
  }, [
    reactFlow,
    scheduleSnapshot,
    setContextMenu,
    setEdges,
    setEditorSelection,
    setNodes,
    setPendingGroupFrame,
    setQuickCreate,
  ]);
}

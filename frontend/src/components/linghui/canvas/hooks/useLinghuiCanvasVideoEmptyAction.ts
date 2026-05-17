import type { Edge, Node } from '@xyflow/react';
import { nanoid } from 'nanoid';
import { useCallback } from 'react';
import type {
  LinghuiImageAssetItem,
  LinghuiImageNodeProperties,
  LinghuiNodeData,
  LinghuiVideoNodeProperties,
} from '../../../../types/linghui';
import { createLinghuiImageImportProperties } from '../../editors/state/linghuiImageCollections';
import { LINGHUI_VIDEO_PRESETS } from '../../editors/state/linghuiVideoPresets';
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
import type { LinghuiVideoEmptyAction } from './useLinghuiCanvasEmptyActions';

export function useLinghuiCanvasVideoEmptyAction({
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
    action: LinghuiVideoEmptyAction,
  ): string | null => {
    const currentNodes = reactFlow.getNodes();
    const sourceNode = currentNodes.find(node => node.id === sourceNodeId);
    if (!sourceNode || sourceNode.type === 'group') return null;
    const sourceNodeData = sourceNode.data as unknown as LinghuiNodeData;
    if (sourceNodeData.linghuiType !== 'linghui/video') return null;

    const groupPositions = collectGroupPositions(currentNodes, sourceNode.parentId ? [sourceNode.parentId] : []);
    const sourceAbsolutePosition = getNodeAbsolutePosition(sourceNode, groupPositions);
    const parentPosition = sourceNode.parentId ? groupPositions.get(sourceNode.parentId) : undefined;
    const horizontalDelta = 220 + 84;
    const leftAbsoluteX = sourceAbsolutePosition.x - horizontalDelta;
    const toLocal = (x: number, y: number) => (parentPosition
      ? { x: x - parentPosition.x, y: y - parentPosition.y }
      : { x, y });

    if (action === 'first-frame') {
      const created = createCanvasNode(
        'linghui/image',
        toLocal(leftAbsoluteX, sourceAbsolutePosition.y),
        currentNodes,
      );
      const createdData = created.data as unknown as LinghuiNodeData;
      const createdProps = createdData.properties as unknown as LinghuiImageNodeProperties;
      const importProps = createLinghuiImageImportProperties(
        createdProps,
        LINGHUI_VIDEO_PRESETS.firstFrame.imageUrl
          ? [{ id: 'preset-1', source: LINGHUI_VIDEO_PRESETS.firstFrame.imageUrl, label: '首帧' } as LinghuiImageAssetItem]
          : [],
        LINGHUI_VIDEO_PRESETS.firstFrame.imageUrl ? 'preset-1' : '',
      );
      const newImageNode: Node = {
        ...created,
        parentId: sourceNode.parentId,
        extent: resolveParentExtent(sourceNode.parentId),
        selected: false,
        data: {
          ...createdData,
          label: '首帧',
          properties: importProps as unknown as Record<string, unknown>,
        } as unknown as Record<string, unknown>,
      };
      const newEdge: Edge = {
        id: `e-${nanoid(8)}`,
        source: newImageNode.id,
        target: sourceNodeId,
        sourceHandle: 'output-0',
        targetHandle: 'input-0',
        type: 'linghui-edge',
        data: { sourceSlotType: 'image', targetSlotType: 'image' } as Record<string, unknown>,
      };
      setNodes(existing => {
        const patched = existing.map(node => {
          if (node.id === sourceNodeId) {
            const data = node.data as unknown as LinghuiNodeData;
            const props = data.properties as unknown as LinghuiVideoNodeProperties;
            return {
              ...node,
              selected: true,
              data: {
                ...data,
                properties: {
                  ...props,
                  mode: 'generate',
                  prompt: LINGHUI_VIDEO_PRESETS.firstFrame.prompt,
                  videoCapability: 'video.image-to-video',
                } as unknown as Record<string, unknown>,
              } as unknown as Record<string, unknown>,
            };
          }
          return node.selected ? { ...node, selected: false } : node;
        });
        return [...patched, newImageNode];
      });
      setEdges(existing => (hasMatchingEmptyActionEdge(existing, newEdge) ? existing : [...existing, newEdge]));
      setEditorSelection({
        kind: 'node', nodeId: sourceNodeId, nodeType: 'linghui/video', label: sourceNodeData.label,
      });
      setContextMenu(null);
      setQuickCreate(null);
      setPendingGroupFrame(null);
      scheduleSnapshot();
      return newImageNode.id;
    }

    const verticalGap = 28;
    const stackHalfHeight = 150;
    const firstY = sourceAbsolutePosition.y - stackHalfHeight - verticalGap;
    const lastY = sourceAbsolutePosition.y + stackHalfHeight + verticalGap;

    const firstCreated = createCanvasNode('linghui/image', toLocal(leftAbsoluteX, firstY), currentNodes);
    const firstData = firstCreated.data as unknown as LinghuiNodeData;
    const firstProps = firstData.properties as unknown as LinghuiImageNodeProperties;
    const firstImport = createLinghuiImageImportProperties(
      firstProps,
      LINGHUI_VIDEO_PRESETS.firstLastFrame.firstImageUrl
        ? [{ id: 'preset-first', source: LINGHUI_VIDEO_PRESETS.firstLastFrame.firstImageUrl, label: '首帧' } as LinghuiImageAssetItem]
        : [],
      LINGHUI_VIDEO_PRESETS.firstLastFrame.firstImageUrl ? 'preset-first' : '',
    );
    const newFirstNode: Node = {
      ...firstCreated,
      parentId: sourceNode.parentId,
      extent: resolveParentExtent(sourceNode.parentId),
      selected: false,
      data: {
        ...firstData,
        label: '首帧',
        properties: firstImport as unknown as Record<string, unknown>,
      } as unknown as Record<string, unknown>,
    };

    const lastCreated = createCanvasNode(
      'linghui/image',
      toLocal(leftAbsoluteX, lastY),
      [...currentNodes, newFirstNode],
    );
    const lastData = lastCreated.data as unknown as LinghuiNodeData;
    const lastProps = lastData.properties as unknown as LinghuiImageNodeProperties;
    const lastImport = createLinghuiImageImportProperties(
      lastProps,
      LINGHUI_VIDEO_PRESETS.firstLastFrame.lastImageUrl
        ? [{ id: 'preset-last', source: LINGHUI_VIDEO_PRESETS.firstLastFrame.lastImageUrl, label: '尾帧' } as LinghuiImageAssetItem]
        : [],
      LINGHUI_VIDEO_PRESETS.firstLastFrame.lastImageUrl ? 'preset-last' : '',
    );
    const newLastNode: Node = {
      ...lastCreated,
      parentId: sourceNode.parentId,
      extent: resolveParentExtent(sourceNode.parentId),
      selected: false,
      data: {
        ...lastData,
        label: '尾帧',
        properties: lastImport as unknown as Record<string, unknown>,
      } as unknown as Record<string, unknown>,
    };

    const newFirstEdge: Edge = {
      id: `e-${nanoid(8)}`,
      source: newFirstNode.id,
      target: sourceNodeId,
      sourceHandle: 'output-0',
      targetHandle: 'input-0',
      type: 'linghui-edge',
      data: { sourceSlotType: 'image', targetSlotType: 'image' } as Record<string, unknown>,
    };
    const newLastEdge: Edge = {
      id: `e-${nanoid(8)}`,
      source: newLastNode.id,
      target: sourceNodeId,
      sourceHandle: 'output-0',
      targetHandle: 'input-0',
      type: 'linghui-edge',
      data: { sourceSlotType: 'image', targetSlotType: 'image' } as Record<string, unknown>,
    };

    setNodes(existing => {
      const patched = existing.map(node => {
        if (node.id === sourceNodeId) {
          const data = node.data as unknown as LinghuiNodeData;
          const props = data.properties as unknown as LinghuiVideoNodeProperties;
          return {
            ...node,
            selected: true,
            data: {
              ...data,
              properties: {
                ...props,
                mode: 'generate',
                prompt: LINGHUI_VIDEO_PRESETS.firstLastFrame.prompt,
                videoCapability: 'video.start-end-to-video',
              } as unknown as Record<string, unknown>,
            } as unknown as Record<string, unknown>,
          };
        }
        return node.selected ? { ...node, selected: false } : node;
      });
      return [...patched, newFirstNode, newLastNode];
    });
    setEdges(existing => {
      let next = existing;
      if (!hasMatchingEmptyActionEdge(next, newFirstEdge)) next = [...next, newFirstEdge];
      if (!hasMatchingEmptyActionEdge(next, newLastEdge)) next = [...next, newLastEdge];
      return next;
    });
    setEditorSelection({
      kind: 'node', nodeId: sourceNodeId, nodeType: 'linghui/video', label: sourceNodeData.label,
    });
    setContextMenu(null);
    setQuickCreate(null);
    setPendingGroupFrame(null);
    scheduleSnapshot();
    return newFirstNode.id;
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

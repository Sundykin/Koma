import { nanoid } from 'nanoid';
import { useCallback } from 'react';
import type { Edge, Node } from '@xyflow/react';
import type {
  LinghuiImageAssetItem,
  LinghuiImageNodeProperties,
  LinghuiNodeData,
} from '../../../../types/linghui';
import { createLinghuiImageImportProperties } from '../../editors/state/linghuiImageCollections';
import {
  collectGroupPositions,
  createCanvasNode,
  getNodeAbsolutePosition,
  resolveParentExtent,
} from '../state/linghuiCanvasShared';
import type { UseLinghuiCanvasMediaDerivationParams } from './linghuiCanvasMediaDerivationShared';

export function useLinghuiCanvasPanoramaDerivation({
  reactFlow,
  setNodes,
  setEdges,
  setEditorSelection,
  setContextMenu,
  setQuickCreate,
  setPendingGroupFrame,
  scheduleSnapshot,
}: UseLinghuiCanvasMediaDerivationParams) {
  return useCallback((sourceNodeId: string, item: LinghuiImageAssetItem): string | null => {
    if (!String(item.source ?? '').trim()) {
      return null;
    }

    const currentNodes = reactFlow.getNodes();
    const sourceNode = currentNodes.find(node => node.id === sourceNodeId);
    if (!sourceNode || sourceNode.type === 'group') {
      return null;
    }

    const groupPositions = collectGroupPositions(currentNodes, sourceNode.parentId ? [sourceNode.parentId] : []);
    const sourceAbsolutePosition = getNodeAbsolutePosition(sourceNode, groupPositions);
    const parentPosition = sourceNode.parentId ? groupPositions.get(sourceNode.parentId) : undefined;
    const sourceWidth = sourceNode.measured?.width ?? sourceNode.width ?? 180;
    const absolutePosition = {
      x: sourceAbsolutePosition.x + sourceWidth + 96,
      y: sourceAbsolutePosition.y,
    };
    const position = parentPosition
      ? {
          x: absolutePosition.x - parentPosition.x,
          y: absolutePosition.y - parentPosition.y,
        }
      : absolutePosition;

    const created = createCanvasNode('linghui/panorama', position, currentNodes, {
      label: '全景预览',
    });
    const createdData = created.data as unknown as LinghuiNodeData;
    const createdProps = createdData.properties as unknown as LinghuiImageNodeProperties;
    const importProperties = createLinghuiImageImportProperties(createdProps, [item], item.id);
    const nextNode: Node = {
      ...created,
      parentId: sourceNode.parentId,
      extent: resolveParentExtent(sourceNode.parentId),
      selected: true,
      data: {
        ...createdData,
        label: item.label ? `${item.label} · 全景预览` : createdData.label,
        properties: {
          ...importProperties,
          aspectRatio: item.aspectRatio ?? importProperties.aspectRatio,
        } as unknown as Record<string, unknown>,
      } as unknown as Record<string, unknown>,
    };
    const nextEdge: Edge = {
      id: `e-${nanoid(8)}`,
      source: sourceNodeId,
      target: nextNode.id,
      sourceHandle: 'output-0',
      targetHandle: 'input-0',
      type: 'linghui-edge',
      data: {
        sourceSlotType: 'image',
        targetSlotType: 'image',
      } as Record<string, unknown>,
    };

    setNodes(existingNodes => [
      ...existingNodes.map(node => (node.selected ? { ...node, selected: false } : node)),
      nextNode,
    ]);
    setEdges(existingEdges => [...existingEdges, nextEdge]);
    setEditorSelection({
      kind: 'node',
      nodeId: nextNode.id,
      nodeType: 'linghui/panorama',
      label: String((nextNode.data as unknown as LinghuiNodeData).label || '全景预览'),
    });
    setContextMenu(null);
    setQuickCreate(null);
    setPendingGroupFrame(null);
    scheduleSnapshot();
    return nextNode.id;
  }, [reactFlow, scheduleSnapshot, setContextMenu, setEditorSelection, setEdges, setNodes, setPendingGroupFrame, setQuickCreate]);
}

import { nanoid } from 'nanoid';
import { useCallback } from 'react';
import type { Edge, Node } from '@xyflow/react';
import type {
  LinghuiImageNodeProperties,
  LinghuiNodeData,
} from '../../../../types/linghui';
import {
  collectGroupPositions,
  createCanvasNode,
  getNodeAbsolutePosition,
  resolveParentExtent,
} from '../state/linghuiCanvasShared';
import { getDerivedNodeMeta, hasMatchingEdge } from './linghuiCanvasDocumentOpsShared';
import type { UseLinghuiCanvasMediaDerivationParams } from './linghuiCanvasMediaDerivationShared';

export function useLinghuiCanvasImageToolDerivation({
  reactFlow,
  setNodes,
  setEdges,
  setEditorSelection,
  setContextMenu,
  setQuickCreate,
  setPendingGroupFrame,
  scheduleSnapshot,
}: UseLinghuiCanvasMediaDerivationParams) {
  return useCallback((sourceNodeId: string, options: {
    label?: string;
    prompt: string;
    properties?: Partial<LinghuiImageNodeProperties>;
  }): string | null => {
    const currentNodes = reactFlow.getNodes();
    const sourceNode = currentNodes.find(node => node.id === sourceNodeId);
    if (!sourceNode || sourceNode.type === 'group') {
      return null;
    }

    const sourceNodeData = sourceNode.data as unknown as LinghuiNodeData;
    if (sourceNodeData.linghuiType !== 'linghui/image' && sourceNodeData.linghuiType !== 'linghui/panorama') {
      return null;
    }

    const sourceProps = sourceNodeData.properties as unknown as LinghuiImageNodeProperties;
    const derivedMeta = getDerivedNodeMeta(sourceNode);
    const groupPositions = collectGroupPositions(currentNodes, sourceNode.parentId ? [sourceNode.parentId] : []);
    const sourceAbsolutePosition = getNodeAbsolutePosition(sourceNode, groupPositions);
    const parentPosition = sourceNode.parentId ? groupPositions.get(sourceNode.parentId) : undefined;
    const sourceWidth = sourceNode.measured?.width ?? sourceNode.width ?? 180;
    const absolutePosition = {
      x: sourceAbsolutePosition.x + sourceWidth + 84,
      y: sourceAbsolutePosition.y + 196,
    };
    const position = parentPosition
      ? {
          x: absolutePosition.x - parentPosition.x,
          y: absolutePosition.y - parentPosition.y,
        }
      : absolutePosition;

    const created = createCanvasNode('linghui/image', position, currentNodes);
    const createdData = created.data as unknown as LinghuiNodeData;
    const createdProps = createdData.properties as unknown as LinghuiImageNodeProperties;
    const prompt = String(options.prompt ?? '').trim();
    const nextProps: LinghuiImageNodeProperties = {
      ...createdProps,
      ...derivedMeta,
      ...(options.properties ?? {}),
      mode: 'generate',
      source: '',
      items: [],
      primaryAssetId: '',
      primaryResultSource: '',
      prompt,
      ttiSelection: String(options.properties?.ttiSelection ?? sourceProps.ttiSelection ?? createdProps.ttiSelection ?? ''),
      aspectRatio: String(options.properties?.aspectRatio ?? sourceProps.aspectRatio ?? createdProps.aspectRatio ?? '3:4'),
      resolution: String(options.properties?.resolution ?? sourceProps.resolution ?? createdProps.resolution ?? 'auto'),
      gridType: 'none',
      batchCount: Number(options.properties?.batchCount ?? 1),
      focusRegion: options.properties?.focusRegion ?? null,
      markPoints: options.properties?.markPoints ?? [],
    };

    const nextNode: Node = {
      ...created,
      parentId: sourceNode.parentId,
      extent: resolveParentExtent(sourceNode.parentId),
      selected: true,
      data: {
        ...createdData,
        label: String(options.label ?? `${sourceNodeData.label} 工具生成`).trim() || createdData.label,
        properties: nextProps as unknown as Record<string, unknown>,
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
    setEdges(existingEdges => (
      hasMatchingEdge(existingEdges, nextEdge)
        ? existingEdges
        : [...existingEdges, nextEdge]
    ));
    setEditorSelection(null);
    setContextMenu(null);
    setQuickCreate(null);
    setPendingGroupFrame(null);
    scheduleSnapshot();
    return nextNode.id;
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

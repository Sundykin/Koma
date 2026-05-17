import { nanoid } from 'nanoid';
import { useCallback } from 'react';
import type { Edge, Node } from '@xyflow/react';
import {
  type LinghuiExecuteMultiAngleOptions,
  type LinghuiImageNodeProperties,
  type LinghuiNodeData,
  normalizeLinghuiMultiAngleConfig,
} from '../../../../types/linghui';
import {
  collectGroupPositions,
  createCanvasNode,
  getNodeAbsolutePosition,
  resolveParentExtent,
} from '../state/linghuiCanvasShared';
import { getDerivedNodeMeta, hasMatchingEdge } from './linghuiCanvasDocumentOpsShared';
import type { UseLinghuiCanvasMediaDerivationParams } from './linghuiCanvasMediaDerivationShared';

export function useLinghuiCanvasMultiAngleImageDerivation({
  reactFlow,
  setNodes,
  setEdges,
  setContextMenu,
  setQuickCreate,
  setPendingGroupFrame,
  scheduleSnapshot,
}: UseLinghuiCanvasMediaDerivationParams) {
  return useCallback((sourceNodeId: string, options?: LinghuiExecuteMultiAngleOptions): string | null => {
    const currentNodes = reactFlow.getNodes();
    const sourceNode = currentNodes.find(node => node.id === sourceNodeId);
    if (!sourceNode || sourceNode.type === 'group') {
      return null;
    }

    const sourceNodeData = sourceNode.data as unknown as LinghuiNodeData;
    if (sourceNodeData.linghuiType !== 'linghui/image') {
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
      y: sourceAbsolutePosition.y,
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
    const nextMultiAngle = normalizeLinghuiMultiAngleConfig({
      ...(sourceProps.multiAngle ?? {}),
      ...(options?.multiAngle ?? {}),
      enabled: true,
    });

    const nextProps: LinghuiImageNodeProperties = {
      ...createdProps,
      ...derivedMeta,
      mode: 'generate',
      source: '',
      items: [],
      primaryAssetId: '',
      primaryResultSource: '',
      prompt: '',
      ttiSelection: String(
        options?.ttiSelection
        ?? nextMultiAngle.ttiSelection
        ?? sourceProps.multiAngle?.ttiSelection
        ?? sourceProps.ttiSelection
        ?? '',
      ),
      aspectRatio: String(sourceProps.aspectRatio ?? createdProps.aspectRatio ?? '3:4'),
      resolution: String(sourceProps.resolution ?? createdProps.resolution ?? 'auto'),
      gridType: 'none',
      batchCount: 1,
      multiAngle: nextMultiAngle,
    };

    const nextNode: Node = {
      ...created,
      parentId: sourceNode.parentId,
      extent: resolveParentExtent(sourceNode.parentId),
      selected: false,
      data: {
        ...createdData,
        label: String(options?.label ?? `${sourceNodeData.label} 多角度`).trim() || createdData.label,
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

    setNodes(existingNodes => [...existingNodes, nextNode]);
    setEdges(existingEdges => (
      hasMatchingEdge(existingEdges, nextEdge)
        ? existingEdges
        : [...existingEdges, nextEdge]
    ));
    setContextMenu(null);
    setQuickCreate(null);
    setPendingGroupFrame(null);
    scheduleSnapshot();
    return nextNode.id;
  }, [reactFlow, scheduleSnapshot, setContextMenu, setEdges, setNodes, setPendingGroupFrame, setQuickCreate]);
}

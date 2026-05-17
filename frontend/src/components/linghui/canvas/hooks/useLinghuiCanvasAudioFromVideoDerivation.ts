import { nanoid } from 'nanoid';
import { useCallback } from 'react';
import type { Edge, Node } from '@xyflow/react';
import type {
  LinghuiAudioNodeProperties,
  LinghuiNodeData,
} from '../../../../types/linghui';
import {
  collectGroupPositions,
  createCanvasNode,
  getNodeAbsolutePosition,
  resolveParentExtent,
} from '../state/linghuiCanvasShared';
import type { UseLinghuiCanvasMediaDerivationParams } from './linghuiCanvasMediaDerivationShared';

export function useLinghuiCanvasAudioFromVideoDerivation({
  reactFlow,
  setNodes,
  setEdges,
  setEditorSelection,
  setContextMenu,
  setQuickCreate,
  setPendingGroupFrame,
  scheduleSnapshot,
}: UseLinghuiCanvasMediaDerivationParams) {
  return useCallback((
    sourceNodeId: string,
    options: {
      source: string;
      label?: string;
      prompt?: string;
    },
  ): string | null => {
    const audioSource = String(options.source ?? '').trim();
    if (!audioSource) {
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
      y: sourceAbsolutePosition.y + 220,
    };
    const position = parentPosition
      ? {
          x: absolutePosition.x - parentPosition.x,
          y: absolutePosition.y - parentPosition.y,
        }
      : absolutePosition;

    const created = createCanvasNode('linghui/audio', position, currentNodes, {
      label: options.label ?? '分离音轨',
    });
    const createdData = created.data as unknown as LinghuiNodeData;
    const createdProps = createdData.properties as unknown as LinghuiAudioNodeProperties;
    const nextNode: Node = {
      ...created,
      parentId: sourceNode.parentId,
      extent: resolveParentExtent(sourceNode.parentId),
      selected: true,
      data: {
        ...createdData,
        label: options.label ?? createdData.label,
        properties: {
          ...createdProps,
          source: audioSource,
          prompt: options.prompt ?? createdProps.prompt ?? '',
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
        sourceSlotType: 'video',
        targetSlotType: 'video',
      } as Record<string, unknown>,
    };

    setNodes(existingNodes => [
      ...existingNodes.map(node => (node.selected ? { ...node, selected: false } : node)),
      nextNode,
    ]);
    setEdges(existingEdges => [...existingEdges, nextEdge]);
    setEditorSelection(null);
    setContextMenu(null);
    setQuickCreate(null);
    setPendingGroupFrame(null);
    scheduleSnapshot();
    return nextNode.id;
  }, [reactFlow, scheduleSnapshot, setContextMenu, setEditorSelection, setEdges, setNodes, setPendingGroupFrame, setQuickCreate]);
}

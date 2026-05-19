import { nanoid } from 'nanoid';
import { useCallback } from 'react';
import type { Edge } from '@xyflow/react';
import type {
  LinghuiMediaItem,
  LinghuiNodeData,
  LinghuiVideoNodeProperties,
} from '../../../../types/linghui';
import {
  collectGroupPositions,
  createCanvasNode,
  getNodeAbsolutePosition,
  resolveParentExtent,
} from '../state/linghuiCanvasShared';
import type { UseLinghuiCanvasMediaDerivationParams } from './linghuiCanvasMediaDerivationShared';

export function useLinghuiCanvasVideoResultDerivation({
  reactFlow,
  setNodes,
  setEdges,
  setEditorSelection,
  setContextMenu,
  setQuickCreate,
  setPendingGroupFrame,
  scheduleSnapshot,
}: UseLinghuiCanvasMediaDerivationParams) {
  return useCallback((sourceNodeId: string, items: LinghuiMediaItem[]): string[] => {
    const videoItems = items.filter(item => item.kind === 'video' && String(item.source ?? item.posterSource ?? '').trim());
    if (!videoItems.length) {
      return [];
    }

    const currentNodes = reactFlow.getNodes();
    const sourceNode = currentNodes.find(node => node.id === sourceNodeId);
    if (!sourceNode || sourceNode.type === 'group') {
      return [];
    }

    const groupPositions = collectGroupPositions(currentNodes, sourceNode.parentId ? [sourceNode.parentId] : []);
    const sourceAbsolutePosition = getNodeAbsolutePosition(sourceNode, groupPositions);
    const parentPosition = sourceNode.parentId ? groupPositions.get(sourceNode.parentId) : undefined;
    const sourceWidth = sourceNode.measured?.width ?? sourceNode.width ?? 180;
    const gapX = 256;
    const gapY = 210;
    const columns = Math.min(2, videoItems.length);
    const createdIds: string[] = [];
    const createdEdges: Edge[] = [];

    setNodes(existingNodes => {
      const nextNodes = existingNodes.map(node => (node.selected ? { ...node, selected: false } : node));
      const createdNodes = videoItems.map((item, index) => {
        const column = index % columns;
        const row = Math.floor(index / columns);
        const absolutePosition = {
          x: sourceAbsolutePosition.x + sourceWidth + 96 + column * gapX,
          y: sourceAbsolutePosition.y + row * gapY,
        };
        const position = parentPosition
          ? {
              x: absolutePosition.x - parentPosition.x,
              y: absolutePosition.y - parentPosition.y,
            }
          : absolutePosition;
        const created = createCanvasNode('linghui/video', position, existingNodes);
        const createdData = created.data as unknown as LinghuiNodeData;
        const createdProps = createdData.properties as unknown as LinghuiVideoNodeProperties;
        createdIds.push(created.id);
        createdEdges.push({
          id: `e-${nanoid(8)}`,
          source: sourceNodeId,
          target: created.id,
          sourceHandle: 'output-0',
          targetHandle: 'input-0',
          type: 'linghui-edge',
          data: {
            sourceSlotType: 'video',
            targetSlotType: 'video',
          } as Record<string, unknown>,
        });

        return {
          ...created,
          parentId: sourceNode.parentId,
          extent: resolveParentExtent(sourceNode.parentId),
          selected: true,
          data: {
            ...createdData,
            label: item.label || `${createdData.label} ${index + 1}`,
            properties: {
              ...createdProps,
              source: String(item.source ?? ''),
              posterSource: String(item.posterSource ?? ''),
              duration: typeof item.durationSec === 'number' ? item.durationSec : createdProps.duration,
              videoCapability: 'video.reference-to-video',
              sourceMetadata: item.metadata,
            } as unknown as Record<string, unknown>,
          } as unknown as Record<string, unknown>,
        };
      });

      return [...nextNodes, ...createdNodes];
    });
    setEdges(existingEdges => [...existingEdges, ...createdEdges]);

    setEditorSelection(null);
    setContextMenu(null);
    setQuickCreate(null);
    setPendingGroupFrame(null);
    scheduleSnapshot();
    return createdIds;
  }, [reactFlow, scheduleSnapshot, setContextMenu, setEditorSelection, setEdges, setNodes, setPendingGroupFrame, setQuickCreate]);
}

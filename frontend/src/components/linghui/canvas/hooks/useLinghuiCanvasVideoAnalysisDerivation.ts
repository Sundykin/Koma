import { nanoid } from 'nanoid';
import { useCallback } from 'react';
import type { Edge } from '@xyflow/react';
import type {
  LinghuiNodeData,
  LinghuiTextNodeProperties,
} from '../../../../types/linghui';
import {
  collectGroupPositions,
  createCanvasNode,
  getNodeAbsolutePosition,
  resolveParentExtent,
} from '../state/linghuiCanvasShared';
import type { UseLinghuiCanvasMediaDerivationParams } from './linghuiCanvasMediaDerivationShared';

export interface LinghuiVideoAnalysisDraft {
  label?: string;
  content: string;
  source?: string;
  durationSec?: number;
}

export function useLinghuiCanvasVideoAnalysisDerivation({
  reactFlow,
  setNodes,
  setEdges,
  setEditorSelection,
  setContextMenu,
  setQuickCreate,
  setPendingGroupFrame,
  scheduleSnapshot,
}: UseLinghuiCanvasMediaDerivationParams) {
  return useCallback((sourceNodeId: string, draft: LinghuiVideoAnalysisDraft): string | null => {
    const content = draft.content.trim();
    if (!content) {
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

    let createdId: string | null = null;
    const createdEdges: Edge[] = [];

    setNodes(existingNodes => {
      const created = createCanvasNode('linghui/text', position, existingNodes, {
        label: draft.label || '视频解析',
      });
      const createdData = created.data as unknown as LinghuiNodeData;
      const createdProps = createdData.properties as unknown as LinghuiTextNodeProperties;
      createdId = created.id;
      createdEdges.push({
        id: `e-${nanoid(8)}`,
        source: sourceNodeId,
        target: created.id,
        sourceHandle: 'output-0',
        targetHandle: 'input-0',
        type: 'linghui-edge',
        data: {
          sourceSlotType: 'video',
          targetSlotType: 'text',
        } as Record<string, unknown>,
      });

      return [
        ...existingNodes.map(node => (node.selected ? { ...node, selected: false } : node)),
        {
          ...created,
          parentId: sourceNode.parentId,
          extent: resolveParentExtent(sourceNode.parentId),
          selected: true,
          data: {
            ...createdData,
            label: draft.label || createdData.label,
            properties: {
              ...createdProps,
              mode: 'manual',
              content,
              prompt: '',
              systemPrompt: '',
              llmSelection: '',
            } satisfies LinghuiTextNodeProperties,
          } as unknown as Record<string, unknown>,
        },
      ];
    });
    setEdges(existingEdges => [...existingEdges, ...createdEdges]);
    setEditorSelection(null);
    setContextMenu(null);
    setQuickCreate(null);
    setPendingGroupFrame(null);
    scheduleSnapshot();
    return createdId;
  }, [reactFlow, scheduleSnapshot, setContextMenu, setEditorSelection, setEdges, setNodes, setPendingGroupFrame, setQuickCreate]);
}

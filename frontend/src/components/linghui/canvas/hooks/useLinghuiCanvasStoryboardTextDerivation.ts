import { nanoid } from 'nanoid';
import { useCallback } from 'react';
import type {
  LinghuiNodeData,
  LinghuiStoryboardFrame,
  LinghuiTextNodeProperties,
} from '../../../../types/linghui';
import {
  collectGroupPositions,
  createCanvasNode,
  getNodeAbsolutePosition,
  resolveParentExtent,
} from '../state/linghuiCanvasShared';
import { getDerivedNodeMeta, hasMatchingEdge } from './linghuiCanvasDocumentOpsShared';
import type { UseLinghuiCanvasStoryboardDerivationParams } from './linghuiCanvasStoryboardDerivationShared';

export function useLinghuiCanvasStoryboardTextDerivation({
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
  ) => {
    const scriptNode = reactFlow.getNode(scriptNodeId);
    if (!scriptNode || scriptNode.type === 'group' || !shots.length) {
      return false;
    }

    const currentNodes = reactFlow.getNodes();
    const currentEdges = reactFlow.getEdges();
    const groupPositions = collectGroupPositions(currentNodes, scriptNode.parentId ? [scriptNode.parentId] : []);
    const scriptAbsolutePosition = getNodeAbsolutePosition(scriptNode, groupPositions);
    const parentPosition = scriptNode.parentId ? groupPositions.get(scriptNode.parentId) : undefined;
    const existingByShotId = new Map(
      currentNodes
        .filter(node => {
          if (node.type === 'group') return false;
          const nodeData = node.data as unknown as LinghuiNodeData | undefined;
          if (nodeData?.linghuiType !== 'linghui/text') return false;
          const meta = getDerivedNodeMeta(node);
          return meta.scriptSourceNodeId === scriptNodeId && meta.scriptDerivationKind === 'text' && Boolean(meta.scriptShotId);
        })
        .map(node => [getDerivedNodeMeta(node).scriptShotId!, node]),
    );

    const nextNodeMap = new Map(currentNodes.map(node => [node.id, node]));
    const targetIds: string[] = [];

    for (const [index, shot] of shots.entries()) {
      const row = Math.floor(index / 2);
      const column = index % 2;
      const absolutePosition = {
        x: scriptAbsolutePosition.x + 248 + column * 220,
        y: scriptAbsolutePosition.y + row * 168,
      };
      const nextPosition = parentPosition
        ? {
            x: absolutePosition.x - parentPosition.x,
            y: absolutePosition.y - parentPosition.y,
          }
        : absolutePosition;
      const normalizedLabel = shot.title?.trim() || `镜头 ${index + 1}`;
      const normalizedContent = ([shot.title?.trim(), shot.description?.trim()]
        .filter(Boolean)
        .join('\n')
        .trim()) || normalizedLabel;
      const existingNode = existingByShotId.get(shot.id);

      if (existingNode) {
        const existingData = existingNode.data as unknown as LinghuiNodeData;
        const existingProps = existingData.properties as unknown as LinghuiTextNodeProperties;
        nextNodeMap.set(existingNode.id, {
          ...existingNode,
          selected: true,
          data: {
            ...existingData,
            label: normalizedLabel || existingData.label || `镜头 ${index + 1}`,
            properties: {
              ...existingProps,
              mode: 'manual',
              content: normalizedContent,
              prompt: '',
              systemPrompt: '',
              llmSelection: '',
              scriptSourceNodeId: scriptNodeId,
              scriptShotId: shot.id,
              scriptShotTitle: normalizedLabel,
              scriptDerivationKind: 'text',
            } satisfies LinghuiTextNodeProperties,
          } as unknown as Record<string, unknown>,
        });
        targetIds.push(existingNode.id);
        continue;
      }

      const created = createCanvasNode('linghui/text', nextPosition, currentNodes);
      const nodeData = created.data as unknown as LinghuiNodeData;
      const nodeProps = nodeData.properties as unknown as LinghuiTextNodeProperties;
      nextNodeMap.set(created.id, {
        ...created,
        parentId: scriptNode.parentId,
        extent: resolveParentExtent(scriptNode.parentId),
        selected: true,
        data: {
          ...nodeData,
          label: normalizedLabel,
          properties: {
            ...nodeProps,
            mode: 'manual',
            content: normalizedContent,
            prompt: '',
            systemPrompt: '',
            llmSelection: '',
            scriptSourceNodeId: scriptNodeId,
            scriptShotId: shot.id,
            scriptShotTitle: normalizedLabel,
            scriptDerivationKind: 'text',
          } satisfies LinghuiTextNodeProperties,
        } as unknown as Record<string, unknown>,
      });
      targetIds.push(created.id);
    }

    const nextNodes = currentNodes.map(node => {
      const mapped = nextNodeMap.get(node.id);
      if (!mapped) return node;
      return targetIds.includes(node.id)
        ? mapped
        : (node.selected ? { ...mapped, selected: false } : mapped);
    });
    const appendedNodes = [...nextNodeMap.values()].filter(node => !currentNodes.some(current => current.id === node.id));

    const nextEdges = [...currentEdges];
    for (const nodeId of targetIds) {
      const edgeShape = {
        source: scriptNodeId,
        sourceHandle: 'output-0',
        target: nodeId,
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

    setNodes([...nextNodes.map(node => (targetIds.includes(node.id) ? node : (node.selected ? { ...node, selected: false } : node))), ...appendedNodes]);
    setEdges(nextEdges);
    setEditorSelection(null);
    setContextMenu(null);
    setQuickCreate(null);
    setPendingGroupFrame(null);
    scheduleSnapshot();
    return true;
  }, [reactFlow, scheduleSnapshot, setContextMenu, setEditorSelection, setEdges, setNodes, setPendingGroupFrame, setQuickCreate]);
}

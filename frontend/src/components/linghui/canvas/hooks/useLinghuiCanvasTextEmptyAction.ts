import type { Edge, Node } from '@xyflow/react';
import { nanoid } from 'nanoid';
import { useCallback } from 'react';
import type {
  LinghuiAudioNodeProperties,
  LinghuiCanvasSelection,
  LinghuiImageAssetItem,
  LinghuiImageNodeProperties,
  LinghuiNodeData,
  LinghuiTextNodeProperties,
  LinghuiVideoNodeProperties,
} from '../../../../types/linghui';
import { createLinghuiImageImportProperties } from '../../editors/state/linghuiImageCollections';
import { LINGHUI_TEXT_PRESETS, pickRandomTextPrompt } from '../../editors/state/linghuiTextPresets';
import {
  collectGroupPositions,
  createCanvasNode,
  getNodeAbsolutePosition,
  resolveParentExtent,
} from '../state/linghuiCanvasShared';
import type { LinghuiTextEmptyAction } from './useLinghuiCanvasEmptyActions';
import {
  hasMatchingEmptyActionEdge,
  type UseLinghuiCanvasEmptyActionParams,
} from './linghuiCanvasEmptyActionShared';

export function useLinghuiCanvasTextEmptyAction({
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
    action: LinghuiTextEmptyAction,
  ): string | null => {
    const currentNodes = reactFlow.getNodes();
    const sourceNode = currentNodes.find(node => node.id === sourceNodeId);
    if (!sourceNode || sourceNode.type === 'group') return null;

    const sourceNodeData = sourceNode.data as unknown as LinghuiNodeData;
    if (sourceNodeData.linghuiType !== 'linghui/text') return null;

    if (action === 'edit') {
      setNodes(existingNodes => existingNodes.map(node => {
        if (node.id !== sourceNodeId) return node;
        const data = node.data as unknown as LinghuiNodeData;
        const props = data.properties as unknown as LinghuiTextNodeProperties;
        return {
          ...node,
          data: {
            ...data,
            properties: { ...props, mode: 'manual', content: '' } as unknown as Record<string, unknown>,
          } as unknown as Record<string, unknown>,
        };
      }));
      setEditorSelection({
        kind: 'node',
        nodeId: sourceNodeId,
        nodeType: 'linghui/text',
        label: sourceNodeData.label,
      });
      scheduleSnapshot();
      return sourceNodeId;
    }

    const sourceWidth = sourceNode.measured?.width ?? sourceNode.width ?? 280;
    const groupPositions = collectGroupPositions(currentNodes, sourceNode.parentId ? [sourceNode.parentId] : []);
    const sourceAbsolutePosition = getNodeAbsolutePosition(sourceNode, groupPositions);
    const parentPosition = sourceNode.parentId ? groupPositions.get(sourceNode.parentId) : undefined;
    const horizontalDelta = sourceWidth + 84;
    const absolutePosition = action === 'image-prompt'
      ? { x: sourceAbsolutePosition.x - horizontalDelta, y: sourceAbsolutePosition.y }
      : { x: sourceAbsolutePosition.x + horizontalDelta, y: sourceAbsolutePosition.y };
    const newPosition = parentPosition
      ? { x: absolutePosition.x - parentPosition.x, y: absolutePosition.y - parentPosition.y }
      : absolutePosition;

    let newNode: Node | null = null;
    let newEdge: Edge | null = null;
    let sourceNodePatch: ((prev: LinghuiTextNodeProperties) => LinghuiTextNodeProperties) | null = null;
    let newLabel = '';

    if (action === 'video') {
      const seed = pickRandomTextPrompt();
      sourceNodePatch = prev => ({ ...prev, mode: 'generate', content: seed, prompt: prev.prompt || seed });

      const created = createCanvasNode('linghui/video', newPosition, currentNodes);
      const createdData = created.data as unknown as LinghuiNodeData;
      const createdProps = createdData.properties as unknown as LinghuiVideoNodeProperties;
      newLabel = (createdData.label || '').trim() || '视频';
      newNode = {
        ...created,
        parentId: sourceNode.parentId,
        extent: resolveParentExtent(sourceNode.parentId),
        selected: true,
        data: {
          ...createdData,
          label: newLabel,
          properties: {
            ...createdProps,
            mode: 'generate',
            prompt: LINGHUI_TEXT_PRESETS.textToVideo.videoPrompt,
          } as unknown as Record<string, unknown>,
        } as unknown as Record<string, unknown>,
      };
      newEdge = {
        id: `e-${nanoid(8)}`,
        source: sourceNodeId,
        target: newNode.id,
        sourceHandle: 'output-0',
        targetHandle: 'input-0',
        type: 'linghui-edge',
        data: { sourceSlotType: 'text', targetSlotType: 'text' } as Record<string, unknown>,
      };
    } else if (action === 'music') {
      const musicPrompt = LINGHUI_TEXT_PRESETS.textToMusic.prompt;
      sourceNodePatch = prev => ({ ...prev, mode: 'generate', content: musicPrompt, prompt: prev.prompt || musicPrompt });

      const created = createCanvasNode('linghui/audio', newPosition, currentNodes);
      const createdData = created.data as unknown as LinghuiNodeData;
      const createdProps = createdData.properties as unknown as LinghuiAudioNodeProperties;
      newLabel = (createdData.label || '').trim() || '音频';
      newNode = {
        ...created,
        parentId: sourceNode.parentId,
        extent: resolveParentExtent(sourceNode.parentId),
        selected: true,
        data: {
          ...createdData,
          label: newLabel,
          properties: {
            ...createdProps,
            prompt: musicPrompt,
          } as unknown as Record<string, unknown>,
        } as unknown as Record<string, unknown>,
      };
      newEdge = {
        id: `e-${nanoid(8)}`,
        source: sourceNodeId,
        target: newNode.id,
        sourceHandle: 'output-0',
        targetHandle: 'input-0',
        type: 'linghui-edge',
        data: { sourceSlotType: 'text', targetSlotType: 'text' } as Record<string, unknown>,
      };
    } else if (action === 'image-prompt') {
      const reversePrompt = LINGHUI_TEXT_PRESETS.imageToPrompt.prompt;
      sourceNodePatch = prev => ({ ...prev, mode: 'generate', prompt: reversePrompt, content: '' });

      const created = createCanvasNode('linghui/image', newPosition, currentNodes);
      const createdData = created.data as unknown as LinghuiNodeData;
      const createdProps = createdData.properties as unknown as LinghuiImageNodeProperties;
      newLabel = (createdData.label || '').trim() || '图片';
      const importProps = createLinghuiImageImportProperties(
        createdProps,
        LINGHUI_TEXT_PRESETS.imageToPrompt.imageUrl
          ? [{ id: 'preset-1', source: LINGHUI_TEXT_PRESETS.imageToPrompt.imageUrl, label: '反推图片' } as LinghuiImageAssetItem]
          : [],
        LINGHUI_TEXT_PRESETS.imageToPrompt.imageUrl ? 'preset-1' : '',
      );
      newNode = {
        ...created,
        parentId: sourceNode.parentId,
        extent: resolveParentExtent(sourceNode.parentId),
        selected: true,
        data: {
          ...createdData,
          label: newLabel,
          properties: importProps as unknown as Record<string, unknown>,
        } as unknown as Record<string, unknown>,
      };
      newEdge = {
        id: `e-${nanoid(8)}`,
        source: newNode.id,
        target: sourceNodeId,
        sourceHandle: 'output-0',
        targetHandle: 'input-0',
        type: 'linghui-edge',
        data: { sourceSlotType: 'image', targetSlotType: 'image' } as Record<string, unknown>,
      };
    }

    if (!newNode || !newEdge || !sourceNodePatch) return null;

    setNodes(existingNodes => {
      const patched = existingNodes.map(node => {
        if (node.id === sourceNodeId) {
          const data = node.data as unknown as LinghuiNodeData;
          const props = data.properties as unknown as LinghuiTextNodeProperties;
          return {
            ...node,
            selected: false,
            data: {
              ...data,
              properties: sourceNodePatch!(props) as unknown as Record<string, unknown>,
            } as unknown as Record<string, unknown>,
          };
        }
        return node.selected ? { ...node, selected: false } : node;
      });
      return [...patched, newNode!];
    });

    setEdges(existingEdges => (
      hasMatchingEmptyActionEdge(existingEdges, newEdge!)
        ? existingEdges
        : [...existingEdges, newEdge!]
    ));
    setEditorSelection({
      kind: 'node',
      nodeId: newNode.id,
      nodeType: newNode.data && (newNode.data as unknown as LinghuiNodeData).linghuiType,
      label: newLabel,
    } as LinghuiCanvasSelection);
    setContextMenu(null);
    setQuickCreate(null);
    setPendingGroupFrame(null);
    scheduleSnapshot();
    return newNode.id;
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

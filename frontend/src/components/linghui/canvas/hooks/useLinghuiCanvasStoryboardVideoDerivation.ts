import { nanoid } from 'nanoid';
import { useCallback } from 'react';
import type { Node } from '@xyflow/react';
import type {
  LinghuiImageNodeProperties,
  LinghuiNodeData,
  LinghuiStoryboardFrame,
  LinghuiVideoClipNodeProperties,
  LinghuiVideoNodeProperties,
} from '../../../../types/linghui';
import {
  collectGroupPositions,
  createCanvasNode,
  getNodeAbsolutePosition,
} from '../state/linghuiCanvasShared';
import { getDerivedNodeMeta, hasMatchingEdge } from './linghuiCanvasDocumentOpsShared';
import type { UseLinghuiCanvasStoryboardDerivationParams } from './linghuiCanvasStoryboardDerivationShared';

export function useLinghuiCanvasStoryboardVideoDerivation({
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
  ): string[] => {
    const scriptNode = reactFlow.getNode(scriptNodeId);
    if (!scriptNode || scriptNode.type === 'group' || !shots.length) {
      return [];
    }

    const currentNodes = reactFlow.getNodes();
    const currentEdges = reactFlow.getEdges();
    const groupPositions = collectGroupPositions(currentNodes, scriptNode.parentId ? [scriptNode.parentId] : []);
    const scriptAbsolutePosition = getNodeAbsolutePosition(scriptNode, groupPositions);
    const parentPosition = scriptNode.parentId ? groupPositions.get(scriptNode.parentId) : undefined;
    const existingImageByShotId = new Map(
      currentNodes
        .filter(node => {
          if (node.type === 'group') return false;
          const nodeData = node.data as unknown as LinghuiNodeData | undefined;
          if (nodeData?.linghuiType !== 'linghui/image') return false;
          const meta = getDerivedNodeMeta(node);
          return meta.scriptSourceNodeId === scriptNodeId && meta.scriptDerivationKind === 'video-image' && Boolean(meta.scriptShotId);
        })
        .map(node => [getDerivedNodeMeta(node).scriptShotId!, node]),
    );
    const existingVideoByShotId = new Map(
      currentNodes
        .filter(node => {
          if (node.type === 'group') return false;
          const nodeData = node.data as unknown as LinghuiNodeData | undefined;
          if (nodeData?.linghuiType !== 'linghui/video') return false;
          const meta = getDerivedNodeMeta(node);
          return meta.scriptSourceNodeId === scriptNodeId && meta.scriptDerivationKind === 'video' && Boolean(meta.scriptShotId);
        })
        .map(node => [getDerivedNodeMeta(node).scriptShotId!, node]),
    );
    const existingClipNode = currentNodes.find(node => {
      if (node.type === 'group') return false;
      const nodeData = node.data as unknown as LinghuiNodeData | undefined;
      if (nodeData?.linghuiType !== 'linghui/video-clip') return false;
      const meta = getDerivedNodeMeta(node);
      return meta.scriptSourceNodeId === scriptNodeId && meta.scriptDerivationKind === 'video-clip';
    });

    const nextNodeMap = new Map(currentNodes.map(node => [node.id, node]));
    const nextEdges = [...currentEdges];
    const targetIds: string[] = [];
    const titleBase = ((scriptNode.data as unknown as LinghuiNodeData | undefined)?.label ?? '故事板').trim();
    const columns = Math.min(3, Math.max(1, Math.ceil(Math.sqrt(shots.length))));
    const cellWidth = 320;
    const cellHeight = 240;
    const gap = 32;
    const padding = 36;
    const header = 48;
    const rows = Math.ceil(shots.length / columns);
    const groupWidth = padding * 2 + columns * cellWidth + Math.max(0, columns - 1) * gap;
    const groupHeight = header + padding + rows * cellHeight + Math.max(0, rows - 1) * gap;
    const groupPosition = {
      x: scriptAbsolutePosition.x + 420,
      y: scriptAbsolutePosition.y + 20,
    };
    const existingVideoGroupId = currentNodes.find(node => (
      node.type === 'group'
      && (node.data as { sourceScriptNodeId?: string; storyboardGroupType?: string } | undefined)?.sourceScriptNodeId === scriptNodeId
      && (node.data as { sourceScriptNodeId?: string; storyboardGroupType?: string } | undefined)?.storyboardGroupType === 'video'
    ))?.id;
    const groupId = existingVideoGroupId
      ?? (existingVideoByShotId.size > 0
        ? currentNodes.find(node => existingVideoByShotId.has(getDerivedNodeMeta(node).scriptShotId ?? ''))?.parentId ?? nanoid(10)
        : nanoid(10));
    const groupNode: Node = {
      id: groupId,
      type: 'group',
      position: groupPosition,
      data: {
        label: `视频组 · ${titleBase}`,
        color: 'var(--token-accent-base)',
        sourceScriptNodeId: scriptNodeId,
        storyboardTitle: `视频组 · ${titleBase}`,
        storyboardGroupType: 'video',
      },
      selected: false,
      draggable: true,
      style: {
        width: groupWidth,
        height: groupHeight,
      },
    };
    nextNodeMap.set(groupId, groupNode);

    for (const [index, shot] of shots.entries()) {
      const row = Math.floor(index / columns);
      const column = index % columns;
      const imageAbsolutePosition = {
        x: groupPosition.x + padding + column * (cellWidth + gap),
        y: groupPosition.y + header + row * (cellHeight + gap),
      };
      const videoAbsolutePosition = {
        x: groupPosition.x + padding + column * (cellWidth + gap),
        y: groupPosition.y + header + row * (cellHeight + gap) + 86,
      };
      const imagePosition = {
        x: imageAbsolutePosition.x - groupPosition.x,
        y: imageAbsolutePosition.y - groupPosition.y,
      };
      const videoPosition = {
        x: videoAbsolutePosition.x - groupPosition.x,
        y: videoAbsolutePosition.y - groupPosition.y,
      };
      const normalizedLabel = shot.title?.trim() || `镜头 ${index + 1}`;
      const normalizedSource = String(shot.image?.source ?? '').trim();
      const normalizedImagePrompt = shot.imageGenerationPrompt?.trim()
        || shot.visualDescription?.trim()
        || shot.description?.trim()
        || normalizedLabel;
      const normalizedVideoPrompt = shot.videoMotionPrompt?.trim()
        || shot.visualDescription?.trim()
        || shot.description?.trim()
        || normalizedLabel;
      const imageLabel = normalizedSource ? `${normalizedLabel} 首帧` : `${normalizedLabel} 分镜图`;
      const videoLabel = `${normalizedLabel} 视频`;

      let imageNode = existingImageByShotId.get(shot.id);
      if (imageNode) {
        const imageData = imageNode.data as unknown as LinghuiNodeData;
        const imageProps = imageData.properties as unknown as LinghuiImageNodeProperties;
        imageNode = {
          ...imageNode,
          parentId: groupId,
          extent: 'parent',
          selected: false,
          position: imagePosition,
          data: {
            ...imageData,
            label: imageLabel,
            properties: {
              ...imageProps,
              mode: normalizedSource ? 'import' : 'generate',
              source: normalizedSource,
              prompt: normalizedImagePrompt,
              gridType: 'none',
              batchCount: 1,
              scriptSourceNodeId: scriptNodeId,
              scriptShotId: shot.id,
              scriptShotTitle: normalizedLabel,
              scriptDerivationKind: 'video-image',
            } satisfies LinghuiImageNodeProperties,
          } as unknown as Record<string, unknown>,
        };
      } else {
        const createdImageNode = createCanvasNode('linghui/image', imagePosition, currentNodes);
        const imageData = createdImageNode.data as unknown as LinghuiNodeData;
        const imageProps = imageData.properties as unknown as LinghuiImageNodeProperties;
        imageNode = {
          ...createdImageNode,
          parentId: groupId,
          extent: 'parent',
          selected: false,
          data: {
            ...imageData,
            label: imageLabel,
            properties: {
              ...imageProps,
              mode: normalizedSource ? 'import' : 'generate',
              source: normalizedSource,
              prompt: normalizedImagePrompt,
              gridType: 'none',
              batchCount: 1,
              scriptSourceNodeId: scriptNodeId,
              scriptShotId: shot.id,
              scriptShotTitle: normalizedLabel,
              scriptDerivationKind: 'video-image',
            } satisfies LinghuiImageNodeProperties,
          } as unknown as Record<string, unknown>,
        };
      }
      nextNodeMap.set(imageNode.id, imageNode);

      let videoNode = existingVideoByShotId.get(shot.id);
      if (videoNode) {
        const videoData = videoNode.data as unknown as LinghuiNodeData;
        const videoProps = videoData.properties as unknown as LinghuiVideoNodeProperties;
        videoNode = {
          ...videoNode,
          parentId: groupId,
          extent: 'parent',
          selected: true,
          position: videoPosition,
          data: {
            ...videoData,
            label: videoLabel,
            properties: {
              ...videoProps,
              prompt: normalizedVideoPrompt,
              duration: Math.max(3, Math.round(shot.durationSec || 5)),
              source: '',
              posterSource: '',
              scriptSourceNodeId: scriptNodeId,
              scriptShotId: shot.id,
              scriptShotTitle: normalizedLabel,
              scriptDerivationKind: 'video',
            } satisfies LinghuiVideoNodeProperties,
          } as unknown as Record<string, unknown>,
        };
      } else {
        const createdVideoNode = createCanvasNode('linghui/video', videoPosition, currentNodes);
        const videoData = createdVideoNode.data as unknown as LinghuiNodeData;
        const videoProps = videoData.properties as unknown as LinghuiVideoNodeProperties;
        videoNode = {
          ...createdVideoNode,
          parentId: groupId,
          extent: 'parent',
          selected: true,
          data: {
            ...videoData,
            label: videoLabel,
            properties: {
              ...videoProps,
              prompt: normalizedVideoPrompt,
              duration: Math.max(3, Math.round(shot.durationSec || 5)),
              source: '',
              posterSource: '',
              scriptSourceNodeId: scriptNodeId,
              scriptShotId: shot.id,
              scriptShotTitle: normalizedLabel,
              scriptDerivationKind: 'video',
            } satisfies LinghuiVideoNodeProperties,
          } as unknown as Record<string, unknown>,
        };
      }
      nextNodeMap.set(videoNode.id, videoNode);
      targetIds.push(videoNode.id);

      const storyboardToImageEdge = {
        source: scriptNodeId,
        sourceHandle: 'output-0',
        target: imageNode.id,
        targetHandle: 'input-0',
      };
      if (!hasMatchingEdge(nextEdges, storyboardToImageEdge)) {
        nextEdges.push({
          id: `e-${nanoid(8)}`,
          ...storyboardToImageEdge,
          type: 'linghui-edge',
          data: { sourceSlotType: 'storyboard', targetSlotType: 'image' } as Record<string, unknown>,
        });
      }

      const edgeShape = {
        source: imageNode.id,
        sourceHandle: 'output-0',
        target: videoNode.id,
        targetHandle: 'input-0',
      };
      if (!hasMatchingEdge(nextEdges, edgeShape)) {
        nextEdges.push({
          id: `e-${nanoid(8)}`,
          ...edgeShape,
          type: 'linghui-edge',
          data: { sourceSlotType: 'image', targetSlotType: 'image' } as Record<string, unknown>,
        });
      }
    }

    const clipAbsolutePosition = {
      x: groupPosition.x + groupWidth + 80,
      y: groupPosition.y + Math.max(0, (groupHeight - 220) / 2),
    };
    const clipPosition = parentPosition
      ? {
          x: clipAbsolutePosition.x - parentPosition.x,
          y: clipAbsolutePosition.y - parentPosition.y,
        }
      : clipAbsolutePosition;
    const videoNodes = [...nextNodeMap.values()].filter(node => {
      const data = node.data as unknown as LinghuiNodeData | undefined;
      const meta = getDerivedNodeMeta(node);
      return data?.linghuiType === 'linghui/video'
        && meta.scriptSourceNodeId === scriptNodeId
        && meta.scriptDerivationKind === 'video';
    });
    let clipNode = existingClipNode;
    const clipPropsPatch: Partial<LinghuiVideoClipNodeProperties> = {
      clips: videoNodes.map((node, index) => {
        const nodeData = node.data as unknown as LinghuiNodeData;
        const props = nodeData.properties as unknown as LinghuiVideoNodeProperties;
        return {
          id: node.id,
          kind: 'video',
          source: String(props.source ?? ''),
          durationSec: Number(props.duration ?? 5),
          label: nodeData.label || `分镜视频 ${index + 1}`,
        };
      }),
      resolution: '1080p',
      fps: 30,
      imageDurationSec: 3,
      source: '',
      posterSource: '',
      status: 'idle',
    };

    if (clipNode) {
      const clipData = clipNode.data as unknown as LinghuiNodeData;
      const clipProps = clipData.properties as unknown as LinghuiVideoClipNodeProperties;
      clipNode = {
        ...clipNode,
        selected: false,
        position: clipPosition,
        parentId: scriptNode.parentId,
        extent: scriptNode.parentId ? 'parent' : undefined,
        data: {
          ...clipData,
          label: `视频合成 · ${titleBase}`,
          properties: {
            ...clipProps,
            ...clipPropsPatch,
            scriptSourceNodeId: scriptNodeId,
            scriptDerivationKind: 'video-clip',
          },
        } as unknown as Record<string, unknown>,
      };
    } else {
      const createdClipNode = createCanvasNode('linghui/video-clip', clipPosition, currentNodes, {
        label: `视频合成 · ${titleBase}`,
      });
      const clipData = createdClipNode.data as unknown as LinghuiNodeData;
      const clipProps = clipData.properties as unknown as LinghuiVideoClipNodeProperties;
      clipNode = {
        ...createdClipNode,
        parentId: scriptNode.parentId,
        extent: scriptNode.parentId ? 'parent' : undefined,
        selected: false,
        data: {
          ...clipData,
          properties: {
            ...clipProps,
            ...clipPropsPatch,
            scriptSourceNodeId: scriptNodeId,
            scriptDerivationKind: 'video-clip',
          },
        } as unknown as Record<string, unknown>,
      };
    }
    nextNodeMap.set(clipNode.id, clipNode);

    for (const videoNode of videoNodes) {
      const videoToClipEdge = {
        source: videoNode.id,
        sourceHandle: 'output-0',
        target: clipNode.id,
        targetHandle: 'input-0',
      };
      if (!hasMatchingEdge(nextEdges, videoToClipEdge)) {
        nextEdges.push({
          id: `e-${nanoid(8)}`,
          ...videoToClipEdge,
          type: 'linghui-edge',
          data: { sourceSlotType: 'video', targetSlotType: 'video' } as Record<string, unknown>,
        });
      }
    }

    const scriptToGroupEdge = {
      source: scriptNodeId,
      sourceHandle: 'output-0',
      target: groupId,
      targetHandle: 'input-0',
    };
    if (!hasMatchingEdge(nextEdges, scriptToGroupEdge)) {
      nextEdges.push({
        id: `e-${nanoid(8)}`,
        ...scriptToGroupEdge,
        type: 'linghui-edge',
        data: { sourceSlotType: 'storyboard', targetSlotType: 'storyboard' } as Record<string, unknown>,
      });
    }

    const nextNodes = currentNodes.map(node => {
      const mapped = nextNodeMap.get(node.id);
      if (!mapped) return node.selected ? { ...node, selected: false } : node;
      return targetIds.includes(node.id)
        ? mapped
        : (mapped.selected ? { ...mapped, selected: false } : mapped);
    });
    const appendedNodes = [...nextNodeMap.values()].filter(node => !currentNodes.some(current => current.id === node.id));

    setNodes([...nextNodes, ...appendedNodes]);
    setEdges(nextEdges);
    setEditorSelection(null);
    setContextMenu(null);
    setQuickCreate(null);
    setPendingGroupFrame(null);
    scheduleSnapshot();
    return targetIds;
  }, [reactFlow, scheduleSnapshot, setContextMenu, setEditorSelection, setEdges, setNodes, setPendingGroupFrame, setQuickCreate]);
}

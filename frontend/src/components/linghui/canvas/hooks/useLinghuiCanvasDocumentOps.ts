import { addEdge, type Edge, type Node, type ReactFlowInstance } from '@xyflow/react';
import { nanoid } from 'nanoid';
import { useCallback, useRef } from 'react';
import type { Dispatch, RefObject, SetStateAction } from 'react';
import type {
  LinghuiCanvasSelection,
  LinghuiAudioNodeProperties,
  LinghuiExecuteMultiAngleOptions,
  LinghuiImageAssetItem,
  LinghuiImageGeneratorNodeProperties,
  LinghuiMultiAngleConfig,
  LinghuiImageNodeProperties,
  LinghuiMediaItem,
  LinghuiNodeData,
  LinghuiScriptDerivationKind,
  LinghuiNodeType,
  LinghuiStoryboardFrame,
  LinghuiTextNodeProperties,
  LinghuiVideoNodeProperties,
} from '../../../../types/linghui';
import type {
  LinghuiWorkspaceAssetRecord,
  LinghuiWorkspaceHistoryRecord,
} from '../../../../store/linghuiStorage';
import { createNextLinghuiWorkflowBlockLabel } from '../../../../constants/linghuiWorkflowBlock';
import { createLinghuiImageImportProperties } from '../../editors/state/linghuiImageCollections';
import {
  type LinghuiCanvasMenuState,
  type LinghuiClipboardSnapshot,
  type LinghuiPendingGroupFrame,
  type PendingConnectionCreateState,
  type QuickCreateState,
  PASTE_OFFSET_STEP,
  cloneLinghuiNodeData,
  cloneSnapshotValue,
  collectGroupPositions,
  expandNodeIdsWithDescendants,
  createCanvasNode,
  detachNodesFromGroups,
  getNodeAbsolutePosition,
  resolveParentExtent,
  resolveCompatibleTargetHandleId,
  resolveCompatibleTargetSlotType,
  buildLinghuiClipboardSnapshotFromRF,
} from '../state/linghuiCanvasShared';
import { normalizeLinghuiMultiAngleConfig } from '../../../../types/linghui';
import { LINGHUI_TEXT_PRESETS, pickRandomTextPrompt } from '../../editors/state/linghuiTextPresets';
import { LINGHUI_VIDEO_PRESETS } from '../../editors/state/linghuiVideoPresets';
import { LINGHUI_AUDIO_PRESETS } from '../../editors/state/linghuiAudioPresets';

/** LibTV TextNode EmptyState 4 actions：每个都派生完整子图（参考 docs/libtv-text-node-deep-dive.md §3）。 */
export type LinghuiTextEmptyAction = 'edit' | 'video' | 'image-prompt' | 'music';

/** LibTV VideoNode EmptyState 2 actions（参考 docs/libtv-video-node-deep-dive.md §3）。 */
export type LinghuiVideoEmptyAction = 'first-frame' | 'first-last-frame';

/** LibTV AudioNode EmptyState 1 action（chunk 15gvxu:8668-8728 eH）。 */
export type LinghuiAudioEmptyAction = 'audio-to-video';

interface UseLinghuiCanvasDocumentOpsParams {
  reactFlow: ReactFlowInstance;
  hostRef: RefObject<HTMLDivElement | null>;
  setNodes: Dispatch<SetStateAction<Node[]>>;
  setEdges: Dispatch<SetStateAction<Edge[]>>;
  setEditorSelection: Dispatch<SetStateAction<LinghuiCanvasSelection>>;
  setContextMenu: Dispatch<SetStateAction<LinghuiCanvasMenuState | null>>;
  setQuickCreate: Dispatch<SetStateAction<QuickCreateState | null>>;
  setPendingGroupFrame: Dispatch<SetStateAction<LinghuiPendingGroupFrame | null>>;
  pendingGroupFrame: LinghuiPendingGroupFrame | null;
  scheduleSnapshot: (options?: { recordHistory?: boolean; force?: boolean }) => void;
  onClearNodeRunState?: (nodeId: string) => void;
}

function getDerivedNodeMeta(node: Node): {
  scriptSourceNodeId?: string;
  scriptShotId?: string;
  scriptDerivationKind?: LinghuiScriptDerivationKind;
} {
  const nodeData = node.data as unknown as LinghuiNodeData | undefined;
  const properties = (nodeData?.properties ?? {}) as Record<string, unknown>;

  return {
    scriptSourceNodeId: typeof properties.scriptSourceNodeId === 'string' ? properties.scriptSourceNodeId : undefined,
    scriptShotId: typeof properties.scriptShotId === 'string' ? properties.scriptShotId : undefined,
    scriptDerivationKind: typeof properties.scriptDerivationKind === 'string'
      ? properties.scriptDerivationKind as LinghuiScriptDerivationKind
      : undefined,
  };
}

function hasMatchingEdge(
  edges: Edge[],
  target: Pick<Edge, 'source' | 'sourceHandle' | 'target' | 'targetHandle'>,
): boolean {
  void target.sourceHandle;
  void target.targetHandle;
  return edges.some(edge => (
    edge.source === target.source &&
    edge.target === target.target
  ));
}

export function useLinghuiCanvasDocumentOps({
  reactFlow,
  hostRef,
  setNodes,
  setEdges,
  setEditorSelection,
  setContextMenu,
  setQuickCreate,
  setPendingGroupFrame,
  pendingGroupFrame,
  scheduleSnapshot,
  onClearNodeRunState,
}: UseLinghuiCanvasDocumentOpsParams) {
  const clipboardRef = useRef<LinghuiClipboardSnapshot | null>(null);
  const pasteSequenceRef = useRef(0);

  const clearPendingGroupFrame = useCallback(() => {
    setPendingGroupFrame(null);
  }, [setPendingGroupFrame]);

  const buildClipboardSnapshot = useCallback((
    requestedIds?: string[],
    options?: { includeExternalInputEdges?: boolean },
  ): LinghuiClipboardSnapshot | null => {
    return buildLinghuiClipboardSnapshotFromRF(
      reactFlow.getNodes(),
      reactFlow.getEdges(),
      requestedIds,
      options,
    );
  }, [reactFlow]);

  const copySelectionToClipboard = useCallback((requestedIds?: string[]) => {
    const snapshot = buildClipboardSnapshot(requestedIds);
    if (!snapshot) return false;
    clipboardRef.current = snapshot;
    return true;
  }, [buildClipboardSnapshot]);

  const insertSubgraphSnapshotAtScreenPosition = useCallback((
    snapshot: LinghuiClipboardSnapshot,
    options?: { screenX?: number; screenY?: number },
  ) => {
    if (!snapshot.nodes.length && !snapshot.groups.length) {
      return false;
    }

    const rect = hostRef.current?.getBoundingClientRect();
    const targetScreenX = options?.screenX ?? (rect ? rect.left + rect.width / 2 : window.innerWidth / 2);
    const targetScreenY = options?.screenY ?? (rect ? rect.top + rect.height / 2 : window.innerHeight / 2);
    const targetCenter = reactFlow.screenToFlowPosition({ x: targetScreenX, y: targetScreenY });
    const serialOffset = pasteSequenceRef.current * PASTE_OFFSET_STEP;
    pasteSequenceRef.current += 1;

    const sourceGroupPositions = new Map(snapshot.groups.map(group => [group.id, group.position]));
    const sourceNodePositions = snapshot.nodes.map(node => {
      const absolutePosition = getNodeAbsolutePosition(node, sourceGroupPositions);
      return {
        node,
        absolutePosition,
        width: node.width ?? 280,
        height: node.height ?? 180,
      };
    });

    const bounds = [...snapshot.groups.map(group => ({
      x: group.position.x,
      y: group.position.y,
      width: group.style.width,
      height: group.style.height,
    })), ...sourceNodePositions.map(item => ({
      x: item.absolutePosition.x,
      y: item.absolutePosition.y,
      width: item.width,
      height: item.height,
    }))];

    if (!bounds.length) {
      return false;
    }

    const minX = Math.min(...bounds.map(item => item.x));
    const minY = Math.min(...bounds.map(item => item.y));
    const maxX = Math.max(...bounds.map(item => item.x + item.width));
    const maxY = Math.max(...bounds.map(item => item.y + item.height));
    const deltaX = targetCenter.x - (minX + (maxX - minX) / 2) + serialOffset;
    const deltaY = targetCenter.y - (minY + (maxY - minY) / 2) + serialOffset * 0.75;

    const groupIdMap = new Map(snapshot.groups.map(group => [group.id, nanoid(10)]));
    const nodeIdMap = new Map(snapshot.nodes.map(node => [node.id, nanoid(10)]));

    const nextGroups: Node[] = snapshot.groups.map(group => ({
      id: groupIdMap.get(group.id)!,
      type: 'group',
      position: {
        x: group.position.x + deltaX,
        y: group.position.y + deltaY,
      },
      data: cloneSnapshotValue(group.data) as unknown as Record<string, unknown>,
      style: {
        width: group.style.width,
        height: group.style.height,
      },
      draggable: true,
      selected: true,
    }));

    const nextNodes: Node[] = sourceNodePositions.map(({ node, absolutePosition }) => {
      const nextParentId = node.parentId && groupIdMap.has(node.parentId)
        ? groupIdMap.get(node.parentId)
        : undefined;

      return {
        id: nodeIdMap.get(node.id)!,
        type: node.type,
        position: nextParentId
          ? cloneSnapshotValue(node.position)
          : {
              x: absolutePosition.x + deltaX,
              y: absolutePosition.y + deltaY,
            },
        data: cloneLinghuiNodeData(node.data) as unknown as Record<string, unknown>,
        parentId: nextParentId,
        extent: resolveParentExtent(nextParentId),
        draggable: false,
        selected: true,
      };
    });

    const nextEdges: Edge[] = snapshot.edges.flatMap(edge => {
      const source = nodeIdMap.get(edge.source) ?? edge.source;
      const target = nodeIdMap.get(edge.target);
      if (!target) {
        return [];
      }

      return [{
        id: `e-${nanoid(8)}`,
        source,
        target,
        sourceHandle: 'output-0',
        targetHandle: 'input-0',
        type: edge.type ?? 'linghui-edge',
        data: cloneSnapshotValue((edge.data ?? {}) as Record<string, unknown>),
      }];
    });

    setNodes(currentNodes => [
      ...currentNodes.map(node => (node.selected ? { ...node, selected: false } : node)),
      ...nextGroups,
      ...nextNodes,
    ]);
    setEdges(currentEdges => [...currentEdges, ...nextEdges]);
    setEditorSelection(null);
    setContextMenu(null);
    setQuickCreate(null);
    setPendingGroupFrame(null);
    scheduleSnapshot();
    return true;
  }, [hostRef, reactFlow, scheduleSnapshot, setContextMenu, setEditorSelection, setEdges, setNodes, setPendingGroupFrame, setQuickCreate]);

  const pasteClipboardSnapshot = useCallback((options?: { screenX?: number; screenY?: number }) => {
    const snapshot = clipboardRef.current;
    if (!snapshot) {
      return false;
    }

    return insertSubgraphSnapshotAtScreenPosition(snapshot, options);
  }, [insertSubgraphSnapshotAtScreenPosition]);

  const duplicateSelection = useCallback((requestedIds?: string[], options?: { screenX?: number; screenY?: number }) => {
    const snapshot = buildClipboardSnapshot(requestedIds, { includeExternalInputEdges: true });
    if (!snapshot) return false;
    clipboardRef.current = snapshot;
    return pasteClipboardSnapshot(options);
  }, [buildClipboardSnapshot, pasteClipboardSnapshot]);

  const createNodeFromWorkspaceAsset = useCallback((
    asset: LinghuiWorkspaceAssetRecord | LinghuiWorkspaceHistoryRecord,
    position: Node['position'],
    currentNodes: Node[],
  ): Node => {
    const targetType: LinghuiNodeType = asset.kind === 'text'
      ? 'linghui/text'
      : asset.kind === 'video'
        ? 'linghui/video'
        : asset.kind === 'audio'
          ? 'linghui/audio'
          : 'linghui/image';
    const node = createCanvasNode(targetType, position, currentNodes);
    const nodeData = node.data as unknown as LinghuiNodeData;
    const properties = nodeData.properties as Record<string, unknown>;

    if (targetType === 'linghui/text') {
      return {
        ...node,
        selected: true,
        data: {
          ...nodeData,
          label: asset.name,
          properties: {
            ...properties,
            mode: 'manual',
            content: asset.text ?? '',
          },
        } as unknown as Record<string, unknown>,
      };
    }

    if (targetType === 'linghui/video') {
      return {
        ...node,
        selected: true,
        data: {
          ...nodeData,
          label: asset.name,
          properties: {
            ...properties,
            source: asset.source ?? '',
            posterSource: asset.posterSource ?? asset.previewSource ?? '',
          },
        } as unknown as Record<string, unknown>,
      };
    }

    if (targetType === 'linghui/audio') {
      return {
        ...node,
        selected: true,
        data: {
          ...nodeData,
          label: asset.name,
          properties: {
            ...properties,
            source: asset.source ?? '',
            prompt: asset.text ?? '',
          },
        } as unknown as Record<string, unknown>,
      };
    }

    return {
      ...node,
      selected: true,
      data: {
        ...nodeData,
        label: asset.name,
        properties: {
          ...createLinghuiImageImportProperties(
            properties as unknown as LinghuiImageNodeProperties,
            [{
              id: asset.id,
              source: asset.source ?? asset.previewSource ?? '',
              label: asset.name,
              width: typeof asset.metadata?.width === 'number' ? asset.metadata.width : undefined,
              height: typeof asset.metadata?.height === 'number' ? asset.metadata.height : undefined,
              aspectRatio: typeof asset.metadata?.aspectRatio === 'string' ? asset.metadata.aspectRatio : undefined,
            }],
            asset.id,
          ),
        } as LinghuiImageNodeProperties,
      } as unknown as Record<string, unknown>,
    };
  }, []);

  const deleteNodesByIds = useCallback((nodeIds: string[]) => {
    if (!nodeIds.length) return;

    const currentNodes = reactFlow.getNodes();
    const expandedNodeIds = expandNodeIdsWithDescendants(currentNodes, nodeIds);
    const deleteSet = new Set(expandedNodeIds);
    const deletedLeafNodeIds = currentNodes
      .filter(node => deleteSet.has(node.id) && node.type !== 'group')
      .map(node => node.id);

    deletedLeafNodeIds.forEach(nodeId => {
      onClearNodeRunState?.(nodeId);
    });

    setNodes(currentNodes => {
      const groupPositions = collectGroupPositions(currentNodes, deleteSet);
      return detachNodesFromGroups(
        currentNodes.filter(node => !deleteSet.has(node.id)),
        groupPositions,
      );
    });

    setEdges(currentEdges => currentEdges.filter(edge => (
      !deleteSet.has(edge.source) && !deleteSet.has(edge.target)
    )));

    setEditorSelection(null);
    setPendingGroupFrame(null);
    scheduleSnapshot();
  }, [onClearNodeRunState, reactFlow, scheduleSnapshot, setEdges, setEditorSelection, setNodes, setPendingGroupFrame]);

  const deleteEdgesByIds = useCallback((edgeIds: string[]) => {
    if (!edgeIds.length) return;

    const deleteSet = new Set(edgeIds);
    setEdges(currentEdges => currentEdges.filter(edge => !deleteSet.has(edge.id)));
    setContextMenu(null);
    setQuickCreate(null);
    setPendingGroupFrame(null);
    scheduleSnapshot();
  }, [scheduleSnapshot, setContextMenu, setEdges, setPendingGroupFrame, setQuickCreate]);

  const ungroupGroupsByIds = useCallback((groupIds: string[]) => {
    if (!groupIds.length) return;

    setNodes(currentNodes => {
      const groupPositions = collectGroupPositions(currentNodes, groupIds);
      if (!groupPositions.size) return currentNodes;

      return detachNodesFromGroups(
        currentNodes.filter(node => !groupPositions.has(node.id)),
        groupPositions,
        { selectDetached: true },
      );
    });

    setEditorSelection(null);
    clearPendingGroupFrame();
    scheduleSnapshot();
  }, [clearPendingGroupFrame, scheduleSnapshot, setEditorSelection, setNodes]);

  const insertNodeAtScreenPosition = useCallback((
    type: LinghuiNodeType,
    screenX: number,
    screenY: number,
    options?: {
      openEditor?: boolean;
      sourceConnection?: PendingConnectionCreateState;
      label?: string;
      initialProperties?: Record<string, unknown>;
    },
  ) => {
    const position = reactFlow.screenToFlowPosition({ x: screenX, y: screenY });
    const currentNodes = reactFlow.getNodes();
    const createdNode = createCanvasNode(type, position, currentNodes, {
      label: options?.label,
      initialProperties: options?.initialProperties,
    });

    setNodes(existingNodes => [...existingNodes, createdNode]);

    if (options?.sourceConnection) {
      const targetHandleId = resolveCompatibleTargetHandleId(type, options.sourceConnection.sourceDataType);
      const targetSlotType = resolveCompatibleTargetSlotType(type, options.sourceConnection.sourceDataType);
      if (targetHandleId) {
        setEdges(existingEdges => addEdge({
          id: `e-${nanoid(8)}`,
          source: options.sourceConnection!.sourceNodeId,
          sourceHandle: options.sourceConnection!.sourceHandleId,
          target: createdNode.id,
          targetHandle: targetHandleId,
          type: 'linghui-edge',
          data: {
            sourceSlotType: options.sourceConnection!.sourceDataType,
            targetSlotType: targetSlotType ?? options.sourceConnection!.sourceDataType,
          },
        }, existingEdges));
      }
    }

    setContextMenu(null);
    setQuickCreate(null);
    requestAnimationFrame(() => {
      scheduleSnapshot();
      if (options?.openEditor) {
        const nodeData = createdNode.data as unknown as LinghuiNodeData;
        setEditorSelection({
          kind: 'node',
          nodeId: createdNode.id,
          nodeType: nodeData.linghuiType,
          label: nodeData.label,
        });
      }
    });
  }, [reactFlow, scheduleSnapshot, setContextMenu, setEditorSelection, setEdges, setNodes, setQuickCreate]);

  const deriveStoryboardShotsFromScript = useCallback((
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

  const deriveStoryboardImagesFromScript = useCallback((
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
    const existingByShotId = new Map(
      currentNodes
        .filter(node => {
          if (node.type === 'group') return false;
          const nodeData = node.data as unknown as LinghuiNodeData | undefined;
          if (nodeData?.linghuiType !== 'linghui/image') return false;
          const meta = getDerivedNodeMeta(node);
          return meta.scriptSourceNodeId === scriptNodeId && meta.scriptDerivationKind === 'image' && Boolean(meta.scriptShotId);
        })
        .map(node => [getDerivedNodeMeta(node).scriptShotId!, node]),
    );

    const nextNodeMap = new Map(currentNodes.map(node => [node.id, node]));
    const targetIds: string[] = [];

    for (const [index, shot] of shots.entries()) {
      const row = Math.floor(index / 2);
      const column = index % 2;
      const absolutePosition = {
        x: scriptAbsolutePosition.x + 248 + column * 236,
        y: scriptAbsolutePosition.y + row * 186,
      };
      const nextPosition = parentPosition
        ? {
            x: absolutePosition.x - parentPosition.x,
            y: absolutePosition.y - parentPosition.y,
          }
        : absolutePosition;
      const normalizedLabel = shot.title?.trim() || `镜头 ${index + 1}`;
      const normalizedSource = String(shot.image?.source ?? '').trim();
      const normalizedPrompt = shot.description?.trim() || normalizedLabel;
      const existingNode = existingByShotId.get(shot.id);

      if (existingNode) {
        const existingData = existingNode.data as unknown as LinghuiNodeData;
        const existingProps = existingData.properties as unknown as LinghuiImageNodeProperties;
        nextNodeMap.set(existingNode.id, {
          ...existingNode,
          selected: true,
          data: {
            ...existingData,
            label: normalizedLabel,
            properties: {
              ...existingProps,
              mode: normalizedSource ? 'import' : 'generate',
              source: normalizedSource,
              prompt: normalizedPrompt,
              gridType: 'none',
              batchCount: 1,
              scriptSourceNodeId: scriptNodeId,
              scriptShotId: shot.id,
              scriptShotTitle: normalizedLabel,
              scriptDerivationKind: 'image',
            } satisfies LinghuiImageNodeProperties,
          } as unknown as Record<string, unknown>,
        });
        targetIds.push(existingNode.id);
        continue;
      }

      const created = createCanvasNode('linghui/image', nextPosition, currentNodes);
      const nodeData = created.data as unknown as LinghuiNodeData;
      const nodeProps = nodeData.properties as unknown as LinghuiImageNodeProperties;
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
            mode: normalizedSource ? 'import' : 'generate',
            source: normalizedSource,
            prompt: normalizedPrompt,
            gridType: 'none',
            batchCount: 1,
            scriptSourceNodeId: scriptNodeId,
            scriptShotId: shot.id,
            scriptShotTitle: normalizedLabel,
            scriptDerivationKind: 'image',
          } satisfies LinghuiImageNodeProperties,
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

    // 把 storyboard/script 节点连到每个派生 image，避免用户手动连线
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

    setNodes([...nextNodes, ...appendedNodes]);
    setEdges(nextEdges);
    setEditorSelection(null);
    setContextMenu(null);
    setQuickCreate(null);
    setPendingGroupFrame(null);
    scheduleSnapshot();
    return targetIds;
  }, [reactFlow, scheduleSnapshot, setContextMenu, setEditorSelection, setEdges, setNodes, setPendingGroupFrame, setQuickCreate]);

  const deriveStoryboardVideosFromScript = useCallback((
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

    const nextNodeMap = new Map(currentNodes.map(node => [node.id, node]));
    const nextEdges = [...currentEdges];
    const targetIds: string[] = [];

    for (const [index, shot] of shots.entries()) {
      const row = Math.floor(index / 2);
      const column = index % 2;
      const imageAbsolutePosition = {
        x: scriptAbsolutePosition.x + 248 + column * 468,
        y: scriptAbsolutePosition.y + row * 196,
      };
      const videoAbsolutePosition = {
        x: imageAbsolutePosition.x + 228,
        y: imageAbsolutePosition.y,
      };
      const imagePosition = parentPosition
        ? {
            x: imageAbsolutePosition.x - parentPosition.x,
            y: imageAbsolutePosition.y - parentPosition.y,
          }
        : imageAbsolutePosition;
      const videoPosition = parentPosition
        ? {
            x: videoAbsolutePosition.x - parentPosition.x,
            y: videoAbsolutePosition.y - parentPosition.y,
          }
        : videoAbsolutePosition;
      const normalizedLabel = shot.title?.trim() || `镜头 ${index + 1}`;
      const normalizedSource = String(shot.image?.source ?? '').trim();
      const normalizedPrompt = shot.description?.trim() || normalizedLabel;
      const imageLabel = normalizedSource ? `${normalizedLabel} 首帧` : `${normalizedLabel} 分镜图`;
      const videoLabel = `${normalizedLabel} 视频`;

      let imageNode = existingImageByShotId.get(shot.id);
      if (imageNode) {
        const imageData = imageNode.data as unknown as LinghuiNodeData;
        const imageProps = imageData.properties as unknown as LinghuiImageNodeProperties;
        imageNode = {
          ...imageNode,
          selected: false,
          data: {
            ...imageData,
            label: imageLabel,
            properties: {
              ...imageProps,
              mode: normalizedSource ? 'import' : 'generate',
              source: normalizedSource,
              prompt: normalizedPrompt,
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
          parentId: scriptNode.parentId,
          extent: resolveParentExtent(scriptNode.parentId),
          selected: false,
          data: {
            ...imageData,
            label: imageLabel,
            properties: {
              ...imageProps,
              mode: normalizedSource ? 'import' : 'generate',
              source: normalizedSource,
              prompt: normalizedPrompt,
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
          selected: true,
          data: {
            ...videoData,
            label: videoLabel,
            properties: {
              ...videoProps,
              prompt: normalizedPrompt,
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
          parentId: scriptNode.parentId,
          extent: resolveParentExtent(scriptNode.parentId),
          selected: true,
          data: {
            ...videoData,
            label: videoLabel,
            properties: {
              ...videoProps,
              prompt: normalizedPrompt,
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

      // storyboard → image：让 image 节点拿到 storyboard 的 references / shot 文本
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
        });
      }
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

  const createGroupFromSelection = useCallback((selectionIds?: string[]) => {
    const allNodes = reactFlow.getNodes();
    const selected = allNodes.filter(n => (selectionIds?.includes(n.id) ?? n.selected) && n.type !== 'group');
    if (!selected.length) return;

    const frameBounds = pendingGroupFrame && (!selectionIds || selectionIds.every(id => pendingGroupFrame.selectionIds.includes(id)))
      ? pendingGroupFrame
      : null;

    const selectedNodeBounds = {
      minX: Math.min(...selected.map(n => n.position.x)),
      minY: Math.min(...selected.map(n => n.position.y)),
      maxX: Math.max(...selected.map(n => n.position.x + (n.measured?.width ?? 280))),
      maxY: Math.max(...selected.map(n => n.position.y + (n.measured?.height ?? 180))),
    };
    const bounds = frameBounds ? {
      minX: Math.min(frameBounds.minX, selectedNodeBounds.minX),
      minY: Math.min(frameBounds.minY, selectedNodeBounds.minY),
      maxX: Math.max(frameBounds.maxX, selectedNodeBounds.maxX),
      maxY: Math.max(frameBounds.maxY, selectedNodeBounds.maxY),
    } : selectedNodeBounds;

    const padding = 36;
    const groupId = nanoid(10);
    const nextGroupLabel = createNextLinghuiWorkflowBlockLabel(
      allNodes
        .filter(node => node.type === 'group')
        .map(node => (node.data as { label?: string } | undefined)?.label),
    );
    const groupNode: Node = {
      id: groupId,
      type: 'group',
      position: { x: bounds.minX - padding, y: bounds.minY - padding - 20 },
      data: { label: nextGroupLabel, color: 'var(--token-status-info)' },
      selected: true,
      draggable: true,
      style: {
        width: bounds.maxX - bounds.minX + padding * 2,
        height: bounds.maxY - bounds.minY + padding * 2 + 20,
      },
    };

    setNodes(nds => {
      const selectedIdSet = new Set(selected.map(node => node.id));
      const updated = nds.map(n => {
        if (!selectedIdSet.has(n.id)) {
          return n.selected ? { ...n, selected: false } : n;
        }
        return {
          ...n,
          parentId: groupId,
          extent: 'parent' as const,
          selected: false,
          position: {
            x: n.position.x - (bounds.minX - padding),
            y: n.position.y - (bounds.minY - padding - 20),
          },
        };
      });
      return [groupNode, ...updated];
    });

    setEditorSelection(null);
    setContextMenu(null);
    clearPendingGroupFrame();
    scheduleSnapshot();
  }, [clearPendingGroupFrame, pendingGroupFrame, reactFlow, scheduleSnapshot, setContextMenu, setEditorSelection, setNodes]);

  const createDerivedImageNodesFromNode = useCallback((sourceNodeId: string, items: LinghuiImageAssetItem[]): string[] => {
    if (!items.length) {
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
    const gapX = 228;
    const gapY = 196;
    const columns = Math.min(2, items.length);
    const createdIds: string[] = [];
    const createdEdges: Edge[] = [];

    setNodes(existingNodes => {
      const nextNodes = existingNodes.map(node => (node.selected ? { ...node, selected: false } : node));
      const createdNodes = items.map((item, index) => {
        const column = index % columns;
        const row = Math.floor(index / columns);
        const absolutePosition = {
          x: sourceAbsolutePosition.x + sourceWidth + 84 + column * gapX,
          y: sourceAbsolutePosition.y + row * gapY,
        };
        const position = parentPosition
          ? {
              x: absolutePosition.x - parentPosition.x,
              y: absolutePosition.y - parentPosition.y,
            }
          : absolutePosition;
        const created = createCanvasNode('linghui/image', position, existingNodes);
        const createdData = created.data as unknown as LinghuiNodeData;
        const createdProps = createdData.properties as unknown as LinghuiImageNodeProperties;
        createdIds.push(created.id);
        createdEdges.push({
          id: `e-${nanoid(8)}`,
          source: sourceNodeId,
          target: created.id,
          sourceHandle: 'output-0',
          targetHandle: 'input-0',
          type: 'linghui-edge',
          data: {
            sourceSlotType: 'image',
            targetSlotType: 'image',
          } as Record<string, unknown>,
        });

        return {
          ...created,
          parentId: sourceNode.parentId,
          extent: resolveParentExtent(sourceNode.parentId),
          selected: true,
          data: {
            ...createdData,
            label: item.label || createdData.label,
            properties: createLinghuiImageImportProperties(createdProps, [item], item.id) as unknown as Record<string, unknown>,
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
  }, [reactFlow, scheduleSnapshot, setContextMenu, setEdges, setEditorSelection, setNodes, setPendingGroupFrame, setQuickCreate]);

  const createDerivedPanoramaNodeFromNode = useCallback((sourceNodeId: string, item: LinghuiImageAssetItem): string | null => {
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
  }, [reactFlow, scheduleSnapshot, setContextMenu, setEdges, setEditorSelection, setNodes, setPendingGroupFrame, setQuickCreate]);

  const createDerivedVideoNodesFromNode = useCallback((sourceNodeId: string, items: LinghuiMediaItem[]): string[] => {
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
              videoCapability: 'video.reference-to-video',
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
  }, [reactFlow, scheduleSnapshot, setContextMenu, setEdges, setEditorSelection, setNodes, setPendingGroupFrame, setQuickCreate]);

  const createDerivedAudioNodeFromVideo = useCallback((
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
  }, [reactFlow, scheduleSnapshot, setContextMenu, setEdges, setEditorSelection, setNodes, setPendingGroupFrame, setQuickCreate]);

  const createDerivedMultiAngleImageNodeFromNode = useCallback((sourceNodeId: string, options?: LinghuiExecuteMultiAngleOptions): string | null => {
    const currentNodes = reactFlow.getNodes();
    const currentEdges = reactFlow.getEdges();
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

  const createDerivedImageToolNodeFromNode = useCallback((sourceNodeId: string, options: {
    label?: string;
    prompt: string;
    properties?: Partial<LinghuiImageNodeProperties>;
  }): string | null => {
    const currentNodes = reactFlow.getNodes();
    const currentEdges = reactFlow.getEdges();
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

  // LibTV 1:1：image-generator 控制器节点已删除。图片节点的"生成"由节点自身的编辑器内 prompt + 运行按钮完成，
  // 不再有"派生下游展示节点"的二分模型。`spawnImageFromGenerator` 不再暴露。

  /**
   * LibTV TextNode EmptyState 4 actions（15gvxu:55145-55256）：
   * - 'edit'        eJ "自己编写内容"：切到 mode='manual' + 清空 content，不派生新节点；返回 sourceNodeId
   * - 'video'       eY "文生视频"：写示例文本 + mode='generate'；右侧 +NODE_WIDTH+GAP 派生 VideoNode；建 text→video 边；选中新视频
   * - 'image-prompt' eV "图片反推提示词"：左侧 -NODE_WIDTH-GAP 派生 ImageNode；建 image→text 反向边；当前节点写反推 prompt + mode='generate'；选中新图片
   * - 'music'       eW "文字生音乐"：写音乐 prompt + mode='generate'；右侧派生 AudioNode；建 text→audio 边；选中新音频
   */
  const applyTextEmptyAction = useCallback((
    sourceNodeId: string,
    action: LinghuiTextEmptyAction,
  ): string | null => {
    const currentNodes = reactFlow.getNodes();
    const sourceNode = currentNodes.find(node => node.id === sourceNodeId);
    if (!sourceNode || sourceNode.type === 'group') return null;

    const sourceNodeData = sourceNode.data as unknown as LinghuiNodeData;
    if (sourceNodeData.linghuiType !== 'linghui/text') return null;

    if (action === 'edit') {
      // 切到 manual 模式（对齐 LibTV TEXT_RESOURCE）+ 清空 content
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

    // 余下 3 个 action 都需要派生节点：先算位置（处理 parent group 偏移）
    const sourceWidth = sourceNode.measured?.width ?? sourceNode.width ?? 280;
    const groupPositions = collectGroupPositions(currentNodes, sourceNode.parentId ? [sourceNode.parentId] : []);
    const sourceAbsolutePosition = getNodeAbsolutePosition(sourceNode, groupPositions);
    const parentPosition = sourceNode.parentId ? groupPositions.get(sourceNode.parentId) : undefined;
    // LibTV 用 NODE_WIDTH + NODE_GAP，灵绘 sourceWidth + 84（与 createDerivedImageToolNodeFromNode 一致）
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
            // LibTV 标记 scene='Music' 让 Audio 走 TTS Music 通道；灵绘暂以 prompt 透传，scene 字段保留扩展
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
      // 走 mode='import'（对齐 LibTV IMAGE_RESOURCE），让 ImageNode 进入 EmptyState 等待上传
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
      // ⚠ 反向连线：image → text
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
      hasMatchingEdge(existingEdges, newEdge!)
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

  /**
   * LibTV VideoNode EmptyState 2 actions（chunk 15gvxu:192400-192509 iU/iO）：
   * - 'first-frame'      eU/iG "首帧生成视频"：左侧 -NODE_WIDTH-GAP 派生 1 个 ImageNode (mode='import')；
   *   建 image→video 边；当前 VideoNode 写入 firstFrame.prompt + capability='video.image-to-video'；
   *   focus 留在 video（与 LibTV 一致）
   * - 'first-last-frame' iO/ij "首尾帧生成视频"：左侧并列派生 TWO ImageNode（首帧 + 尾帧，垂直分布）；
   *   建 2 条 image→video 边；写入 firstLastFrame.prompt + capability='video.start-end-to-video'
   */
  const applyVideoEmptyAction = useCallback((
    sourceNodeId: string,
    action: LinghuiVideoEmptyAction,
  ): string | null => {
    const currentNodes = reactFlow.getNodes();
    const sourceNode = currentNodes.find(node => node.id === sourceNodeId);
    if (!sourceNode || sourceNode.type === 'group') return null;
    const sourceNodeData = sourceNode.data as unknown as LinghuiNodeData;
    if (sourceNodeData.linghuiType !== 'linghui/video') return null;

    const sourceWidth = sourceNode.measured?.width ?? sourceNode.width ?? 320;
    const groupPositions = collectGroupPositions(currentNodes, sourceNode.parentId ? [sourceNode.parentId] : []);
    const sourceAbsolutePosition = getNodeAbsolutePosition(sourceNode, groupPositions);
    const parentPosition = sourceNode.parentId ? groupPositions.get(sourceNode.parentId) : undefined;
    // ImageNode 默认尺寸约 220，加 84 间距即可（LibTV 用 NODE_GAP，灵绘惯例 84）
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
            // 选中 video 节点（focus 留在 video）+ 写入默认 prompt + 切到首帧→视频 capability
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
      setEdges(existing => (hasMatchingEdge(existing, newEdge) ? existing : [...existing, newEdge]));
      setEditorSelection({
        kind: 'node', nodeId: sourceNodeId, nodeType: 'linghui/video', label: sourceNodeData.label,
      });
      setContextMenu(null);
      setQuickCreate(null);
      setPendingGroupFrame(null);
      scheduleSnapshot();
      return newImageNode.id;
    }

    // first-last-frame：两张 ImageNode 在 video 左侧垂直分布
    const verticalGap = 28;
    const stackHalfHeight = 150;  // 估算单图卡高度的一半，足够拉开间距即可
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
      if (!hasMatchingEdge(next, newFirstEdge)) next = [...next, newFirstEdge];
      if (!hasMatchingEdge(next, newLastEdge)) next = [...next, newLastEdge];
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

  /**
   * LibTV AudioNode EmptyState 1 action（chunk 15gvxu:8668-8728 eH "音频生视频"）：
   *  - 当前 AudioNode 写入示例 audioUrl + mode='import'
   *  - 右侧 +NODE_WIDTH+GAP 派生 VideoNode（generate + 默认 prompt）
   *  - 下方 +NODE_HEIGHT_AUDIO+GAP 派生 ImageNode（import + 默认参考图）
   *  - 2 条边：audio → video，image → video
   *  - focus 切到 video（LibTV 一致）
   */
  const applyAudioEmptyAction = useCallback((
    sourceNodeId: string,
    action: LinghuiAudioEmptyAction,
  ): string | null => {
    if (action !== 'audio-to-video') return null;
    const currentNodes = reactFlow.getNodes();
    const sourceNode = currentNodes.find(node => node.id === sourceNodeId);
    if (!sourceNode || sourceNode.type === 'group') return null;
    const sourceNodeData = sourceNode.data as unknown as LinghuiNodeData;
    if (sourceNodeData.linghuiType !== 'linghui/audio') return null;

    const sourceWidth = sourceNode.measured?.width ?? sourceNode.width ?? 320;
    const sourceHeight = sourceNode.measured?.height ?? sourceNode.height ?? 220;
    const groupPositions = collectGroupPositions(currentNodes, sourceNode.parentId ? [sourceNode.parentId] : []);
    const sourceAbsolutePosition = getNodeAbsolutePosition(sourceNode, groupPositions);
    const parentPosition = sourceNode.parentId ? groupPositions.get(sourceNode.parentId) : undefined;
    const toLocal = (x: number, y: number) => (parentPosition
      ? { x: x - parentPosition.x, y: y - parentPosition.y }
      : { x, y });

    const videoAbsoluteX = sourceAbsolutePosition.x + sourceWidth + 84;
    const videoAbsoluteY = sourceAbsolutePosition.y;
    const imageAbsoluteX = sourceAbsolutePosition.x;
    const imageAbsoluteY = sourceAbsolutePosition.y + sourceHeight + 56;

    // 右侧 VideoNode（generate）
    const videoCreated = createCanvasNode(
      'linghui/video',
      toLocal(videoAbsoluteX, videoAbsoluteY),
      currentNodes,
    );
    const videoData = videoCreated.data as unknown as LinghuiNodeData;
    const videoNode: Node = {
      ...videoCreated,
      parentId: sourceNode.parentId,
      extent: resolveParentExtent(sourceNode.parentId),
      selected: true,
      data: {
        ...videoData,
        label: '视频',
        properties: {
          ...(videoData.properties as Record<string, unknown>),
          mode: 'generate',
          prompt: LINGHUI_AUDIO_PRESETS.audioToVideo.prompt,
        } as unknown as Record<string, unknown>,
      } as unknown as Record<string, unknown>,
    };

    // 下方 ImageNode（import）
    const imageCreated = createCanvasNode(
      'linghui/image',
      toLocal(imageAbsoluteX, imageAbsoluteY),
      [...currentNodes, videoNode],
    );
    const imageData = imageCreated.data as unknown as LinghuiNodeData;
    const imageProps = imageData.properties as unknown as LinghuiImageNodeProperties;
    const imageImportProps = createLinghuiImageImportProperties(
      imageProps,
      LINGHUI_AUDIO_PRESETS.audioToVideo.imageUrl
        ? [{ id: 'preset-image', source: LINGHUI_AUDIO_PRESETS.audioToVideo.imageUrl, label: '图片' } as LinghuiImageAssetItem]
        : [],
      LINGHUI_AUDIO_PRESETS.audioToVideo.imageUrl ? 'preset-image' : '',
    );
    const imageNode: Node = {
      ...imageCreated,
      parentId: sourceNode.parentId,
      extent: resolveParentExtent(sourceNode.parentId),
      selected: false,
      data: {
        ...imageData,
        label: '图片',
        properties: imageImportProps as unknown as Record<string, unknown>,
      } as unknown as Record<string, unknown>,
    };

    const audioToVideoEdge: Edge = {
      id: `e-${nanoid(8)}`,
      source: sourceNodeId,
      target: videoNode.id,
      sourceHandle: 'output-0',
      targetHandle: 'input-0',
      type: 'linghui-edge',
      data: { sourceSlotType: 'audio', targetSlotType: 'audio' } as Record<string, unknown>,
    };
    const imageToVideoEdge: Edge = {
      id: `e-${nanoid(8)}`,
      source: imageNode.id,
      target: videoNode.id,
      sourceHandle: 'output-0',
      targetHandle: 'input-0',
      type: 'linghui-edge',
      data: { sourceSlotType: 'image', targetSlotType: 'image' } as Record<string, unknown>,
    };

    setNodes(existing => {
      const patched = existing.map(node => {
        if (node.id === sourceNodeId) {
          const data = node.data as unknown as LinghuiNodeData;
          const props = data.properties as unknown as LinghuiAudioNodeProperties;
          // 当前 AudioNode 切到 import 模式（与 LibTV AUDIO_RESOURCE 一致）+ 写示例音频 URL
          return {
            ...node,
            selected: false,
            data: {
              ...data,
              properties: {
                ...props,
                mode: 'import',
                source: LINGHUI_AUDIO_PRESETS.audioToVideo.audioUrl || props.source || '',
              } as unknown as Record<string, unknown>,
            } as unknown as Record<string, unknown>,
          };
        }
        return node.selected ? { ...node, selected: false } : node;
      });
      return [...patched, videoNode, imageNode];
    });
    setEdges(existing => {
      let next = existing;
      if (!hasMatchingEdge(next, audioToVideoEdge)) next = [...next, audioToVideoEdge];
      if (!hasMatchingEdge(next, imageToVideoEdge)) next = [...next, imageToVideoEdge];
      return next;
    });
    setEditorSelection({
      kind: 'node', nodeId: videoNode.id, nodeType: 'linghui/video', label: '视频',
    });
    setContextMenu(null);
    setQuickCreate(null);
    setPendingGroupFrame(null);
    scheduleSnapshot();
    return videoNode.id;
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

  const hasClipboardData = Boolean(clipboardRef.current?.nodes.length || clipboardRef.current?.groups.length);

  return {
    hasClipboardData,
    buildClipboardSnapshot,
    copySelectionToClipboard,
    insertSubgraphSnapshotAtScreenPosition,
    pasteClipboardSnapshot,
    duplicateSelection,
    createNodeFromWorkspaceAsset,
    deleteNodesByIds,
    deleteEdgesByIds,
    ungroupGroupsByIds,
    insertNodeAtScreenPosition,
    deriveStoryboardShotsFromScript,
    deriveStoryboardImagesFromScript,
    deriveStoryboardVideosFromScript,
    createGroupFromSelection,
    createDerivedImageNodesFromNode,
    createDerivedVideoNodesFromNode,
    createDerivedPanoramaNodeFromNode,
    createDerivedAudioNodeFromVideo,
    createDerivedMultiAngleImageNodeFromNode,
    createDerivedImageToolNodeFromNode,
    applyTextEmptyAction,
    applyVideoEmptyAction,
    applyAudioEmptyAction,
    clearPendingGroupFrame,
  };
}

import { addEdge, type Edge, type Node, type ReactFlowInstance } from '@xyflow/react';
import { nanoid } from 'nanoid';
import { useCallback, useRef } from 'react';
import type { Dispatch, RefObject, SetStateAction } from 'react';
import type {
  LinghuiCanvasSelection,
  LinghuiImageAssetItem,
  LinghuiImageNodeProperties,
  LinghuiNodeData,
  LinghuiScriptDerivationKind,
  LinghuiNodeType,
  LinghuiStoryboardFrame,
  LinghuiTextNodeProperties,
  LinghuiVideoNodeProperties,
} from '../../types/linghui';
import type {
  LinghuiWorkspaceAssetRecord,
  LinghuiWorkspaceHistoryRecord,
} from '../../store/linghuiStorage';
import { createNextLinghuiWorkflowBlockLabel } from '../../constants/linghuiWorkflowBlock';
import { createLinghuiImageImportProperties } from './linghuiImageCollections';
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
  toEdgeSnapshot,
  toGroupSnapshot,
  toNodeSnapshot,
} from './linghuiCanvasShared';

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
  return edges.some(edge => (
    edge.source === target.source &&
    (edge.sourceHandle ?? 'output-0') === (target.sourceHandle ?? 'output-0') &&
    edge.target === target.target &&
    (edge.targetHandle ?? 'input-0') === (target.targetHandle ?? 'input-0')
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

  const buildClipboardSnapshot = useCallback((requestedIds?: string[]): LinghuiClipboardSnapshot | null => {
    const rfNodes = reactFlow.getNodes();
    const rfEdges = reactFlow.getEdges();
    const selectionIds = new Set(
      requestedIds?.length
        ? requestedIds
        : rfNodes.filter(node => node.selected).map(node => node.id),
    );

    const selectedGroups = rfNodes.filter(node => selectionIds.has(node.id) && node.type === 'group');
    const selectedGroupIds = new Set(selectedGroups.map(node => node.id));
    const selectedNodes = rfNodes.filter(node => (
      node.type !== 'group' && (
        selectionIds.has(node.id) ||
        (node.parentId ? selectedGroupIds.has(node.parentId) : false)
      )
    ));
    const selectedNodeIds = new Set(selectedNodes.map(node => node.id));
    const selectedEdges = rfEdges.filter(edge => (
      selectedNodeIds.has(edge.source) && selectedNodeIds.has(edge.target)
    ));

    if (!selectedNodes.length && !selectedGroups.length) {
      return null;
    }

    return {
      nodes: selectedNodes.map(toNodeSnapshot),
      edges: selectedEdges.map(toEdgeSnapshot),
      groups: selectedGroups.map(toGroupSnapshot),
    };
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
      const source = nodeIdMap.get(edge.source);
      const target = nodeIdMap.get(edge.target);
      if (!source || !target) {
        return [];
      }

      return [{
        id: `e-${nanoid(8)}`,
        source,
        target,
        sourceHandle: edge.sourceHandle,
        targetHandle: edge.targetHandle,
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
    const snapshot = buildClipboardSnapshot(requestedIds);
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
          ...properties,
          mode: 'import',
          source: asset.source ?? asset.previewSource ?? '',
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
    options?: { openEditor?: boolean; sourceConnection?: PendingConnectionCreateState },
  ) => {
    const position = reactFlow.screenToFlowPosition({ x: screenX, y: screenY });
    const currentNodes = reactFlow.getNodes();
    const createdNode = createCanvasNode(type, position, currentNodes);

    setNodes(existingNodes => [...existingNodes, createdNode]);

    if (options?.sourceConnection) {
      const targetHandleId = resolveCompatibleTargetHandleId(type, options.sourceConnection.sourceDataType);
      if (targetHandleId) {
        setEdges(existingEdges => addEdge({
          id: `e-${nanoid(8)}`,
          source: options.sourceConnection!.sourceNodeId,
          sourceHandle: options.sourceConnection!.sourceHandleId,
          target: createdNode.id,
          targetHandle: targetHandleId,
          type: 'linghui-edge',
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
        targetHandle: 'input-1',
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

    setNodes([...nextNodes, ...appendedNodes]);
    setEditorSelection(null);
    setContextMenu(null);
    setQuickCreate(null);
    setPendingGroupFrame(null);
    scheduleSnapshot();
    return targetIds;
  }, [reactFlow, scheduleSnapshot, setContextMenu, setEditorSelection, setNodes, setPendingGroupFrame, setQuickCreate]);

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
      data: { label: nextGroupLabel, color: '#2563eb' },
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
  }, [reactFlow, scheduleSnapshot, setContextMenu, setEditorSelection, setNodes, setPendingGroupFrame, setQuickCreate]);

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
    clearPendingGroupFrame,
  };
}

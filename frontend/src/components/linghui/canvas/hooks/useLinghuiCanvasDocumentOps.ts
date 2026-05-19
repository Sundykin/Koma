import { addEdge, type Edge, type Node, type ReactFlowInstance } from '@xyflow/react';
import { nanoid } from 'nanoid';
import { useCallback, useRef } from 'react';
import type { Dispatch, RefObject, SetStateAction } from 'react';
import type {
  LinghuiCanvasSelection,
  LinghuiImageNodeProperties,
  LinghuiNodeData,
  LinghuiNodeType,
} from '../../../../types/linghui';
import type {
  LinghuiWorkspaceAssetRecord,
  LinghuiWorkspaceHistoryRecord,
} from '../../../../store/linghuiStorage';
import { createLinghuiImageImportProperties } from '../../editors/state/linghuiImageCollections';
import { useLinghuiCanvasEmptyActions } from './useLinghuiCanvasEmptyActions';
import { useLinghuiCanvasGroupOps } from './useLinghuiCanvasGroupOps';
import { useLinghuiCanvasMediaDerivations } from './useLinghuiCanvasMediaDerivations';
import { useLinghuiCanvasStoryboardDerivations } from './useLinghuiCanvasStoryboardDerivations';
import {
  type LinghuiCanvasMenuState,
  type LinghuiClipboardSnapshot,
  type LinghuiPendingGroupFrame,
  type PendingConnectionCreateState,
  type QuickCreateState,
  PASTE_OFFSET_STEP,
  cloneLinghuiNodeData,
  cloneSnapshotValue,
  createCanvasNode,
  getNodeAbsolutePosition,
  resolveParentExtent,
  resolveCompatibleTargetHandleId,
  resolveCompatibleTargetSlotType,
  buildLinghuiClipboardSnapshotFromRF,
} from '../state/linghuiCanvasShared';

export type {
  LinghuiAudioEmptyAction,
  LinghuiTextEmptyAction,
  LinghuiVideoEmptyAction,
} from './useLinghuiCanvasEmptyActions';

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

  const {
    deriveStoryboardShotsFromScript,
    deriveStoryboardImagesFromScript,
    deriveStoryboardVideosFromScript,
  } = useLinghuiCanvasStoryboardDerivations({
    reactFlow,
    setNodes,
    setEdges,
    setEditorSelection,
    setContextMenu,
    setQuickCreate,
    setPendingGroupFrame,
    scheduleSnapshot,
  });

  const {
    clearPendingGroupFrame,
    deleteNodesByIds,
    deleteEdgesByIds,
    ungroupGroupsByIds,
    createGroupFromSelection,
  } = useLinghuiCanvasGroupOps({
    reactFlow,
    setNodes,
    setEdges,
    setEditorSelection,
    setContextMenu,
    setQuickCreate,
    setPendingGroupFrame,
    pendingGroupFrame,
    scheduleSnapshot,
    onClearNodeRunState,
  });

  const {
    createDerivedImageNodesFromNode,
    createDerivedPanoramaNodeFromNode,
    createDerivedVideoNodesFromNode,
    createDerivedVideoAnalysisNodeFromNode,
    createDerivedAudioNodeFromVideo,
    createDerivedMultiAngleImageNodeFromNode,
    createDerivedImageToolNodeFromNode,
  } = useLinghuiCanvasMediaDerivations({
    reactFlow,
    setNodes,
    setEdges,
    setEditorSelection,
    setContextMenu,
    setQuickCreate,
    setPendingGroupFrame,
    scheduleSnapshot,
  });

  // LibTV 1:1：image-generator 控制器节点已删除。图片节点的"生成"由节点自身的编辑器内 prompt + 运行按钮完成，
  // 不再有"派生下游展示节点"的二分模型。`spawnImageFromGenerator` 不再暴露。

  const {
    applyTextEmptyAction,
    applyVideoEmptyAction,
    applyAudioEmptyAction,
  } = useLinghuiCanvasEmptyActions({
    reactFlow,
    setNodes,
    setEdges,
    setEditorSelection,
    setContextMenu,
    setQuickCreate,
    setPendingGroupFrame,
    scheduleSnapshot,
  });

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
    createDerivedVideoAnalysisNodeFromNode,
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

import { useImperativeHandle } from 'react';
import type { Dispatch, ForwardedRef, MutableRefObject, RefObject, SetStateAction } from 'react';
import type { Node, ReactFlowInstance } from '@xyflow/react';
import type { LinghuiExecutionContext, LinghuiNodeData, LinghuiNodeType } from '../../../../types/linghui';
import type {
  LinghuiWorkflowTemplateRecord,
  LinghuiWorkspaceAssetRecord,
  LinghuiWorkspaceHistoryRecord,
} from '../../../../store/linghuiStorage';
import {
  collectGroupPositions,
  createCanvasNode,
  getNodeAbsolutePosition,
  isPersistableLinghuiNode,
  resolveExecutionTargetNodeIds,
  toEdgeSnapshot,
  toNodeSnapshot,
} from '../state/linghuiCanvasShared';
import type { LinghuiCanvasHandle } from '../state/linghuiCanvasTypes';

interface UseLinghuiCanvasImperativeHandleParams {
  ref: ForwardedRef<LinghuiCanvasHandle>;
  reactFlowRef: MutableRefObject<ReactFlowInstance>;
  setNodesRef: MutableRefObject<Dispatch<SetStateAction<Node[]>>>;
  hostRef: RefObject<HTMLDivElement | null>;
  emitSnapshotRef: MutableRefObject<(options?: { recordHistory?: boolean; force?: boolean }) => void>;
  createNodeFromWorkspaceAsset: (
    asset: LinghuiWorkspaceAssetRecord | LinghuiWorkspaceHistoryRecord,
    position: Node['position'],
    currentNodes: Node[],
  ) => Node;
  insertSubgraphSnapshotAtScreenPosition: (
    snapshot: LinghuiWorkflowTemplateRecord['snapshot'],
    options?: { screenX?: number; screenY?: number },
  ) => boolean;
  handleUploadImagesToCanvas: (screenX?: number, screenY?: number) => Promise<void>;
  handleUploadVideosToCanvas: (screenX?: number, screenY?: number) => Promise<void>;
  handleUploadAudiosToCanvas: (screenX?: number, screenY?: number) => Promise<void>;
  createGroupFromSelection: () => void;
}

export function useLinghuiCanvasImperativeHandle({
  ref,
  reactFlowRef,
  setNodesRef,
  hostRef,
  emitSnapshotRef,
  createNodeFromWorkspaceAsset,
  insertSubgraphSnapshotAtScreenPosition,
  handleUploadImagesToCanvas,
  handleUploadVideosToCanvas,
  handleUploadAudiosToCanvas,
  createGroupFromSelection,
}: UseLinghuiCanvasImperativeHandleParams) {
  useImperativeHandle(ref, () => ({
    addNode(type, clientPosition) {
      const rf = reactFlowRef.current;
      const position = clientPosition
        ? rf.screenToFlowPosition({ x: clientPosition[0], y: clientPosition[1] })
        : rf.screenToFlowPosition({
            x: window.innerWidth / 2,
            y: window.innerHeight / 2,
          });

      setNodesRef.current(currentNodes => [...currentNodes, createCanvasNode(type, position, currentNodes)]);
      requestAnimationFrame(() => emitSnapshotRef.current());
    },

    addWorkspaceAsset(asset, clientPosition) {
      const rf = reactFlowRef.current;
      const position = clientPosition
        ? rf.screenToFlowPosition({ x: clientPosition[0], y: clientPosition[1] })
        : rf.screenToFlowPosition({
            x: window.innerWidth / 2,
            y: window.innerHeight / 2,
          });

      setNodesRef.current(currentNodes => {
        const nextNode = createNodeFromWorkspaceAsset(asset, position, currentNodes);
        return [
          ...currentNodes.map(node => (node.selected ? { ...node, selected: false } : node)),
          nextNode,
        ];
      });
      requestAnimationFrame(() => emitSnapshotRef.current());
    },

    addWorkflowTemplate(template, clientPosition) {
      const rect = hostRef.current?.getBoundingClientRect();
      const screenX = clientPosition?.[0] ?? (rect ? rect.left + rect.width / 2 : window.innerWidth / 2);
      const screenY = clientPosition?.[1] ?? (rect ? rect.top + rect.height / 2 : window.innerHeight / 2);
      insertSubgraphSnapshotAtScreenPosition(template.snapshot, { screenX, screenY });
    },

    async importMediaToCanvas(kind, clientPosition) {
      const screenX = clientPosition?.[0];
      const screenY = clientPosition?.[1];

      if (kind === 'image') {
        await handleUploadImagesToCanvas(screenX, screenY);
        return;
      }
      if (kind === 'video') {
        await handleUploadVideosToCanvas(screenX, screenY);
        return;
      }
      await handleUploadAudiosToCanvas(screenX, screenY);
    },

    createGroupFromSelection() {
      createGroupFromSelection();
    },

    focusContent() {
      reactFlowRef.current.fitView({ padding: 0.12, duration: 240 });
    },

    focusNodes(nodeIds, options) {
      if (!nodeIds.length) {
        return;
      }

      const currentNodes = reactFlowRef.current.getNodes();
      const targetSet = new Set(nodeIds);
      const matchedNodes = currentNodes.filter(node => targetSet.has(node.id));
      if (!matchedNodes.length) {
        return;
      }

      if (options?.select) {
        setNodesRef.current(nodes => nodes.map(node => {
          const isSelected = targetSet.has(node.id);
          return node.selected === isSelected ? node : { ...node, selected: isSelected };
        }));
      }

      const groupPositions = collectGroupPositions(currentNodes, currentNodes.filter(node => node.type === 'group').map(node => node.id));
      const bounds = matchedNodes.map(node => {
        const absolute = getNodeAbsolutePosition(node, groupPositions);
        return {
          x: absolute.x,
          y: absolute.y,
          width: node.measured?.width ?? node.width ?? 220,
          height: node.measured?.height ?? node.height ?? 140,
        };
      });
      const minX = Math.min(...bounds.map(item => item.x));
      const minY = Math.min(...bounds.map(item => item.y));
      const maxX = Math.max(...bounds.map(item => item.x + item.width));
      const maxY = Math.max(...bounds.map(item => item.y + item.height));

      reactFlowRef.current.fitBounds({
        x: minX,
        y: minY,
        width: Math.max(40, maxX - minX),
        height: Math.max(40, maxY - minY),
      }, {
        padding: 0.28,
        duration: 260,
      });
    },

    notifyMutation() {
      emitSnapshotRef.current({ recordHistory: false });
    },

    snapshotNow() {
      emitSnapshotRef.current({ force: true });
    },

    getSelectionIds() {
      return reactFlowRef.current.getNodes().filter(node => node.selected).map(node => node.id);
    },

    resolveExecutionTargetIds(selectionIds) {
      return resolveExecutionTargetNodeIds(reactFlowRef.current.getNodes(), selectionIds);
    },

    getExecutionContext(): LinghuiExecutionContext | null {
      const rfNodes = reactFlowRef.current.getNodes().filter(isPersistableLinghuiNode);
      const rfNodeIds = new Set(rfNodes.map(node => node.id));
      const rfEdges = reactFlowRef.current.getEdges().filter(edge => (
        rfNodeIds.has(edge.source) && rfNodeIds.has(edge.target)
      ));
      return {
        nodes: rfNodes.map(node => toNodeSnapshot(node)),
        edges: rfEdges.map(edge => toEdgeSnapshot(edge)),
        nodeOutputs: {},
      };
    },
  }), [
    createGroupFromSelection,
    createNodeFromWorkspaceAsset,
    emitSnapshotRef,
    handleUploadAudiosToCanvas,
    handleUploadImagesToCanvas,
    handleUploadVideosToCanvas,
    hostRef,
    insertSubgraphSnapshotAtScreenPosition,
    reactFlowRef,
    setNodesRef,
  ]);
}

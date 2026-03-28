import { useImperativeHandle } from 'react';
import type { Dispatch, ForwardedRef, MutableRefObject, RefObject, SetStateAction } from 'react';
import type { Node, ReactFlowInstance } from '@xyflow/react';
import type { LinghuiExecutionContext, LinghuiNodeData, LinghuiNodeType } from '../../types/linghui';
import type {
  LinghuiWorkflowTemplateRecord,
  LinghuiWorkspaceAssetRecord,
  LinghuiWorkspaceHistoryRecord,
} from '../../store/linghuiStorage';
import { createCanvasNode, resolveExecutionTargetNodeIds, toEdgeSnapshot, toNodeSnapshot } from './linghuiCanvasShared';
import type { LinghuiCanvasHandle } from './LinghuiCanvas';

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
      const rfNodes = reactFlowRef.current.getNodes().filter(node => node.type !== 'group');
      const rfEdges = reactFlowRef.current.getEdges();
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

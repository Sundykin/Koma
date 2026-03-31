import { useCallback, useEffect, useRef, useState } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { Edge, Node, ReactFlowInstance } from '@xyflow/react';
import type {
  LinghuiGraphSnapshot,
  LinghuiGraphStats,
  LinghuiViewportState,
  LinghuiWorkspaceDocument,
} from '../../types/linghui';
import {
  type LinghuiCanvasDocumentSnapshot,
  buildCanvasDocumentSnapshotFromRF,
  buildRFEdgesFromSnapshot,
  buildRFNodesFromSnapshot,
  calculateStats,
  cloneSnapshotValue,
  detectCanvasMutationKind,
  serializeCanvasDocumentSnapshot,
} from './linghuiCanvasShared';

interface UseLinghuiCanvasHistoryParams {
  reactFlow: ReactFlowInstance;
  workspace: LinghuiWorkspaceDocument | null;
  setNodes: Dispatch<SetStateAction<Node[]>>;
  setEdges: Dispatch<SetStateAction<Edge[]>>;
  onGraphChange: (
    graphData: LinghuiGraphSnapshot,
    viewport: LinghuiViewportState,
    stats: LinghuiGraphStats,
  ) => void;
  resetUiState: () => void;
}

export function useLinghuiCanvasHistory({
  reactFlow,
  workspace,
  setNodes,
  setEdges,
  onGraphChange,
  resetUiState,
}: UseLinghuiCanvasHistoryParams) {
  const [, setHistoryRevision] = useState(0);
  const lastWorkspaceIdRef = useRef<string | null>(null);
  const hydratingRef = useRef(false);
  const applyingHistoryRef = useRef(false);
  const historyPastRef = useRef<LinghuiCanvasDocumentSnapshot[]>([]);
  const historyPresentRef = useRef<LinghuiCanvasDocumentSnapshot | null>(null);
  const historyFutureRef = useRef<LinghuiCanvasDocumentSnapshot[]>([]);
  const onGraphChangeRef = useRef(onGraphChange);
  const reactFlowRef = useRef(reactFlow);
  const setNodesRef = useRef(setNodes);

  useEffect(() => {
    onGraphChangeRef.current = onGraphChange;
  }, [onGraphChange]);

  useEffect(() => {
    reactFlowRef.current = reactFlow;
  }, [reactFlow]);

  useEffect(() => {
    setNodesRef.current = setNodes;
  }, [setNodes]);

  const captureCanvasDocumentSnapshot = useCallback((): LinghuiCanvasDocumentSnapshot => {
    const rfNodes = reactFlow.getNodes();
    const rfEdges = reactFlow.getEdges();
    const currentViewport = reactFlow.getViewport();
    return buildCanvasDocumentSnapshotFromRF(rfNodes, rfEdges, {
      x: currentViewport.x,
      y: currentViewport.y,
      zoom: currentViewport.zoom,
    });
  }, [reactFlow]);

  const applyCanvasDocumentSnapshot = useCallback((snapshot: LinghuiCanvasDocumentSnapshot) => {
    applyingHistoryRef.current = true;
    hydratingRef.current = true;
    setNodes(buildRFNodesFromSnapshot(snapshot));
    setEdges(buildRFEdgesFromSnapshot(snapshot));
    resetUiState();

    requestAnimationFrame(() => {
      reactFlow.setViewport(snapshot.viewport);
      hydratingRef.current = false;
      applyingHistoryRef.current = false;
      onGraphChangeRef.current(
        snapshot.graphData,
        snapshot.viewport,
        calculateStats(snapshot.graphData),
      );
      setHistoryRevision(value => value + 1);
    });
  }, [reactFlow, resetUiState, setEdges, setNodes]);

  const commitHistorySnapshot = useCallback((snapshot: LinghuiCanvasDocumentSnapshot) => {
    if (hydratingRef.current || applyingHistoryRef.current) return;

    const current = historyPresentRef.current;
    if (!current) {
      historyPresentRef.current = snapshot;
      historyPastRef.current = [];
      historyFutureRef.current = [];
      return;
    }

    if (serializeCanvasDocumentSnapshot(current) === serializeCanvasDocumentSnapshot(snapshot)) {
      return;
    }

    historyPastRef.current = [...historyPastRef.current, current].slice(-80);
    historyPresentRef.current = snapshot;
    historyFutureRef.current = [];
    setHistoryRevision(value => value + 1);
  }, []);

  const syncHistoryBaseline = useCallback((snapshot?: LinghuiCanvasDocumentSnapshot) => {
    historyPresentRef.current = cloneSnapshotValue(snapshot ?? captureCanvasDocumentSnapshot());
    historyPastRef.current = [];
    historyFutureRef.current = [];
    setHistoryRevision(value => value + 1);
  }, [captureCanvasDocumentSnapshot]);

  const flushCanvasSnapshot = useCallback((options?: { recordHistory?: boolean; force?: boolean }) => {
    if (hydratingRef.current) return;
    const { recordHistory = true, force = false } = options ?? {};
    const snapshot = captureCanvasDocumentSnapshot();
    const changeKind = detectCanvasMutationKind(historyPresentRef.current, snapshot);
    if (!force && changeKind === 'none') {
      return;
    }

    onGraphChangeRef.current(
      snapshot.graphData,
      snapshot.viewport,
      calculateStats(snapshot.graphData),
    );

    if (recordHistory && changeKind !== 'viewport') {
      commitHistorySnapshot(snapshot);
    }
  }, [captureCanvasDocumentSnapshot, commitHistorySnapshot]);

  const scheduleSnapshot = useCallback((options?: { recordHistory?: boolean; force?: boolean }) => {
    const { recordHistory = true } = options ?? {};
    requestAnimationFrame(() => {
      flushCanvasSnapshot({ ...options, recordHistory });
    });
  }, [flushCanvasSnapshot]);

  const emitSnapshot = useCallback((options?: { recordHistory?: boolean; force?: boolean }) => {
    flushCanvasSnapshot(options);
  }, [flushCanvasSnapshot]);

  const emitSnapshotRef = useRef(emitSnapshot);
  useEffect(() => {
    emitSnapshotRef.current = emitSnapshot;
  }, [emitSnapshot]);

  const undoHistory = useCallback(() => {
    const previous = historyPastRef.current[historyPastRef.current.length - 1];
    const current = historyPresentRef.current;
    if (!previous || !current) return;

    historyPastRef.current = historyPastRef.current.slice(0, -1);
    historyFutureRef.current = [current, ...historyFutureRef.current].slice(0, 80);
    historyPresentRef.current = cloneSnapshotValue(previous);
    applyCanvasDocumentSnapshot(previous);
  }, [applyCanvasDocumentSnapshot]);

  const redoHistory = useCallback(() => {
    const [next, ...remainingFuture] = historyFutureRef.current;
    const current = historyPresentRef.current;
    if (!next || !current) return;

    historyPastRef.current = [...historyPastRef.current, current].slice(-80);
    historyFutureRef.current = remainingFuture;
    historyPresentRef.current = cloneSnapshotValue(next);
    applyCanvasDocumentSnapshot(next);
  }, [applyCanvasDocumentSnapshot]);

  useEffect(() => {
    if (!workspace) return;
    if (lastWorkspaceIdRef.current === workspace.id) return;

    hydratingRef.current = true;
    lastWorkspaceIdRef.current = workspace.id;
    resetUiState();
    const workspaceSnapshot: LinghuiCanvasDocumentSnapshot = {
      graphData: cloneSnapshotValue(workspace.graphData),
      viewport: cloneSnapshotValue(workspace.viewport),
    };

    setNodes(buildRFNodesFromSnapshot(workspaceSnapshot));
    setEdges(buildRFEdgesFromSnapshot(workspaceSnapshot));
    syncHistoryBaseline(workspaceSnapshot);

    requestAnimationFrame(() => {
      reactFlow.setViewport({
        x: workspace.viewport.x,
        y: workspace.viewport.y,
        zoom: workspace.viewport.zoom,
      });
      hydratingRef.current = false;
    });
  }, [reactFlow, resetUiState, setEdges, setNodes, syncHistoryBaseline, workspace]);

  return {
    canUndo: historyPastRef.current.length > 0,
    canRedo: historyFutureRef.current.length > 0,
    scheduleSnapshot,
    emitSnapshot,
    emitSnapshotRef,
    reactFlowRef,
    setNodesRef,
    undoHistory,
    redoHistory,
  };
}

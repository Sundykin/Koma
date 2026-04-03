import React, { useEffect, useMemo, useRef, useState } from 'react';
import { act, render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Edge, Node, ReactFlowInstance } from '@xyflow/react';
import type { LinghuiNodeRunState, LinghuiWorkspaceDocument } from '../../../../types/linghui';
import { createNewNodeData } from '../../library/state/linghuiNodeDefs';
import { useLinghuiCanvasHistory } from '../hooks/useLinghuiCanvasHistory';

interface HistoryHarnessHandle {
  replaceNodes: (nodes: Node[]) => void;
  setNodeRuns: (nodeRuns: Record<string, LinghuiNodeRunState>) => void;
  getNodes: () => Node[];
  getNodeRuns: () => Record<string, LinghuiNodeRunState>;
  emitSnapshot: (options?: { recordHistory?: boolean; force?: boolean }) => void;
  undoHistory: () => void;
}

function createWorkspace(): LinghuiWorkspaceDocument {
  return {
    id: 'workspace-1',
    name: '测试工作区',
    description: '',
    createdAt: 1,
    updatedAt: 1,
    lastOpenedAt: 1,
    nodeCount: 1,
    linkCount: 0,
    groupCount: 0,
    viewport: {
      x: 0,
      y: 0,
      zoom: 1,
    },
    graphData: {
      version: 2,
      nodes: [{
        id: 'node-1',
        type: 'linghui-image',
        position: { x: 120, y: 80 },
        data: createNewNodeData('linghui/image', { label: '图生图节点' }),
      }],
      edges: [],
      groups: [],
    },
    nodeRuns: {},
    executionLogs: [],
  };
}

const GENERATED_IMAGE_RUN: LinghuiNodeRunState = {
  status: 'succeeded',
  updatedAt: 123,
  result: {
    kind: 'image',
    primary: {
      kind: 'image',
      source: '/tmp/generated-image.png',
      label: '生成结果',
    },
  },
};

function HistoryHarness({ workspace, onReady }: {
  workspace: LinghuiWorkspaceDocument;
  onReady: (handle: HistoryHarnessHandle) => void;
}) {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [nodeRuns, setNodeRuns] = useState<Record<string, LinghuiNodeRunState>>(workspace.nodeRuns);
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  const nodeRunsRef = useRef(nodeRuns);
  const viewportRef = useRef(workspace.viewport);

  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  useEffect(() => {
    edgesRef.current = edges;
  }, [edges]);

  useEffect(() => {
    nodeRunsRef.current = nodeRuns;
  }, [nodeRuns]);

  const reactFlow = useMemo(() => ({
    getNodes: () => nodesRef.current,
    getEdges: () => edgesRef.current,
    getViewport: () => viewportRef.current,
    setViewport: (nextViewport: typeof viewportRef.current) => {
      viewportRef.current = nextViewport;
    },
  }) as unknown as ReactFlowInstance, []);

  const history = useLinghuiCanvasHistory({
    reactFlow,
    workspace,
    nodeRuns,
    setNodes,
    setEdges,
    onGraphChange: () => undefined,
    onRestoreNodeRuns: setNodeRuns,
    resetUiState: () => undefined,
  });

  useEffect(() => {
    onReady({
      replaceNodes: nextNodes => setNodes(nextNodes),
      setNodeRuns,
      getNodes: () => nodesRef.current,
      getNodeRuns: () => nodeRunsRef.current,
      emitSnapshot: history.emitSnapshot,
      undoHistory: history.undoHistory,
    });
  }, [history.emitSnapshot, history.undoHistory, onReady]);

  return null;
}

describe('useLinghuiCanvasHistory runtime restore', () => {
  beforeEach(() => {
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
      callback(0);
      return 1;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);
  });

  it('restores the latest node run result when undoing a node deletion', async () => {
    const workspace = createWorkspace();
    let handle: HistoryHarnessHandle | null = null;

    render(
      <HistoryHarness
        workspace={workspace}
        onReady={nextHandle => {
          handle = nextHandle;
        }}
      />,
    );

    await waitFor(() => {
      expect(handle?.getNodes()).toHaveLength(1);
    });

    act(() => {
      handle?.setNodeRuns({
        'node-1': GENERATED_IMAGE_RUN,
      });
    });

    await waitFor(() => {
      expect(handle?.getNodeRuns()['node-1']?.result?.kind).toBe('image');
    });

    act(() => {
      handle?.replaceNodes([]);
      handle?.setNodeRuns({});
    });

    await waitFor(() => {
      expect(handle?.getNodes()).toHaveLength(0);
      expect(handle?.getNodeRuns()['node-1']).toBeUndefined();
    });

    act(() => {
      handle?.emitSnapshot({ force: true });
    });

    act(() => {
      handle?.undoHistory();
    });

    await waitFor(() => {
      expect(handle?.getNodes()).toHaveLength(1);
      expect(handle?.getNodeRuns()['node-1']?.result).toEqual(GENERATED_IMAGE_RUN.result);
    });
  });
});

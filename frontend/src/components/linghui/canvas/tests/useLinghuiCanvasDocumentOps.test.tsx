import React, { useEffect, useMemo, useRef, useState } from 'react';
import { act, render, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Edge, Node, ReactFlowInstance } from '@xyflow/react';
import type { LinghuiCanvasSelection, LinghuiImageNodeProperties, LinghuiNodeData } from '../../../../types/linghui';
import { createNewNodeData } from '../../library/state/linghuiNodeDefs';
import { useLinghuiCanvasDocumentOps } from '../hooks/useLinghuiCanvasDocumentOps';

interface DocumentOpsHarnessHandle {
  createDerivedImageToolNodeFromNode: ReturnType<typeof useLinghuiCanvasDocumentOps>['createDerivedImageToolNodeFromNode'];
  getNodes: () => Node[];
  getEdges: () => Edge[];
  getEditorSelection: () => LinghuiCanvasSelection;
}

function createSourceImageNode(): Node {
  const data = createNewNodeData('linghui/image', { label: '原图' });
  const properties = data.properties as unknown as LinghuiImageNodeProperties;
  return {
    id: 'source-image',
    type: 'linghui-image',
    position: { x: 100, y: 80 },
    width: 220,
    selected: true,
    data: {
      ...data,
      properties: {
        ...properties,
        mode: 'import',
        source: 'https://cdn.example.com/original.png',
        primaryResultSource: 'https://cdn.example.com/original.png',
        prompt: '原始提示词',
        ttiSelection: 'mock-model',
        aspectRatio: '3:4',
        resolution: 'auto',
        focusRegion: {
          x: 0.2,
          y: 0.2,
          width: 0.4,
          height: 0.4,
          source: 'https://cdn.example.com/original.png',
        },
        markPoints: [{
          id: 'mark-1',
          x: 0.5,
          y: 0.5,
          source: 'https://cdn.example.com/original.png',
        }],
      },
    } as unknown as Record<string, unknown>,
  };
}

function DocumentOpsHarness({
  onReady,
  scheduleSnapshot,
}: {
  onReady: (handle: DocumentOpsHarnessHandle) => void;
  scheduleSnapshot: () => void;
}) {
  const [nodes, setNodes] = useState<Node[]>([createSourceImageNode()]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [editorSelection, setEditorSelection] = useState<LinghuiCanvasSelection>({
    kind: 'node',
    nodeId: 'source-image',
    nodeType: 'linghui/image',
    label: '原图',
  });
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  const editorSelectionRef = useRef(editorSelection);
  const hostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  useEffect(() => {
    edgesRef.current = edges;
  }, [edges]);

  useEffect(() => {
    editorSelectionRef.current = editorSelection;
  }, [editorSelection]);

  const reactFlow = useMemo(() => ({
    getNodes: () => nodesRef.current,
    getEdges: () => edgesRef.current,
    getNode: (nodeId: string) => nodesRef.current.find(node => node.id === nodeId),
    screenToFlowPosition: (position: { x: number; y: number }) => position,
  }) as unknown as ReactFlowInstance, []);

  const ops = useLinghuiCanvasDocumentOps({
    reactFlow,
    hostRef,
    setNodes,
    setEdges,
    setEditorSelection,
    setContextMenu: vi.fn(),
    setQuickCreate: vi.fn(),
    setPendingGroupFrame: vi.fn(),
    pendingGroupFrame: null,
    scheduleSnapshot,
  });

  useEffect(() => {
    onReady({
      createDerivedImageToolNodeFromNode: ops.createDerivedImageToolNodeFromNode,
      getNodes: () => nodesRef.current,
      getEdges: () => edgesRef.current,
      getEditorSelection: () => editorSelectionRef.current,
    });
  }, [onReady, ops.createDerivedImageToolNodeFromNode]);

  return <div ref={hostRef} />;
}

describe('useLinghuiCanvasDocumentOps', () => {
  it('creates a selected executable image-to-image node for LibTV-style image tool presets', async () => {
    const scheduleSnapshot = vi.fn();
    let handle: DocumentOpsHarnessHandle | null = null;

    render(
      <DocumentOpsHarness
        scheduleSnapshot={scheduleSnapshot}
        onReady={nextHandle => {
          handle = nextHandle;
        }}
      />,
    );

    await waitFor(() => {
      expect(handle?.getNodes()).toHaveLength(1);
    });

    let createdId: string | null = null;
    act(() => {
      createdId = handle?.createDerivedImageToolNodeFromNode('source-image', {
        label: '原图 横向扩图',
        prompt: '原始提示词\n横向扩图，补足主体两侧环境。',
        properties: {
          aspectRatio: '16:9',
          resolution: '2K',
        },
      }) ?? null;
    });

    await waitFor(() => {
      expect(handle?.getNodes()).toHaveLength(2);
      expect(handle?.getEdges()).toHaveLength(1);
    });

    expect(createdId).toBeTruthy();
    const nodes = handle!.getNodes();
    const sourceNode = nodes.find(node => node.id === 'source-image');
    const createdNode = nodes.find(node => node.id === createdId);
    expect(sourceNode?.selected).toBe(false);
    expect(createdNode?.selected).toBe(true);
    expect(createdNode?.type).toBe('linghui-image');

    const createdData = createdNode?.data as unknown as LinghuiNodeData;
    const createdProps = createdData.properties as unknown as LinghuiImageNodeProperties;
    expect(createdData.label).toBe('原图 横向扩图');
    expect(createdProps).toEqual(expect.objectContaining({
      mode: 'generate',
      source: '',
      primaryResultSource: '',
      prompt: expect.stringContaining('横向扩图'),
      ttiSelection: 'mock-model',
      aspectRatio: '16:9',
      resolution: '2K',
      gridType: 'none',
      batchCount: 1,
      focusRegion: null,
      markPoints: [],
    }));

    expect(handle!.getEdges()[0]).toEqual(expect.objectContaining({
      source: 'source-image',
      target: createdId,
      sourceHandle: 'output-0',
      targetHandle: 'input-0',
      type: 'linghui-edge',
      data: {
        sourceSlotType: 'image',
        targetSlotType: 'image',
      },
    }));
    expect(handle!.getEditorSelection()).toBeNull();
    expect(scheduleSnapshot).toHaveBeenCalledTimes(1);
  });
});

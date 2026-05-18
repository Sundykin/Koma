import React, { useEffect, useMemo, useRef, useState } from 'react';
import { act, render, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Edge, Node, ReactFlowInstance } from '@xyflow/react';
import type {
  LinghuiAudioNodeProperties,
  LinghuiCanvasSelection,
  LinghuiImageNodeProperties,
  LinghuiNodeData,
  LinghuiStoryboardFrame,
  LinghuiTextNodeProperties,
  LinghuiVideoClipNodeProperties,
  LinghuiVideoNodeProperties,
} from '../../../../types/linghui';
import { createNewNodeData } from '../../library/state/linghuiNodeDefs';
import { useLinghuiCanvasDocumentOps } from '../hooks/useLinghuiCanvasDocumentOps';

interface DocumentOpsHarnessHandle {
  createDerivedImageToolNodeFromNode: ReturnType<typeof useLinghuiCanvasDocumentOps>['createDerivedImageToolNodeFromNode'];
  createDerivedVideoAnalysisNodeFromNode: ReturnType<typeof useLinghuiCanvasDocumentOps>['createDerivedVideoAnalysisNodeFromNode'];
  applyTextEmptyAction: ReturnType<typeof useLinghuiCanvasDocumentOps>['applyTextEmptyAction'];
  applyVideoEmptyAction: ReturnType<typeof useLinghuiCanvasDocumentOps>['applyVideoEmptyAction'];
  deriveStoryboardVideosFromScript: ReturnType<typeof useLinghuiCanvasDocumentOps>['deriveStoryboardVideosFromScript'];
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

function createSourceTextNode(): Node {
  const data = createNewNodeData('linghui/text', { label: '文本节点' });
  return {
    id: 'source-text',
    type: 'linghui-text',
    position: { x: 200, y: 120 },
    width: 280,
    selected: true,
    data: data as unknown as Record<string, unknown>,
  };
}

function createSourceVideoNode(): Node {
  const data = createNewNodeData('linghui/video', { label: '视频节点' });
  return {
    id: 'source-video',
    type: 'linghui-video',
    position: { x: 400, y: 200 },
    width: 320,
    selected: true,
    data: data as unknown as Record<string, unknown>,
  };
}

function createSourceStoryboardNode(): Node {
  const data = createNewNodeData('linghui/storyboard', { label: '故事板' });
  return {
    id: 'source-storyboard',
    type: 'linghui-storyboard',
    position: { x: 160, y: 120 },
    width: 760,
    selected: true,
    data: data as unknown as Record<string, unknown>,
  };
}

function DocumentOpsHarness({
  onReady,
  scheduleSnapshot,
  initialNodes = [createSourceImageNode()],
  initialSelection = {
    kind: 'node',
    nodeId: 'source-image',
    nodeType: 'linghui/image',
    label: '原图',
  } as LinghuiCanvasSelection,
}: {
  onReady: (handle: DocumentOpsHarnessHandle) => void;
  scheduleSnapshot: () => void;
  initialNodes?: Node[];
  initialSelection?: LinghuiCanvasSelection;
}) {
  const [nodes, setNodes] = useState<Node[]>(initialNodes);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [editorSelection, setEditorSelection] = useState<LinghuiCanvasSelection>(initialSelection);
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
      createDerivedVideoAnalysisNodeFromNode: ops.createDerivedVideoAnalysisNodeFromNode,
      applyTextEmptyAction: ops.applyTextEmptyAction,
      applyVideoEmptyAction: ops.applyVideoEmptyAction,
      deriveStoryboardVideosFromScript: ops.deriveStoryboardVideosFromScript,
      getNodes: () => nodesRef.current,
      getEdges: () => edgesRef.current,
      getEditorSelection: () => editorSelectionRef.current,
    });
  }, [
    onReady,
    ops.createDerivedImageToolNodeFromNode,
    ops.createDerivedVideoAnalysisNodeFromNode,
    ops.applyTextEmptyAction,
    ops.applyVideoEmptyAction,
    ops.deriveStoryboardVideosFromScript,
  ]);

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

  it('creates a selected text analysis node from a video resource tool', async () => {
    const scheduleSnapshot = vi.fn();
    let handle: DocumentOpsHarnessHandle | null = null;

    render(
      <DocumentOpsHarness
        scheduleSnapshot={scheduleSnapshot}
        initialNodes={[createSourceVideoNode()]}
        initialSelection={{ kind: 'node', nodeId: 'source-video', nodeType: 'linghui/video', label: '视频节点' }}
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
      createdId = handle?.createDerivedVideoAnalysisNodeFromNode('source-video', {
        label: '视频节点-解析',
        content: '# 视频解析\n\n镜头运动稳定。',
        source: '/tmp/source.mp4',
        durationSec: 8,
      }) ?? null;
    });

    await waitFor(() => {
      expect(handle?.getNodes()).toHaveLength(2);
      expect(handle?.getEdges()).toHaveLength(1);
    });

    const nodes = handle!.getNodes();
    const sourceNode = nodes.find(node => node.id === 'source-video');
    const createdNode = nodes.find(node => node.id === createdId);
    expect(sourceNode?.selected).toBe(false);
    expect(createdNode?.selected).toBe(true);
    expect(createdNode?.type).toBe('linghui-text');

    const createdData = createdNode?.data as unknown as LinghuiNodeData;
    const createdProps = createdData.properties as unknown as LinghuiTextNodeProperties;
    expect(createdData.label).toBe('视频节点-解析');
    expect(createdProps).toEqual(expect.objectContaining({
      mode: 'manual',
      content: expect.stringContaining('镜头运动稳定'),
      prompt: '',
      systemPrompt: '',
      llmSelection: '',
    }));
    expect(handle!.getEdges()[0]).toEqual(expect.objectContaining({
      source: 'source-video',
      target: createdId,
      sourceHandle: 'output-0',
      targetHandle: 'input-0',
      type: 'linghui-edge',
      data: {
        sourceSlotType: 'video',
        targetSlotType: 'text',
      },
    }));
    expect(scheduleSnapshot).toHaveBeenCalledTimes(1);
  });

  // ============================================================
  // LibTV TextNode EmptyState 4 actions（15gvxu:55145-55256 eJ/eY/eV/eW）
  // 详见 docs/libtv-text-node-deep-dive.md §3
  // ============================================================
  describe('applyTextEmptyAction (LibTV TextNode EmptyState)', () => {
    function renderTextHarness(scheduleSnapshot: () => void) {
      let handle: DocumentOpsHarnessHandle | null = null;
      render(
        <DocumentOpsHarness
          scheduleSnapshot={scheduleSnapshot}
          initialNodes={[createSourceTextNode()]}
          initialSelection={{ kind: 'node', nodeId: 'source-text', nodeType: 'linghui/text', label: '文本节点' }}
          onReady={next => { handle = next; }}
        />,
      );
      return () => handle!;
    }

    it("'edit' 切到 manual 模式 + 清空 content，不派生新节点", async () => {
      const scheduleSnapshot = vi.fn();
      const getHandle = renderTextHarness(scheduleSnapshot);
      await waitFor(() => expect(getHandle().getNodes()).toHaveLength(1));

      let resultId: string | null = null;
      act(() => {
        resultId = getHandle().applyTextEmptyAction('source-text', 'edit');
      });

      expect(resultId).toBe('source-text');
      const node = getHandle().getNodes().find(n => n.id === 'source-text');
      const props = (node?.data as unknown as LinghuiNodeData).properties as unknown as LinghuiTextNodeProperties;
      expect(props.mode).toBe('manual');
      expect(props.content).toBe('');
      expect(getHandle().getNodes()).toHaveLength(1);
      expect(getHandle().getEdges()).toHaveLength(0);
    });

    it("'video' 右侧派生 VideoNode + text→video 连线 + 选中新视频", async () => {
      const scheduleSnapshot = vi.fn();
      const getHandle = renderTextHarness(scheduleSnapshot);
      await waitFor(() => expect(getHandle().getNodes()).toHaveLength(1));

      let videoId: string | null = null;
      act(() => {
        videoId = getHandle().applyTextEmptyAction('source-text', 'video');
      });

      await waitFor(() => expect(getHandle().getNodes()).toHaveLength(2));
      expect(videoId).toBeTruthy();

      const videoNode = getHandle().getNodes().find(n => n.id === videoId);
      const textNode = getHandle().getNodes().find(n => n.id === 'source-text');
      expect(videoNode?.type).toBe('linghui-video');
      expect(videoNode?.selected).toBe(true);
      expect(textNode?.selected).toBe(false);
      // 右侧：x 大于源
      expect((videoNode!.position.x)).toBeGreaterThan((textNode!.position.x));

      // 当前文本节点切到 generate + 预填示例文本
      const textProps = (textNode?.data as unknown as LinghuiNodeData).properties as unknown as LinghuiTextNodeProperties;
      expect(textProps.mode).toBe('generate');
      expect(textProps.content.length).toBeGreaterThan(0);

      // VideoNode params.prompt 预填了 textToVideo.videoPrompt
      const videoProps = (videoNode?.data as unknown as LinghuiNodeData).properties as unknown as LinghuiVideoNodeProperties;
      expect(String(videoProps.prompt || '')).toContain('运镜');

      // 边方向 text → video
      const edges = getHandle().getEdges();
      expect(edges).toHaveLength(1);
      expect(edges[0]).toEqual(expect.objectContaining({
        source: 'source-text',
        target: videoId,
        type: 'linghui-edge',
      }));
    });

    it("'image-prompt' 左侧派生 ImageNode + 反向 image→text 连线 + 当前节点写反推 prompt", async () => {
      const scheduleSnapshot = vi.fn();
      const getHandle = renderTextHarness(scheduleSnapshot);
      await waitFor(() => expect(getHandle().getNodes()).toHaveLength(1));

      let imageId: string | null = null;
      act(() => {
        imageId = getHandle().applyTextEmptyAction('source-text', 'image-prompt');
      });

      await waitFor(() => expect(getHandle().getNodes()).toHaveLength(2));
      expect(imageId).toBeTruthy();

      const imageNode = getHandle().getNodes().find(n => n.id === imageId);
      const textNode = getHandle().getNodes().find(n => n.id === 'source-text');
      expect(imageNode?.type).toBe('linghui-image');
      // 左侧：x 小于源
      expect((imageNode!.position.x)).toBeLessThan((textNode!.position.x));

      // ImageNode 是 import 模式（对齐 LibTV IMAGE_RESOURCE）
      const imageProps = (imageNode?.data as unknown as LinghuiNodeData).properties as unknown as LinghuiImageNodeProperties;
      expect(imageProps.mode).toBe('import');

      // 文本节点切到 generate + 写反推图片描述 prompt
      const textProps = (textNode?.data as unknown as LinghuiNodeData).properties as unknown as LinghuiTextNodeProperties;
      expect(textProps.mode).toBe('generate');
      expect(textProps.prompt).toContain('请仔细观察输入图片');

      // ⚠ 边方向反向：image → text
      const edges = getHandle().getEdges();
      expect(edges).toHaveLength(1);
      expect(edges[0]).toEqual(expect.objectContaining({
        source: imageId,
        target: 'source-text',
      }));
    });

    it("'music' 右侧派生 AudioNode + text→audio 连线 + 当前节点写音乐 prompt", async () => {
      const scheduleSnapshot = vi.fn();
      const getHandle = renderTextHarness(scheduleSnapshot);
      await waitFor(() => expect(getHandle().getNodes()).toHaveLength(1));

      let audioId: string | null = null;
      act(() => {
        audioId = getHandle().applyTextEmptyAction('source-text', 'music');
      });

      await waitFor(() => expect(getHandle().getNodes()).toHaveLength(2));
      expect(audioId).toBeTruthy();

      const audioNode = getHandle().getNodes().find(n => n.id === audioId);
      const textNode = getHandle().getNodes().find(n => n.id === 'source-text');
      expect(audioNode?.type).toBe('linghui-audio');
      expect((audioNode!.position.x)).toBeGreaterThan((textNode!.position.x));

      // 文本写音乐 prompt
      const textProps = (textNode?.data as unknown as LinghuiNodeData).properties as unknown as LinghuiTextNodeProperties;
      expect(textProps.content).toContain('钢琴');

      // AudioNode prompt 透传 music prompt
      const audioProps = (audioNode?.data as unknown as LinghuiNodeData).properties as unknown as LinghuiAudioNodeProperties;
      expect(String(audioProps.prompt || '')).toContain('钢琴');

      const edges = getHandle().getEdges();
      expect(edges[0]).toEqual(expect.objectContaining({
        source: 'source-text',
        target: audioId,
      }));
    });

    it('非文本节点调用 → 返回 null，不修改图', async () => {
      const scheduleSnapshot = vi.fn();
      let handle: DocumentOpsHarnessHandle | null = null;
      render(
        <DocumentOpsHarness
          scheduleSnapshot={scheduleSnapshot}
          onReady={next => { handle = next; }}
        />,
      );
      await waitFor(() => expect(handle?.getNodes()).toHaveLength(1));

      let result: string | null = null;
      act(() => {
        result = handle!.applyTextEmptyAction('source-image', 'video');
      });
      expect(result).toBeNull();
      expect(handle!.getNodes()).toHaveLength(1);
      expect(handle!.getEdges()).toHaveLength(0);
    });
  });

  // ============================================================
  // LibTV VideoNode EmptyState 2 actions（15gvxu:192400-192509 iU/iO）
  // 详见 docs/libtv-video-node-deep-dive.md §3
  // ============================================================
  describe('applyVideoEmptyAction (LibTV VideoNode EmptyState)', () => {
    function renderVideoHarness(scheduleSnapshot: () => void) {
      let handle: DocumentOpsHarnessHandle | null = null;
      render(
        <DocumentOpsHarness
          scheduleSnapshot={scheduleSnapshot}
          initialNodes={[createSourceVideoNode()]}
          initialSelection={{ kind: 'node', nodeId: 'source-video', nodeType: 'linghui/video', label: '视频节点' }}
          onReady={next => { handle = next; }}
        />,
      );
      return () => handle!;
    }

    it("'first-frame' 左侧派生 1 个 ImageNode + image→video 边 + 写 image-to-video capability", async () => {
      const scheduleSnapshot = vi.fn();
      const getHandle = renderVideoHarness(scheduleSnapshot);
      await waitFor(() => expect(getHandle().getNodes()).toHaveLength(1));

      let imageId: string | null = null;
      act(() => {
        imageId = getHandle().applyVideoEmptyAction('source-video', 'first-frame');
      });

      await waitFor(() => expect(getHandle().getNodes()).toHaveLength(2));
      expect(imageId).toBeTruthy();

      const imageNode = getHandle().getNodes().find(n => n.id === imageId);
      const videoNode = getHandle().getNodes().find(n => n.id === 'source-video');
      expect(imageNode?.type).toBe('linghui-image');
      // 左侧：x 小于 video
      expect((imageNode!.position.x)).toBeLessThan((videoNode!.position.x));
      // focus 留在 video（LibTV 一致）
      expect(videoNode?.selected).toBe(true);

      // ImageNode 是 import 模式
      const imageProps = (imageNode?.data as unknown as LinghuiNodeData).properties as unknown as LinghuiImageNodeProperties;
      expect(imageProps.mode).toBe('import');

      // VideoNode 写默认 prompt + capability='video.image-to-video'
      const videoProps = (videoNode?.data as unknown as LinghuiNodeData).properties as unknown as LinghuiVideoNodeProperties;
      expect(videoProps.videoCapability).toBe('video.image-to-video');
      expect(videoProps.prompt).toContain('上游首帧');

      // 边方向 image → video
      const edges = getHandle().getEdges();
      expect(edges).toHaveLength(1);
      expect(edges[0]).toEqual(expect.objectContaining({
        source: imageId,
        target: 'source-video',
        type: 'linghui-edge',
      }));
    });

    it("'first-last-frame' 左侧派生 2 个 ImageNode（首帧+尾帧，垂直分布）+ 2 条 image→video 边", async () => {
      const scheduleSnapshot = vi.fn();
      const getHandle = renderVideoHarness(scheduleSnapshot);
      await waitFor(() => expect(getHandle().getNodes()).toHaveLength(1));

      let firstId: string | null = null;
      act(() => {
        firstId = getHandle().applyVideoEmptyAction('source-video', 'first-last-frame');
      });

      await waitFor(() => expect(getHandle().getNodes()).toHaveLength(3));
      expect(firstId).toBeTruthy();

      const allNodes = getHandle().getNodes();
      const videoNode = allNodes.find(n => n.id === 'source-video');
      const newImageNodes = allNodes.filter(n => n.id !== 'source-video');
      expect(newImageNodes).toHaveLength(2);
      expect(newImageNodes.every(n => n.type === 'linghui-image')).toBe(true);

      // 两张图都在 video 左侧
      newImageNodes.forEach(n => {
        expect(n.position.x).toBeLessThan(videoNode!.position.x);
      });
      // 垂直分布：一张高于 video，一张低于 video
      const ys = newImageNodes.map(n => n.position.y).sort((a, b) => a - b);
      expect(ys[0]).toBeLessThan(videoNode!.position.y);
      expect(ys[1]).toBeGreaterThan(videoNode!.position.y);

      // VideoNode capability='video.start-end-to-video'
      const videoProps = (videoNode?.data as unknown as LinghuiNodeData).properties as unknown as LinghuiVideoNodeProperties;
      expect(videoProps.videoCapability).toBe('video.start-end-to-video');
      expect(videoProps.prompt).toContain('首帧');

      // 2 条边都指向 video
      const edges = getHandle().getEdges();
      expect(edges).toHaveLength(2);
      expect(edges.every(e => e.target === 'source-video')).toBe(true);
    });

    it('非视频节点调用 → 返回 null，不修改图', async () => {
      const scheduleSnapshot = vi.fn();
      let handle: DocumentOpsHarnessHandle | null = null;
      render(
        <DocumentOpsHarness
          scheduleSnapshot={scheduleSnapshot}
          onReady={next => { handle = next; }}
        />,
      );
      await waitFor(() => expect(handle?.getNodes()).toHaveLength(1));

      let result: string | null = null;
      act(() => {
        result = handle!.applyVideoEmptyAction('source-image', 'first-frame');
      });
      expect(result).toBeNull();
      expect(handle!.getNodes()).toHaveLength(1);
      expect(handle!.getEdges()).toHaveLength(0);
    });
  });

  describe('deriveStoryboardVideosFromScript (LibTV video_group parity)', () => {
    const shots: LinghuiStoryboardFrame[] = [
      {
        id: 'shot-1',
        title: '镜头 1',
        description: '角色推门进入',
        durationSec: 4,
        image: { kind: 'image', source: 'https://cdn.example.com/shot-1.png' },
      },
      {
        id: 'shot-2',
        title: '镜头 2',
        description: '镜头切到反应',
        durationSec: 6,
        image: { kind: 'image', source: 'https://cdn.example.com/shot-2.png' },
      },
      {
        id: 'shot-3',
        title: '镜头 3',
        description: '远景展示空间',
        durationSec: 5,
      },
    ];

    it('creates a video group with child storyboard image/video nodes and a downstream clip node', async () => {
      const scheduleSnapshot = vi.fn();
      let handle: DocumentOpsHarnessHandle | null = null;
      render(
        <DocumentOpsHarness
          scheduleSnapshot={scheduleSnapshot}
          initialNodes={[createSourceStoryboardNode()]}
          initialSelection={{ kind: 'node', nodeId: 'source-storyboard', nodeType: 'linghui/storyboard', label: '故事板' }}
          onReady={next => { handle = next; }}
        />,
      );
      await waitFor(() => expect(handle?.getNodes()).toHaveLength(1));

      let videoIds: string[] = [];
      act(() => {
        videoIds = handle!.deriveStoryboardVideosFromScript('source-storyboard', shots);
      });

      await waitFor(() => {
        expect(handle?.getNodes().filter(node => node.type === 'group')).toHaveLength(1);
        expect(handle?.getNodes().filter(node => (node.data as unknown as LinghuiNodeData).linghuiType === 'linghui/video')).toHaveLength(3);
      });

      expect(videoIds).toHaveLength(3);
      const nodes = handle!.getNodes();
      const group = nodes.find(node => node.type === 'group');
      expect(group?.data).toEqual(expect.objectContaining({
        label: '视频组 · 故事板',
        sourceScriptNodeId: 'source-storyboard',
        storyboardGroupType: 'video',
      }));

      const imageNodes = nodes.filter(node => (node.data as unknown as LinghuiNodeData).linghuiType === 'linghui/image');
      const videoNodes = nodes.filter(node => (node.data as unknown as LinghuiNodeData).linghuiType === 'linghui/video');
      const clipNode = nodes.find(node => (node.data as unknown as LinghuiNodeData).linghuiType === 'linghui/video-clip');
      expect(imageNodes).toHaveLength(3);
      expect(videoNodes).toHaveLength(3);
      expect(clipNode).toBeTruthy();
      expect(imageNodes.every(node => node.parentId === group?.id)).toBe(true);
      expect(videoNodes.every(node => node.parentId === group?.id)).toBe(true);

      const firstImageProps = (imageNodes[0].data as unknown as LinghuiNodeData).properties as unknown as LinghuiImageNodeProperties;
      expect(firstImageProps.mode).toBe('import');
      expect(firstImageProps.source).toBe('https://cdn.example.com/shot-1.png');
      expect(firstImageProps.scriptDerivationKind).toBe('video-image');

      const firstVideoProps = (videoNodes[0].data as unknown as LinghuiNodeData).properties as unknown as LinghuiVideoNodeProperties;
      expect(firstVideoProps.prompt).toBe('角色推门进入');
      expect(firstVideoProps.duration).toBe(4);
      expect(firstVideoProps.scriptDerivationKind).toBe('video');

      const clipProps = (clipNode!.data as unknown as LinghuiNodeData).properties as unknown as LinghuiVideoClipNodeProperties;
      expect(clipProps.clips).toHaveLength(3);
      expect(clipProps.clips.map(clip => clip.id)).toEqual(videoNodes.map(node => node.id));
      expect(clipProps.scriptDerivationKind).toBe('video-clip');

      const edges = handle!.getEdges();
      expect(edges.some(edge => edge.source === 'source-storyboard' && edge.target === group?.id)).toBe(true);
      for (const imageNode of imageNodes) {
        expect(edges.some(edge => edge.source === 'source-storyboard' && edge.target === imageNode.id)).toBe(true);
      }
      for (const videoNode of videoNodes) {
        expect(edges.some(edge => edge.source === videoNode.id && edge.target === clipNode!.id)).toBe(true);
      }
      expect(scheduleSnapshot).toHaveBeenCalledTimes(1);
    });
  });
});

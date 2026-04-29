import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LinghuiExecutionContext, LinghuiExecutionQueueState } from '../../../../types/linghui';

vi.mock('../state/linghuiExecutionProviders', () => ({
  generateAudioWithProvider: vi.fn(),
  generateImageWithProvider: vi.fn(),
  generateImageVariantsWithProvider: vi.fn(),
  generateImagesWithProvider: vi.fn(),
  generateTextWithProvider: vi.fn(),
  generateVideoWithProvider: vi.fn(),
}));

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
}

function cloneQueueState(queue: LinghuiExecutionQueueState): LinghuiExecutionQueueState {
  return {
    ...queue,
    targetNodeIds: [...queue.targetNodeIds],
    queuedNodeIds: [...queue.queuedNodeIds],
    runningNodeIds: [...queue.runningNodeIds],
    completedNodeIds: [...queue.completedNodeIds],
    failedNodeIds: [...queue.failedNodeIds],
    canceledNodeIds: [...queue.canceledNodeIds],
  };
}

function createTextNode(params: {
  id: string;
  label: string;
  prompt: string;
  x: number;
  y?: number;
}): LinghuiExecutionContext['nodes'][number] {
  return {
    id: params.id,
    type: 'linghui-text',
    position: { x: params.x, y: params.y ?? 0 },
    data: {
      linghuiType: 'linghui/text',
      label: params.label,
      accent: '#f59e0b',
      background: '#0f1720',
      properties: {
        mode: 'generate',
        content: '',
        prompt: params.prompt,
        systemPrompt: '',
        llmSelection: 'channel-llm::model-llm',
      },
      inputs: [
        { name: '图片参考', dataType: 'image' },
        { name: '文本输入', dataType: 'text' },
        { name: '视频参考', dataType: 'video' },
        { name: '音频参考', dataType: 'audio' },
      ],
      outputs: [{ name: 'text', dataType: 'text' }],
      active: false,
    },
  };
}

describe('executeLinghuiWorkflow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('只执行视频节点时也能消费导入图片节点作为图生视频主图', async () => {
    const { executeLinghuiWorkflow } = await import('../state/linghuiExecutionWorkflow');
    const executionProviders = await import('../state/linghuiExecutionProviders');

    vi.mocked(executionProviders.generateVideoWithProvider).mockResolvedValue({
      kind: 'video',
      source: 'https://cdn.example.com/out.mp4',
      posterSource: '/tmp/cell_01.png',
    } as any);

    const context: LinghuiExecutionContext = {
      nodes: [
        {
          id: 'image-import-node',
          type: 'linghui-image',
          position: { x: 0, y: 0 },
          data: {
            linghuiType: 'linghui/image',
            label: '图片 1',
            accent: '#4ade80',
            background: '#0f1720',
            properties: {
              mode: 'import',
              source: '/tmp/cell_01.png',
              items: [
                {
                  id: 'asset-1',
                  source: '/tmp/cell_01.png',
                  label: '图片 1',
                  width: 1128,
                  height: 616,
                  aspectRatio: '141:77',
                },
              ],
              primaryAssetId: 'asset-1',
              primaryResultSource: '',
              prompt: '',
              ttiSelection: '',
              aspectRatio: '16:9',
              resolution: 'auto',
              gridType: 'none',
              batchCount: 1,
            },
            inputs: [],
            outputs: [{ name: 'image', dataType: 'image' }],
            active: false,
          },
        },
        {
          id: 'video-node',
          type: 'linghui-video',
          position: { x: 400, y: 0 },
          data: {
            linghuiType: 'linghui/video',
            label: '视频',
            accent: '#22c55e',
            background: '#0f1720',
            properties: {
              prompt: '让图片里的猫咪慢慢起床',
              itvSelection: '',
              source: '',
              posterSource: '',
              videoCapability: 'video.image-to-video',
              aspectRatio: '16:9',
              resolution: '720p',
              duration: 5,
            },
            inputs: [
              { name: '参考', dataType: 'image' },
              { name: '文本', dataType: 'text' },
              { name: '音频', dataType: 'audio' },
              { name: '视频', dataType: 'video' },
            ],
            outputs: [{ name: 'video', dataType: 'video' }],
            active: false,
          },
        },
      ],
      edges: [
        {
          id: 'edge-image-video',
          source: 'image-import-node',
          target: 'video-node',
          sourceHandle: 'output-0',
          targetHandle: 'input-0',
          type: 'linghui-edge',
          data: {
            sourceSlotType: 'image',
            targetSlotType: 'image',
          },
        },
      ],
      nodeOutputs: {},
    };

    const result = await executeLinghuiWorkflow({
      context,
      targetNodeIds: ['video-node'],
      resolveTargetsOnly: true,
      previousRuns: {},
    });

    expect(executionProviders.generateVideoWithProvider).toHaveBeenCalledWith(
      expect.objectContaining({
        capability: 'video.image-to-video',
        primaryImageSource: '/tmp/cell_01.png',
      }),
    );
    expect(result.runs['video-node']?.status).toBe('succeeded');
  });

  it('显式多角度节点即使填写了 prompt，缺少上游图片时也不会静默回退', async () => {
    const { executeLinghuiWorkflow } = await import('../state/linghuiExecutionWorkflow');
    const executionProviders = await import('../state/linghuiExecutionProviders');

    const context: LinghuiExecutionContext = {
      nodes: [
        {
          id: 'image-node',
          type: 'linghui-image',
          position: { x: 0, y: 0 },
          data: {
            linghuiType: 'linghui/image',
            label: '图片 2',
            accent: '#4ade80',
            background: '#0f1720',
            properties: {
              mode: 'generate',
              source: '',
              items: [],
              primaryAssetId: '',
              primaryResultSource: '',
              prompt: '宫崎骏风格，一个清秀少年，穿着破衣烂衫，拿着灰色瓦罐',
              ttiSelection: 'channel-tti::model-tti',
              aspectRatio: '3:4',
              resolution: 'auto',
              gridType: 'none',
              batchCount: 1,
              multiAngle: {
                enabled: true,
                azimuth: 45,
                elevation: 30,
                distance: 1.8,
                ttiSelection: 'channel-i2i::model-i2i',
                promptProtocol: 'sks-camera-v1',
                endpointPath: '/v1/images/multi-angle',
              },
            },
            inputs: [
              { name: '参考', dataType: 'image' },
              { name: '文本', dataType: 'text' },
            ],
            outputs: [{ name: 'image', dataType: 'image' }],
            active: false,
          },
        },
      ],
      edges: [],
      nodeOutputs: {},
    };

    const result = await executeLinghuiWorkflow({
      context,
      targetNodeIds: ['image-node'],
      resolveTargetsOnly: true,
      previousRuns: {},
    });

    expect(executionProviders.generateImageWithProvider).not.toHaveBeenCalled();
    expect(result.runs['image-node']?.status).toBe('failed');
    expect(result.runs['image-node']?.error).toBe('多角度生图需要先连接一张上游图片');
  });

  it('真正的多角度节点缺少上游图片时仍然返回明确错误', async () => {
    const { executeLinghuiWorkflow } = await import('../state/linghuiExecutionWorkflow');
    const executionProviders = await import('../state/linghuiExecutionProviders');

    const context: LinghuiExecutionContext = {
      nodes: [
        {
          id: 'multi-angle-node',
          type: 'linghui-image',
          position: { x: 0, y: 0 },
          data: {
            linghuiType: 'linghui/image',
            label: '图片 1 多角度',
            accent: '#4ade80',
            background: '#0f1720',
            properties: {
              mode: 'generate',
              source: '',
              items: [],
              primaryAssetId: '',
              primaryResultSource: '',
              prompt: '',
              ttiSelection: 'channel-tti::model-tti',
              aspectRatio: '3:4',
              resolution: 'auto',
              gridType: 'none',
              batchCount: 1,
              multiAngle: {
                enabled: true,
                azimuth: 45,
                elevation: 30,
                distance: 1.8,
                ttiSelection: 'channel-i2i::model-i2i',
                promptProtocol: 'sks-camera-v1',
                endpointPath: '/v1/images/multi-angle',
              },
            },
            inputs: [
              { name: '参考', dataType: 'image' },
              { name: '文本', dataType: 'text' },
            ],
            outputs: [{ name: 'image', dataType: 'image' }],
            active: false,
          },
        },
      ],
      edges: [],
      nodeOutputs: {},
    };

    const result = await executeLinghuiWorkflow({
      context,
      targetNodeIds: ['multi-angle-node'],
      resolveTargetsOnly: true,
      previousRuns: {},
    });

    expect(executionProviders.generateImageWithProvider).not.toHaveBeenCalled();
    expect(result.runs['multi-angle-node']?.status).toBe('failed');
    expect(result.runs['multi-angle-node']?.error).toBe('多角度生图需要先连接一张上游图片');
  });

  it('待执行子图存在环时会直接报出循环依赖错误', async () => {
    const { executeLinghuiWorkflow } = await import('../state/linghuiExecutionWorkflow');
    const executionProviders = await import('../state/linghuiExecutionProviders');

    const context: LinghuiExecutionContext = {
      nodes: [
        {
          id: 'text-node-a',
          type: 'linghui-text',
          position: { x: 0, y: 0 },
          data: {
            linghuiType: 'linghui/text',
            label: '文本 A',
            accent: '#f59e0b',
            background: '#0f1720',
            properties: {
              mode: 'generate',
              content: '',
              prompt: 'A',
              systemPrompt: '',
              llmSelection: '',
            },
            inputs: [
              { name: '图片参考', dataType: 'image' },
              { name: '文本输入', dataType: 'text' },
              { name: '视频参考', dataType: 'video' },
              { name: '音频参考', dataType: 'audio' },
            ],
            outputs: [{ name: 'text', dataType: 'text' }],
            active: false,
          },
        },
        {
          id: 'text-node-b',
          type: 'linghui-text',
          position: { x: 320, y: 0 },
          data: {
            linghuiType: 'linghui/text',
            label: '文本 B',
            accent: '#f59e0b',
            background: '#0f1720',
            properties: {
              mode: 'generate',
              content: '',
              prompt: 'B',
              systemPrompt: '',
              llmSelection: '',
            },
            inputs: [
              { name: '图片参考', dataType: 'image' },
              { name: '文本输入', dataType: 'text' },
              { name: '视频参考', dataType: 'video' },
              { name: '音频参考', dataType: 'audio' },
            ],
            outputs: [{ name: 'text', dataType: 'text' }],
            active: false,
          },
        },
      ],
      edges: [
        {
          id: 'edge-a-b',
          source: 'text-node-a',
          target: 'text-node-b',
          sourceHandle: 'output-0',
          targetHandle: 'input-1',
          type: 'linghui-edge',
          data: {
            sourceSlotType: 'text',
            targetSlotType: 'text',
          },
        },
        {
          id: 'edge-b-a',
          source: 'text-node-b',
          target: 'text-node-a',
          sourceHandle: 'output-0',
          targetHandle: 'input-1',
          type: 'linghui-edge',
          data: {
            sourceSlotType: 'text',
            targetSlotType: 'text',
          },
        },
      ],
      nodeOutputs: {},
    };

    await expect(executeLinghuiWorkflow({
      context,
      targetNodeIds: ['text-node-a'],
      previousRuns: {},
    })).rejects.toThrow('工作流存在循环依赖');

    expect(executionProviders.generateTextWithProvider).not.toHaveBeenCalled();
  });

  it('执行上下文中的 settingsSnapshot 会透传给节点 provider 调用', async () => {
    const { executeLinghuiWorkflow } = await import('../state/linghuiExecutionWorkflow');
    const executionProviders = await import('../state/linghuiExecutionProviders');
    const settingsSnapshot = {
      channelConfigs: [],
      mediaDefaults: {
        llm: {
          channelId: 'channel-llm',
          modelId: 'model-llm',
        },
      },
      promptTemplates: {},
    };

    vi.mocked(executionProviders.generateTextWithProvider).mockResolvedValue('结构化文本结果');

    const context: LinghuiExecutionContext = {
      nodes: [
        {
          id: 'text-generate-node',
          type: 'linghui-text',
          position: { x: 0, y: 0 },
          data: {
            linghuiType: 'linghui/text',
            label: '文本节点',
            accent: '#4ade80',
            background: '#0f1720',
            properties: {
              mode: 'generate',
              content: '',
              prompt: '生成一段旁白',
              systemPrompt: '',
              llmSelection: 'channel-llm::model-llm',
            },
            inputs: [],
            outputs: [{ name: 'text', dataType: 'text' }],
            active: false,
          },
        },
      ],
      edges: [],
      nodeOutputs: {},
      settingsSnapshot,
    };

    const result = await executeLinghuiWorkflow({
      context,
      targetNodeIds: ['text-generate-node'],
      resolveTargetsOnly: true,
      previousRuns: {},
    });

    expect(executionProviders.generateTextWithProvider).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: '生成一段旁白',
        llmSelection: 'channel-llm::model-llm',
        settingsSnapshot,
      }),
    );
    expect(result.runs['text-generate-node']?.status).toBe('succeeded');
  });

  it('同层独立节点会并发启动，并在上游全部完成后才执行下游节点', async () => {
    const { executeLinghuiWorkflow } = await import('../state/linghuiExecutionWorkflow');
    const executionProviders = await import('../state/linghuiExecutionProviders');

    const upstreamA = createDeferred<string>();
    const upstreamB = createDeferred<string>();
    vi.mocked(executionProviders.generateTextWithProvider).mockImplementation(async ({ prompt }) => {
      if (prompt.includes('上游 A')) {
        return upstreamA.promise;
      }
      if (prompt.includes('上游 B')) {
        return upstreamB.promise;
      }
      if (prompt.includes('汇总 C')) {
        return '结果 C';
      }
      throw new Error(`unexpected prompt: ${prompt}`);
    });

    const queueSnapshots: LinghuiExecutionQueueState[] = [];
    const context: LinghuiExecutionContext = {
      nodes: [
        createTextNode({ id: 'text-node-a', label: '上游 A', prompt: '上游 A', x: 0 }),
        createTextNode({ id: 'text-node-b', label: '上游 B', prompt: '上游 B', x: 240 }),
        createTextNode({ id: 'text-node-c', label: '下游 C', prompt: '汇总 C', x: 520 }),
      ],
      edges: [
        {
          id: 'edge-a-c',
          source: 'text-node-a',
          target: 'text-node-c',
          sourceHandle: 'output-0',
          targetHandle: 'input-1',
          type: 'linghui-edge',
          data: {
            sourceSlotType: 'text',
            targetSlotType: 'text',
          },
        },
        {
          id: 'edge-b-c',
          source: 'text-node-b',
          target: 'text-node-c',
          sourceHandle: 'output-0',
          targetHandle: 'input-1',
          type: 'linghui-edge',
          data: {
            sourceSlotType: 'text',
            targetSlotType: 'text',
          },
        },
      ],
      nodeOutputs: {},
    };

    const workflowPromise = executeLinghuiWorkflow({
      context,
      previousRuns: {},
      onQueueChange(queue) {
        queueSnapshots.push(cloneQueueState(queue));
      },
    });

    await vi.waitFor(() => {
      expect(executionProviders.generateTextWithProvider).toHaveBeenCalledTimes(2);
    });

    const firstLayerPrompts = vi.mocked(executionProviders.generateTextWithProvider).mock.calls
      .slice(0, 2)
      .map(call => call[0]?.prompt ?? '');
    expect(firstLayerPrompts.some(prompt => prompt.includes('上游 A'))).toBe(true);
    expect(firstLayerPrompts.some(prompt => prompt.includes('上游 B'))).toBe(true);
    expect(vi.mocked(executionProviders.generateTextWithProvider)).toHaveBeenCalledTimes(2);

    const parallelSnapshot = queueSnapshots.find(queue => (
      queue.runningNodeIds.length === 2
      && queue.runningNodeIds.includes('text-node-a')
      && queue.runningNodeIds.includes('text-node-b')
      && queue.queuedNodeIds.includes('text-node-c')
    ));
    expect(parallelSnapshot).toBeTruthy();

    upstreamA.resolve('结果 A');
    await Promise.resolve();
    expect(vi.mocked(executionProviders.generateTextWithProvider)).toHaveBeenCalledTimes(2);

    upstreamB.resolve('结果 B');
    await vi.waitFor(() => {
      expect(vi.mocked(executionProviders.generateTextWithProvider)).toHaveBeenCalledTimes(3);
    });

    expect(vi.mocked(executionProviders.generateTextWithProvider).mock.calls[2]?.[0]?.prompt).toContain('汇总 C');

    const result = await workflowPromise;
    expect(result.runs['text-node-a']?.status).toBe('succeeded');
    expect(result.runs['text-node-b']?.status).toBe('succeeded');
    expect(result.runs['text-node-c']?.status).toBe('succeeded');
    expect(result.queue.completedNodeIds).toEqual(expect.arrayContaining([
      'text-node-a',
      'text-node-b',
      'text-node-c',
    ]));
  });

  it('并行层中的单个分支失败时不会中断其他独立分支', async () => {
    const { executeLinghuiWorkflow } = await import('../state/linghuiExecutionWorkflow');
    const executionProviders = await import('../state/linghuiExecutionProviders');

    vi.mocked(executionProviders.generateTextWithProvider).mockImplementation(async ({ prompt }) => {
      if (prompt.includes('上游 A')) {
        throw new Error('A 分支失败');
      }
      if (prompt.includes('上游 B')) {
        return '结果 B';
      }
      if (prompt.includes('下游 D')) {
        return '结果 D';
      }
      if (prompt.includes('下游 C')) {
        return '结果 C';
      }
      throw new Error(`unexpected prompt: ${prompt}`);
    });

    const context: LinghuiExecutionContext = {
      nodes: [
        createTextNode({ id: 'text-node-a', label: '上游 A', prompt: '上游 A', x: 0 }),
        createTextNode({ id: 'text-node-b', label: '上游 B', prompt: '上游 B', x: 240 }),
        createTextNode({ id: 'text-node-c', label: '下游 C', prompt: '下游 C', x: 520 }),
        createTextNode({ id: 'text-node-d', label: '下游 D', prompt: '下游 D', x: 760 }),
      ],
      edges: [
        {
          id: 'edge-a-c',
          source: 'text-node-a',
          target: 'text-node-c',
          sourceHandle: 'output-0',
          targetHandle: 'input-1',
          type: 'linghui-edge',
          data: {
            sourceSlotType: 'text',
            targetSlotType: 'text',
          },
        },
        {
          id: 'edge-b-d',
          source: 'text-node-b',
          target: 'text-node-d',
          sourceHandle: 'output-0',
          targetHandle: 'input-1',
          type: 'linghui-edge',
          data: {
            sourceSlotType: 'text',
            targetSlotType: 'text',
          },
        },
      ],
      nodeOutputs: {},
    };

    const result = await executeLinghuiWorkflow({
      context,
      previousRuns: {},
    });

    expect(result.runs['text-node-a']?.status).toBe('failed');
    expect(result.runs['text-node-a']?.error).toBe('A 分支失败');
    expect(result.runs['text-node-b']?.status).toBe('succeeded');
    expect(result.runs['text-node-c']).toEqual(expect.objectContaining({
      status: 'failed',
      error: '上游节点执行失败',
    }));
    expect(result.runs['text-node-d']?.status).toBe('succeeded');
    expect(vi.mocked(executionProviders.generateTextWithProvider)).not.toHaveBeenCalledWith(
      expect.objectContaining({ prompt: expect.stringContaining('下游 C') }),
    );
  });

  it('取消并行层时会同时标记运行中和未开始的节点', async () => {
    const { executeLinghuiWorkflow } = await import('../state/linghuiExecutionWorkflow');
    const executionProviders = await import('../state/linghuiExecutionProviders');

    vi.mocked(executionProviders.generateTextWithProvider).mockImplementation(({ prompt, signal }) => {
      if (prompt.includes('汇总 C')) {
        return Promise.resolve('结果 C');
      }
      return new Promise<string>((_resolve, reject) => {
        signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
      });
    });

    const controller = new AbortController();
    const context: LinghuiExecutionContext = {
      nodes: [
        createTextNode({ id: 'text-node-a', label: '上游 A', prompt: '上游 A', x: 0 }),
        createTextNode({ id: 'text-node-b', label: '上游 B', prompt: '上游 B', x: 240 }),
        createTextNode({ id: 'text-node-c', label: '下游 C', prompt: '汇总 C', x: 520 }),
      ],
      edges: [
        {
          id: 'edge-a-c',
          source: 'text-node-a',
          target: 'text-node-c',
          sourceHandle: 'output-0',
          targetHandle: 'input-1',
          type: 'linghui-edge',
          data: {
            sourceSlotType: 'text',
            targetSlotType: 'text',
          },
        },
        {
          id: 'edge-b-c',
          source: 'text-node-b',
          target: 'text-node-c',
          sourceHandle: 'output-0',
          targetHandle: 'input-1',
          type: 'linghui-edge',
          data: {
            sourceSlotType: 'text',
            targetSlotType: 'text',
          },
        },
      ],
      nodeOutputs: {},
    };

    const workflowPromise = executeLinghuiWorkflow({
      context,
      previousRuns: {},
      signal: controller.signal,
    });

    await vi.waitFor(() => {
      expect(executionProviders.generateTextWithProvider).toHaveBeenCalledTimes(2);
    });

    controller.abort('user abort');

    const result = await workflowPromise;
    expect(result.queue.status).toBe('canceled');
    expect(result.queue.canceledNodeIds).toEqual(expect.arrayContaining([
      'text-node-a',
      'text-node-b',
      'text-node-c',
    ]));
    expect(result.runs['text-node-a']?.message).toBe('执行已取消');
    expect(result.runs['text-node-b']?.message).toBe('执行已取消');
    expect(vi.mocked(executionProviders.generateTextWithProvider)).toHaveBeenCalledTimes(2);
  });
});

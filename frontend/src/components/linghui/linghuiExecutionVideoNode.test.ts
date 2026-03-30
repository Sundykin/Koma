import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExecutionNodeView } from './linghuiExecutionShared';
import type { LinghuiNodeResult } from '../../types/linghui';

vi.mock('./linghuiExecutionProviders', () => ({
  generateAudioWithProvider: vi.fn(),
  generateImageWithProvider: vi.fn(),
  generateTextWithProvider: vi.fn(),
  generateVideoWithProvider: vi.fn(),
}));

function createNode(params?: {
  capability?: 'video.text-to-video' | 'video.image-to-video' | 'video.reference-to-video' | 'video.start-end-to-video';
  prompt?: string;
  itvSelection?: string;
  slot0?: LinghuiNodeResult[];
  slot1?: LinghuiNodeResult[];
  slot2?: LinghuiNodeResult[];
  slot3?: LinghuiNodeResult[];
}): ExecutionNodeView {
  const slot0 = params?.slot0 ?? [];
  const slot1 = params?.slot1 ?? [];
  const slot2 = params?.slot2 ?? [];
  const slot3 = params?.slot3 ?? [];

  return {
    id: 'video-node-1',
    type: 'linghui/video',
    title: '视频节点',
    properties: {
      source: '',
      posterSource: '',
      prompt: params?.prompt ?? '主提示词',
      itvSelection: params?.itvSelection ?? 'vidu-main::vidu-model-a',
      videoCapability: params?.capability ?? 'video.reference-to-video',
      duration: 6,
      aspectRatio: '16:9',
      resolution: '720p',
    },
    getAllInputResults(slot) {
      if (slot === 0) return slot0;
      if (slot === 1) return slot1;
      if (slot === 2) return slot2;
      if (slot === 3) return slot3;
      return [];
    },
    getAllInputImages() {
      return slot0;
    },
    getInputResult(slot) {
      if (slot === 2) return slot2[0];
      return undefined;
    },
    getPromptReferences() {
      return [
        {
          id: 'ref-image-1',
          nodeId: 'image-node-1',
          kind: 'image',
          name: '图1',
          source: 'https://cdn.example.com/ref-1.png',
        },
        {
          id: 'ref-video-poster',
          nodeId: 'video-upstream-1',
          kind: 'video',
          name: '视频封面',
          source: 'https://cdn.example.com/poster-1.png',
        },
      ];
    },
  };
}

describe('executeVideoNode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('会把灵绘视频节点编译为能力级标准请求并透传上下文', async () => {
    const { executeVideoNode } = await import('./linghuiExecutionNodeExecutors');
    const executionProviders = await import('./linghuiExecutionProviders');

    vi.mocked(executionProviders.generateVideoWithProvider).mockResolvedValue({
      kind: 'video',
      source: 'https://cdn.example.com/out.mp4',
      posterSource: 'https://cdn.example.com/poster-out.png',
      metadata: { taskId: 'task-1' },
    } as any);

    const node = createNode({
      capability: 'video.reference-to-video',
      slot0: [
        {
          kind: 'image',
          primary: { kind: 'image', source: 'https://cdn.example.com/ref-1.png' },
        },
        {
          kind: 'image',
          primary: { kind: 'image', source: 'https://cdn.example.com/ref-2.png' },
        },
      ],
      slot1: [
        {
          kind: 'text',
          text: '夜色都市，雨后路面反光',
        },
      ],
      slot2: [
        {
          kind: 'audio',
          primary: { kind: 'audio', source: 'https://cdn.example.com/voice.mp3' },
          metadata: { description: '旁白：镜头缓慢推进' },
        },
      ],
      slot3: [
        {
          kind: 'video',
          primary: {
            kind: 'video',
            source: 'https://cdn.example.com/ref-video.mp4',
            posterSource: 'https://cdn.example.com/poster-1.png',
          },
        },
      ],
    });

    const result = await executeVideoNode(node);

    expect(executionProviders.generateVideoWithProvider).toHaveBeenCalledWith(
      expect.objectContaining({
        capability: 'video.reference-to-video',
        itvSelection: 'vidu-main::vidu-model-a',
        referenceImageSources: [
          'https://cdn.example.com/ref-1.png',
          'https://cdn.example.com/ref-2.png',
          'https://cdn.example.com/poster-1.png',
        ],
        prompt: '夜色都市，雨后路面反光\n\n旁白：镜头缓慢推进\n\n主提示词',
      }),
    );
    expect(result.metadata).toEqual(
      expect.objectContaining({
        capability: 'video.reference-to-video',
        audioSource: 'https://cdn.example.com/voice.mp3',
        visualReferenceCount: 3,
        imageReferenceCount: 2,
        videoReferenceCount: 1,
      }),
    );
  });

  it('能力输入不满足契约时会阻止执行并返回明确错误', async () => {
    const { executeVideoNode } = await import('./linghuiExecutionNodeExecutors');
    const executionProviders = await import('./linghuiExecutionProviders');

    const node = createNode({
      capability: 'video.start-end-to-video',
      slot0: [
        {
          kind: 'image',
          primary: { kind: 'image', source: 'https://cdn.example.com/only-one-frame.png' },
        },
      ],
    });

    await expect(executeVideoNode(node)).rejects.toThrow('首尾帧视频需要同时提供首帧和尾帧');
    expect(executionProviders.generateVideoWithProvider).not.toHaveBeenCalled();
  });

  it('模型不支持当前能力时保留原始失败提示', async () => {
    const { executeVideoNode } = await import('./linghuiExecutionNodeExecutors');
    const executionProviders = await import('./linghuiExecutionProviders');

    vi.mocked(executionProviders.generateVideoWithProvider).mockRejectedValue(
      new Error('当前视频模型不支持参考生视频'),
    );

    const node = createNode({
      capability: 'video.reference-to-video',
      slot0: [
        {
          kind: 'image',
          primary: { kind: 'image', source: 'https://cdn.example.com/ref-1.png' },
        },
      ],
    });

    await expect(executeVideoNode(node)).rejects.toThrow('当前视频模型不支持参考生视频');
  });
});

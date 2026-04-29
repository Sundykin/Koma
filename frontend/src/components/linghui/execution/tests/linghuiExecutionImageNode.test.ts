import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExecutionNodeView } from '../state/linghuiExecutionShared';

const { analyzeLinghuiImageBatchSimilarityMock } = vi.hoisted(() => ({
  analyzeLinghuiImageBatchSimilarityMock: vi.fn(),
}));

vi.mock('../state/linghuiExecutionProviders', () => ({
  generateAudioWithProvider: vi.fn(),
  generateImageWithProvider: vi.fn(),
  generateImagesWithProvider: vi.fn(),
  generateImageVariantsWithProvider: vi.fn(),
  generateTextWithProvider: vi.fn(),
  generateVideoWithProvider: vi.fn(),
}));

vi.mock('../state/linghuiImageSimilarity', () => ({
  analyzeLinghuiImageBatchSimilarity: (...args: unknown[]) => analyzeLinghuiImageBatchSimilarityMock(...args),
}));

function createNode(
  batchCount: number,
  options: {
    prompt?: string;
    inputImages?: ReturnType<ExecutionNodeView['getAllInputImages']>;
    promptReferences?: ReturnType<ExecutionNodeView['getPromptReferences']>;
  } = {},
): ExecutionNodeView {
  const {
    prompt = '主提示词',
    inputImages = [],
    promptReferences = [],
  } = options;

  return {
    id: 'image-node-1',
    type: 'linghui/image',
    title: '图片节点',
    properties: {
      mode: 'generate',
      source: '',
      prompt,
      ttiSelection: 'channel-image::model-image',
      batchCount,
    },
    getAllInputResults() {
      return [];
    },
    getAllInputImages() {
      return inputImages;
    },
    getInputResult() {
      return undefined;
    },
    getPromptReferences() {
      return promptReferences;
    },
  };
}

describe('executeImageNode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    analyzeLinghuiImageBatchSimilarityMock.mockResolvedValue({
      status: 'ok',
      duplicates: [],
      comparedCount: 4,
    });
  });

  it('batchCount=4 时走并发 variants 批量请求，并为每张候选生成独立 prompt', async () => {
    const { executeImageNode } = await import('../state/linghuiExecutionNodeExecutors');
    const executionProviders = await import('../state/linghuiExecutionProviders');

    vi.mocked(executionProviders.generateImageVariantsWithProvider).mockResolvedValue([
      { kind: 'image', source: 'https://cdn.example.com/1.png', label: '#1' } as any,
      { kind: 'image', source: 'https://cdn.example.com/2.png', label: '#2' } as any,
      { kind: 'image', source: 'https://cdn.example.com/3.png', label: '#3' } as any,
      { kind: 'image', source: 'https://cdn.example.com/4.png', label: '#4' } as any,
    ]);

    const result = await executeImageNode(createNode(4));

    expect(executionProviders.generateImageVariantsWithProvider).toHaveBeenCalledTimes(1);
    const batchCall = vi.mocked(executionProviders.generateImageVariantsWithProvider).mock.calls[0]?.[0];
    expect(batchCall).toEqual(expect.objectContaining({
      ttiSelection: 'channel-image::model-image',
      placeholderTitle: '图片节点',
    }));
    expect(batchCall?.variants).toHaveLength(4);
    expect(batchCall?.variants.map(variant => variant.label)).toEqual(['#1', '#2', '#3', '#4']);

    const prompts = batchCall?.variants.map(variant => variant.prompt) ?? [];
    const identityBlueprintKeywords = [
      ['long oval face shape', 'almond eyes', 'narrow nose bridge', 'thin lips', 'refined jawline'],
      ['rounder heart-shaped face', 'large round eyes', 'small button nose', 'fuller lips', 'soft tapered jawline'],
      ['square face shape', 'deep-set eyes', 'prominent straight nose bridge', 'firm mouth', 'strong jawline'],
      ['sharp V-shaped face', 'upturned eyes', 'refined narrow nose bridge', 'medium lips', 'pointed chin'],
    ];

    expect(new Set(prompts).size).toBe(4);
    prompts.forEach((variantPrompt, index) => {
      const candidateIndex = index + 1;
      expect(variantPrompt).toContain('主提示词');
      expect(variantPrompt).toContain(`Linghui draw candidate #${candidateIndex}`);
      expect(variantPrompt).toContain(`This request generates candidate #${candidateIndex} only`);
      expect(variantPrompt).toContain(`candidate #${candidateIndex}`);
      expect(variantPrompt).toContain('distinct facial identity');
      expect(variantPrompt).toContain('do not reuse the same face template');
      expect(variantPrompt).toContain('face shape');
      expect(variantPrompt).toContain('eye shape');
      expect(variantPrompt).toContain('nose');
      expect(variantPrompt).toContain('mouth');
      expect(variantPrompt).toContain('jawline');
      expect(variantPrompt).toContain(`Variation option ${candidateIndex}`);
      expect(variantPrompt).toContain('This request generates exactly one candidate image only.');
      expect(variantPrompt).toContain('Do not create a grid, collage, contact sheet');
      expect(variantPrompt).toContain('no multi-panel');
      expect(variantPrompt).toContain('no identical clone');
      expect(variantPrompt).toContain('no same face repeated');
    });
    identityBlueprintKeywords.forEach((keywords, index) => {
      keywords.forEach((keyword) => {
        expect(prompts[index]).toContain(keyword);
      });
    });

    expect(executionProviders.generateImagesWithProvider).not.toHaveBeenCalled();
    expect(executionProviders.generateImageWithProvider).not.toHaveBeenCalled();
    expect(analyzeLinghuiImageBatchSimilarityMock).toHaveBeenCalledTimes(1);

    expect(result).toEqual(expect.objectContaining({
      kind: 'images',
      primary: expect.objectContaining({ source: 'https://cdn.example.com/1.png', label: '#1' }),
      items: [
        expect.objectContaining({ source: 'https://cdn.example.com/1.png', label: '#1' }),
        expect.objectContaining({ source: 'https://cdn.example.com/2.png', label: '#2' }),
        expect.objectContaining({ source: 'https://cdn.example.com/3.png', label: '#3' }),
        expect.objectContaining({ source: 'https://cdn.example.com/4.png', label: '#4' }),
      ],
      metadata: expect.objectContaining({
        batchCount: 4,
        batchMode: 'parallel-variant-prompts',
        variantStrategy: 'linghui-parallel-diverse-prompts-v3',
        similarityDedupe: expect.objectContaining({
          enabled: true,
          status: 'ok',
          attempts: 0,
          maxAttempts: 2,
          rerolledCount: 0,
          unresolvedDuplicateCount: 0,
        }),
        mode: 'generate',
      }),
    }));
    expect(result.kind).toBe('images');
    if (result.kind === 'images') {
      expect(result.items).toHaveLength(4);
    }
  });

  it('批量 variants 会把 prompt editor 里的图片引用并入 referenceSources', async () => {
    const { executeImageNode } = await import('../state/linghuiExecutionNodeExecutors');
    const executionProviders = await import('../state/linghuiExecutionProviders');
    const promptReferences = [
      {
        id: 'prompt-ref-1',
        nodeId: 'ref-node',
        kind: 'image',
        name: '角色参考图',
        source: {
          kind: 'image',
          remoteUrl: 'https://cdn.example.com/prompt-ref.png',
          localPath: '/tmp/prompt-ref.png',
          createdAt: 1,
        },
      },
      {
        id: 'prompt-ref-2',
        nodeId: 'ref-node',
        kind: 'image',
        name: '上游重复图',
        source: 'https://cdn.example.com/upstream.png',
      },
      {
        id: 'prompt-ref-text',
        nodeId: 'text-node',
        kind: 'text',
        name: '文案引用',
        textValue: '忽略这个文本引用',
      },
    ] as any;
    const inputImages = [
      {
        kind: 'image',
        primary: {
          kind: 'image',
          source: 'https://cdn.example.com/upstream.png',
        },
      },
    ] as any;

    vi.mocked(executionProviders.generateImageVariantsWithProvider).mockResolvedValue([
      { kind: 'image', source: 'https://cdn.example.com/1.png', label: '#1' } as any,
      { kind: 'image', source: 'https://cdn.example.com/2.png', label: '#2' } as any,
      { kind: 'image', source: 'https://cdn.example.com/3.png', label: '#3' } as any,
      { kind: 'image', source: 'https://cdn.example.com/4.png', label: '#4' } as any,
    ]);

    await executeImageNode(createNode(4, { inputImages, promptReferences }));

    expect(executionProviders.generateImageVariantsWithProvider).toHaveBeenCalledTimes(1);
    expect(vi.mocked(executionProviders.generateImageVariantsWithProvider).mock.calls[0]?.[0]).toEqual(expect.objectContaining({
      promptReferences,
      referenceSources: [
        'https://cdn.example.com/upstream.png',
        'https://cdn.example.com/prompt-ref.png',
      ],
    }));
  });

  it('检测到重复候选时只重抽重复位置，并用更强 retry prompt 替换结果', async () => {
    const { executeImageNode } = await import('../state/linghuiExecutionNodeExecutors');
    const executionProviders = await import('../state/linghuiExecutionProviders');

    vi.mocked(executionProviders.generateImageVariantsWithProvider)
      .mockResolvedValueOnce([
        { kind: 'image', source: 'https://cdn.example.com/1.png', label: '#1' } as any,
        { kind: 'image', source: 'https://cdn.example.com/2.png', label: '#2' } as any,
        { kind: 'image', source: 'https://cdn.example.com/3.png', label: '#3' } as any,
        { kind: 'image', source: 'https://cdn.example.com/4.png', label: '#4' } as any,
      ])
      .mockResolvedValueOnce([
        { kind: 'image', source: 'https://cdn.example.com/2-reroll.png', label: '#2' } as any,
      ]);

    analyzeLinghuiImageBatchSimilarityMock
      .mockResolvedValueOnce({
        status: 'ok',
        duplicates: [
          {
            originalIndex: 0,
            duplicateIndex: 1,
            faceHashDistance: 2,
            frameHashDistance: 5,
            faceColorDistance: 10,
            faceLumaDelta: 4,
            faceContrastDelta: 3,
          },
        ],
        comparedCount: 4,
      })
      .mockResolvedValueOnce({
        status: 'ok',
        duplicates: [],
        comparedCount: 4,
      });

    const result = await executeImageNode(createNode(4));

    expect(executionProviders.generateImageVariantsWithProvider).toHaveBeenCalledTimes(2);
    expect(vi.mocked(executionProviders.generateImageVariantsWithProvider).mock.calls[0]?.[0]?.variants).toHaveLength(4);

    const retryCall = vi.mocked(executionProviders.generateImageVariantsWithProvider).mock.calls[1]?.[0];
    expect(retryCall?.variants).toHaveLength(1);
    expect(retryCall?.variants[0]).toEqual(expect.objectContaining({
      label: '#2',
    }));
    expect(retryCall?.variants[0]?.prompt).toContain('REROLL candidate #2 because previous result looked too similar to another candidate.');
    expect(retryCall?.variants[0]?.prompt).toContain('use an aggressively different facial identity recipe.');

    expect(analyzeLinghuiImageBatchSimilarityMock).toHaveBeenCalledTimes(2);
    expect(result.kind).toBe('images');
    if (result.kind === 'images') {
      expect(result.items[1]).toEqual(expect.objectContaining({
        source: 'https://cdn.example.com/2-reroll.png',
        label: '#2',
      }));
      expect(result.metadata).toEqual(expect.objectContaining({
        similarityDedupe: expect.objectContaining({
          enabled: true,
          status: 'ok',
          attempts: 1,
          maxAttempts: 2,
          rerolledCount: 1,
          unresolvedDuplicateCount: 0,
        }),
      }));
    }
  });

  it('单张生成会把 prompt editor 里的图片引用并入 provider referenceSources', async () => {
    const { executeImageNode } = await import('../state/linghuiExecutionNodeExecutors');
    const executionProviders = await import('../state/linghuiExecutionProviders');
    const promptReferences = [
      {
        id: 'prompt-ref-local',
        nodeId: 'ref-node',
        kind: 'image',
        name: '本地参考图',
        source: '/tmp/prompt-local.png',
      },
    ] as any;
    const inputImages = [
      {
        kind: 'image',
        primary: {
          kind: 'image',
          source: 'https://cdn.example.com/upstream.png',
        },
      },
    ] as any;

    vi.mocked(executionProviders.generateImageWithProvider).mockResolvedValue(
      { kind: 'image', source: 'https://cdn.example.com/single.png' } as any,
    );

    const result = await executeImageNode(createNode(1, { inputImages, promptReferences }));

    expect(executionProviders.generateImageWithProvider).toHaveBeenCalledTimes(1);
    expect(executionProviders.generateImageWithProvider).toHaveBeenCalledWith(expect.objectContaining({
      prompt: '主提示词',
      ttiSelection: 'channel-image::model-image',
      promptReferences,
      referenceSources: [
        'https://cdn.example.com/upstream.png',
        '/tmp/prompt-local.png',
      ],
    }));
    expect(executionProviders.generateImagesWithProvider).not.toHaveBeenCalled();
    expect(executionProviders.generateImageVariantsWithProvider).not.toHaveBeenCalled();
    expect(analyzeLinghuiImageBatchSimilarityMock).not.toHaveBeenCalled();
    expect(result).toEqual(expect.objectContaining({
      kind: 'image',
      primary: expect.objectContaining({ source: 'https://cdn.example.com/single.png' }),
      metadata: expect.objectContaining({ mode: 'generate' }),
    }));
  });
});

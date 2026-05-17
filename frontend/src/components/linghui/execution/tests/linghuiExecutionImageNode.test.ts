import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExecutionNodeView } from '../state/linghuiExecutionShared';

const {
  analyzeLinghuiImageBatchSimilarityMock,
  analyzeLinghuiImageCandidateQualityMock,
} = vi.hoisted(() => ({
  analyzeLinghuiImageBatchSimilarityMock: vi.fn(),
  analyzeLinghuiImageCandidateQualityMock: vi.fn(),
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
  analyzeLinghuiImageCandidateQuality: (...args: unknown[]) => analyzeLinghuiImageCandidateQualityMock(...args),
}));

function createNode(
  batchCount: number,
  options: {
    prompt?: string;
    inputImages?: ReturnType<ExecutionNodeView['getAllInputImages']>;
    promptReferences?: ReturnType<ExecutionNodeView['getPromptReferences']>;
    properties?: Record<string, unknown>;
  } = {},
): ExecutionNodeView {
  const {
    prompt = '主提示词',
    inputImages = [],
    promptReferences = [],
    properties = {},
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
      ...properties,
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

function createImageItems(count: number, prefix = 'https://cdn.example.com'): any[] {
  return Array.from({ length: count }, (_unused, index) => ({
    kind: 'image',
    source: `${prefix}/${index + 1}.png`,
    label: `#${index + 1}`,
  }));
}

describe('executeImageNode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    analyzeLinghuiImageBatchSimilarityMock.mockImplementation(async (items: any[]) => ({
      status: 'ok',
      duplicates: [],
      comparedCount: Array.isArray(items) ? items.length : 0,
    }));
    analyzeLinghuiImageCandidateQualityMock.mockImplementation(async () => ({
      status: 'ok',
      verdict: 'accept',
      classification: 'valid',
    }));
  });

  it('batchCount=4 时首轮会过采样 8 个候选，并为候选池生成独立 prompt', async () => {
    const { executeImageNode } = await import('../state/linghuiExecutionNodeExecutors');
    const executionProviders = await import('../state/linghuiExecutionProviders');

    vi.mocked(executionProviders.generateImageVariantsWithProvider).mockResolvedValue(
      createImageItems(8) as any,
    );

    const result = await executeImageNode(createNode(4));

    expect(executionProviders.generateImageVariantsWithProvider).toHaveBeenCalledTimes(1);
    const batchCall = vi.mocked(executionProviders.generateImageVariantsWithProvider).mock.calls[0]?.[0];
    expect(batchCall).toEqual(expect.objectContaining({
      ttiSelection: 'channel-image::model-image',
      placeholderTitle: '图片节点',
    }));
    expect(batchCall?.variants).toHaveLength(8);
    expect(batchCall?.variants.map(variant => variant.label)).toEqual([
      '#1', '#2', '#3', '#4', '#5', '#6', '#7', '#8',
    ]);

    const prompts = batchCall?.variants.map(variant => variant.prompt) ?? [];
    expect(new Set(prompts).size).toBe(8);
    prompts.forEach((variantPrompt, index) => {
      const candidateIndex = index + 1;
      expect(variantPrompt).toContain('主提示词');
      expect(variantPrompt).toContain(`Linghui draw candidate #${candidateIndex}`);
      expect(variantPrompt).toContain(`This request generates candidate #${candidateIndex} only`);
      expect(variantPrompt).toContain('distinct facial identity');
      expect(variantPrompt).toContain('do not reuse the same face template');
      expect(variantPrompt).toContain('This request generates exactly one candidate image only.');
      expect(variantPrompt).toContain('concrete non-abstract character image');
      expect(variantPrompt).toContain('clear readable subject');
      expect(variantPrompt).toContain('no abstract texture');
      expect(variantPrompt).toContain('no symbolic pattern');
      expect(variantPrompt).toContain('no empty scene');
    });
    expect(prompts[6]).toContain('Alternate identity seed');
    expect(prompts[7]).toContain('Alternate identity seed');

    expect(executionProviders.generateImagesWithProvider).not.toHaveBeenCalled();
    expect(executionProviders.generateImageWithProvider).not.toHaveBeenCalled();
    expect(analyzeLinghuiImageCandidateQualityMock).toHaveBeenCalledTimes(8);
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
        variantStrategy: 'linghui-parallel-diverse-prompts-v4',
        similarityDedupe: expect.objectContaining({
          enabled: true,
          status: 'ok',
          attempts: 0,
          maxAttempts: 2,
          rerolledCount: 0,
          unresolvedDuplicateCount: 0,
          candidatePoolSize: 8,
          selectedCount: 4,
          invalidRejectedCount: 0,
          similarRejectedCount: 0,
          qualityUnknownCount: 0,
        }),
        candidateSelection: expect.objectContaining({
          candidatePoolSize: 8,
          selectedCount: 4,
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

    vi.mocked(executionProviders.generateImageVariantsWithProvider).mockResolvedValue(
      createImageItems(8) as any,
    );

    await executeImageNode(createNode(4, { inputImages, promptReferences }));

    expect(executionProviders.generateImageVariantsWithProvider).toHaveBeenCalledTimes(1);
    expect(vi.mocked(executionProviders.generateImageVariantsWithProvider).mock.calls[0]?.[0]).toEqual(expect.objectContaining({
      promptReferences,
      referenceSources: [
        'https://cdn.example.com/upstream.png',
        expect.objectContaining({
          kind: 'image',
          localPath: '/tmp/prompt-ref.png',
          remoteUrl: 'https://cdn.example.com/prompt-ref.png',
        }),
      ],
    }));
  });

  it('候选池会先过滤 invalid 与重复，再用同池后备候选补齐，不必二次 provider', async () => {
    const { executeImageNode } = await import('../state/linghuiExecutionNodeExecutors');
    const executionProviders = await import('../state/linghuiExecutionProviders');

    vi.mocked(executionProviders.generateImageVariantsWithProvider).mockResolvedValue(
      createImageItems(8) as any,
    );

    analyzeLinghuiImageCandidateQualityMock.mockImplementation(async (item: any) => {
      if (item.source === 'https://cdn.example.com/4.png') {
        return {
          status: 'ok',
          verdict: 'reject',
          classification: 'abstract',
          reason: 'low-structure',
        };
      }

      return {
        status: 'ok',
        verdict: 'accept',
        classification: 'valid',
      };
    });
    analyzeLinghuiImageBatchSimilarityMock.mockResolvedValue({
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
      comparedCount: 7,
    });

    const result = await executeImageNode(createNode(4));

    expect(executionProviders.generateImageVariantsWithProvider).toHaveBeenCalledTimes(1);
    expect(analyzeLinghuiImageCandidateQualityMock).toHaveBeenCalledTimes(8);
    expect(analyzeLinghuiImageBatchSimilarityMock).toHaveBeenCalledTimes(1);
    expect(result.kind).toBe('images');
    if (result.kind === 'images') {
      expect(result.items).toEqual([
        expect.objectContaining({ source: 'https://cdn.example.com/1.png', label: '#1' }),
        expect.objectContaining({ source: 'https://cdn.example.com/3.png', label: '#2' }),
        expect.objectContaining({ source: 'https://cdn.example.com/5.png', label: '#3' }),
        expect.objectContaining({ source: 'https://cdn.example.com/6.png', label: '#4' }),
      ]);
      expect(result.metadata).toEqual(expect.objectContaining({
        similarityDedupe: expect.objectContaining({
          candidatePoolSize: 8,
          selectedCount: 4,
          invalidRejectedCount: 1,
          similarRejectedCount: 1,
          rerolledCount: 0,
          unresolvedDuplicateCount: 0,
        }),
      }));
    }
  });

  it('候选池不足时会补抽缺口并在 prompt 中加入 REROLL/质量约束', async () => {
    const { executeImageNode } = await import('../state/linghuiExecutionNodeExecutors');
    const executionProviders = await import('../state/linghuiExecutionProviders');

    vi.mocked(executionProviders.generateImageVariantsWithProvider)
      .mockResolvedValueOnce(createImageItems(8) as any)
      .mockResolvedValueOnce([
        { kind: 'image', source: 'https://cdn.example.com/fill-1.png', label: '#9' } as any,
        { kind: 'image', source: 'https://cdn.example.com/fill-2.png', label: '#10' } as any,
        { kind: 'image', source: 'https://cdn.example.com/fill-3.png', label: '#11' } as any,
        { kind: 'image', source: 'https://cdn.example.com/fill-4.png', label: '#12' } as any,
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
          {
            originalIndex: 0,
            duplicateIndex: 2,
            faceHashDistance: 3,
            frameHashDistance: 5,
            faceColorDistance: 11,
            faceLumaDelta: 4,
            faceContrastDelta: 3,
          },
          {
            originalIndex: 0,
            duplicateIndex: 3,
            faceHashDistance: 3,
            frameHashDistance: 6,
            faceColorDistance: 11,
            faceLumaDelta: 5,
            faceContrastDelta: 4,
          },
          {
            originalIndex: 0,
            duplicateIndex: 4,
            faceHashDistance: 3,
            frameHashDistance: 6,
            faceColorDistance: 12,
            faceLumaDelta: 5,
            faceContrastDelta: 4,
          },
          {
            originalIndex: 0,
            duplicateIndex: 5,
            faceHashDistance: 4,
            frameHashDistance: 7,
            faceColorDistance: 12,
            faceLumaDelta: 6,
            faceContrastDelta: 5,
          },
          {
            originalIndex: 0,
            duplicateIndex: 6,
            faceHashDistance: 4,
            frameHashDistance: 7,
            faceColorDistance: 13,
            faceLumaDelta: 6,
            faceContrastDelta: 5,
          },
        ],
        comparedCount: 8,
      })
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
          {
            originalIndex: 0,
            duplicateIndex: 2,
            faceHashDistance: 3,
            frameHashDistance: 5,
            faceColorDistance: 11,
            faceLumaDelta: 4,
            faceContrastDelta: 3,
          },
          {
            originalIndex: 0,
            duplicateIndex: 3,
            faceHashDistance: 3,
            frameHashDistance: 6,
            faceColorDistance: 11,
            faceLumaDelta: 5,
            faceContrastDelta: 4,
          },
          {
            originalIndex: 0,
            duplicateIndex: 4,
            faceHashDistance: 3,
            frameHashDistance: 6,
            faceColorDistance: 12,
            faceLumaDelta: 5,
            faceContrastDelta: 4,
          },
          {
            originalIndex: 0,
            duplicateIndex: 5,
            faceHashDistance: 4,
            frameHashDistance: 7,
            faceColorDistance: 12,
            faceLumaDelta: 6,
            faceContrastDelta: 5,
          },
          {
            originalIndex: 0,
            duplicateIndex: 6,
            faceHashDistance: 4,
            frameHashDistance: 7,
            faceColorDistance: 13,
            faceLumaDelta: 6,
            faceContrastDelta: 5,
          },
        ],
        comparedCount: 12,
      });

    const result = await executeImageNode(createNode(4));

    expect(executionProviders.generateImageVariantsWithProvider).toHaveBeenCalledTimes(2);
    expect(vi.mocked(executionProviders.generateImageVariantsWithProvider).mock.calls[0]?.[0]?.variants).toHaveLength(8);

    const retryCall = vi.mocked(executionProviders.generateImageVariantsWithProvider).mock.calls[1]?.[0];
    expect(retryCall?.variants).toHaveLength(4);
    retryCall?.variants.forEach((variant) => {
      expect(variant.prompt).toContain('REROLL fill slot');
      expect(variant.prompt).toContain('avoid abstract output');
      expect(variant.prompt).toContain('must show a concrete character/portrait');
      expect(variant.prompt).toContain('avoid same facial template');
    });

    expect(analyzeLinghuiImageBatchSimilarityMock).toHaveBeenCalledTimes(2);
    expect(result.kind).toBe('images');
    if (result.kind === 'images') {
      expect(result.items).toEqual([
        expect.objectContaining({ source: 'https://cdn.example.com/1.png', label: '#1' }),
        expect.objectContaining({ source: 'https://cdn.example.com/8.png', label: '#2' }),
        expect.objectContaining({ source: 'https://cdn.example.com/fill-1.png', label: '#3' }),
        expect.objectContaining({ source: 'https://cdn.example.com/fill-2.png', label: '#4' }),
      ]);
      expect(result.metadata).toEqual(expect.objectContaining({
        similarityDedupe: expect.objectContaining({
          attempts: 1,
          rerolledCount: 4,
          candidatePoolSize: 12,
          selectedCount: 4,
          invalidRejectedCount: 0,
          similarRejectedCount: 6,
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
    expect(analyzeLinghuiImageCandidateQualityMock).not.toHaveBeenCalled();
    expect(result).toEqual(expect.objectContaining({
      kind: 'image',
      primary: expect.objectContaining({ source: 'https://cdn.example.com/single.png' }),
      metadata: expect.objectContaining({ mode: 'generate' }),
    }));
  });

  it('聚焦区域会把标记图片作为参考并追加局部重绘约束', async () => {
    const { executeImageNode } = await import('../state/linghuiExecutionNodeExecutors');
    const executionProviders = await import('../state/linghuiExecutionProviders');

    vi.mocked(executionProviders.generateImageWithProvider).mockResolvedValue(
      { kind: 'image', source: 'https://cdn.example.com/focus.png' } as any,
    );

    const result = await executeImageNode(createNode(1, {
      properties: {
        focusRegion: {
          enabled: true,
          x: 0.2,
          y: 0.15,
          width: 0.3,
          height: 0.25,
          source: 'https://cdn.example.com/original.png',
          label: '脸部',
        },
      },
    }));

    expect(executionProviders.generateImageWithProvider).toHaveBeenCalledTimes(1);
    const call = vi.mocked(executionProviders.generateImageWithProvider).mock.calls[0]?.[0];
    expect(call).toEqual(expect.objectContaining({
      referenceSources: ['https://cdn.example.com/original.png'],
      placeholderSubtitle: '聚焦区域生成',
    }));
    expect(call?.prompt).toContain('主提示词');
    expect(call?.prompt).toContain('LibTV-style focus region (脸部)');
    expect(call?.prompt).toContain('left 20%, top 15%, right 50%, bottom 40%');
    expect(call?.prompt).toContain('Preserve the original image outside this box');
    expect(result).toEqual(expect.objectContaining({
      kind: 'image',
      metadata: expect.objectContaining({
        mode: 'generate',
        focusRegion: expect.objectContaining({
          enabled: true,
          x: 0.2,
          y: 0.15,
          width: 0.3,
          height: 0.25,
          source: 'https://cdn.example.com/original.png',
        }),
      }),
    }));
  });

  it('标记点会把标记图片作为参考并追加坐标锚点约束', async () => {
    const { executeImageNode } = await import('../state/linghuiExecutionNodeExecutors');
    const executionProviders = await import('../state/linghuiExecutionProviders');

    vi.mocked(executionProviders.generateImageWithProvider).mockResolvedValue(
      { kind: 'image', source: 'https://cdn.example.com/marked.png' } as any,
    );

    const result = await executeImageNode(createNode(1, {
      properties: {
        markPoints: [
          {
            id: 'mark-face',
            enabled: true,
            x: 0.25,
            y: 0.6,
            source: 'https://cdn.example.com/original.png',
            label: '脸部',
            prompt: '保持人物脸部身份一致。',
          },
        ],
      },
    }));

    expect(executionProviders.generateImageWithProvider).toHaveBeenCalledTimes(1);
    const call = vi.mocked(executionProviders.generateImageWithProvider).mock.calls[0]?.[0];
    expect(call).toEqual(expect.objectContaining({
      referenceSources: ['https://cdn.example.com/original.png'],
    }));
    expect(call?.prompt).toContain('LibTV-style mark points');
    expect(call?.prompt).toContain('Mark 1 (脸部) at x 25%, y 60%');
    expect(call?.prompt).toContain('保持人物脸部身份一致');
    expect(call?.prompt).toContain('do not render visible UI pins');
    expect(result).toEqual(expect.objectContaining({
      kind: 'image',
      metadata: expect.objectContaining({
        mode: 'generate',
        markPoints: [
          expect.objectContaining({
            id: 'mark-face',
            x: 0.25,
            y: 0.6,
            source: 'https://cdn.example.com/original.png',
          }),
        ],
      }),
    }));
  });

  it('全景节点会用模板包装用户提示词后复用单图 provider', async () => {
    const { executePanoramaNode } = await import('../state/linghuiExecutionNodeExecutors');
    const executionProviders = await import('../state/linghuiExecutionProviders');

    vi.mocked(executionProviders.generateImageWithProvider).mockResolvedValue(
      { kind: 'image', source: 'https://cdn.example.com/panorama.png' } as any,
    );

    const result = await executePanoramaNode({
      ...createNode(1, { prompt: '赛博寺庙中庭，雨后夜色' }),
      id: 'panorama-node-1',
      type: 'linghui/panorama',
      title: '全景环境',
      properties: {
        mode: 'generate',
        source: '',
        prompt: '赛博寺庙中庭，雨后夜色',
        ttiSelection: 'channel-image::model-image',
        batchCount: 1,
        panoramaTemplate: 'indoor',
      },
    });

    expect(executionProviders.generateImageWithProvider).toHaveBeenCalledTimes(1);
    const call = vi.mocked(executionProviders.generateImageWithProvider).mock.calls[0]?.[0];
    expect(call?.prompt).toContain('赛博寺庙中庭，雨后夜色');
    // 新提示词契约：projection contract（ar720-band 默认）+ scene specialization（indoor）
    expect(call?.prompt).toContain('wraparound horizontal panoramic environment band');
    expect(call?.prompt).toContain('enclosed indoor environment');
    expect(call?.prompt).toContain('seam-safe edges');
    expect(result).toEqual(expect.objectContaining({
      kind: 'image',
      primary: expect.objectContaining({ source: 'https://cdn.example.com/panorama.png' }),
      metadata: expect.objectContaining({
        mode: 'panorama',
        panoramaTemplate: 'indoor',
        panoramaProjection: 'ar720-band',
        originalPrompt: '赛博寺庙中庭，雨后夜色',
      }),
    }));
  });
});

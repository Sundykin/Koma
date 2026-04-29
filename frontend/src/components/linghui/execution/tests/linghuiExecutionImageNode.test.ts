import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExecutionNodeView } from '../state/linghuiExecutionShared';

vi.mock('../state/linghuiExecutionProviders', () => ({
  generateAudioWithProvider: vi.fn(),
  generateImageWithProvider: vi.fn(),
  generateImagesWithProvider: vi.fn(),
  generateImageVariantsWithProvider: vi.fn(),
  generateTextWithProvider: vi.fn(),
  generateVideoWithProvider: vi.fn(),
}));

function createNode(batchCount: number): ExecutionNodeView {
  return {
    id: 'image-node-1',
    type: 'linghui/image',
    title: '图片节点',
    properties: {
      mode: 'generate',
      source: '',
      prompt: '主提示词',
      ttiSelection: 'channel-image::model-image',
      batchCount,
    },
    getAllInputResults() {
      return [];
    },
    getAllInputImages() {
      return [];
    },
    getInputResult() {
      return undefined;
    },
    getPromptReferences() {
      return [];
    },
  };
}

describe('executeImageNode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
        variantStrategy: 'linghui-parallel-diverse-prompts-v2',
        mode: 'generate',
      }),
    }));
    expect(result.kind).toBe('images');
    if (result.kind === 'images') {
      expect(result.items).toHaveLength(4);
    }
  });

  it('单张生成仍保持原有 generateImageWithProvider 路径', async () => {
    const { executeImageNode } = await import('../state/linghuiExecutionNodeExecutors');
    const executionProviders = await import('../state/linghuiExecutionProviders');

    vi.mocked(executionProviders.generateImageWithProvider).mockResolvedValue(
      { kind: 'image', source: 'https://cdn.example.com/single.png' } as any,
    );

    const result = await executeImageNode(createNode(1));

    expect(executionProviders.generateImageWithProvider).toHaveBeenCalledTimes(1);
    expect(executionProviders.generateImageWithProvider).toHaveBeenCalledWith(expect.objectContaining({
      prompt: '主提示词',
      ttiSelection: 'channel-image::model-image',
    }));
    expect(executionProviders.generateImagesWithProvider).not.toHaveBeenCalled();
    expect(executionProviders.generateImageVariantsWithProvider).not.toHaveBeenCalled();
    expect(result).toEqual(expect.objectContaining({
      kind: 'image',
      primary: expect.objectContaining({ source: 'https://cdn.example.com/single.png' }),
      metadata: expect.objectContaining({ mode: 'generate' }),
    }));
  });
});

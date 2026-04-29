import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExecutionNodeView } from '../state/linghuiExecutionShared';

vi.mock('../state/linghuiExecutionProviders', () => ({
  generateAudioWithProvider: vi.fn(),
  generateImageWithProvider: vi.fn(),
  generateImageVariantsWithProvider: vi.fn(),
  generateImagesWithProvider: vi.fn(),
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

  it('batchCount > 1 时会改走变体 prompt 批量生成，避免完全同 prompt 克隆', async () => {
    const { executeImageNode } = await import('../state/linghuiExecutionNodeExecutors');
    const executionProviders = await import('../state/linghuiExecutionProviders');

    vi.mocked(executionProviders.generateImageVariantsWithProvider).mockResolvedValue([
      { kind: 'image', source: 'https://cdn.example.com/1.png' } as any,
      { kind: 'image', source: 'https://cdn.example.com/2.png' } as any,
      { kind: 'image', source: 'https://cdn.example.com/3.png' } as any,
    ]);

    const result = await executeImageNode(createNode(3));

    expect(executionProviders.generateImageVariantsWithProvider).toHaveBeenCalledTimes(1);
    expect(executionProviders.generateImagesWithProvider).not.toHaveBeenCalled();
    expect(executionProviders.generateImageWithProvider).not.toHaveBeenCalled();

    const variantRequest = vi.mocked(executionProviders.generateImageVariantsWithProvider).mock.calls[0]?.[0];
    expect(variantRequest).toEqual(expect.objectContaining({
      ttiSelection: 'channel-image::model-image',
      placeholderTitle: '图片节点',
    }));
    expect(variantRequest?.variants).toHaveLength(3);
    const variantPrompts = variantRequest?.variants.map(item => item.prompt) ?? [];
    expect(new Set(variantPrompts).size).toBe(3);
    expect(variantPrompts.every(prompt => prompt.includes('灵绘批量变体'))).toBe(true);

    expect(result).toEqual(expect.objectContaining({
      kind: 'images',
      items: expect.arrayContaining([
        expect.objectContaining({ source: 'https://cdn.example.com/1.png', label: '#1' }),
        expect.objectContaining({ source: 'https://cdn.example.com/2.png', label: '#2' }),
        expect.objectContaining({ source: 'https://cdn.example.com/3.png', label: '#3' }),
      ]),
      metadata: expect.objectContaining({
        batchCount: 3,
        batchMode: 'variant-prompts',
        variantStrategy: 'linghui-image-batch-diversity-v1',
      }),
    }));
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
    expect(executionProviders.generateImageVariantsWithProvider).not.toHaveBeenCalled();
    expect(result).toEqual(expect.objectContaining({
      kind: 'image',
      primary: expect.objectContaining({ source: 'https://cdn.example.com/single.png' }),
      metadata: expect.objectContaining({ mode: 'generate' }),
    }));
  });
});

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

  it('batchCount=4 时走单次 provider count 批量请求并返回 4 张结果', async () => {
    const { executeImageNode } = await import('../state/linghuiExecutionNodeExecutors');
    const executionProviders = await import('../state/linghuiExecutionProviders');

    vi.mocked(executionProviders.generateImagesWithProvider).mockResolvedValue([
      { kind: 'image', source: 'https://cdn.example.com/1.png', label: 'provider-1' } as any,
      { kind: 'image', source: 'https://cdn.example.com/2.png', label: 'provider-2' } as any,
      { kind: 'image', source: 'https://cdn.example.com/3.png', label: 'provider-3' } as any,
      { kind: 'image', source: 'https://cdn.example.com/4.png', label: 'provider-4' } as any,
    ]);

    const result = await executeImageNode(createNode(4));

    expect(executionProviders.generateImagesWithProvider).toHaveBeenCalledTimes(1);
    expect(executionProviders.generateImagesWithProvider).toHaveBeenCalledWith(expect.objectContaining({
      count: 4,
      ttiSelection: 'channel-image::model-image',
      placeholderTitle: '图片节点',
      prompt: expect.stringContaining('API count creates separate independent image files'),
    }));
    expect(executionProviders.generateImageVariantsWithProvider).not.toHaveBeenCalled();
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
        batchMode: 'provider-count',
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

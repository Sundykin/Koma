import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LinghuiExecutionContext } from '../../types/linghui';

vi.mock('./linghuiExecutionProviders', () => ({
  generateAudioWithProvider: vi.fn(),
  generateImageWithProvider: vi.fn(),
  generateTextWithProvider: vi.fn(),
  generateVideoWithProvider: vi.fn(),
}));

describe('executeLinghuiWorkflow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('只执行视频节点时也能消费导入图片节点作为图生视频主图', async () => {
    const { executeLinghuiWorkflow } = await import('./linghuiExecutionWorkflow');
    const executionProviders = await import('./linghuiExecutionProviders');

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

  it('普通文生图节点即使残留 multiAngle.enabled 也会回退到标准文生图执行', async () => {
    const { executeLinghuiWorkflow } = await import('./linghuiExecutionWorkflow');
    const executionProviders = await import('./linghuiExecutionProviders');

    vi.mocked(executionProviders.generateImageWithProvider).mockResolvedValue({
      kind: 'image',
      source: 'https://cdn.example.com/text-to-image.png',
    } as any);

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

    expect(executionProviders.generateImageWithProvider).toHaveBeenCalledTimes(1);
    expect(executionProviders.generateImageWithProvider).toHaveBeenCalledWith(expect.objectContaining({
      prompt: '宫崎骏风格，一个清秀少年，穿着破衣烂衫，拿着灰色瓦罐',
      referenceSources: [],
      ttiSelection: 'channel-tti::model-tti',
    }));
    const imageRequest = vi.mocked(executionProviders.generateImageWithProvider).mock.calls[0]?.[0] as Record<string, unknown>;
    expect(imageRequest.multiAngle).toBeUndefined();
    expect(result.runs['image-node']?.status).toBe('succeeded');
  });

  it('真正的多角度节点缺少上游图片时仍然返回明确错误', async () => {
    const { executeLinghuiWorkflow } = await import('./linghuiExecutionWorkflow');
    const executionProviders = await import('./linghuiExecutionProviders');

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
});

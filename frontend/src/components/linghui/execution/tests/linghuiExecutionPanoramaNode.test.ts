import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExecutionNodeView } from '../state/linghuiExecutionShared';
import * as executionProviders from '../state/linghuiExecutionProviders';

vi.mock('../state/linghuiExecutionProviders', () => ({
  generateAudioWithProvider: vi.fn(),
  generateImageWithProvider: vi.fn(async () => ({
    kind: 'image',
    source: 'https://cdn.example.com/pano-primary.png',
    label: '主全景',
  })),
  generateImagesWithProvider: vi.fn(),
  generateImageVariantsWithProvider: vi.fn(),
  generateTextWithProvider: vi.fn(),
  generateVideoWithProvider: vi.fn(),
}));

vi.mock('../../../../services/mediaPersistenceService', () => ({
  persistMediaAsset: vi.fn(),
}));

vi.mock('../../../../services/fileSystemPort', async () => {
  const actual = await vi.importActual<typeof import('../../../../services/fileSystemPort')>(
    '../../../../services/fileSystemPort',
  );
  return {
    ...actual,
    toFileSystemDisplayUrl: (source?: string) =>
      source && !source.startsWith('data:') && !source.startsWith('koma-local://')
        ? `koma-local://files/${encodeURIComponent(source)}`
        : source,
  };
});

function buildPanoramaNodeView(properties: Record<string, unknown>): ExecutionNodeView {
  return {
    id: 'panorama-1',
    type: 'linghui/panorama',
    title: '全景节点',
    properties: {
      mode: 'generate',
      source: '',
      prompt: '夜晚星空下的小镇',
      ttiSelection: 'channel-image::model-image',
      aspectRatio: '2:1',
      resolution: 'auto',
      gridType: 'none',
      batchCount: 1,
      panoramaTemplate: 'auto',
      projectionMode: 'equirectangular-2to1',
      panoramaSlashScene: '720_panoramic',
      panoramaWithPromptScene: '720_panoramic_with_prompt',
      panoramaSlashLabel: '720°全景图',
      panoramaModelKey: 'lib-image-2',
      panoramaQuality: 'medium',
      ...properties,
    },
    getAllInputResults: () => [],
    getAllInputImages: () => [],
    getInputResult: () => undefined,
    getPromptReferences: () => [],
  };
}

describe('executePanoramaNode detailCrops 合并 + 落盘', () => {
  beforeEach(async () => {
    const persistenceMod = await import('../../../../services/mediaPersistenceService');
    vi.mocked(persistenceMod.persistMediaAsset).mockReset();
    vi.mocked(executionProviders.generateImageWithProvider).mockClear();
  });

  it('properties.detailCrops 为空时，仍保持单图 kind，不调 persistMediaAsset', async () => {
    const persistenceMod = await import('../../../../services/mediaPersistenceService');
    const { executePanoramaNode } = await import('../state/linghuiExecutionNodeExecutors');
    const result = await executePanoramaNode(buildPanoramaNodeView({}));
    expect(result.kind).toBe('image');
    expect(result.metadata?.detailCropCount).toBe(0);
    expect(persistenceMod.persistMediaAsset).not.toHaveBeenCalled();
  });

  it('全景生图带上 LibTV 720° slash 默认比例、质量和场景元数据', async () => {
    const { executePanoramaNode } = await import('../state/linghuiExecutionNodeExecutors');
    const result = await executePanoramaNode(buildPanoramaNodeView({
      prompt: '雨夜赛博城市天台',
    }));

    expect(executionProviders.generateImageWithProvider).toHaveBeenCalledWith(expect.objectContaining({
      aspectRatio: '2:1',
      resolution: 'auto',
      prompt: expect.stringContaining('雨夜赛博城市天台'),
    }));
    const call = vi.mocked(executionProviders.generateImageWithProvider).mock.calls[0]?.[0];
    expect(call?.prompt).toContain('true 2:1 equirectangular panorama');
    expect(call?.prompt).toContain('雨夜赛博城市天台');
    expect(result.metadata).toEqual(expect.objectContaining({
      mode: 'panorama',
      panoramaProjection: 'equirectangular-2to1',
      panoramaSlashScene: '720_panoramic',
      panoramaWithPromptScene: '720_panoramic_with_prompt',
      panoramaSlashLabel: '720°全景图',
      panoramaModelKey: 'lib-image-2',
      panoramaQuality: 'medium',
      panoramaRatio: '2:1',
      originalPrompt: '雨夜赛博城市天台',
    }));
  });

  it('有 detailCrops 时合并为 images kind，每张 crop 都被落盘成 koma-local URL', async () => {
    const persistenceMod = await import('../../../../services/mediaPersistenceService');
    let counter = 0;
    vi.mocked(persistenceMod.persistMediaAsset).mockImplementation(async () => ({
      kind: 'image',
      localPath: `/abs/pano-detail-${++counter}.png`,
      mimeType: 'image/png',
      createdAt: Date.now(),
    }));

    const { executePanoramaNode } = await import('../state/linghuiExecutionNodeExecutors');
    const node = buildPanoramaNodeView({
      detailCrops: [
        { id: 'd-1', source: 'data:image/png;base64,NORTH', label: '北 N', width: 512, height: 512 },
        { id: 'd-2', source: 'data:image/png;base64,EAST', label: '东 E', width: 512, height: 512 },
      ],
    });

    const result = await executePanoramaNode(node);
    expect(result.kind).toBe('images');
    if (result.kind !== 'images') return;
    expect(result.items[0].source).toBe('https://cdn.example.com/pano-primary.png');
    expect(result.items[1].label).toBe('北 N');
    expect(result.items[1].source).toMatch(/^koma-local:\/\/files\//);
    expect(result.items[2].label).toBe('东 E');
    expect(result.items[2].source).toMatch(/^koma-local:\/\/files\//);
    expect(result.metadata?.detailCropCount).toBe(2);
    expect(persistenceMod.persistMediaAsset).toHaveBeenCalledTimes(2);
  });

  it('detailCrops 中无效条目（缺 source）被丢弃，不浪费 persist 调用', async () => {
    const persistenceMod = await import('../../../../services/mediaPersistenceService');
    vi.mocked(persistenceMod.persistMediaAsset).mockImplementation(async () => ({
      kind: 'image',
      localPath: '/abs/valid.png',
      mimeType: 'image/png',
      createdAt: Date.now(),
    }));

    const { executePanoramaNode } = await import('../state/linghuiExecutionNodeExecutors');
    const node = buildPanoramaNodeView({
      detailCrops: [
        { id: 'd-1', source: 'data:image/png;base64,VALID', label: '正面' },
        { id: 'd-bad', label: '坏数据' },
      ],
    });

    const result = await executePanoramaNode(node);
    expect(result.kind).toBe('images');
    if (result.kind !== 'images') return;
    expect(result.items).toHaveLength(2);
    expect(result.metadata?.detailCropCount).toBe(1);
    expect(persistenceMod.persistMediaAsset).toHaveBeenCalledTimes(1);
  });

  it('perspectiveViews 被聚合到 result.items，按 view.label 命名，images kind', async () => {
    const persistenceMod = await import('../../../../services/mediaPersistenceService');
    let counter = 0;
    vi.mocked(persistenceMod.persistMediaAsset).mockImplementation(async () => ({
      kind: 'image',
      localPath: `/abs/pano-view-${++counter}.png`,
      mimeType: 'image/png',
      createdAt: Date.now(),
    }));

    const { executePanoramaNode } = await import('../state/linghuiExecutionNodeExecutors');
    const node = buildPanoramaNodeView({
      perspectiveViews: [
        { id: 'v-1', label: '正前', yaw: 0, pitch: 0, fovDeg: 90, source: 'koma-local://files/front.png' },
        { id: 'v-2', label: '正右', yaw: 1.57, pitch: 0, fovDeg: 90, source: 'koma-local://files/right.png' },
      ],
    });

    const result = await executePanoramaNode(node);
    expect(result.kind).toBe('images');
    if (result.kind !== 'images') return;
    expect(result.items).toHaveLength(3); // 主图 + 2 个视角
    expect(result.items[1].label).toBe('正前');
    expect(result.items[2].label).toBe('正右');
    expect(result.metadata?.perspectiveViewCount).toBe(2);
  });

  it('detailCrops 和 perspectiveViews 同时存在时都被合并，且互不冲突', async () => {
    const persistenceMod = await import('../../../../services/mediaPersistenceService');
    let counter = 0;
    vi.mocked(persistenceMod.persistMediaAsset).mockImplementation(async () => ({
      kind: 'image',
      localPath: `/abs/pano-mixed-${++counter}.png`,
      mimeType: 'image/png',
      createdAt: Date.now(),
    }));

    const { executePanoramaNode } = await import('../state/linghuiExecutionNodeExecutors');
    const node = buildPanoramaNodeView({
      detailCrops: [
        { id: 'd-1', source: 'data:image/png;base64,DIR_N', label: '北' },
      ],
      perspectiveViews: [
        { id: 'v-1', label: '正前', yaw: 0, pitch: 0, fovDeg: 90, source: 'koma-local://files/p1.png' },
        { id: 'v-2', label: '正后', yaw: 3.14, pitch: 0, fovDeg: 90, source: 'koma-local://files/p2.png' },
      ],
    });

    const result = await executePanoramaNode(node);
    expect(result.kind).toBe('images');
    if (result.kind !== 'images') return;
    // 主图 + 1 detailCrop + 2 perspectiveViews = 4
    expect(result.items).toHaveLength(4);
    expect(result.metadata?.detailCropCount).toBe(1);
    expect(result.metadata?.perspectiveViewCount).toBe(2);
  });
});

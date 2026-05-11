import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExecutionNodeView } from '../state/linghuiExecutionShared';

vi.mock('../../services/electronService', () => ({
  electronService: {
    fs: {
      toLocalUrl: (value?: string) => value,
    },
  },
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

function buildDirectorNodeView(properties: Record<string, unknown>): ExecutionNodeView {
  return {
    id: 'director-1',
    type: 'linghui/director3d',
    title: '导演工作台',
    properties,
    getAllInputResults: () => [],
    getAllInputImages: () => [],
    getInputResult: () => undefined,
    getPromptReferences: () => [],
  };
}

describe('executeDirector3DNode', () => {
  beforeEach(async () => {
    const persistenceMod = await import('../../../../services/mediaPersistenceService');
    vi.mocked(persistenceMod.persistMediaAsset).mockReset();
  });

  it('未导出线稿时直接抛错提示用户先导出', async () => {
    const { executeDirector3DNode } = await import('../state/linghuiExecutionNodeExecutors');
    const node = buildDirectorNodeView({});
    await expect(executeDirector3DNode(node)).rejects.toThrow(/导出线稿参考/);
  });

  it('已导出线稿时把 dataUrl 落盘成 koma-local URL，directorPromptFragment 写到 metadata.description', async () => {
    const persistenceMod = await import('../../../../services/mediaPersistenceService');
    let counter = 0;
    vi.mocked(persistenceMod.persistMediaAsset).mockImplementation(async () => ({
      kind: 'image',
      localPath: `/abs/lineart-${++counter}.png`,
      mimeType: 'image/png',
      createdAt: Date.now(),
    }));

    const { executeDirector3DNode } = await import('../state/linghuiExecutionNodeExecutors');
    const fragment = 'Camera setup: position (0,1.55,4.5), looking at (0,1.6,0), FOV 35 degrees.';
    const node = buildDirectorNodeView({
      lineartDataUrl: 'data:image/png;base64,AAA',
      directorPromptFragment: fragment,
      scene: { actors: [] },
    });

    const result = await executeDirector3DNode(node);

    expect(persistenceMod.persistMediaAsset).toHaveBeenCalledTimes(1);
    const call = vi.mocked(persistenceMod.persistMediaAsset).mock.calls[0][0];
    expect(call.projectId).toBe('linghui');
    expect(call.kind).toBe('image');
    expect(call.source).toBe('data:image/png;base64,AAA');

    expect(result.kind).toBe('image');
    if (result.kind !== 'image') return;
    // dataUrl 已替换为 koma-local URL，下游 grok/video provider 才能消费
    expect(result.primary.source).toMatch(/^koma-local:\/\/files\//);
    expect(result.primary.source).not.toMatch(/^data:/);
    expect(result.metadata?.directorPromptFragment).toBe(fragment);
    expect(result.metadata?.description).toBe(fragment);
  });

  it('批量导出 angleViews：主图 + 每张视角都各自调一次 persistMediaAsset', async () => {
    const persistenceMod = await import('../../../../services/mediaPersistenceService');
    let counter = 0;
    vi.mocked(persistenceMod.persistMediaAsset).mockImplementation(async () => ({
      kind: 'image',
      localPath: `/abs/img-${++counter}.png`,
      mimeType: 'image/png',
      createdAt: Date.now(),
    }));

    const { executeDirector3DNode } = await import('../state/linghuiExecutionNodeExecutors');
    const node = buildDirectorNodeView({
      lineartDataUrl: 'data:image/png;base64,PRIMARY',
      directorPromptFragment: 'fragment',
      angleViews: [
        { id: 'a1', label: '正面', dataUrl: 'data:image/png;base64,FRONT', camera: {}, renderMode: 'lineart' },
        { id: 'a2', label: '侧面', dataUrl: 'data:image/png;base64,SIDE', camera: {}, renderMode: 'lineart' },
      ],
    });

    const result = await executeDirector3DNode(node);

    // 主图 1 次 + 2 个 angleViews
    expect(persistenceMod.persistMediaAsset).toHaveBeenCalledTimes(3);
    expect(result.kind).toBe('images');
    if (result.kind !== 'images') return;
    expect(result.items).toHaveLength(3);
    // 全部已经落盘成 koma-local
    for (const item of result.items) {
      expect(item.source).toMatch(/^koma-local:\/\/files\//);
    }
    expect(result.items[1].label).toBe('正面');
    expect(result.items[2].label).toBe('侧面');
  });

  it('落盘失败时回退到原 dataUrl（保证不阻塞用户），但 metadata 字段保持正确', async () => {
    const persistenceMod = await import('../../../../services/mediaPersistenceService');
    vi.mocked(persistenceMod.persistMediaAsset).mockRejectedValue(new Error('not electron'));

    const { executeDirector3DNode } = await import('../state/linghuiExecutionNodeExecutors');
    const node = buildDirectorNodeView({
      lineartDataUrl: 'data:image/png;base64,PRIMARY',
    });

    const result = await executeDirector3DNode(node);
    expect(result.kind).toBe('image');
    if (result.kind !== 'image') return;
    expect(result.primary.source).toBe('data:image/png;base64,PRIMARY');
  });

  it('outputMode=video 时输出 kind=video，timelineVideoUrl 作为 primary', async () => {
    const persistenceMod = await import('../../../../services/mediaPersistenceService');
    // 这条分支不该再调落盘（视频已在导出时落盘）
    vi.mocked(persistenceMod.persistMediaAsset).mockImplementation(async () => {
      throw new Error('视频分支不应该再走落盘');
    });

    const { executeDirector3DNode } = await import('../state/linghuiExecutionNodeExecutors');
    const node = buildDirectorNodeView({
      lineartDataUrl: 'data:image/png;base64,POSTER',
      directorPromptFragment: '50mm OTS',
      outputMode: 'video',
      timelineVideoUrl: 'koma-local://files/dir3d-timeline.mp4',
      timelineVideoPosterUrl: 'koma-local://files/dir3d-frame-0.png',
      timelineVideoMeta: { duration: 4, fps: 24, frameCount: 96, width: 1024, height: 576 },
    });

    const result = await executeDirector3DNode(node);
    expect(result.kind).toBe('video');
    if (result.kind !== 'video') return;
    expect(result.primary.source).toBe('koma-local://files/dir3d-timeline.mp4');
    expect(result.primary.durationSec).toBe(4);
    expect(result.primary.width).toBe(1024);
    expect(result.metadata?.mode).toBe('director3d-video');
    expect(result.metadata?.timeline).toEqual({ duration: 4, fps: 24, frameCount: 96 });
    expect(result.metadata?.directorPromptFragment).toBe('50mm OTS');
    // description 写入了 fragment，下游 video provider 通过 collectTextSnippets 拿到镜头语言
    expect(result.metadata?.description).toBe('50mm OTS');
    // posterSource 是落盘的首帧（不是 dataUrl），下游 image-to-video / video poster 才能用
    expect(result.primary.posterSource).toBe('koma-local://files/dir3d-frame-0.png');
    expect(persistenceMod.persistMediaAsset).not.toHaveBeenCalled();
  });

  it('outputMode=video 时下游 collectVideoPosterSources 能从 result.primary.posterSource 提取首帧', async () => {
    const persistenceMod = await import('../../../../services/mediaPersistenceService');
    vi.mocked(persistenceMod.persistMediaAsset).mockImplementation(async () => {
      throw new Error('video 分支不需要落盘');
    });
    const { executeDirector3DNode } = await import('../state/linghuiExecutionNodeExecutors');
    const { collectVideoPosterSources } = await import('../state/linghuiExecutionShared');

    const result = await executeDirector3DNode(buildDirectorNodeView({
      lineartDataUrl: 'data:image/png;base64,ANYDATA',
      outputMode: 'video',
      timelineVideoUrl: 'koma-local://files/anim.mp4',
      timelineVideoPosterUrl: 'koma-local://files/anim-frame-0.png',
    }));

    const posters = collectVideoPosterSources([result]);
    // 这是 AI 模仿动作链路的关键：下游 video provider 拿到首帧 → image-to-video 模仿动作
    expect(posters).toEqual(['koma-local://files/anim-frame-0.png']);
  });

  it('outputMode=video 但缺 timelineVideoUrl 时回退到 lineart 单图分支', async () => {
    const persistenceMod = await import('../../../../services/mediaPersistenceService');
    vi.mocked(persistenceMod.persistMediaAsset).mockImplementation(async () => ({
      kind: 'image',
      localPath: '/abs/lineart.png',
      mimeType: 'image/png',
      createdAt: Date.now(),
    }));

    const { executeDirector3DNode } = await import('../state/linghuiExecutionNodeExecutors');
    const node = buildDirectorNodeView({
      lineartDataUrl: 'data:image/png;base64,FALLBACK',
      outputMode: 'video',
      // timelineVideoUrl 缺失 → 回退
    });

    const result = await executeDirector3DNode(node);
    expect(result.kind).toBe('image');
    expect(persistenceMod.persistMediaAsset).toHaveBeenCalled();
  });

  it('actor.referenceImages 被聚合到 result.items，按 actor.label 命名，kind 升级为 images', async () => {
    const persistenceMod = await import('../../../../services/mediaPersistenceService');
    vi.mocked(persistenceMod.persistMediaAsset).mockImplementation(async () => ({
      kind: 'image',
      localPath: '/abs/primary.png',
      mimeType: 'image/png',
      createdAt: Date.now(),
    }));

    const { executeDirector3DNode } = await import('../state/linghuiExecutionNodeExecutors');
    const node = buildDirectorNodeView({
      lineartDataUrl: 'data:image/png;base64,PRIMARY',
      scene: {
        actors: [
          {
            id: 'actor-hero',
            label: '主角',
            referenceImages: [
              'koma-local://files/hero-face.png',
              'koma-local://files/hero-costume.png',
            ],
          },
          {
            id: 'actor-prop',
            label: '宝剑',
            referenceImages: ['koma-local://files/sword.png'],
          },
        ],
      },
    });

    const result = await executeDirector3DNode(node);

    // 主图 + 3 张参考图 → images 集合
    expect(result.kind).toBe('images');
    if (result.kind !== 'images') return;
    expect(result.items).toHaveLength(4);
    // 参考图按 actor.label 命名，且保留原 koma-local URL（无需二次落盘）
    const refItems = result.items.slice(1);
    expect(refItems[0].source).toBe('koma-local://files/hero-face.png');
    expect(refItems[0].label).toBe('主角 参考图 1');
    expect(refItems[1].source).toBe('koma-local://files/hero-costume.png');
    expect(refItems[1].label).toBe('主角 参考图 2');
    expect(refItems[2].source).toBe('koma-local://files/sword.png');
    expect(refItems[2].label).toBe('宝剑 参考图 1');
    expect(result.metadata?.referenceImageCount).toBe(3);
    // 参考图直接拿 URL，不应该再调 persistMediaAsset（只有主图调一次）
    expect(persistenceMod.persistMediaAsset).toHaveBeenCalledTimes(1);
  });

  it('actor.referenceImages 含重复 URL 时跨 actor 自动去重', async () => {
    const persistenceMod = await import('../../../../services/mediaPersistenceService');
    vi.mocked(persistenceMod.persistMediaAsset).mockImplementation(async () => ({
      kind: 'image',
      localPath: '/abs/primary.png',
      mimeType: 'image/png',
      createdAt: Date.now(),
    }));

    const { executeDirector3DNode } = await import('../state/linghuiExecutionNodeExecutors');
    const node = buildDirectorNodeView({
      lineartDataUrl: 'data:image/png;base64,PRIMARY',
      scene: {
        actors: [
          {
            id: 'a1',
            label: '甲',
            referenceImages: ['koma-local://files/shared.png', 'koma-local://files/unique-a.png'],
          },
          {
            id: 'a2',
            label: '乙',
            // shared.png 重复出现 → 只保留第一份
            referenceImages: ['koma-local://files/shared.png', 'koma-local://files/unique-b.png'],
          },
        ],
      },
    });

    const result = await executeDirector3DNode(node);
    expect(result.kind).toBe('images');
    if (result.kind !== 'images') return;
    // 主图 + (shared, unique-a, unique-b) = 4 项，shared 只算一次
    expect(result.items).toHaveLength(4);
    expect(result.metadata?.referenceImageCount).toBe(3);
    const sources = result.items.map((item) => item.source);
    const sharedCount = sources.filter((s) => s === 'koma-local://files/shared.png').length;
    expect(sharedCount).toBe(1);
  });

  it('无 referenceImages 时不破坏既有 lineart 单图行为', async () => {
    const persistenceMod = await import('../../../../services/mediaPersistenceService');
    vi.mocked(persistenceMod.persistMediaAsset).mockImplementation(async () => ({
      kind: 'image',
      localPath: '/abs/primary.png',
      mimeType: 'image/png',
      createdAt: Date.now(),
    }));

    const { executeDirector3DNode } = await import('../state/linghuiExecutionNodeExecutors');
    const node = buildDirectorNodeView({
      lineartDataUrl: 'data:image/png;base64,PRIMARY',
      scene: {
        actors: [
          { id: 'a1', label: '主角' }, // 没有 referenceImages
          { id: 'a2', label: '群演', referenceImages: [] }, // 空数组
          { id: 'a3', label: '坏数据', referenceImages: [123, null, ''] }, // 非字符串项被忽略
        ],
      },
    });

    const result = await executeDirector3DNode(node);
    expect(result.kind).toBe('image');
    expect(result.metadata?.referenceImageCount).toBe(0);
  });

  it('无效 angleView 项（缺 dataUrl）被丢弃后仍保留单图 kind', async () => {
    const persistenceMod = await import('../../../../services/mediaPersistenceService');
    vi.mocked(persistenceMod.persistMediaAsset).mockImplementation(async () => ({
      kind: 'image',
      localPath: '/abs/primary.png',
      mimeType: 'image/png',
      createdAt: Date.now(),
    }));

    const { executeDirector3DNode } = await import('../state/linghuiExecutionNodeExecutors');
    const node = buildDirectorNodeView({
      lineartDataUrl: 'data:image/png;base64,PRIMARY',
      angleViews: [{ id: 'bad', label: 'X' }],
    });

    const result = await executeDirector3DNode(node);
    expect(result.kind).toBe('image');
    expect(result.metadata?.angleViewCount).toBe(0);
    // 只落盘了主图（无效 angleView 被丢弃 → 不浪费 fs.write）
    expect(persistenceMod.persistMediaAsset).toHaveBeenCalledTimes(1);
  });
});

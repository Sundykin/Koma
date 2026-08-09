import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppSettings, Shot, StoredMediaAsset } from '../types';

vi.mock('../providers', () => ({
  getProjectTTSProvider: vi.fn(),
}));

vi.mock('../services/MediaGenerationService', () => ({
  mediaGenerationService: {
    generateAudio: vi.fn(),
    generateVideo: vi.fn(),
  },
}));

vi.mock('../services/ffmpegManager', () => ({
  ffmpegManager: {
    getTailFrame: vi.fn(),
  },
}));

vi.mock('../store/projectStore', () => ({
  saveShotVersion: vi.fn(),
  loadShotMeta: vi.fn(),
  loadCharacters: vi.fn(),
  loadProps: vi.fn(),
  loadScenes: vi.fn(),
  loadEpisodeShots: vi.fn(),
  updateShot: vi.fn(),
}));

vi.mock('../store/promptTemplates', () => ({
  resolvePromptTemplate: vi.fn(async () => ({
    prompt: 'fallback prompt',
    source: 'default',
    template: { id: 'itv_shot_video' },
  })),
}));

vi.mock('../config/themePresets', () => ({
  getThemeStylePrefixAsync: vi.fn(async () => 'theme-style'),
}));

function createImageAsset(remoteUrl: string): StoredMediaAsset {
  return {
    kind: 'image',
    remoteUrl,
    createdAt: 1,
  };
}

function createShot(partial?: Partial<Shot>): Shot {
  return {
    id: 'shot-1',
    scriptLines: [{ id: 'l1', text: '镜头内容' }],
    shotType: 'medium',
    cameraMovement: 'static',
    duration: 4,
    imagePrompt: '',
    videoPrompt: '已有视频提示词',
    characters: [],
    scenes: [],
    props: [],
    media: {},
    ...partial,
  };
}

// 测试 fixture 必须使用 *已注册的* providerType（resolveConfiguredChannelModel 会
// 通过 getBuiltInChannelDefinition 在 ProviderRegistry 里查找；老的 'runway'/'vidu' 已下线）。
// 现役 ITV provider：'grok2api-imagine-itv'（Grok 全能力）+ 'koma-suihe-itv'（即梦，仅图生视频）。
function createSettings(channelId: string, modelId: string): AppSettings {
  return {
    channelConfigs: [
      {
        id: 'koma-suihe-main',
        name: 'Koma 即梦（图生视频）',
        category: 'itv',
        providerType: 'koma-suihe-itv',
        providerConfig: { apiKey: 'suihe-key', baseUrl: 'https://komaapi.com' },
        defaultModelId: 'seedance-i2v-only',
        models: [
          {
            id: 'seedance-i2v-only',
            label: 'Seedance Image-to-Video Only',
            providerModelName: 'seedance-2.0-r',
            capabilities: ['video.image-to-video'],
          },
        ],
        enabled: true,
        source: 'builtin',
        createdAt: 1,
        updatedAt: 1,
      },
      {
        id: 'grok-main',
        name: 'Koma 官方 Grok',
        category: 'itv',
        providerType: 'grok2api-imagine-itv',
        providerConfig: { apiKey: 'grok-key', baseUrl: 'https://komaapi.com' },
        defaultModelId: 'grok-imagine-video',
        models: [
          {
            id: 'grok-imagine-video',
            label: 'grok-imagine-video',
            providerModelName: 'grok-imagine-video',
            capabilities: [
              'video.text-to-video',
              'video.image-to-video',
              'video.reference-to-video',
              'video.start-end-to-video',
            ],
          },
        ],
        enabled: true,
        source: 'builtin',
        createdAt: 2,
        updatedAt: 2,
      },
    ],
    mediaDefaults: {
      itv: { channelId, modelId },
    },
    promptTemplates: {},
  };
}

function createReferenceOnlySettings(): AppSettings {
  return {
    channelConfigs: [
      {
        id: 'ref-main',
        name: 'ReferenceOnly',
        category: 'itv',
        providerType: 'custom',
        providerConfig: { apiKey: 'ref-key', baseUrl: 'https://ref.example.com' },
        defaultModelId: 'ref-model-a',
        models: [
          {
            id: 'ref-model-a',
            label: 'ref-a',
            providerModelName: 'ref-a',
            capabilities: ['video.reference-to-video'],
          },
        ],
        enabled: true,
        source: 'builtin',
        createdAt: 1,
        updatedAt: 1,
      },
    ],
    mediaDefaults: {
      itv: { channelId: 'ref-main', modelId: 'ref-model-a' },
    },
    promptTemplates: {},
  };
}

// "Seedance 系" 资产合并触发条件：providerType ∈ {seedance, koma-suihe-itv}。
// 老 'seedance' 已下线，所以测试用现役的 'koma-suihe-itv'。
// 注意：实测 koma-suihe 默认模型 capabilities 仅含 image-to-video，但这里为了覆盖
// "无主图 + 模型支持参考生视频" 等场景，给一个全能力 seedance-r 模型。
function createSeedanceSettings(): AppSettings {
  return {
    channelConfigs: [
      {
        id: 'seedance-main',
        name: 'Seedance',
        category: 'itv',
        providerType: 'koma-suihe-itv',
        providerConfig: { apiKey: 'seedance-key', baseUrl: 'https://komaapi.com' },
        defaultModelId: 'seedance-2.0-r-full',
        models: [
          {
            id: 'seedance-2.0-r-full',
            label: 'Seedance 2.0 Full',
            providerModelName: 'seedance-2.0-r',
            capabilities: [
              'video.text-to-video',
              'video.image-to-video',
              'video.reference-to-video',
              'video.start-end-to-video',
            ],
            // 测试场景需要 5 张引用图（shot-anchor + 3 资产 + 1 用户上传）；
            // koma-suihe-itv 默认 maxReferenceImages=4 会截掉用户上传，所以这里调高到 6。
            defaults: { maxReferenceImages: 6 },
          },
        ],
        enabled: true,
        source: 'builtin',
        createdAt: 3,
        updatedAt: 3,
      },
    ],
    mediaDefaults: {
      itv: { channelId: 'seedance-main', modelId: 'seedance-2.0-r-full' },
    },
    promptTemplates: {},
  };
}

describe('shotRenderWorkflow video chain', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const projectStore = await import('../store/projectStore');
    vi.mocked(projectStore.loadCharacters).mockResolvedValue([]);
    vi.mocked(projectStore.loadProps).mockResolvedValue([]);
    vi.mocked(projectStore.loadScenes).mockResolvedValue([]);
    vi.mocked(projectStore.loadEpisodeShots).mockResolvedValue([]);
    vi.mocked(projectStore.loadShotMeta).mockResolvedValue({
      versions: [],
    } as any);
  });

  it('无真主图且模型支持参考生视频时，参考图和资产引用进入 reference-to-video', async () => {
    const { shotRenderWorkflow } = await import('./shotRenderWorkflow');
    const { mediaGenerationService } = await import('../services/MediaGenerationService');
    const projectStore = await import('../store/projectStore');

    vi.mocked(projectStore.loadCharacters).mockResolvedValue([]);
    vi.mocked(projectStore.loadProps).mockResolvedValue([
      {
        id: 'prop-1',
        name: '道具A',
        prompt: 'sword',
        media: {
          previewImage: createImageAsset('https://cdn.example.com/prop.png'),
        },
      },
    ] as any);
    vi.mocked(projectStore.loadScenes).mockResolvedValue([]);
    vi.mocked(projectStore.saveShotVersion).mockResolvedValue({
      version: 1,
      prompt: '已有视频提示词',
      seed: 1,
      createdAt: 1,
      model: 'test-model',
      media: {},
    } as any);
    vi.mocked(projectStore.loadShotMeta).mockResolvedValue({
      versions: [{ version: 1 }],
    } as any);

    vi.mocked(mediaGenerationService.generateVideo).mockResolvedValue({
      kind: 'video',
      localPath: '/tmp/shot.mp4',
      providerTaskId: 'task-shot-1',
      createdAt: 1,
    } as any);

    const referenceAsset = createImageAsset('https://cdn.example.com/ref.png');
    const shot = createShot({
      props: ['prop-1'],
      media: {
        references: [referenceAsset],
      },
    });

    const result = await shotRenderWorkflow(
      {
        projectId: 'project-1',
        shot,
        settings: createSettings('grok-main', 'grok-imagine-video'),
        mediaSelections: { itvSelection: 'grok-main::grok-imagine-video' },
        styleSnapshot: { ttiStylePrefix: '电影级风格' },
      },
      () => {},
    );

    expect(result.success).toBe(true);
    expect(mediaGenerationService.generateAudio).not.toHaveBeenCalled();
    expect(mediaGenerationService.generateVideo).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 'project-1',
        ownerRef: expect.objectContaining({
          ownerType: 'shot-version',
          ownerId: 'shot-1',
          slot: 'video',
        }),
        request: expect.objectContaining({
          capability: 'video.reference-to-video',
          prompt: '已有视频提示词',
          referenceImages: expect.arrayContaining([referenceAsset]),
          options: expect.objectContaining({ duration: 6 }),
        }),
        itvSelection: 'grok-main::grok-imagine-video',
        allowCapabilityFallback: false,
      }),
    );
  });

  it('seedance 分镜请求会把角色场景道具按顺序并入真实参考图', async () => {
    const { shotRenderWorkflow } = await import('./shotRenderWorkflow');
    const { mediaGenerationService } = await import('../services/MediaGenerationService');
    const projectStore = await import('../store/projectStore');

    const shotImage = createImageAsset('https://cdn.example.com/shot.png');
    const manualReference = createImageAsset('https://cdn.example.com/manual-ref.png');
    const characterImage = createImageAsset('https://cdn.example.com/char.png');
    const sceneImage = createImageAsset('https://cdn.example.com/scene.png');
    const propImage = createImageAsset('https://cdn.example.com/prop.png');

    vi.mocked(projectStore.loadCharacters).mockResolvedValue([
      {
        id: 'char-1',
        name: '角色A',
        role: 'protagonist',
        prompt: 'hero',
        media: {
          costumePhoto: characterImage,
        },
      },
    ] as any);
    vi.mocked(projectStore.loadProps).mockResolvedValue([
      {
        id: 'prop-1',
        name: '道具A',
        prompt: 'sword',
        media: {
          previewImage: propImage,
        },
      },
    ] as any);
    vi.mocked(projectStore.loadScenes).mockResolvedValue([
      {
        id: 'scene-1',
        name: '场景A',
        prompt: 'alley',
        media: {
          previewImage: sceneImage,
        },
      },
    ] as any);
    vi.mocked(projectStore.saveShotVersion).mockResolvedValue({
      version: 1,
      prompt: '已有视频提示词',
      seed: 1,
      createdAt: 1,
      model: 'test-model',
      media: {},
    } as any);
    vi.mocked(projectStore.loadShotMeta).mockResolvedValue({
      versions: [{ version: 1 }],
    } as any);
    vi.mocked(mediaGenerationService.generateVideo).mockResolvedValue({
      kind: 'video',
      localPath: '/tmp/shot.mp4',
      providerTaskId: 'task-shot-1',
      createdAt: 1,
    } as any);

    const result = await shotRenderWorkflow(
      {
        projectId: 'project-1',
        shot: createShot({
          characters: ['char-1'],
          scenes: ['scene-1'],
          props: ['prop-1'],
          media: {
            images: [shotImage],
            currentImageIndex: 0,
            references: [manualReference],
          },
        }),
        settings: createSeedanceSettings(),
        mediaSelections: { itvSelection: 'seedance-main::seedance-2.0-r-full' },
        styleSnapshot: { ttiStylePrefix: '电影级风格' },
      },
      () => {},
    );

    expect(result.success).toBe(true);
    // 模型支持 reference-to-video + 多参模式 + 有锚定图 → 走 reference-to-video。
    // request 图片顺序必须严格等于 bundle 顺序：锚点 / 场景 / 角色 / 道具 / 用户上传。
    // 这也是最终提示词中 @Image 1..N 的唯一索引来源。
    expect(mediaGenerationService.generateVideo).toHaveBeenCalledWith(
      expect.objectContaining({
        request: expect.objectContaining({
          capability: 'video.reference-to-video',
          referenceImages: [
            shotImage,
            sceneImage,
            characterImage,
            propImage,
            manualReference,
          ],
        }),
        itvSelection: 'seedance-main::seedance-2.0-r-full',
        allowCapabilityFallback: false,
      }),
    );
  });

  it('seedance 分镜渲染使用当前模型时长范围，不把 8 秒吸附成 10 秒', async () => {
    const { shotRenderWorkflow } = await import('./shotRenderWorkflow');
    const { mediaGenerationService } = await import('../services/MediaGenerationService');
    const projectStore = await import('../store/projectStore');

    const shotImage = createImageAsset('https://cdn.example.com/shot.png');

    vi.mocked(projectStore.loadCharacters).mockResolvedValue([]);
    vi.mocked(projectStore.loadProps).mockResolvedValue([]);
    vi.mocked(projectStore.loadScenes).mockResolvedValue([]);
    vi.mocked(projectStore.saveShotVersion).mockResolvedValue({
      version: 1,
      prompt: '已有视频提示词',
      seed: 1,
      createdAt: 1,
      model: 'test-model',
      media: {},
    } as any);
    vi.mocked(projectStore.loadShotMeta).mockResolvedValue({
      versions: [{ version: 1 }],
    } as any);
    vi.mocked(mediaGenerationService.generateVideo).mockResolvedValue({
      kind: 'video',
      localPath: '/tmp/shot.mp4',
      providerTaskId: 'task-shot-1',
      createdAt: 1,
    } as any);

    const result = await shotRenderWorkflow(
      {
        projectId: 'project-1',
        shot: createShot({
          duration: 8,
          media: {
            images: [shotImage],
            currentImageIndex: 0,
          },
        }),
        settings: createSeedanceSettings(),
        mediaSelections: { itvSelection: 'seedance-main::seedance-2.0-r-full' },
        styleSnapshot: { ttiStylePrefix: '电影级风格' },
      },
      () => {},
    );

    expect(result.success).toBe(true);
    expect(mediaGenerationService.generateVideo).toHaveBeenCalledWith(
      expect.objectContaining({
        request: expect.objectContaining({
          options: expect.objectContaining({ duration: 8 }),
        }),
      }),
    );
  });

  it('分镜视频链路遇到项目选择不兼容时会直接报错，不再回退到其他模型', async () => {
    const { shotRenderWorkflow } = await import('./shotRenderWorkflow');
    const { mediaGenerationService } = await import('../services/MediaGenerationService');
    const projectStore = await import('../store/projectStore');

    vi.mocked(projectStore.loadCharacters).mockResolvedValue([]);
    vi.mocked(projectStore.loadProps).mockResolvedValue([] as any);
    vi.mocked(projectStore.loadScenes).mockResolvedValue([]);

    const result = await shotRenderWorkflow(
      {
        projectId: 'project-1',
        shot: createShot(),
        settings: createSettings('koma-suihe-main', 'seedance-i2v-only'),
        mediaSelections: { itvSelection: 'koma-suihe-main::seedance-i2v-only' },
        styleSnapshot: { ttiStylePrefix: '电影级风格' },
      },
      () => {},
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe('当前选择的模型不支持文生视频，请切换模型');
    expect(mediaGenerationService.generateVideo).not.toHaveBeenCalled();
  });

  it('分镜图生视频在仅配置参考生视频模型时不会兼容成参考生视频', async () => {
    const { shotRenderWorkflow } = await import('./shotRenderWorkflow');
    const { mediaGenerationService } = await import('../services/MediaGenerationService');
    const projectStore = await import('../store/projectStore');

    vi.mocked(projectStore.loadCharacters).mockResolvedValue([]);
    vi.mocked(projectStore.loadProps).mockResolvedValue([]);
    vi.mocked(projectStore.loadScenes).mockResolvedValue([]);
    vi.mocked(projectStore.saveShotVersion).mockResolvedValue({
      version: 1,
      prompt: '已有视频提示词',
      seed: 1,
      createdAt: 1,
      model: 'test-model',
      media: {},
    } as any);
    vi.mocked(projectStore.loadShotMeta).mockResolvedValue({
      versions: [{ version: 1 }],
    } as any);
    vi.mocked(mediaGenerationService.generateVideo).mockResolvedValue({
      kind: 'video',
      localPath: '/tmp/shot.mp4',
      providerTaskId: 'task-shot-1',
      createdAt: 1,
    } as any);

    const referenceAsset = createImageAsset('https://cdn.example.com/ref.png');
    const result = await shotRenderWorkflow(
      {
        projectId: 'project-1',
        shot: createShot({
          media: {
            references: [referenceAsset],
            selectedReferenceIndex: 0,
          },
        }),
        settings: createReferenceOnlySettings(),
        mediaSelections: { itvSelection: 'ref-main::ref-model-a' },
        styleSnapshot: { ttiStylePrefix: '电影级风格' },
      },
      () => {},
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe('当前没有配置支持图生视频的视频模型');
    expect(mediaGenerationService.generateVideo).not.toHaveBeenCalled();
  });

  it('只有角色场景道具且模型支持参考生视频时，资产图作为 referenceImages 而不是主图', async () => {
    const { shotRenderWorkflow } = await import('./shotRenderWorkflow');
    const { mediaGenerationService } = await import('../services/MediaGenerationService');
    const projectStore = await import('../store/projectStore');

    vi.mocked(projectStore.loadCharacters).mockResolvedValue([]);
    vi.mocked(projectStore.loadProps).mockResolvedValue([
      {
        id: 'prop-1',
        name: '道具A',
        prompt: 'sword',
        media: {
          previewImage: createImageAsset('https://cdn.example.com/prop.png'),
        },
      },
    ] as any);
    vi.mocked(projectStore.loadScenes).mockResolvedValue([]);
    vi.mocked(projectStore.saveShotVersion).mockResolvedValue({
      version: 1,
      prompt: '已有视频提示词',
      seed: 1,
      createdAt: 1,
      model: 'test-model',
      media: {},
    } as any);
    vi.mocked(projectStore.loadShotMeta).mockResolvedValue({
      versions: [{ version: 1 }],
    } as any);
    vi.mocked(mediaGenerationService.generateVideo).mockResolvedValue({
      kind: 'video',
      localPath: '/tmp/shot.mp4',
      providerTaskId: 'task-shot-1',
      createdAt: 1,
    } as any);

    const result = await shotRenderWorkflow(
      {
        projectId: 'project-1',
        shot: createShot({
          props: ['prop-1'],
        }),
        settings: createSettings('grok-main', 'grok-imagine-video'),
        mediaSelections: { itvSelection: 'grok-main::grok-imagine-video' },
        styleSnapshot: { ttiStylePrefix: '电影级风格' },
      },
      () => {},
    );

    expect(result.success).toBe(true);
    expect(mediaGenerationService.generateVideo).toHaveBeenCalledWith(
      expect.objectContaining({
        request: expect.objectContaining({
          capability: 'video.reference-to-video',
          prompt: '已有视频提示词',
          referenceImages: expect.arrayContaining([
            expect.objectContaining({ remoteUrl: 'https://cdn.example.com/prop.png' }),
          ]),
          options: expect.objectContaining({ duration: 6 }),
        }),
        allowCapabilityFallback: false,
      }),
    );
    expect((vi.mocked(mediaGenerationService.generateVideo).mock.calls.at(-1)?.[0] as any)?.request.primaryImage).toBeUndefined();
  });

  it('批量渲染单项失败后继续后续分镜，并逐项触发完成回调', async () => {
    const { batchRenderShots } = await import('./shotRenderWorkflow');
    const { mediaGenerationService } = await import('../services/MediaGenerationService');
    const projectStore = await import('../store/projectStore');

    vi.mocked(projectStore.loadCharacters).mockResolvedValue([]);
    vi.mocked(projectStore.loadProps).mockResolvedValue([]);
    vi.mocked(projectStore.loadScenes).mockResolvedValue([]);
    vi.mocked(projectStore.loadEpisodeShots).mockResolvedValue([]);
    vi.mocked(projectStore.saveShotVersion)
      .mockResolvedValueOnce({
        version: 1,
        prompt: '视频提示词 1',
        seed: 1,
        createdAt: 1,
        model: 'test-model',
        media: {},
      } as any)
      .mockResolvedValueOnce({
        version: 2,
        prompt: '视频提示词 2',
        seed: 2,
        createdAt: 2,
        model: 'test-model',
        media: {},
      } as any);
    vi.mocked(projectStore.loadShotMeta).mockResolvedValue({
      versions: [{ version: 1 }, { version: 2 }],
    } as any);
    // 并发下调用顺序不保证，按 shotId 分发：shot-1 失败、shot-2 成功
    vi.mocked(mediaGenerationService.generateVideo)
      .mockImplementation(async (params: { ownerRef?: { ownerId?: string } }) => {
        // ownerRef.ownerId 是分镜 id（shot-version 场景）
        const ownerId = params?.ownerRef?.ownerId ?? '';
        if (ownerId.startsWith('shot-1')) {
          throw new Error('第一个视频失败');
        }
        return {
          kind: 'video',
          localPath: '/tmp/shot-2.mp4',
          createdAt: 2,
        } as any;
      });

    const onShotComplete = vi.fn();
    const result = await batchRenderShots(
      {
        projectId: 'project-1',
        episodeId: 'episode-1',
        shots: [
          createShot({
            id: 'shot-1',
            videoPrompt: '视频提示词 1',
            media: {
              images: [createImageAsset('https://cdn.example.com/shot-1.png')],
              currentImageIndex: 0,
            },
          }),
          createShot({
            id: 'shot-2',
            videoPrompt: '视频提示词 2',
            media: {
              images: [createImageAsset('https://cdn.example.com/shot-2.png')],
              currentImageIndex: 0,
            },
          }),
        ],
        settings: createSettings('grok-main', 'grok-imagine-video'),
        mediaSelections: { itvSelection: 'grok-main::grok-imagine-video' },
        onShotComplete,
      },
      () => {},
    );

    expect(result.total).toBe(2);
    expect(result.success).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.results.map(item => item.shotId)).toEqual(['shot-1', 'shot-2']);
    expect(result.results[0]).toMatchObject({ shotId: 'shot-1', success: false, error: '第一个视频失败' });
    expect(result.results[1]).toMatchObject({ shotId: 'shot-2', success: true });
    expect(mediaGenerationService.generateVideo).toHaveBeenCalledTimes(2);
    expect(onShotComplete).toHaveBeenCalledTimes(2);
    expect(onShotComplete.mock.calls.map(call => call[0].success)).toEqual([false, true]);
  });

  it('手写视频提示词已有对白提示词时，不再把 shot.dialogue 追加成重复台词', async () => {
    const { shotRenderWorkflow } = await import('./shotRenderWorkflow');
    const { mediaGenerationService } = await import('../services/MediaGenerationService');
    const projectStore = await import('../store/projectStore');

    vi.mocked(projectStore.loadCharacters).mockResolvedValue([
      { id: 'char_yeshu', name: '叶赎' },
      { id: 'char_xiaobai', name: '小白' },
    ] as any);
    vi.mocked(projectStore.loadProps).mockResolvedValue([]);
    vi.mocked(projectStore.loadScenes).mockResolvedValue([]);
    vi.mocked(projectStore.loadEpisodeShots).mockResolvedValue([]);
    vi.mocked(projectStore.saveShotVersion).mockResolvedValue({
      version: 1,
      prompt: '',
      seed: 1,
      createdAt: 1,
      model: 'test-model',
      media: {},
    } as any);
    vi.mocked(projectStore.loadShotMeta).mockResolvedValue({ versions: [{ version: 1 }] } as any);
    vi.mocked(mediaGenerationService.generateVideo).mockResolvedValue({
      kind: 'video',
      localPath: '/tmp/video.mp4',
      createdAt: 1,
    } as any);

    const manualPrompt = [
      '整体画风：动漫风格',
      '画面描述：@storyboard_anchor',
      '角色提示词：@char_yeshu 叶赎 @char_xiaobai 小白',
      '对白提示词：叶赎 台词：『我叫叶赎，好不容易踏上仙途。刚做了一桌好菜准备庆祝，结果遇到了一个自称天道的小萝莉！』；小白 台词：『我是天道！你看这段画面。』',
      '精确时长：15秒',
    ].join('\n');

    await shotRenderWorkflow(
      {
        projectId: 'project-1',
        episodeId: 'episode-1',
        shot: createShot({
          id: 'shot-1',
          imageMode: 'storyboard',
          videoMode: 'multi-ref',
          videoPrompt: manualPrompt,
          dialogue: '她自称天道，说要帮我夺回气运',
          characters: ['char_yeshu', 'char_xiaobai'],
          media: {
            images: [createImageAsset('https://cdn.example.com/storyboard.png')],
            currentImageIndex: 0,
          },
        }),
        settings: createSettings('grok-main', 'grok-imagine-video'),
        mediaSelections: { itvSelection: 'grok-main::grok-imagine-video' },
      },
      () => {},
    );

    const request = vi.mocked(mediaGenerationService.generateVideo).mock.calls[0][0].request as any;
    expect(request.prompt).toContain('叶赎 台词');
    expect(request.prompt).toContain('小白 台词');
    expect(request.prompt).not.toContain('帮你夺回气运');
    expect(request.prompt).not.toContain('我自称天道');
    expect(request.prompt.match(/我叫叶赎/g)).toHaveLength(1);
  });

  it('videoPrompt 与 scriptLines 都为空才阻止视频生成', async () => {
    // 合并分镜后 videoPrompt 会被清空，但 scriptLines 仍然完整 —— 此时应该回落到
    // scriptLines 作为兜底，不能直接报"请先填写视频提示词"否则用户看到剧情齐全却生不出来。
    // 这条用例验证：videoPrompt 与 scriptLines 都空才硬拦。
    const { shotRenderWorkflow } = await import('./shotRenderWorkflow');
    const { mediaGenerationService } = await import('../services/MediaGenerationService');
    const projectStore = await import('../store/projectStore');

    vi.mocked(projectStore.loadCharacters).mockResolvedValue([]);
    vi.mocked(projectStore.loadProps).mockResolvedValue([]);
    vi.mocked(projectStore.loadScenes).mockResolvedValue([]);
    vi.mocked(projectStore.loadEpisodeShots).mockResolvedValue([]);

    const result = await shotRenderWorkflow(
      {
        projectId: 'project-1',
        episodeId: 'episode-1',
        shot: createShot({ videoPrompt: '', scriptLines: [] }),
        settings: createSettings('grok-main', 'grok-imagine-video'),
        mediaSelections: { itvSelection: 'grok-main::grok-imagine-video' },
      },
      () => {},
    );

    expect(result).toMatchObject({ success: false, error: '请先填写剧情或视频提示词' });
    expect(mediaGenerationService.generateVideo).not.toHaveBeenCalled();
  });

  it('连续性镜头在生成前提取上一镜真实尾帧并把它编译为第一参考图', async () => {
    const { shotRenderWorkflow } = await import('./shotRenderWorkflow');
    const { mediaGenerationService } = await import('../services/MediaGenerationService');
    const { ffmpegManager } = await import('../services/ffmpegManager');
    const projectStore = await import('../store/projectStore');
    const previousVideo = createImageAsset('https://cdn.example.com/previous.mp4') as any;
    previousVideo.kind = 'video';
    previousVideo.providerTaskId = 'previous-task';
    const generatedVideo = {
      kind: 'video',
      localPath: '/tmp/current.mp4',
      createdAt: 2,
    } as any;
    const tailPath = '/tmp/tail-frame.jpg';

    vi.mocked(projectStore.loadShotMeta).mockImplementation(async (_projectId, shotId) => {
      if (shotId === 'shot-prev') {
        return { id: 'shot-prev', currentVersion: 1, versions: [{ version: 1, media: { video: previousVideo } }] } as any;
      }
      return { id: 'shot-next', currentVersion: 1, versions: [{ version: 1, media: { video: generatedVideo } }] } as any;
    });
    vi.mocked(projectStore.saveShotVersion).mockResolvedValue({
      version: 1,
      prompt: '连续性 prompt',
      seed: 1,
      createdAt: 1,
      model: 'test-model',
      media: {},
    } as any);
    vi.mocked(mediaGenerationService.generateVideo).mockResolvedValue(generatedVideo);
    vi.mocked(ffmpegManager.getTailFrame).mockResolvedValue(tailPath);
    vi.mocked(projectStore.updateShot).mockResolvedValue(null as any);

    const previous = createShot({
      id: 'shot-prev',
      scenes: ['scene-room'],
      media: { videos: [previousVideo], currentVideoIndex: 0 },
    });
    const current = createShot({
      id: 'shot-next',
      scenes: ['scene-room'],
      videoReference: {
        mode: 'auto',
        usePreviousTailFrame: true,
        autoUsePreviousTailFrame: true,
        continuityReason: '同一场景延续',
      },
      videoPrompt: '镜头从人物抬手继续',
    });

    const result = await shotRenderWorkflow({
      projectId: 'project-1',
      episodeId: 'episode-1',
      shot: current,
      allShots: [previous, current],
      settings: createSettings('grok-main', 'grok-imagine-video'),
      mediaSelections: { itvSelection: 'grok-main::grok-imagine-video' },
    }, () => {});

    expect(result.success).toBe(true);
    expect(ffmpegManager.getTailFrame).toHaveBeenCalledWith(previousVideo, 'shot-next', expect.objectContaining({
      sourceVideoKey: expect.stringContaining('shot-prev'),
    }));
    expect(projectStore.updateShot).toHaveBeenCalledWith(
      'project-1',
      'episode-1',
      'shot-next',
      expect.objectContaining({
        videoReference: expect.objectContaining({
          sourceShotId: 'shot-prev',
          sourceVideoKey: expect.stringContaining('shot-prev'),
          referenceFrame: expect.objectContaining({ localPath: tailPath }),
        }),
      }),
    );
    const request = vi.mocked(mediaGenerationService.generateVideo).mock.calls.at(-1)?.[0].request as any;
    expect(request.referenceImages?.[0]).toEqual(expect.objectContaining({ localPath: tailPath }));
    expect(request.prompt).toContain('@Image 1');
  });

  it('需要连续性但上一镜没有真实视频时明确失败且不调用抽帧', async () => {
    const { shotRenderWorkflow } = await import('./shotRenderWorkflow');
    const { mediaGenerationService } = await import('../services/MediaGenerationService');
    const { ffmpegManager } = await import('../services/ffmpegManager');
    const projectStore = await import('../store/projectStore');
    vi.mocked(projectStore.loadShotMeta).mockResolvedValue({ id: 'shot-prev', currentVersion: 0, versions: [] } as any);

    const previous = createShot({ id: 'shot-prev', scenes: ['scene-room'], media: {} });
    const current = createShot({
      id: 'shot-next',
      scenes: ['scene-room'],
      videoReference: { mode: 'manual', usePreviousTailFrame: true, sourceShotId: 'shot-prev' },
    });
    const result = await shotRenderWorkflow({
      projectId: 'project-1',
      episodeId: 'episode-1',
      shot: current,
      allShots: [previous, current],
      settings: createSettings('grok-main', 'grok-imagine-video'),
      mediaSelections: { itvSelection: 'grok-main::grok-imagine-video' },
    }, () => {});

    expect(result).toMatchObject({ success: false, error: expect.stringContaining('没有已完成的真实视频') });
    expect(ffmpegManager.getTailFrame).not.toHaveBeenCalled();
    expect(mediaGenerationService.generateVideo).not.toHaveBeenCalled();
  });

  it('批量连续镜头等待上一镜完成后才抽尾帧并生成', async () => {
    const { batchRenderShots } = await import('./shotRenderWorkflow');
    const { mediaGenerationService } = await import('../services/MediaGenerationService');
    const { ffmpegManager } = await import('../services/ffmpegManager');
    const projectStore = await import('../store/projectStore');
    const predecessorVideo = { kind: 'video', localPath: '/tmp/shot-prev.mp4', createdAt: 10 } as any;
    const currentVideo = { kind: 'video', localPath: '/tmp/shot-next.mp4', createdAt: 20 } as any;
    let predecessorFinished = false;

    vi.mocked(projectStore.saveShotVersion).mockImplementation(async (_projectId, shotId) => ({
      version: 1,
      prompt: `${shotId} prompt`,
      seed: 1,
      createdAt: 1,
      model: 'test-model',
      media: {},
    } as any));
    vi.mocked(projectStore.loadShotMeta).mockImplementation(async (_projectId, shotId) => {
      if (shotId === 'shot-prev') {
        return predecessorFinished
          ? { id: shotId, currentVersion: 1, versions: [{ version: 1, media: { video: predecessorVideo } }] } as any
          : { id: shotId, currentVersion: 0, versions: [] } as any;
      }
      return { id: shotId, currentVersion: 1, versions: [{ version: 1, media: { video: currentVideo } }] } as any;
    });
    vi.mocked(mediaGenerationService.generateVideo).mockImplementation(async (args: any) => {
      if (args.ownerRef.ownerId === 'shot-prev') {
        predecessorFinished = true;
        return predecessorVideo;
      }
      expect(predecessorFinished).toBe(true);
      return currentVideo;
    });
    vi.mocked(ffmpegManager.getTailFrame).mockImplementation(async () => {
      expect(predecessorFinished).toBe(true);
      return '/tmp/shot-prev-tail.jpg';
    });
    vi.mocked(projectStore.updateShot).mockResolvedValue(null as any);

    const previous = createShot({ id: 'shot-prev', scenes: ['room'], videoPrompt: '前镜' });
    const current = createShot({
      id: 'shot-next',
      scenes: ['room'],
      videoPrompt: '后镜',
      videoReference: {
        mode: 'auto',
        usePreviousTailFrame: true,
        autoUsePreviousTailFrame: true,
        sourceShotId: 'shot-prev',
      },
    });
    const onShotComplete = vi.fn();
    const result = await batchRenderShots({
      projectId: 'project-1',
      episodeId: 'episode-1',
      shots: [previous, current],
      allShots: [previous, current],
      concurrency: 2,
      settings: createSettings('grok-main', 'grok-imagine-video'),
      mediaSelections: { itvSelection: 'grok-main::grok-imagine-video' },
      onShotComplete,
    }, () => {});

    expect(result).toMatchObject({ total: 2, success: 2, failed: 0 });
    expect(vi.mocked(mediaGenerationService.generateVideo).mock.calls.map(call => call[0].ownerRef.ownerId))
      .toEqual(['shot-prev', 'shot-next']);
    expect(ffmpegManager.getTailFrame).toHaveBeenCalledTimes(1);
    expect(onShotComplete).toHaveBeenCalledTimes(2);
  });

  it('批量上一镜失败时阻止依赖镜头，但不影响完成回调', async () => {
    const { batchRenderShots } = await import('./shotRenderWorkflow');
    const { mediaGenerationService } = await import('../services/MediaGenerationService');
    const { ffmpegManager } = await import('../services/ffmpegManager');
    const projectStore = await import('../store/projectStore');
    vi.mocked(projectStore.saveShotVersion).mockResolvedValue({
      version: 1, prompt: 'prev', seed: 1, createdAt: 1, model: 'test', media: {},
    } as any);
    vi.mocked(mediaGenerationService.generateVideo).mockRejectedValue(new Error('前镜生成失败'));
    const previous = createShot({ id: 'shot-prev', scenes: ['room'] });
    const current = createShot({
      id: 'shot-next',
      scenes: ['room'],
      videoReference: {
        mode: 'manual',
        usePreviousTailFrame: true,
        sourceShotId: 'shot-prev',
      },
    });
    const onShotComplete = vi.fn();

    const result = await batchRenderShots({
      projectId: 'project-1',
      episodeId: 'episode-1',
      shots: [previous, current],
      allShots: [previous, current],
      concurrency: 2,
      settings: createSettings('grok-main', 'grok-imagine-video'),
      mediaSelections: { itvSelection: 'grok-main::grok-imagine-video' },
      onShotComplete,
    }, () => {});

    expect(result.failed).toBe(2);
    expect(result.results[1].error).toContain('依赖分镜 shot-prev 失败');
    expect(mediaGenerationService.generateVideo).toHaveBeenCalledTimes(1);
    expect(ffmpegManager.getTailFrame).not.toHaveBeenCalled();
    expect(onShotComplete).toHaveBeenCalledTimes(2);
  });

  it('批量无连续性依赖的镜头仍按并发上限并行执行', async () => {
    const { batchRenderShots } = await import('./shotRenderWorkflow');
    const { mediaGenerationService } = await import('../services/MediaGenerationService');
    const projectStore = await import('../store/projectStore');
    let releaseFirst!: () => void;
    let notifySecondStarted!: () => void;
    const firstGate = new Promise<void>(resolve => { releaseFirst = resolve; });
    const secondStarted = new Promise<void>(resolve => { notifySecondStarted = resolve; });

    vi.mocked(projectStore.saveShotVersion).mockResolvedValue({
      version: 1, prompt: 'parallel', seed: 1, createdAt: 1, model: 'test', media: {},
    } as any);
    vi.mocked(projectStore.loadShotMeta).mockImplementation(async (_projectId, shotId) => ({
      id: shotId,
      currentVersion: 1,
      versions: [{ version: 1, media: { video: { kind: 'video', localPath: `/tmp/${shotId}.mp4`, createdAt: 1 } } }],
    } as any));
    vi.mocked(mediaGenerationService.generateVideo).mockImplementation(async (args: any) => {
      if (args.ownerRef.ownerId === 'shot-a') {
        await firstGate;
      } else {
        notifySecondStarted();
      }
      return { kind: 'video', localPath: `/tmp/${args.ownerRef.ownerId}.mp4`, createdAt: 1 } as any;
    });

    const shotA = createShot({
      id: 'shot-a',
      videoReference: { mode: 'manual', usePreviousTailFrame: false },
    });
    const shotB = createShot({
      id: 'shot-b',
      videoReference: { mode: 'manual', usePreviousTailFrame: false },
    });
    const batchPromise = batchRenderShots({
      projectId: 'project-1',
      episodeId: 'episode-1',
      shots: [shotA, shotB],
      allShots: [shotA, shotB],
      concurrency: 2,
      settings: createSettings('grok-main', 'grok-imagine-video'),
      mediaSelections: { itvSelection: 'grok-main::grok-imagine-video' },
    }, () => {});

    await secondStarted;
    expect(mediaGenerationService.generateVideo).toHaveBeenCalledTimes(2);
    releaseFirst();
    await expect(batchPromise).resolves.toMatchObject({ success: 2, failed: 0 });
  });
});

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

vi.mock('../store/projectStore', () => ({
  saveShotVersion: vi.fn(),
  loadShotMeta: vi.fn(),
  loadCharacters: vi.fn(),
  loadProps: vi.fn(),
  loadScenes: vi.fn(),
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
    scriptContent: '镜头内容',
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

function createSettings(channelId: string, modelId: string): AppSettings {
  return {
    channelConfigs: [
      {
        id: 'runway-main',
        name: 'Runway',
        category: 'itv',
        providerType: 'runway',
        providerConfig: { apiKey: 'runway-key' },
        defaultModelId: 'runway-model-a',
        models: [
          {
            id: 'runway-model-a',
            label: 'runway-a',
            providerModelName: 'runway-a',
            capabilities: ['video.image-to-video'],
          },
        ],
        enabled: true,
        source: 'builtin',
        createdAt: 1,
        updatedAt: 1,
      },
      {
        id: 'vidu-main',
        name: 'Vidu',
        category: 'itv',
        providerType: 'vidu',
        providerConfig: { apiKey: 'vidu-key', baseUrl: 'https://vidu.example.com' },
        defaultModelId: 'vidu-model-a',
        models: [
          {
            id: 'vidu-model-a',
            label: 'vidu-a',
            providerModelName: 'vidu-a',
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

function createSeedanceSettings(): AppSettings {
  return {
    channelConfigs: [
      {
        id: 'seedance-main',
        name: 'Seedance',
        category: 'itv',
        providerType: 'seedance',
        providerConfig: { apiKey: 'seedance-key', baseUrl: 'https://toapis.example.com' },
        defaultModelId: 'seedance-2.0',
        models: [
          {
            id: 'seedance-2.0',
            label: 'Seedance 2.0',
            providerModelName: 'seedance-2.0',
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
        createdAt: 3,
        updatedAt: 3,
      },
    ],
    mediaDefaults: {
      itv: { channelId: 'seedance-main', modelId: 'seedance-2.0' },
    },
    promptTemplates: {},
  };
}

describe('shotRenderWorkflow video chain', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
        settings: createSettings('vidu-main', 'vidu-model-a'),
        mediaSelections: { itvSelection: 'vidu-main::vidu-model-a' },
        styleSnapshot: { ttiStylePrefix: '电影级风格' },
      },
      () => {},
    );

    expect(result.success).toBe(true);
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
        itvSelection: 'vidu-main::vidu-model-a',
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
        mediaSelections: { itvSelection: 'seedance-main::seedance-2.0' },
        styleSnapshot: { ttiStylePrefix: '电影级风格' },
      },
      () => {},
    );

    expect(result.success).toBe(true);
    expect(mediaGenerationService.generateVideo).toHaveBeenCalledWith(
      expect.objectContaining({
        request: expect.objectContaining({
          capability: 'video.image-to-video',
          primaryImage: shotImage,
          additionalReferences: [
            characterImage,
            sceneImage,
            propImage,
            manualReference,
          ],
        }),
        itvSelection: 'seedance-main::seedance-2.0',
        allowCapabilityFallback: false,
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
        settings: createSettings('runway-main', 'runway-model-a'),
        mediaSelections: { itvSelection: 'runway-main::runway-model-a' },
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
        settings: createSettings('vidu-main', 'vidu-model-a'),
        mediaSelections: { itvSelection: 'vidu-main::vidu-model-a' },
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
});

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

describe('shotRenderWorkflow video chain', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('分镜视频链路会按能力生成标准请求并透传选择上下文', async () => {
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
    const shot = createShot({
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
          referenceImages: [referenceAsset],
        }),
        itvSelection: 'vidu-main::vidu-model-a',
      }),
    );
  });

  it('分镜视频链路遇到模型能力不匹配时快速失败并返回明确提示', async () => {
    const { shotRenderWorkflow } = await import('./shotRenderWorkflow');
    const { mediaGenerationService } = await import('../services/MediaGenerationService');
    const projectStore = await import('../store/projectStore');

    vi.mocked(projectStore.loadCharacters).mockResolvedValue([]);
    vi.mocked(projectStore.loadProps).mockResolvedValue([]);
    vi.mocked(projectStore.loadScenes).mockResolvedValue([]);

    const result = await shotRenderWorkflow(
      {
        projectId: 'project-1',
        shot: createShot({
          media: {
            references: [createImageAsset('https://cdn.example.com/ref.png')],
          },
        }),
        settings: createSettings('runway-main', 'runway-model-a'),
        mediaSelections: { itvSelection: 'runway-main::runway-model-a' },
        styleSnapshot: { ttiStylePrefix: '电影级风格' },
      },
      () => {},
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe('当前项目选择的视频模型不支持参考生视频，请切换模型');
    expect(mediaGenerationService.generateVideo).not.toHaveBeenCalled();
  });
});

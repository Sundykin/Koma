import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Character, Prop, StoredMediaAsset } from '../types';

vi.mock('../providers', () => ({
  getProjectITVProvider: vi.fn(),
}));

vi.mock('../services/MediaGenerationService', () => ({
  mediaGenerationService: {
    generateImage: vi.fn(),
    generateVideo: vi.fn(),
  },
}));

vi.mock('../store/promptTemplates', () => ({
  resolvePromptTemplate: vi.fn(),
}));

vi.mock('../config/themePresets', () => ({
  getThemeStylePrefix: vi.fn(() => 'theme-style'),
  getThemeStylePrefixAsync: vi.fn(async () => 'theme-style'),
}));

function createImageAsset(remoteUrl: string): StoredMediaAsset {
  return {
    kind: 'image',
    remoteUrl,
    createdAt: 1,
  };
}

function createCharacter(partial?: Partial<Character>): Character {
  return {
    id: 'char-1',
    name: '主角A',
    role: 'protagonist',
    prompt: '坚定的女战士',
    media: {},
    ...partial,
  };
}

function createProp(partial?: Partial<Prop>): Prop {
  return {
    id: 'prop-1',
    name: '神秘盒子',
    prompt: '古老金属盒',
    media: {},
    ...partial,
  };
}

describe('asset preview video workflows', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('角色预览视频会编译图生视频标准请求并透传 itvSelection', async () => {
    const { generateCharacterPreviewVideo } = await import('./characterAssetWorkflow');
    const { resolvePromptTemplate } = await import('../store/promptTemplates');
    const { mediaGenerationService } = await import('../services/MediaGenerationService');

    vi.mocked(resolvePromptTemplate).mockImplementation(async (_templateId, variables: any) => ({
      prompt: `[${variables.stylePrefix}] ${variables.characterName}: ${variables.action}`,
      source: 'custom',
      template: { id: 'itv_character_motion' },
    } as any));
    vi.mocked(mediaGenerationService.generateVideo).mockResolvedValue({
      kind: 'video',
      localPath: '/tmp/character-preview.mp4',
      providerTaskId: 'task-char-1',
      createdAt: 1,
    } as any);

    const character = createCharacter({
      media: {
        costumePhoto: createImageAsset('https://cdn.example.com/char.png'),
      },
    });

    const result = await generateCharacterPreviewVideo({
      projectId: 'project-1',
      character,
      styleSnapshot: { ttiStylePrefix: '电影风格' },
      itvSelection: 'vidu-main::vidu-model-a',
    });

    expect(result.success).toBe(true);
    expect(resolvePromptTemplate).toHaveBeenCalledWith(
      'itv_character_motion',
      expect.objectContaining({
        stylePrefix: '电影风格',
        characterName: '主角A',
      }),
    );
    expect(mediaGenerationService.generateVideo).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerRef: expect.objectContaining({
          ownerType: 'character',
          ownerId: 'char-1',
          slot: 'previewVideo',
        }),
        request: expect.objectContaining({
          capability: 'video.image-to-video',
          primaryImage: 'https://cdn.example.com/char.png',
          options: expect.objectContaining({
            duration: 4,
            aspectRatio: '9:16',
          }),
        }),
        itvSelection: 'vidu-main::vidu-model-a',
      }),
    );
  });

  it('道具预览视频在模型能力不匹配时返回明确错误提示', async () => {
    const { generatePropPreviewVideo } = await import('./scenePropAssetWorkflow');
    const { resolvePromptTemplate } = await import('../store/promptTemplates');
    const { mediaGenerationService } = await import('../services/MediaGenerationService');

    vi.mocked(resolvePromptTemplate).mockResolvedValue({
      prompt: '道具展示视频提示词',
      source: 'custom',
      template: { id: 'itv_prop_motion' },
    } as any);
    vi.mocked(mediaGenerationService.generateVideo).mockRejectedValue(
      new Error('当前选择的模型不支持图生视频，请切换模型'),
    );

    const result = await generatePropPreviewVideo({
      projectId: 'project-1',
      prop: createProp({
        media: {
          previewImage: createImageAsset('https://cdn.example.com/prop.png'),
        },
      }),
      styleSnapshot: { ttiStylePrefix: '写实工业风' },
      itvSelection: 'runway-main::runway-model-a',
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('当前选择的模型不支持图生视频，请切换模型');
    expect(mediaGenerationService.generateVideo).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerRef: expect.objectContaining({
          ownerType: 'prop',
          ownerId: 'prop-1',
          slot: 'previewVideo',
        }),
        request: expect.objectContaining({
          capability: 'video.image-to-video',
          primaryImage: 'https://cdn.example.com/prop.png',
          options: expect.objectContaining({
            duration: 4,
            aspectRatio: '1:1',
          }),
        }),
        itvSelection: 'runway-main::runway-model-a',
      }),
    );
  });
});

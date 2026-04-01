import { describe, expect, it } from 'vitest';
import type {
  AppSettings,
  Character,
  Prop,
  Scene,
  Shot,
  StoredMediaAsset,
} from '../types';
import {
  buildShotVideoRequest,
  collectShotVideoPlan,
  resolveShotVideoCapabilitySupport,
} from './shotVideoPlan';

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
    scriptContent: '镜头描述',
    shotType: 'medium',
    cameraMovement: 'static',
    duration: 4,
    imagePrompt: '',
    videoPrompt: '',
    characters: [],
    scenes: [],
    props: [],
    media: {},
    ...partial,
  };
}

function createSettings(): AppSettings {
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
      itv: {
        channelId: 'runway-main',
        modelId: 'runway-model-a',
      },
    },
    promptTemplates: {},
  };
}

describe('shotVideoPlan', () => {
  it('有选中主图时优先走图生视频，并保留补充参考', () => {
    const character: Character = {
      id: 'char-1',
      name: '角色A',
      role: 'protagonist',
      prompt: 'hero',
      media: {
        costumePhoto: createImageAsset('https://cdn.example.com/char.png'),
      },
    };
    const shot = createShot({
      characters: ['char-1'],
      media: {
        images: [createImageAsset('https://cdn.example.com/shot.png')],
        currentImageIndex: 0,
        references: [
          createImageAsset('https://cdn.example.com/manual-ref.png'),
          createImageAsset('https://cdn.example.com/manual-ref.png'),
        ],
      },
    });

    const plan = collectShotVideoPlan({
      shot,
      characters: [character],
      scenes: [],
      props: [],
    });

    expect(plan.capability).toBe('video.image-to-video');
    expect(plan.selectedImageSource).toBe('https://cdn.example.com/shot.png');
    expect(plan.additionalReferenceImages).toEqual([
      'https://cdn.example.com/char.png',
      createImageAsset('https://cdn.example.com/manual-ref.png'),
    ]);

    expect(buildShotVideoRequest({
      plan,
      prompt: '生成一个角色展示镜头',
      duration: 4,
      aspectRatio: '16:9',
    })).toMatchObject({
      capability: 'video.image-to-video',
      prompt: '生成一个角色展示镜头',
      primaryImage: shot.media?.images?.[0],
    });
  });

  it('没有主图但有参考时走参考生视频', () => {
    const prop: Prop = {
      id: 'prop-1',
      name: '道具A',
      prompt: 'sword',
      media: {
        previewImage: createImageAsset('https://cdn.example.com/prop.png'),
      },
    };
    const shot = createShot({
      props: ['prop-1'],
    });

    const plan = collectShotVideoPlan({
      shot,
      characters: [],
      scenes: [],
      props: [prop],
    });

    expect(plan.capability).toBe('video.reference-to-video');
    expect(buildShotVideoRequest({
      plan,
      prompt: '展示道具细节',
      duration: 4,
      aspectRatio: '1:1',
    })).toEqual({
      capability: 'video.reference-to-video',
      prompt: '展示道具细节',
      referenceImages: ['https://cdn.example.com/prop.png'],
      options: {
        duration: 4,
        motionPrompt: undefined,
        aspectRatio: '1:1',
      },
    });
  });

  it('没有任何视觉输入时走文生视频', () => {
    const plan = collectShotVideoPlan({
      shot: createShot(),
      characters: [],
      scenes: [],
      props: [],
    });

    expect(plan.capability).toBe('video.text-to-video');
  });

  it('能力支持检查会给出清晰原因', () => {
    const settings = createSettings();

    const unsupportedBySelection = resolveShotVideoCapabilitySupport({
      settings,
      selectionKey: 'runway-main::runway-model-a',
      capability: 'video.text-to-video',
    });
    expect(unsupportedBySelection.disabledReason).toBe('当前项目选择的视频模型不支持文生视频，请切换模型');

    const unsupportedEverywhere = resolveShotVideoCapabilitySupport({
      settings: {
        ...settings,
        channelConfigs: settings.channelConfigs.filter(config => config.id === 'runway-main'),
      },
      selectionKey: 'runway-main::runway-model-a',
      capability: 'video.reference-to-video',
    });
    expect(unsupportedEverywhere.disabledReason).toBe('当前没有配置支持参考生视频的视频模型');
  });

  it('能力支持时返回解析后的模型上下文', () => {
    const support = resolveShotVideoCapabilitySupport({
      settings: createSettings(),
      selectionKey: 'vidu-main::vidu-model-a',
      capability: 'video.reference-to-video',
    });

    expect(support.disabledReason).toBeUndefined();
    expect(support.resolvedContext?.definition.id).toBe('vidu');
    expect(support.resolvedContext?.model.id).toBe('vidu-model-a');
  });
});

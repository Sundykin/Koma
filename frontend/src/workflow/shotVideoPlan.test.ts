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
      itv: {
        channelId: 'ref-main',
        modelId: 'ref-model-a',
      },
    },
    promptTemplates: {},
  };
}

describe('shotVideoPlan', () => {
  it('有选中主图时按图生视频执行，角色资产只保留在提示词编译上下文', () => {
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
      createImageAsset('https://cdn.example.com/manual-ref.png'),
    ]);
    expect(plan.selectedAssetsForCompilation).toEqual([
      expect.objectContaining({
        type: 'char',
        assetId: 'char-1',
        name: '角色A',
        textValue: 'hero',
      }),
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

  it('没有分镜主图时，选中的参考图会作为图生视频主图', () => {
    const referenceAsset = createImageAsset('https://cdn.example.com/manual-ref.png');
    const shot = createShot({
      media: {
        references: [referenceAsset],
        selectedReferenceIndex: 0,
      },
    });

    const plan = collectShotVideoPlan({
      shot,
      characters: [],
      scenes: [],
      props: [],
    });

    expect(plan.capability).toBe('video.image-to-video');
    expect(plan.primaryImageInput).toBe(referenceAsset);
    expect(plan.primaryImageSource).toBe('https://cdn.example.com/manual-ref.png');
    expect(buildShotVideoRequest({
      plan,
      prompt: '让静帧角色轻微呼吸并看向镜头',
      duration: 4,
      aspectRatio: '16:9',
    })).toEqual({
      capability: 'video.image-to-video',
      prompt: '让静帧角色轻微呼吸并看向镜头',
      primaryImage: referenceAsset,
      additionalReferences: [],
      options: {
        duration: 6,
        motionPrompt: undefined,
        aspectRatio: '16:9',
      },
    });
  });

  it('角色场景道具仅参与提示词编译，不直接变成视频参考图', () => {
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

    expect(plan.capability).toBe('video.text-to-video');
    expect(plan.additionalReferenceImages).toEqual([]);
    expect(plan.selectedAssetsForCompilation).toEqual([
      expect.objectContaining({
        type: 'prop',
        assetId: 'prop-1',
        name: '道具A',
        textValue: 'sword',
      }),
    ]);
    expect(buildShotVideoRequest({
      plan,
      prompt: '展示道具细节',
      duration: 4,
      aspectRatio: '1:1',
    })).toEqual({
      capability: 'video.text-to-video',
      prompt: '展示道具细节',
      options: {
        duration: 6,
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

  it('构建视频请求时会把任意时长归一到允许档位', () => {
    const plan = collectShotVideoPlan({
      shot: createShot(),
      characters: [],
      scenes: [],
      props: [],
    });

    expect(buildShotVideoRequest({
      plan,
      prompt: '短镜头',
      duration: 4,
      aspectRatio: '16:9',
    }).options?.duration).toBe(6);

    expect(buildShotVideoRequest({
      plan,
      prompt: '长镜头',
      duration: 18,
      aspectRatio: '16:9',
    }).options?.duration).toBe(20);
  });

  it('能力支持检查会按当前项目选择直接校验，不再回退到其他模型', () => {
    const settings = createSettings();

    const supported = resolveShotVideoCapabilitySupport({
      settings,
      selectionKey: 'runway-main::runway-model-a',
      capability: 'video.image-to-video',
    });
    expect(supported.disabledReason).toBeUndefined();
    expect(supported.capability).toBe('video.image-to-video');
    expect(supported.resolvedContext?.definition.id).toBe('runway');
    expect(supported.effectiveSelectionKey).toBe('runway-main::runway-model-a');

    const unsupportedBySelection = resolveShotVideoCapabilitySupport({
      selectionKey: 'runway-main::runway-model-a',
      settings,
      capability: 'video.text-to-video',
    });
    expect(unsupportedBySelection.disabledReason).toBe('当前选择的模型不支持文生视频，请切换模型');

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

  it('仅配置参考生视频模型时，不会把图生视频兼容成参考生视频', () => {
    const support = resolveShotVideoCapabilitySupport({
      settings: createReferenceOnlySettings(),
      selectionKey: 'ref-main::ref-model-a',
      capability: 'video.image-to-video',
      visualInputCount: 1,
    });

    expect(support.disabledReason).toBe('当前没有配置支持图生视频的视频模型');
    expect(support.requestedCapability).toBe('video.image-to-video');
    expect(support.capability).toBe('video.image-to-video');
    expect(support.capabilityLabel).toBe('图生视频');
    expect(support.effectiveSelectionKey).toBe('ref-main::ref-model-a');
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

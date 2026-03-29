import { describe, expect, it } from 'vitest';
import type { AppSettings } from '../../types';
import {
  getDefaultMediaSelection,
  listConfiguredModelSelectOptions,
  resolveConfiguredChannelModel,
} from './resolver';

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
      {
        id: 'plugin-tti',
        name: 'Plugin TTI',
        category: 'tti',
        providerType: 'plugin-tti-provider',
        providerConfig: { apiKey: 'plugin-key' },
        defaultModelId: 'plugin-image-pro',
        models: [
          {
            id: 'plugin-image-pro',
            label: 'Plugin Image Pro',
            providerModelName: 'plugin-image-pro',
            capabilities: ['image.text-to-image', 'image.image-to-image'],
          },
        ],
        enabled: true,
        source: 'plugin',
        pluginId: 'com.example.plugin',
        createdAt: 3,
        updatedAt: 3,
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

describe('channel resolver', () => {
  it('能力不匹配时会从默认模型回退到可用模型', () => {
    const selection = getDefaultMediaSelection(
      createSettings(),
      'itv',
      'video.reference-to-video',
    );

    expect(selection).toEqual({
      channelId: 'vidu-main',
      modelId: 'vidu-model-a',
    });
  });

  it('按能力解析模型时会阻止不支持的模型', () => {
    const settings = createSettings();

    expect(resolveConfiguredChannelModel(
      settings,
      'itv',
      { channelId: 'runway-main', modelId: 'runway-model-a' },
      'video.reference-to-video',
    )).toBeUndefined();

    const resolved = resolveConfiguredChannelModel(
      settings,
      'itv',
      { channelId: 'vidu-main', modelId: 'vidu-model-a' },
      'video.reference-to-video',
    );

    expect(resolved?.definition.id).toBe('vidu');
    expect(resolved?.model.id).toBe('vidu-model-a');
    expect(resolved?.model.capabilities).toContain('video.reference-to-video');
  });

  it('按能力过滤模型选项时只暴露真实支持的模型', () => {
    const options = listConfiguredModelSelectOptions(
      createSettings(),
      'itv',
      'video.start-end-to-video',
    );

    expect(options.length).toBeGreaterThan(0);
    expect(options.every(option => option.channelId === 'vidu-main')).toBe(true);
    expect(options.every(option => option.capabilities.includes('video.start-end-to-video'))).toBe(true);
  });

  it('插件渠道也能走统一模型解析入口', () => {
    const resolved = resolveConfiguredChannelModel(
      createSettings(),
      'tti',
      { channelId: 'plugin-tti', modelId: 'plugin-image-pro' },
      'image.image-to-image',
    );

    expect(resolved?.channelConfig.source).toBe('plugin');
    expect(resolved?.definition.runtimeProviderType).toBe('plugin-tti-provider');
    expect(resolved?.model.id).toBe('plugin-image-pro');
    expect(resolved?.model.capabilities).toContain('image.image-to-image');
  });
});

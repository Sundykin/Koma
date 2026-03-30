import { describe, expect, it } from 'vitest';
import type { AppSettings } from '../../types';
import { buildProjectMediaCategoryState, PROJECT_MEDIA_BASE_REQUIREMENTS } from './projectMediaSelectionState';

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
        id: 'gemini-main',
        name: 'Gemini',
        category: 'llm',
        providerType: 'gemini',
        providerConfig: { apiKey: 'gemini-key' },
        defaultModelId: 'llm-model-a',
        models: [
          {
            id: 'llm-model-a',
            label: 'llm-a',
            providerModelName: 'llm-a',
            capabilities: ['llm.chat'],
          },
        ],
        enabled: true,
        source: 'builtin',
        createdAt: 3,
        updatedAt: 3,
      },
    ],
    mediaDefaults: {
      itv: {
        channelId: 'runway-main',
        modelId: 'runway-model-a',
      },
      llm: {
        channelId: 'gemini-main',
        modelId: 'llm-model-a',
      },
    },
    promptTemplates: {},
  };
}

describe('projectMediaSelectionState', () => {
  it('按能力过滤项目候选模型', () => {
    const state = buildProjectMediaCategoryState({
      settings: createSettings(),
      category: 'itv',
      requirement: {
        capability: 'video.reference-to-video',
        label: '参考生视频',
      },
    });

    expect(state.options.length).toBeGreaterThan(0);
    expect(state.options.every(option => option.channelId === 'vidu-main')).toBe(true);
    expect(state.fallbackLabel).toBe('Vidu / vidu-a');
    expect(state.usingFallback).toBe(true);
  });

  it('显式选择失效时会提示并回退到全局默认', () => {
    const state = buildProjectMediaCategoryState({
      settings: createSettings(),
      category: 'itv',
      explicitSelection: {
        channelId: 'runway-main',
        modelId: 'runway-model-a',
      },
      requirement: {
        capability: 'video.reference-to-video',
        label: '参考生视频',
      },
    });

    expect(state.explicitSupported).toBe(false);
    expect(state.usingFallback).toBe(true);
    expect(state.warning).toBe('当前项目选择的模型不支持参考生视频，已回退到全局默认');
    expect(state.fallbackLabel).toBe('Vidu / vidu-a');
  });

  it('基础项目能力要求会过滤到对应类别的真实模型', () => {
    const state = buildProjectMediaCategoryState({
      settings: createSettings(),
      category: 'llm',
      requirement: PROJECT_MEDIA_BASE_REQUIREMENTS.llm,
    });

    expect(state.options.length).toBeGreaterThan(0);
    expect(state.options.every(option => option.channelId === 'gemini-main')).toBe(true);
    expect(state.options.every(option => option.capabilities.includes('llm.chat'))).toBe(true);
    expect(state.fallbackLabel).toBe('Gemini / llm-a');
  });
});

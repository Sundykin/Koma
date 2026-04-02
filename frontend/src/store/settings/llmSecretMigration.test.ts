import { describe, expect, it, vi } from 'vitest';
import type { AppSettings } from '../../types';
import { migrateLLMSecretsToProfiles } from './llmSecretMigration';

function createSettings(): AppSettings {
  return {
    channelConfigs: [
      {
        id: 'llm-claude',
        name: 'Claude',
        category: 'llm',
        providerType: 'claude',
        providerConfig: {
          apiKey: 'sk-claude',
          baseUrl: 'https://api.anthropic.com',
        },
        defaultModelId: 'model-1',
        models: [
          {
            id: 'model-1',
            label: 'Claude Sonnet',
            providerModelName: 'claude-sonnet',
            capabilities: ['llm.chat'],
          },
        ],
        enabled: true,
        source: 'builtin',
        createdAt: 1,
        updatedAt: 1,
      },
      {
        id: 'tti-1',
        name: 'Runway',
        category: 'itv',
        providerType: 'runway',
        providerConfig: {
          apiKey: 'runway-key',
        },
        defaultModelId: 'itv-model-1',
        models: [
          {
            id: 'itv-model-1',
            label: 'Runway Gen',
            providerModelName: 'runway-gen',
            capabilities: ['video.image-to-video'],
          },
        ],
        enabled: true,
        source: 'builtin',
        createdAt: 2,
        updatedAt: 2,
      },
    ],
    mediaDefaults: {},
    promptTemplates: {},
  };
}

describe('migrateLLMSecretsToProfiles', () => {
  it('会把 LLM apiKey 迁到后端 profile，并从前端 settings 剥离', async () => {
    const saveProfile = vi.fn(async () => {});
    const settings = createSettings();

    const result = await migrateLLMSecretsToProfiles(settings, saveProfile);

    expect(saveProfile).toHaveBeenCalledWith({
      profileId: 'llm-claude',
      apiKey: 'sk-claude',
    });
    expect(result.migrated).toBe(true);
    expect(result.settings.channelConfigs[0].providerConfig).toEqual({
      baseUrl: 'https://api.anthropic.com',
      hasApiKey: true,
    });
    expect(result.settings.channelConfigs[1].providerConfig).toEqual({
      apiKey: 'runway-key',
    });
  });
});

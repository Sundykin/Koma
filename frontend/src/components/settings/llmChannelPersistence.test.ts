import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChannelConfig } from '../../providers/channel/types';
import { persistLLMChannelConfig } from './llmChannelPersistence';

function createChannel(overrides: Partial<ChannelConfig> = {}): ChannelConfig {
  return {
    id: 'channel-1',
    name: 'Claude',
    description: 'desc',
    category: 'llm',
    providerType: 'claude',
    providerConfig: { hasApiKey: true, baseUrl: 'https://api.anthropic.com' },
    defaultModelId: 'model-1',
    models: [{ id: 'model-1', label: 'm1', capabilities: ['llm.chat'] } as any],
    enabled: true,
    source: 'builtin',
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

describe('persistLLMChannelConfig', () => {
  const addChannelConfig = vi.fn();
  const updateChannelConfig = vi.fn();
  const deleteChannelConfig = vi.fn();
  const saveLLMProfile = vi.fn();
  const setDefaultMediaModelSelection = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('新建时 profile 保存失败会回滚已创建的 channel', async () => {
    addChannelConfig.mockResolvedValue(createChannel());
    deleteChannelConfig.mockResolvedValue(true);
    saveLLMProfile.mockRejectedValue(new Error('save profile failed'));

    await expect(persistLLMChannelConfig({
      editingChannel: null,
      payload: {
        name: 'Claude',
        description: 'desc',
        category: 'llm',
        providerType: 'claude',
        providerConfig: { hasApiKey: true, baseUrl: 'https://api.anthropic.com' },
        defaultModelId: 'model-1',
        models: [{ id: 'model-1', label: 'm1', capabilities: ['llm.chat'] }],
        enabled: true,
        source: 'builtin',
      },
      profilePayload: {
        profileId: 'channel-1',
        modelProvider: 'anthropic',
        apiKey: 'sk-1',
        baseUrl: 'https://api.anthropic.com',
      },
      shouldUpdateDefault: false,
      deps: { addChannelConfig, updateChannelConfig, deleteChannelConfig, saveLLMProfile, setDefaultMediaModelSelection },
    })).rejects.toThrow(/save profile failed/);

    expect(deleteChannelConfig).toHaveBeenCalledWith('channel-1');
  });

  it('编辑时 profile 保存失败会回滚 channel 更新', async () => {
    const editingChannel = createChannel();
    updateChannelConfig.mockResolvedValue(createChannel({ name: 'Claude New' }));
    saveLLMProfile.mockRejectedValue(new Error('save profile failed'));

    await expect(persistLLMChannelConfig({
      editingChannel,
      payload: {
        name: 'Claude New',
        description: 'desc2',
        category: 'llm',
        providerType: 'claude',
        providerConfig: { hasApiKey: true, baseUrl: 'https://new.example.com' },
        defaultModelId: 'model-1',
        models: [{ id: 'model-1', label: 'm1', capabilities: ['llm.chat'] }],
        enabled: true,
        source: 'builtin',
      },
      profilePayload: {
        profileId: 'channel-1',
        modelProvider: 'anthropic',
        baseUrl: 'https://new.example.com',
      },
      shouldUpdateDefault: false,
      deps: { addChannelConfig, updateChannelConfig, deleteChannelConfig, saveLLMProfile, setDefaultMediaModelSelection },
    })).rejects.toThrow(/save profile failed/);

    expect(updateChannelConfig).toHaveBeenNthCalledWith(2, 'channel-1', expect.objectContaining({
      name: 'Claude',
      providerConfig: { hasApiKey: true, baseUrl: 'https://api.anthropic.com' },
    }));
  });
});

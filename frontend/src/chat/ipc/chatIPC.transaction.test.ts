import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('chatIPC llm transaction apis', () => {
  beforeEach(() => {
    delete (window as typeof window & { electronAPI?: unknown }).electronAPI;
  });

  it('saveLLMChannelConfigTransaction 调用 preload 中的 llm.saveChannelConfig', async () => {
    const saveChannelConfig = vi.fn(async () => ({ success: true, channel: { id: 'channel-1' } }));
    (window as typeof window & { electronAPI?: unknown }).electronAPI = {
      llm: {
        query: vi.fn(),
        testConnection: vi.fn(),
        saveProfile: vi.fn(),
        deleteProfile: vi.fn(),
        saveChannelConfig,
        deleteChannelConfig: vi.fn(),
        migrateSettingsSecrets: vi.fn(),
      },
    };

    const { saveLLMChannelConfigTransaction } = await import('./chatIPC');
    const payload = { rootPath: '/tmp/.koma', payload: { providerType: 'claude' } };
    await saveLLMChannelConfigTransaction(payload as any);
    expect(saveChannelConfig).toHaveBeenCalledWith(payload);
  });

  it('migrateLLMSecretsTransaction 调用 preload 中的 llm.migrateSettingsSecrets', async () => {
    const migrateSettingsSecrets = vi.fn(async () => ({ settings: { channelConfigs: [] }, migrated: false }));
    (window as typeof window & { electronAPI?: unknown }).electronAPI = {
      llm: {
        query: vi.fn(),
        testConnection: vi.fn(),
        saveProfile: vi.fn(),
        deleteProfile: vi.fn(),
        saveChannelConfig: vi.fn(),
        deleteChannelConfig: vi.fn(),
        migrateSettingsSecrets,
      },
    };

    const { migrateLLMSecretsTransaction } = await import('./chatIPC');
    const payload = { rootPath: '/tmp/.koma', settings: { channelConfigs: [] } };
    await migrateLLMSecretsTransaction(payload as any);
    expect(migrateSettingsSecrets).toHaveBeenCalledWith(payload);
  });
});

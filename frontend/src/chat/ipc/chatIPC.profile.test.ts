import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('chatIPC llm profile management', () => {
  beforeEach(() => {
    delete (window as typeof window & { electronAPI?: unknown }).electronAPI;
  });

  it('saveLLMProfile 调用 preload 中的 llm.saveProfile', async () => {
    const saveProfile = vi.fn(async () => ({ success: true }));
    (window as typeof window & { electronAPI?: unknown }).electronAPI = {
      llm: {
        query: vi.fn(),
        testConnection: vi.fn(),
        saveProfile,
        deleteProfile: vi.fn(),
      },
    };

    const { saveLLMProfile } = await import('./chatIPC');
    const payload = {
      profileId: 'channel-1',
      modelProvider: 'anthropic',
      apiKey: 'sk-xxx',
      baseUrl: 'https://api.anthropic.com',
    };

    await saveLLMProfile(payload);
    expect(saveProfile).toHaveBeenCalledWith(payload);
  });

  it('deleteLLMProfile 调用 preload 中的 llm.deleteProfile', async () => {
    const deleteProfile = vi.fn(async () => ({ success: true }));
    (window as typeof window & { electronAPI?: unknown }).electronAPI = {
      llm: {
        query: vi.fn(),
        testConnection: vi.fn(),
        saveProfile: vi.fn(),
        deleteProfile,
      },
    };

    const { deleteLLMProfile } = await import('./chatIPC');
    await expect(deleteLLMProfile('channel-1')).resolves.toBe(true);
    expect(deleteProfile).toHaveBeenCalledWith('channel-1');
  });


  it('saveLLMProfile 在后端返回失败时会抛错', async () => {
    const saveProfile = vi.fn(async () => ({ success: false, error: { message: 'boom' } }));
    (window as typeof window & { electronAPI?: unknown }).electronAPI = {
      llm: {
        query: vi.fn(),
        testConnection: vi.fn(),
        saveProfile,
        deleteProfile: vi.fn(),
      },
    };

    const { saveLLMProfile } = await import('./chatIPC');
    await expect(saveLLMProfile({
      profileId: 'channel-1',
      modelProvider: 'anthropic',
      apiKey: 'sk-xxx',
    })).rejects.toThrow(/boom/);
  });

  it('deleteLLMProfile 在后端返回失败时会抛错', async () => {
    const deleteProfile = vi.fn(async () => ({ success: false, error: { message: 'delete failed' } }));
    (window as typeof window & { electronAPI?: unknown }).electronAPI = {
      llm: {
        query: vi.fn(),
        testConnection: vi.fn(),
        saveProfile: vi.fn(),
        deleteProfile,
      },
    };

    const { deleteLLMProfile } = await import('./chatIPC');
    await expect(deleteLLMProfile('channel-1')).rejects.toThrow(/delete failed/);
  });


  it('saveLLMProfile 只发送 profileId + apiKey，不再耦合 baseUrl/provider 真值', async () => {
    const saveProfile = vi.fn(async () => ({ success: true }));
    (window as typeof window & { electronAPI?: unknown }).electronAPI = {
      llm: {
        query: vi.fn(),
        testConnection: vi.fn(),
        saveProfile,
        deleteProfile: vi.fn(),
      },
    };

    const { saveLLMProfile } = await import('./chatIPC');
    await saveLLMProfile({ profileId: 'channel-1', apiKey: 'sk-xxx' } as any);
    expect(saveProfile).toHaveBeenCalledWith({ profileId: 'channel-1', apiKey: 'sk-xxx' });
  });
});

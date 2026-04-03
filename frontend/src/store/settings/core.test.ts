import { beforeEach, describe, expect, it, vi } from 'vitest';
import { STORAGE_KEYS } from '../../constants/storageKeys';

const migrateLLMSecretsTransaction = vi.fn();

vi.mock('../encryption', () => ({
  initEncryption: vi.fn(async () => {}),
  encryptSettings: vi.fn(async (settings) => settings),
  decryptSettings: vi.fn(async (settings) => settings),
}));

vi.mock('../../chat/ipc/chatIPC', () => ({
  migrateLLMSecretsTransaction,
}));

describe('settings/core loadSettings', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.clearAllMocks();
  });

  it('在 Electron 环境迁移设置时使用存储配置里的 rootPath', async () => {
    const rootPath = '/tmp/koma-settings';
    window.localStorage.setItem(
      STORAGE_KEYS.STORAGE_CONFIG,
      JSON.stringify({ rootPath, version: 1 }),
    );

    migrateLLMSecretsTransaction.mockResolvedValue({
      settings: {
        channelConfigs: [],
        mediaDefaults: {},
        promptTemplates: {},
      },
      migrated: false,
    });

    (window as typeof window & { electronAPI?: unknown }).electronAPI = {
      fs: {
        exists: async () => ({ exists: true }),
        readFile: async () => ({
          content: JSON.stringify({ channelConfigs: [{ id: 'channel-1' }] }),
        }),
        writeFile: async () => {},
        mkdir: async () => {},
        readdir: async () => ({ files: [] }),
        stat: async () => null,
        remove: async () => {},
        copy: async () => {},
        readFileAsBase64: async () => ({ base64: '' }),
        downloadFile: async () => ({ success: true, size: 0 }),
      },
      app: {
        getPath: async () => ({ path: '/tmp/user-data' }),
        getVersion: async () => ({ version: '1.0.0' }),
      },
      dialog: {
        openFile: async () => ({ canceled: true, filePaths: [] }),
        openDirectory: async () => ({ canceled: true, filePaths: [] }),
        saveFile: async () => ({ canceled: true }),
      },
      window: {
        minimize: async () => {},
        maximize: async () => {},
        close: async () => {},
        isMaximized: async () => false,
      },
      shell: {
        openExternal: async () => {},
        showItemInFolder: async () => {},
      },
      project: {
        list: async () => [],
        create: async () => { throw new Error('not implemented'); },
        load: async () => { throw new Error('not implemented'); },
        save: async () => ({ success: true }),
        update: async () => { throw new Error('not implemented'); },
        remove: async () => ({ success: true }),
        rebuildIndex: async () => ({}),
        export: async () => ({ success: true, path: '' }),
        import: async () => ({ success: true, projectId: '', meta: {} }),
      },
      llm: {
        query: vi.fn(),
        testConnection: vi.fn(),
        saveProfile: vi.fn(),
        deleteProfile: vi.fn(),
        saveChannelConfig: vi.fn(),
        deleteChannelConfig: vi.fn(),
        migrateSettingsSecrets: vi.fn(),
      },
    };

    const { loadSettings } = await import('./core');
    const settings = await loadSettings();

    expect(migrateLLMSecretsTransaction).toHaveBeenCalledWith({
      rootPath,
      settings: {
        channelConfigs: [{ id: 'channel-1' }],
        mediaDefaults: {},
        promptTemplates: {},
      },
    });
    expect(settings.channelConfigs).toEqual([{ id: 'channel-1' }]);
  });

});

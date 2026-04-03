import { beforeEach, describe, expect, it, vi } from 'vitest';

const loadSettingsMock = vi.fn();

vi.mock('./core', () => ({
  loadSettings: (...args: unknown[]) => loadSettingsMock(...args),
  saveSettings: vi.fn(),
}));

describe('channelConfig legacy image-hosting compatibility', () => {
  beforeEach(() => {
    loadSettingsMock.mockReset();
  });

  it('按能力查询时会识别缺少 category 的老图床渠道', async () => {
    loadSettingsMock.mockResolvedValue({
      channelConfigs: [
        {
          id: 'hosting-legacy',
          name: 'SCDN 图床',
          providerType: 'scdn-image-hosting',
          providerConfig: { enabled: true },
          capabilities: ['image-hosting'],
          enabled: true,
          source: 'plugin',
          pluginId: 'com.koma.scdn-image-hosting',
          createdAt: 1,
          updatedAt: 1,
        },
      ],
      mediaDefaults: {},
      promptTemplates: {},
    });

    const { getChannelsByCapability } = await import('./channelConfig');
    const channels = await getChannelsByCapability('image-hosting');

    expect(channels).toHaveLength(1);
    expect(channels[0]?.id).toBe('hosting-legacy');
  });

  it('读取默认图床渠道时会兼容老配置格式', async () => {
    loadSettingsMock.mockResolvedValue({
      channelConfigs: [
        {
          id: 'hosting-legacy',
          name: 'SCDN 图床',
          providerType: 'scdn-image-hosting',
          providerConfig: { enabled: true },
          capabilities: ['image-hosting'],
          enabled: true,
          source: 'plugin',
          pluginId: 'com.koma.scdn-image-hosting',
          createdAt: 1,
          updatedAt: 1,
        },
      ],
      mediaDefaults: {},
      promptTemplates: {},
    });

    const { getDefaultChannelConfig } = await import('./channelConfig');
    const channel = await getDefaultChannelConfig('image-hosting');

    expect(channel?.id).toBe('hosting-legacy');
  });
});

import type { AppSettings } from '../../types';
import type { ChannelConfig } from '../../providers/channel/types';

type SaveProfileFn = (payload: {
  profileId: string;
  apiKey: string;
}) => Promise<void>;

function migrateChannelConfig(
  channel: ChannelConfig,
): { nextChannel: ChannelConfig; secret?: { profileId: string; apiKey: string } } {
  if (channel.category !== 'llm') {
    return { nextChannel: channel };
  }

  const providerConfig = { ...(channel.providerConfig || {}) } as Record<string, unknown>;
  const apiKey = typeof providerConfig.apiKey === 'string' ? providerConfig.apiKey.trim() : '';
  if (!apiKey) {
    return { nextChannel: channel };
  }

  delete providerConfig.apiKey;
  providerConfig.hasApiKey = true;

  return {
    nextChannel: {
      ...channel,
      providerConfig,
    },
    secret: {
      profileId: channel.id,
      apiKey,
    },
  };
}

export async function migrateLLMSecretsToProfiles(
  settings: AppSettings,
  saveProfile: SaveProfileFn,
): Promise<{ settings: AppSettings; migrated: boolean }> {
  const nextConfigs: ChannelConfig[] = [];
  let migrated = false;

  for (const channel of settings.channelConfigs || []) {
    const { nextChannel, secret } = migrateChannelConfig(channel);
    nextConfigs.push(nextChannel);
    if (secret) {
      await saveProfile(secret);
      migrated = true;
    }
  }

  if (!migrated) {
    return { settings, migrated: false };
  }

  return {
    settings: {
      ...settings,
      channelConfigs: nextConfigs,
    },
    migrated: true,
  };
}

import type { ChannelConfig, MediaModelSelection } from '../../providers/channel/types';

export interface PersistLLMChannelPayload {
  name: string;
  description?: string;
  category: 'llm';
  providerType: string;
  providerConfig: Record<string, unknown>;
  defaultModelId: string;
  models: Array<Record<string, unknown>>;
  enabled: true;
  source: 'builtin';
}

export interface PersistLLMProfilePayload {
  profileId: string;
  apiKey?: string;
}

interface PersistDeps {
  addChannelConfig: (payload: PersistLLMChannelPayload) => Promise<ChannelConfig>;
  updateChannelConfig: (id: string, updates: Partial<Omit<ChannelConfig, 'id' | 'createdAt'>>) => Promise<ChannelConfig | null>;
  deleteChannelConfig: (id: string) => Promise<boolean>;
  saveLLMProfile: (payload: PersistLLMProfilePayload) => Promise<void>;
  setDefaultMediaModelSelection: (category: 'llm', selection: MediaModelSelection) => Promise<boolean>;
}

interface PersistArgs {
  editingChannel: ChannelConfig | null;
  payload: PersistLLMChannelPayload;
  profilePayload?: PersistLLMProfilePayload;
  shouldUpdateDefault: boolean;
  deps: PersistDeps;
}

function toRollbackPayload(channel: ChannelConfig): Partial<Omit<ChannelConfig, 'id' | 'createdAt'>> {
  return {
    name: channel.name,
    description: channel.description,
    category: channel.category,
    providerType: channel.providerType,
    providerConfig: channel.providerConfig,
    defaultModelId: channel.defaultModelId,
    models: channel.models,
    capabilities: channel.capabilities,
    polling: channel.polling,
    enabled: channel.enabled,
    isDefault: channel.isDefault,
    source: channel.source,
    pluginId: channel.pluginId,
    updatedAt: channel.updatedAt,
  };
}

export async function persistLLMChannelConfig(args: PersistArgs): Promise<ChannelConfig> {
  const { editingChannel, payload, profilePayload, shouldUpdateDefault, deps } = args;
  const saved = editingChannel
    ? await deps.updateChannelConfig(editingChannel.id, payload)
    : await deps.addChannelConfig(payload);

  if (!saved) {
    throw new Error('保存渠道配置失败');
  }

  try {
    if (profilePayload) {
      await deps.saveLLMProfile(profilePayload);
    }

    if (shouldUpdateDefault) {
      await deps.setDefaultMediaModelSelection('llm', {
        channelId: saved.id,
        modelId: payload.defaultModelId,
      });
    }

    return saved;
  } catch (error) {
    if (editingChannel) {
      await deps.updateChannelConfig(editingChannel.id, toRollbackPayload(editingChannel));
    } else {
      await deps.deleteChannelConfig(saved.id);
    }
    throw error;
  }
}

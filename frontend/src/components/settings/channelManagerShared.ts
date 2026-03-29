import type { AppSettings } from '../../types';
import type {
  ChannelConfig,
  ChannelDefinition,
  ChannelModelDefinition,
  MediaCategory,
} from '../../providers/channel/types';
import { getBuiltInChannelDefinition, listBuiltInChannelDefinitions } from '../../providers/channel/catalog';
import { resolveConfiguredChannelModel } from '../../providers/channel/resolver';
import { generateId } from '../../store/globalStore';

export interface ManagedChannelCard<TConfig> {
  channel: ChannelConfig;
  definition: ChannelDefinition;
  resolvedConfig: TConfig;
  enabledModels: ChannelModelDefinition[];
  isDefault: boolean;
}

export interface ChannelFormValues {
  providerType: string;
  name: string;
  defaultModelId?: string;
  models: ChannelModelDefinition[];
  [key: string]: unknown;
}

export function listBuiltInChannelOptions(category: MediaCategory): ChannelDefinition[] {
  return listBuiltInChannelDefinitions(category);
}

export function getEnabledChannelModels(
  channel: ChannelConfig,
  definition: ChannelDefinition,
): ChannelModelDefinition[] {
  // For built-in channels, models are user-maintained in settings.
  // Do not fall back to definition.models to avoid showing hardcoded/outdated presets.
  void definition;
  return channel.models || [];
}

export function getPreferredChannelModelId(
  channel: ChannelConfig,
  definition: ChannelDefinition,
): string | undefined {
  const enabledModels = getEnabledChannelModels(channel, definition);
  if (!enabledModels.length) {
    return undefined;
  }

  if (channel.defaultModelId && enabledModels.some((model) => model.id === channel.defaultModelId)) {
    return channel.defaultModelId;
  }

  return enabledModels[0]?.id;
}

export function buildManagedChannelCards<TConfig>(
  settings: AppSettings,
  category: MediaCategory,
  buildConfig: (context: NonNullable<ReturnType<typeof resolveConfiguredChannelModel>>) => TConfig,
): ManagedChannelCard<TConfig>[] {
  const defaultSelection = settings.mediaDefaults?.[category];

  return (settings.channelConfigs || [])
    .filter((channel) => channel.category === category && channel.source === 'builtin')
    .flatMap((channel) => {
      const definition = getBuiltInChannelDefinition(channel.providerType);
      if (!definition) {
        return [];
      }

      const modelId = getPreferredChannelModelId(channel, definition);
      if (!modelId) {
        return [];
      }

      const context = resolveConfiguredChannelModel(settings, category, {
        channelId: channel.id,
        modelId,
      });
      if (!context) {
        return [];
      }

      return [{
        channel,
        definition,
        resolvedConfig: buildConfig(context),
        enabledModels: getEnabledChannelModels(channel, definition),
        isDefault: defaultSelection?.channelId === channel.id,
      }];
    });
}

export function buildChannelFormValues(
  channel: ChannelConfig,
  definition: ChannelDefinition,
): ChannelFormValues {
  const enabledModels = getEnabledChannelModels(channel, definition);
  const models = enabledModels.length
    ? enabledModels
    : [{
        id: generateId(),
        providerModelName: '',
        label: '',
        capabilities: [],
      }];
  return {
    providerType: channel.providerType,
    name: channel.name,
    defaultModelId: getPreferredChannelModelId(channel, definition),
    models,
    ...channel.providerConfig,
  };
}

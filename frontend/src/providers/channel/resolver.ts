import type {
  ITVConfig,
  ITVModelConfig,
  LLMModelConfig,
  MediaProviderConfig,
  TTIModelConfig,
  TTSModelConfig,
} from '../../types';
import type {
  ChannelConfig,
  ChannelDefinition,
  ChannelModelDefinition,
  MediaCategory,
  MediaModelSelection,
  ModelCapability,
} from './types';
import type { AppSettings } from '../../types';
import { getBuiltInChannelDefinition, listBuiltInChannelDefinitions } from './catalog';

const MEDIA_SELECTION_SEPARATOR = '::';

export interface ResolvedChannelModelContext {
  category: MediaCategory;
  channelConfig: ChannelConfig;
  definition: ChannelDefinition;
  model: ChannelModelDefinition;
}

export interface ConfiguredChannelModelOption {
  channelConfig: ChannelConfig;
  definition: ChannelDefinition;
  model: ChannelModelDefinition;
  selection: MediaModelSelection;
}

export interface ConfiguredModelSelectOption {
  value: string;
  channelId: string;
  modelId: string;
  channelName: string;
  channelLabel: string;
  modelLabel: string;
  description?: string;
  capabilities: ModelCapability[];
}

export function serializeMediaSelection(selection?: MediaModelSelection | null): string | undefined {
  if (!selection?.channelId || !selection?.modelId) {
    return undefined;
  }
  return `${selection.channelId}${MEDIA_SELECTION_SEPARATOR}${selection.modelId}`;
}

export function parseMediaSelectionKey(
  selectionKey?: string | null,
): MediaModelSelection | undefined {
  if (!selectionKey) {
    return undefined;
  }
  const [channelId, modelId] = selectionKey.split(MEDIA_SELECTION_SEPARATOR);
  if (!channelId || !modelId) {
    return undefined;
  }
  return { channelId, modelId };
}

export function getChannelDefinitionForConfig(config: ChannelConfig): ChannelDefinition | undefined {
  const builtIn = getBuiltInChannelDefinition(config.providerType);
  if (builtIn) {
    return {
      ...builtIn,
      // Built-in definitions act as provider templates; models live in user settings.
      models: config.models || [],
    };
  }

  if (config.source === 'plugin') {
    return {
      id: config.providerType,
      category: config.category,
      vendor: config.name,
      name: config.name,
      description: config.description,
      runtimeProviderType: config.providerType,
      models: config.models || [],
    };
  }

  return undefined;
}

function getChannelModel(config: ChannelConfig, definition: ChannelDefinition, modelId?: string): ChannelModelDefinition | undefined {
  const candidateIds = [modelId, config.defaultModelId].filter(Boolean) as string[];
  for (const candidateId of candidateIds) {
    const match = definition.models.find((item) => item.id === candidateId);
    if (match) return match;
  }
  return definition.models[0];
}

export function listConfiguredChannelModels(
  settings: AppSettings,
  category: MediaCategory,
  capability?: ModelCapability,
): ConfiguredChannelModelOption[] {
  const configs = (settings.channelConfigs || [])
    .filter((item) => item.enabled && item.category === category);

  return configs.flatMap((channelConfig) => {
    const definition = getChannelDefinitionForConfig(channelConfig);
    if (!definition) {
      return [];
    }

    return definition.models
      .filter((model) => !capability || model.capabilities.includes(capability))
      .map((model) => ({
        channelConfig,
        definition,
        model,
        selection: {
          channelId: channelConfig.id,
          modelId: model.id,
        },
      }));
  });
}

function getFallbackSelection(
  settings: AppSettings,
  category: MediaCategory,
  capability?: ModelCapability,
): MediaModelSelection | undefined {
  const options = listConfiguredChannelModels(settings, category, capability);
  return options[0]?.selection;
}

export function getDefaultMediaSelection(
  settings: AppSettings,
  category: MediaCategory,
  capability?: ModelCapability,
): MediaModelSelection | undefined {
  const stored = settings.mediaDefaults?.[category];
  if (stored) {
    const resolved = resolveConfiguredChannelModel(settings, category, stored, capability);
    if (resolved) {
      return stored;
    }
  }
  return getFallbackSelection(settings, category, capability);
}

export function resolveConfiguredChannelModel(
  settings: AppSettings,
  category: MediaCategory,
  selection?: MediaModelSelection | string,
  capability?: ModelCapability,
): ResolvedChannelModelContext | undefined {
  const normalizedSelection = typeof selection === 'string'
    ? parseMediaSelectionKey(selection)
    : selection;

  const finalSelection = normalizedSelection || getDefaultMediaSelection(settings, category, capability);
  if (!finalSelection) {
    return undefined;
  }

  const channelConfig = (settings.channelConfigs || []).find((item) => item.id === finalSelection.channelId);
  if (!channelConfig || !channelConfig.enabled || channelConfig.category !== category) {
    return undefined;
  }

  const definition = getChannelDefinitionForConfig(channelConfig);
  if (!definition) {
    return undefined;
  }

  const model = getChannelModel(channelConfig, definition, finalSelection.modelId);
  if (!model) {
    return undefined;
  }

  if (capability && !model.capabilities.includes(capability)) {
    return undefined;
  }

  return {
    category,
    channelConfig,
    definition,
    model,
  };
}

function mergeProviderConfig<T extends MediaProviderConfig>(
  context: ResolvedChannelModelContext,
  patch: Partial<T>,
): T {
  const baseConfig = context.channelConfig.providerConfig as Record<string, unknown>;
  const modelDefaults = context.model.defaults || {};

  return {
    ...(baseConfig as T),
    ...modelDefaults,
    ...patch,
  };
}

export function buildLLMConfigFromContext(context: ResolvedChannelModelContext): LLMModelConfig {
  const provider = context.definition.runtimeProviderType || context.channelConfig.providerType;
  return mergeProviderConfig<LLMModelConfig>(context, {
    id: serializeMediaSelection({ channelId: context.channelConfig.id, modelId: context.model.id }) || context.channelConfig.id,
    name: context.channelConfig.name,
    provider: provider as LLMModelConfig['provider'],
    modelName: String(context.model.providerModelName || ''),
    isDefault: false,
    createdAt: context.channelConfig.createdAt,
    updatedAt: context.channelConfig.updatedAt,
  });
}

export function buildTTIConfigFromContext(context: ResolvedChannelModelContext): TTIModelConfig {
  const provider = context.definition.runtimeProviderType || context.channelConfig.providerType;
  return mergeProviderConfig<TTIModelConfig>(context, {
    id: serializeMediaSelection({ channelId: context.channelConfig.id, modelId: context.model.id }) || context.channelConfig.id,
    name: context.channelConfig.name,
    provider: provider as TTIModelConfig['provider'],
    modelName: context.model.providerModelName,
    isDefault: false,
    createdAt: context.channelConfig.createdAt,
    updatedAt: context.channelConfig.updatedAt,
  });
}

export function buildITVConfigFromContext(context: ResolvedChannelModelContext): ITVModelConfig {
  const provider = context.definition.runtimeProviderType || context.channelConfig.providerType;
  return mergeProviderConfig<ITVModelConfig>(context, {
    id: serializeMediaSelection({ channelId: context.channelConfig.id, modelId: context.model.id }) || context.channelConfig.id,
    name: context.channelConfig.name,
    provider: provider as ITVModelConfig['provider'],
    modelName: context.model.providerModelName,
    isDefault: false,
    createdAt: context.channelConfig.createdAt,
    updatedAt: context.channelConfig.updatedAt,
  });
}

export function buildITVProviderConfigFromContext(context: ResolvedChannelModelContext): ITVConfig {
  const config = buildITVConfigFromContext(context);
  return {
    provider: config.provider,
    name: config.name,
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
    modelName: config.modelName,
    defaultDuration: config.defaultDuration,
    defaultResolution: config.defaultResolution,
  };
}

export function buildTTSConfigFromContext(context: ResolvedChannelModelContext): TTSModelConfig {
  const provider = context.definition.runtimeProviderType || context.channelConfig.providerType;
  return mergeProviderConfig<TTSModelConfig>(context, {
    id: serializeMediaSelection({ channelId: context.channelConfig.id, modelId: context.model.id }) || context.channelConfig.id,
    name: context.channelConfig.name,
    provider: provider as TTSModelConfig['provider'],
    modelName: context.model.providerModelName,
    isDefault: false,
    createdAt: context.channelConfig.createdAt,
    updatedAt: context.channelConfig.updatedAt,
  });
}

export function getAvailableCapabilityModels(
  settings: AppSettings,
  category: MediaCategory,
  capability: ModelCapability,
): ConfiguredChannelModelOption[] {
  return listConfiguredChannelModels(settings, category, capability);
}

export function listAvailableBuiltInChannels(category: MediaCategory): ChannelDefinition[] {
  return listBuiltInChannelDefinitions(category);
}

export function listConfiguredModelSelectOptions(
  settings: AppSettings,
  category: MediaCategory,
  capability?: ModelCapability,
): ConfiguredModelSelectOption[] {
  return listConfiguredChannelModels(settings, category, capability).map((item) => ({
    value: serializeMediaSelection(item.selection) || '',
    channelId: item.channelConfig.id,
    modelId: item.model.id,
    channelName: item.definition.id,
    channelLabel: item.definition.name,
    modelLabel: item.model.label,
    description: item.model.description,
    capabilities: item.model.capabilities,
  }));
}

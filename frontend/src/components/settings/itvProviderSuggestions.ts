import type { ChannelModelDefinition } from '../../providers/channel/types';
import { getSuggestedSeedanceModels, getSuggestedViduModels } from '../../providers/itv/modelCatalog';

const KLING_MODEL_SUGGESTIONS: ChannelModelDefinition[] = [
  {
    id: 'kling-v1',
    label: 'Kling 1.0',
    providerModelName: 'kling-v1',
    capabilities: [
      'video.text-to-video',
      'video.image-to-video',
      'video.start-end-to-video',
    ],
    defaults: {
      defaultDuration: 5,
      defaultResolution: '1280x720',
    },
  },
  {
    id: 'kling-v1-5',
    label: 'Kling 1.5',
    providerModelName: 'kling-v1-5',
    capabilities: [
      'video.text-to-video',
      'video.image-to-video',
      'video.start-end-to-video',
    ],
    defaults: {
      defaultDuration: 5,
      defaultResolution: '1280x720',
    },
  },
  {
    id: 'kling-v1-6',
    label: 'Kling 1.6',
    providerModelName: 'kling-v1-6',
    capabilities: [
      'video.text-to-video',
      'video.image-to-video',
      'video.reference-to-video',
      'video.start-end-to-video',
    ],
    defaults: {
      defaultDuration: 5,
      defaultResolution: '1280x720',
    },
  },
];

const KOMA_OFFICIAL_MODEL_SUGGESTIONS: ChannelModelDefinition[] = [
  {
    id: 'jimeng-video-3.0-fast',
    label: '即梦 3.0 Fast',
    providerModelName: 'jimeng-video-3.0-fast',
    capabilities: [
      'video.text-to-video',
      'video.image-to-video',
      'video.start-end-to-video',
    ],
    defaults: { defaultDuration: 5, defaultResolution: '720p' },
  },
  {
    id: 'jimeng-video-3.0',
    label: '即梦 3.0',
    providerModelName: 'jimeng-video-3.0',
    capabilities: [
      'video.text-to-video',
      'video.image-to-video',
      'video.start-end-to-video',
    ],
    defaults: { defaultDuration: 5, defaultResolution: '720p' },
  },
  {
    id: 'jimeng-video-sora2',
    label: 'Sora 2',
    providerModelName: 'jimeng-video-sora2',
    capabilities: ['video.text-to-video', 'video.image-to-video'],
    defaults: { defaultDuration: 8, defaultResolution: '720p' },
  },
  {
    id: 'grok-imagine-1.0-video',
    label: 'Grok Imagine Video',
    providerModelName: 'grok-imagine-1.0-video',
    capabilities: [
      'video.text-to-video',
      'video.image-to-video',
      'video.reference-to-video',
    ],
    defaults: { defaultDuration: 6, defaultResolution: '720p' },
  },
];

const ITV_PROVIDER_MODEL_SUGGESTIONS: Record<string, ChannelModelDefinition[]> = {
  vidu: getSuggestedViduModels(),
  seedance: getSuggestedSeedanceModels(),
  kling: KLING_MODEL_SUGGESTIONS,
  'koma-official': KOMA_OFFICIAL_MODEL_SUGGESTIONS,
};

const ITV_PROVIDER_FIELD_DEFAULTS: Record<string, Record<string, unknown>> = {
  vidu: {
    defaultDuration: 5,
    defaultResolution: '720p',
  },
  seedance: {
    defaultDuration: 5,
    defaultResolution: '720p',
  },
  kling: {
    defaultDuration: 5,
    defaultResolution: '1280x720',
  },
  'koma-official': {
    defaultDuration: 5,
    defaultResolution: '720p',
    baseUrl: 'https://api.568069.xyz',
  },
};

function cloneDefaults(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  return { ...(value as Record<string, unknown>) };
}

function cloneModel(model: ChannelModelDefinition): ChannelModelDefinition {
  return {
    ...model,
    capabilities: [...model.capabilities],
    defaults: cloneDefaults(model.defaults),
  };
}

export function getSuggestedITVModels(providerType?: string): ChannelModelDefinition[] {
  if (!providerType) {
    return [];
  }
  return (ITV_PROVIDER_MODEL_SUGGESTIONS[providerType] || []).map(cloneModel);
}

export function getSuggestedITVFieldDefaults(providerType?: string): Record<string, unknown> {
  if (!providerType) {
    return {};
  }
  return { ...(ITV_PROVIDER_FIELD_DEFAULTS[providerType] || {}) };
}

export function normalizeITVModelsForProvider(
  rawModels: ChannelModelDefinition[] | undefined,
  providerType?: string,
): ChannelModelDefinition[] {
  const models = Array.isArray(rawModels) ? rawModels : [];
  const suggestions = ITV_PROVIDER_MODEL_SUGGESTIONS[providerType || ''] || [];
  if (!suggestions.length || !models.length) {
    return models.map(cloneModel);
  }

  const suggestionMap = new Map(
    suggestions.map(model => [String(model.providerModelName || '').trim(), model]),
  );

  return models.map((model) => {
    const providerModelName = String(model.providerModelName || '').trim();
    const suggestion = suggestionMap.get(providerModelName);
    if (!suggestion) {
      return cloneModel(model);
    }
    return {
      ...cloneModel(model),
      id: suggestion.id,
      providerModelName: suggestion.providerModelName,
      label: String(model.label || '').trim() || suggestion.label,
      capabilities: Array.isArray(model.capabilities) && model.capabilities.length > 0
        ? [...model.capabilities]
        : [...suggestion.capabilities],
      defaults: cloneDefaults(model.defaults) || cloneDefaults(suggestion.defaults),
    };
  });
}

export function hasConfiguredITVModels(rawModels: unknown): boolean {
  if (!Array.isArray(rawModels)) {
    return false;
  }
  return rawModels.some((item) => String((item as Partial<ChannelModelDefinition>)?.providerModelName || '').trim().length > 0);
}

export function shouldReplaceITVModelsOnProviderChange(
  rawModels: unknown,
  providerType?: string,
  previousProviderType?: string,
): boolean {
  if (!providerType) {
    return false;
  }

  const suggestedModels = ITV_PROVIDER_MODEL_SUGGESTIONS[providerType] || [];
  if (suggestedModels.length === 0) {
    return !hasConfiguredITVModels(rawModels);
  }

  if (!hasConfiguredITVModels(rawModels)) {
    return true;
  }

  return Boolean(previousProviderType && previousProviderType !== providerType);
}

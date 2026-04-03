import type { ChannelModelDefinition } from '../channel/types';

export interface ITVModelRule {
  durations: number[];
  resolutions: string[];
}

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

export const VIDU_MODEL_RULES: Record<string, ITVModelRule> = {
  'viduq2-pro': {
    durations: [1, 2, 3, 4, 5, 6, 7, 8],
    resolutions: ['540p', '720p', '1080p'],
  },
  'viduq2-turbo': {
    durations: [1, 2, 3, 4, 5, 6, 7, 8],
    resolutions: ['540p', '720p', '1080p'],
  },
  viduq1: {
    durations: [1, 2, 3, 4, 5, 6, 7, 8],
    resolutions: ['1080p'],
  },
  'viduq1-classic': {
    durations: [1, 2, 3, 4, 5, 6, 7, 8],
    resolutions: ['1080p'],
  },
  'vidu2.0': {
    durations: [4, 8],
    resolutions: ['360p', '720p', '1080p'],
  },
  'vidu1.5': {
    durations: [4, 8],
    resolutions: ['360p', '720p', '1080p'],
  },
};

export const VIDU_MODEL_SUGGESTIONS: ChannelModelDefinition[] = [
  {
    id: 'viduq2-pro',
    label: 'Vidu Q2 Pro',
    providerModelName: 'viduq2-pro',
    capabilities: [
      'video.text-to-video',
      'video.image-to-video',
      'video.reference-to-video',
      'video.start-end-to-video',
    ],
    defaults: {
      defaultDuration: 5,
      defaultResolution: '720p',
    },
  },
  {
    id: 'viduq2-turbo',
    label: 'Vidu Q2 Turbo',
    providerModelName: 'viduq2-turbo',
    capabilities: [
      'video.text-to-video',
      'video.image-to-video',
      'video.reference-to-video',
      'video.start-end-to-video',
    ],
    defaults: {
      defaultDuration: 5,
      defaultResolution: '720p',
    },
  },
  {
    id: 'viduq1',
    label: 'Vidu Q1',
    providerModelName: 'viduq1',
    capabilities: [
      'video.text-to-video',
      'video.image-to-video',
      'video.reference-to-video',
      'video.start-end-to-video',
    ],
    defaults: {
      defaultDuration: 5,
      defaultResolution: '1080p',
    },
  },
  {
    id: 'viduq1-classic',
    label: 'Vidu Q1 Classic',
    providerModelName: 'viduq1-classic',
    capabilities: [
      'video.text-to-video',
      'video.image-to-video',
      'video.reference-to-video',
      'video.start-end-to-video',
    ],
    defaults: {
      defaultDuration: 5,
      defaultResolution: '1080p',
    },
  },
  {
    id: 'vidu2.0',
    label: 'Vidu 2.0',
    providerModelName: 'vidu2.0',
    capabilities: [
      'video.text-to-video',
      'video.image-to-video',
      'video.reference-to-video',
      'video.start-end-to-video',
    ],
    defaults: {
      defaultDuration: 4,
      defaultResolution: '360p',
    },
  },
  {
    id: 'vidu1.5',
    label: 'Vidu 1.5',
    providerModelName: 'vidu1.5',
    capabilities: [
      'video.text-to-video',
      'video.image-to-video',
      'video.reference-to-video',
      'video.start-end-to-video',
    ],
    defaults: {
      defaultDuration: 4,
      defaultResolution: '360p',
    },
  },
];

export const SEEDANCE_MODEL_SUGGESTIONS: ChannelModelDefinition[] = [
  {
    id: 'seedance-2.0',
    label: 'Seedance 2.0',
    providerModelName: 'seedance-2.0',
    capabilities: [
      'video.text-to-video',
      'video.image-to-video',
      'video.reference-to-video',
      'video.start-end-to-video',
    ],
    defaults: {
      defaultDuration: 5,
      defaultResolution: '720p',
    },
  },
  {
    id: 'seedance-2.0-fast',
    label: 'Seedance 2.0 Fast',
    providerModelName: 'seedance-2.0-fast',
    capabilities: [
      'video.text-to-video',
      'video.image-to-video',
      'video.reference-to-video',
      'video.start-end-to-video',
    ],
    defaults: {
      defaultDuration: 5,
      defaultResolution: '720p',
    },
  },
];

export function getSuggestedViduModels(): ChannelModelDefinition[] {
  return VIDU_MODEL_SUGGESTIONS.map(cloneModel);
}

export function getSuggestedSeedanceModels(): ChannelModelDefinition[] {
  return SEEDANCE_MODEL_SUGGESTIONS.map(cloneModel);
}

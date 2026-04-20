import type { ChannelDefinition, MediaCategory } from './types';
import { LLM_CHANNEL_PRESETS, TTI_PRESETS, ITV_PRESETS, TTS_PRESETS } from '../../store/settings/presets';

/**
 * Built-in channel definitions are provider templates only.
 *
 * Important: do NOT hardcode upstream model lists here. Models (and their capability matrix)
 * are maintained in user settings (ChannelConfig.models) so they can be updated dynamically
 * without shipping a new app build.
 */

const llmChannels: ChannelDefinition[] = [
  ...LLM_CHANNEL_PRESETS.map((preset) => ({
    id: preset.id,
    category: 'llm' as const,
    vendor: preset.name,
    name: preset.name,
    description: 'OpenAI 兼容对话渠道',
    runtimeProviderType: 'openai-compatible',
    models: [],
    configSchema: {
      required: ['apiKey'],
      properties: {
        baseUrl: { type: 'string', default: preset.baseUrl },
        apiKey: { type: 'string' },
      },
    },
  })),
  {
    id: 'gemini',
    category: 'llm',
    vendor: 'Google',
    name: 'Gemini',
    runtimeProviderType: 'gemini',
    models: [],
    configSchema: {
      required: ['apiKey'],
      properties: {
        baseUrl: { type: 'string', default: 'https://generativelanguage.googleapis.com' },
        apiKey: { type: 'string' },
      },
    },
  },
  {
    id: 'claude',
    category: 'llm',
    vendor: 'Anthropic',
    name: 'Claude',
    runtimeProviderType: 'claude',
    models: [],
    configSchema: {
      required: ['apiKey'],
      properties: {
        baseUrl: { type: 'string', default: 'https://api.anthropic.com' },
        apiKey: { type: 'string' },
      },
    },
  },
];

const ttiChannels: ChannelDefinition[] = [
  {
    id: 'comfyui',
    category: 'tti',
    vendor: 'ComfyUI',
    name: 'ComfyUI',
    runtimeProviderType: 'comfyui',
    models: [],
    configSchema: {
      required: ['baseUrl'],
      properties: {
        baseUrl: { type: 'string', default: 'http://127.0.0.1:8188' },
      },
    },
  },
  ...TTI_PRESETS.map((preset) => ({
    id: preset.id,
    category: 'tti' as const,
    vendor: preset.name,
    name: preset.name,
    runtimeProviderType: preset.id,
    models: [],
    configSchema: {
      required: preset.id === 'comfyui' ? ['baseUrl'] : ['apiKey'],
      properties: {
        baseUrl: { type: 'string', default: preset.baseUrl || '' },
        apiKey: { type: 'string' },
      },
    },
  })),
];

const itvChannels: ChannelDefinition[] = ITV_PRESETS.map((preset) => {
  const isLocalOnly = preset.id === 'comfyui-animatediff';
  // koma-official 官方渠道：baseUrl 固定，UI 不再允许用户改写。
  const baseUrlLocked = preset.id === 'koma-official';
  return {
    id: preset.id,
    category: 'itv' as const,
    vendor: preset.name,
    name: preset.name,
    runtimeProviderType: preset.id,
    models: [],
    configSchema: {
      required: isLocalOnly ? ['baseUrl'] : ['apiKey'],
      properties: {
        baseUrl: {
          type: 'string',
          default: preset.baseUrl || '',
          ...(baseUrlLocked ? { locked: true, fixed: preset.baseUrl } : {}),
        },
        apiKey: { type: 'string' },
      },
      ...(baseUrlLocked ? { baseUrlLocked: true, fixedBaseUrl: preset.baseUrl } : {}),
    },
  };
});

const ttsChannels: ChannelDefinition[] = TTS_PRESETS.map((preset) => ({
  id: preset.id,
  category: 'tts' as const,
  vendor: preset.name,
  name: preset.name,
  runtimeProviderType: preset.id,
  models: [],
  configSchema: {
    required: preset.id === 'edge-tts' || preset.id === 'gpt-sovits' ? [] : ['apiKey'],
    properties: {
      baseUrl: { type: 'string', default: preset.baseUrl || '' },
      apiKey: { type: 'string' },
    },
  },
}));

const BUILTIN_CHANNELS: ChannelDefinition[] = [
  ...llmChannels,
  ...ttiChannels,
  ...itvChannels,
  ...ttsChannels,
];

export function listBuiltInChannelDefinitions(category?: MediaCategory): ChannelDefinition[] {
  if (!category) {
    return BUILTIN_CHANNELS;
  }
  return BUILTIN_CHANNELS.filter((item) => item.category === category);
}

export function getBuiltInChannelDefinition(channelId: string): ChannelDefinition | undefined {
  return BUILTIN_CHANNELS.find((item) => item.id === channelId);
}


/**
 * 模型预设常量
 */
import type { LLMChannelPreset, ProviderPreset } from '../../types';

// OpenAI 兼容渠道预设
export const LLM_CHANNEL_PRESETS: LLMChannelPreset[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'],
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    models: ['deepseek-chat', 'deepseek-reasoner'],
  },
  {
    id: 'qwen',
    name: '通义千问',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    models: ['qwen-turbo', 'qwen-plus', 'qwen-max'],
  },
  {
    id: 'zhipu',
    name: '智谱 AI',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    models: ['glm-4-flash', 'glm-4-plus', 'glm-4'],
  },
  {
    id: 'moonshot',
    name: '月之暗面',
    baseUrl: 'https://api.moonshot.cn/v1',
    models: ['moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k'],
  },
];

// TTI 厂商预设
export const TTI_PRESETS: ProviderPreset[] = [
  { id: 'nano-banana', name: 'Nano-Banana（官方）', baseUrl: 'http://ai.hsxbk.top', models: ['gemini-2.5-pro-image-preview', 'gemini-3-pro-image-preview'] },
  { id: 'gemini-3-pro', name: 'Gemini-3-Pro (toapis)', baseUrl: 'https://toapis.com', models: ['gemini-3-pro-image-preview'] },
];

// ITV 厂商预设
export const ITV_PRESETS: ProviderPreset[] = [];

// TTS 厂商预设
export const TTS_PRESETS: ProviderPreset[] = [
  { id: 'edge-tts', name: 'Edge TTS (免费)' },
  { id: 'openai-tts', name: 'OpenAI TTS', baseUrl: 'https://api.openai.com/v1', models: ['tts-1', 'tts-1-hd'] },
  { id: 'doubao-tts', name: '豆包 TTS', baseUrl: 'https://openspeech.bytedance.com' },
  { id: 'fish-audio', name: 'Fish Audio', baseUrl: 'https://api.fish.audio' },
  { id: 'gpt-sovits', name: 'GPT-SoVITS (本地)', baseUrl: 'http://127.0.0.1:9880' },
];

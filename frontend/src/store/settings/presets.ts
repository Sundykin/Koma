/**
 * 模型预设常量
 */
import type { LLMChannelPreset, ProviderPreset } from '../../types';

// OpenAI 兼容渠道预设
export const LLM_CHANNEL_PRESETS: LLMChannelPreset[] = [
  {
    id: 'koma-official-llm',
    name: 'Koma 官方',
    baseUrl: 'https://api.568069.xyz/v1',
  },
  {
    id: 'openai',
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
  },
  {
    id: 'qwen',
    name: '通义千问',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  },
  {
    id: 'zhipu',
    name: '智谱 AI',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
  },
  {
    id: 'moonshot',
    name: '月之暗面',
    baseUrl: 'https://api.moonshot.cn/v1',
  },
];

// TTI 厂商预设
export const TTI_PRESETS: ProviderPreset[] = [
  { id: 'koma-official-tti', name: 'Koma 官方（文生图）', baseUrl: 'https://api.568069.xyz' },
  { id: 'nano-banana', name: 'Nano-Banana（官方）', baseUrl: 'http://ai.hsxbk.top' },
  { id: 'gemini-3-pro', name: 'Gemini-3-Pro (toapis)', baseUrl: 'https://toapis.com' },
  { id: 'openai-compatible-tti', name: '自定义服务商（OpenAI 兼容）', baseUrl: '' },
  { id: 'grok2api-imagine-tti', name: 'Grok2API Imagine（多参考）', baseUrl: '' },
  { id: 'gemini-native-tti', name: 'Gemini Native（谷歌原生）', baseUrl: 'https://generativelanguage.googleapis.com' },
];

// ITV 厂商预设
export const ITV_PRESETS: ProviderPreset[] = [
  // 官方内置渠道，baseUrl 锁死在 catalog.ts 中的 configSchema.baseUrlLocked
  { id: 'koma-official', name: 'Koma 官方', baseUrl: 'https://api.568069.xyz' },
  {
    id: 'vidu',
    name: 'Vidu',
    baseUrl: '',
  },
  { id: 'sora2', name: 'Sora 2', baseUrl: 'https://toapis.com' },
  { id: 'seedance', name: 'Seedance 2.0', baseUrl: 'https://toapis.com' },
  { id: 'kling', name: '可灵 Kling', baseUrl: 'https://api.klingai.com' },
  { id: 'runway', name: 'Runway', baseUrl: 'https://api.runwayml.com' },
  { id: 'pika', name: 'Pika Labs', baseUrl: 'https://api.pika.art/v1' },
  { id: 'comfyui-animatediff', name: 'ComfyUI AnimateDiff', baseUrl: 'http://127.0.0.1:8188' },
  { id: 'custom', name: '自定义 / Grok2API', baseUrl: '' },
  { id: 'grok2api-imagine-itv', name: 'Grok2API Imagine Video', baseUrl: '' },
];

// TTS 厂商预设
export const TTS_PRESETS: ProviderPreset[] = [
  { id: 'edge-tts', name: 'Edge TTS (免费)' },
  { id: 'openai-tts', name: 'OpenAI TTS', baseUrl: 'https://api.openai.com/v1' },
  { id: 'doubao-tts', name: '豆包 TTS', baseUrl: 'https://openspeech.bytedance.com' },
  { id: 'fish-audio', name: 'Fish Audio', baseUrl: 'https://api.fish.audio' },
  { id: 'gpt-sovits', name: 'GPT-SoVITS (本地)', baseUrl: 'http://127.0.0.1:9880' },
];

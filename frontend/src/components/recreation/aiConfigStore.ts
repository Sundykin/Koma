/**
 * 二创工作台 AI 能力配置
 *
 * 只有 2 个档位：VLM（看图 + 写描述）+ LLM（基于结果做可行性推理）。
 * 所有 ASR / OCR / 音频识别都让 VLM 综合处理（现代多模态模型有能力）。
 *
 * 存到 app_settings_kv 一个 key：'recreation-ai-config'
 */
import { electronService } from '../../services/electronService';

const KV_KEY = 'recreation-ai-config';

export interface RecreationAiConfig {
  /** 选用的 LLM channel selectionKey（来自 listConfiguredModelSelectOptions('llm','llm.chat')） */
  channelKey?: string;
  /** TTS channel selectionKey（language_dub 用，listConfiguredModelSelectOptions('tts','speech.text-to-speech')） */
  ttsSelection?: string;
  /** TTI channel selectionKey（stylization / wardrobe 用） */
  ttiSelection?: string;
  /** model 名 —— 仅 VLM / LLM 需要手填 model；TTS / TTI 的 model 通过 selection 自带 */
  models: {
    vlm?: string;
    llm?: string;
  };
}

const DEFAULT_CONFIG: RecreationAiConfig = {
  models: {
    vlm: 'gpt-5.5',
    llm: 'glm-5',
  },
};

type IpcResult<T> = { ok: true; data: T } | { ok: false; code: string; message: string };

async function kvGet<T>(key: string): Promise<T | null> {
  const res = (await electronService.ipc.invoke('app-kv:get', { key })) as IpcResult<{ value: T | null }>;
  if (!res || res.ok === false) return null;
  return res.data?.value ?? null;
}

async function kvSet<T>(key: string, value: T): Promise<void> {
  const res = (await electronService.ipc.invoke('app-kv:set', { key, value })) as IpcResult<unknown>;
  if (!res || res.ok === false) throw new Error(`app-kv:set failed: ${KV_KEY}`);
}

export async function loadRecreationAiConfig(): Promise<RecreationAiConfig> {
  if (!electronService.isElectron()) return DEFAULT_CONFIG;
  const stored = await kvGet<any>(KV_KEY);
  if (!stored) return { ...DEFAULT_CONFIG, models: { ...DEFAULT_CONFIG.models } };
  // 兼容旧版（含 asr/ocr/audio 字段）→ 只取需要的字段
  return {
    channelKey: stored.channelKey,
    ttsSelection: stored.ttsSelection,
    ttiSelection: stored.ttiSelection,
    models: {
      vlm: stored.models?.vlm ?? DEFAULT_CONFIG.models.vlm,
      llm: stored.models?.llm ?? DEFAULT_CONFIG.models.llm,
    },
  };
}

export async function saveRecreationAiConfig(cfg: RecreationAiConfig): Promise<void> {
  await kvSet<RecreationAiConfig>(KV_KEY, cfg);
}

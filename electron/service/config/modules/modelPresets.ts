/**
 * 模型预设配置模块
 */
import { z } from 'zod';
import type { ConfigModule } from '../types';

const modelPresetSchema = z.object({
  name: z.string(),
  type: z.enum(['llm', 'tti', 'tts', 'itv']),
  config: z.record(z.string(), z.unknown()),
});

const modelPresetsSchema = z.array(modelPresetSchema).default([]);

export type ModelPresetsData = z.infer<typeof modelPresetsSchema>;

export const modelPresetsModule: ConfigModule<ModelPresetsData> = {
  id: 'model-presets',
  version: 1,
  schema: modelPresetsSchema,
  defaults: [],
  store: 'json',
};

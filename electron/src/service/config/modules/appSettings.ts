/**
 * 应用设置模块
 * 统一管理 LLM/TTI/ITV/TTS 配置、渠道配置、图床配置等
 */
import { z } from 'zod';
import type { ConfigModule } from '../types';

// 宽松 schema：settings 结构复杂且前端主导，这里只做顶层校验
const appSettingsSchema = z.object({
  llmConfigs: z.array(z.record(z.string(), z.unknown())).default([]),
  ttiConfigs: z.array(z.record(z.string(), z.unknown())).default([]),
  itvConfigs: z.array(z.record(z.string(), z.unknown())).default([]),
  ttsConfigs: z.array(z.record(z.string(), z.unknown())).default([]),
  channelConfigs: z.array(z.record(z.string(), z.unknown())).optional(),
  customThemePresets: z.array(z.record(z.string(), z.unknown())).optional(),
  imageHostingConfig: z.record(z.string(), z.unknown()).optional(),
}).passthrough();

export type AppSettingsData = z.infer<typeof appSettingsSchema>;

export const appSettingsModule: ConfigModule<AppSettingsData> = {
  id: 'app-settings',
  version: 1,
  schema: appSettingsSchema,
  defaults: {
    llmConfigs: [],
    ttiConfigs: [],
    itvConfigs: [],
    ttsConfigs: [],
  },
  store: 'json',
};

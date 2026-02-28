/**
 * 应用设置模块
 * 统一管理 LLM/TTI/ITV/TTS 配置、渠道配置、图床配置等
 */
import { z } from 'zod';
import type { ConfigModule } from '../types';

const mediaProviderConfigSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  apiKey: z.string().optional(),
  baseUrl: z.string().optional(),
  isDefault: z.boolean(),
  createdAt: z.number(),
  updatedAt: z.number(),
});

const llmConfigSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  provider: z.string().min(1),
  baseUrl: z.string().optional(),
  apiKey: z.string(),
  modelName: z.string().min(1),
  isDefault: z.boolean(),
  createdAt: z.number(),
  updatedAt: z.number(),
});

const ttiConfigSchema = mediaProviderConfigSchema.extend({
  provider: z.string().min(1),
  workflowPath: z.string().optional(),
  workflowMapping: z.record(z.string(), z.string()).optional(),
  modelName: z.string().optional(),
  defaultSize: z.string().optional(),
  defaultSteps: z.number().optional(),
});

const itvConfigSchema = mediaProviderConfigSchema.extend({
  provider: z.string().min(1),
  workflowPath: z.string().optional(),
  workflowMapping: z.record(z.string(), z.string()).optional(),
  defaultDuration: z.number().optional(),
  defaultResolution: z.string().optional(),
});

const ttsConfigSchema = mediaProviderConfigSchema.extend({
  provider: z.string().min(1),
  defaultVoice: z.string().optional(),
  defaultSpeed: z.number().optional(),
});

const themePresetSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string(),
  ttiStylePrefix: z.string(),
  llmPromptSuffix: z.string(),
  previewImage: z.string().optional(),
});

const channelHealthSchema = z.object({
  status: z.enum(['unknown', 'healthy', 'degraded', 'unhealthy']),
  lastCheck: z.number().optional(),
  latency: z.number().optional(),
  error: z.string().optional(),
}).optional();

const channelConfigSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  providerType: z.string().min(1),
  providerConfig: z.record(z.string(), z.unknown()),
  capabilities: z.array(z.string()),
  polling: z.record(z.string(), z.unknown()).optional(),
  enabled: z.boolean(),
  isDefault: z.boolean().optional(),
  priority: z.number().optional(),
  health: channelHealthSchema,
  source: z.enum(['builtin', 'plugin']),
  pluginId: z.string().optional(),
  createdAt: z.number(),
  updatedAt: z.number(),
}).passthrough();

const imageHostingSchema = z.object({
  enabled: z.boolean(),
  apiEndpoint: z.string(),
  outputFormat: z.enum(['auto', 'jpeg', 'png', 'webp', 'gif', 'webp_animated']),
  cdnDomain: z.string(),
});

const appSettingsSchema = z.object({
  llmConfigs: z.array(llmConfigSchema).default([]),
  ttiConfigs: z.array(ttiConfigSchema).default([]),
  itvConfigs: z.array(itvConfigSchema).default([]),
  ttsConfigs: z.array(ttsConfigSchema).default([]),
  channelConfigs: z.array(channelConfigSchema).optional(),
  customThemePresets: z.array(themePresetSchema).optional(),
  imageHostingConfig: imageHostingSchema.optional(),
  customChannels: z.array(channelConfigSchema).optional(),
  unifiedChannels: z.array(channelConfigSchema).optional(),
  channelMigrationVersion: z.number().int().optional(),
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

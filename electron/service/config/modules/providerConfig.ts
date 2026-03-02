/**
 * Provider 配置模块
 * 替代原来内联在 runtime.ts 中的 ProviderConfigStore
 */
import { z } from 'zod';
import type { ConfigModule } from '../types';

const providerConfigSchema = z.record(z.string(), z.record(z.string(), z.unknown()));

export type ProviderConfigData = z.infer<typeof providerConfigSchema>;

export const providerConfigModule: ConfigModule<ProviderConfigData> = {
  id: 'provider-config',
  version: 1,
  schema: providerConfigSchema,
  defaults: {},
  store: 'json',
};

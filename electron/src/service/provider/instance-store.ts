/**
 * Provider 实例存储
 * 管理 Provider 实例配置（哪个插件的哪个 Provider 被选为默认）
 */
import { configRegistry } from '../config';
import { z } from 'zod';
import type { ConfigModule } from '../config';

export type ProviderKind = 'tti' | 'itv' | 'tts' | 'llm' | 'image-hosting';

export interface ProviderInstance {
  id: string;
  pluginId: string;
  kind: ProviderKind;
  config: Record<string, unknown>;
  isDefault: boolean;
}

const providerInstancesSchema = z.object({
  instances: z.array(z.object({
    id: z.string(),
    pluginId: z.string(),
    kind: z.string(),
    config: z.record(z.string(), z.unknown()),
    isDefault: z.boolean(),
  })),
});

type ProviderInstancesData = z.infer<typeof providerInstancesSchema>;

export const providerInstancesModule: ConfigModule<ProviderInstancesData> = {
  id: 'provider-instances',
  version: 1,
  schema: providerInstancesSchema,
  defaults: { instances: [] },
  store: 'json',
};

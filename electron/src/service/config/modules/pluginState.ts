/**
 * 插件状态配置模块
 * 持久化插件启用/禁用状态
 */
import { z } from 'zod';
import type { ConfigModule } from '../types';

const pluginStateSchema = z.object({
  enabledPlugins: z.array(z.string()),
});

export type PluginStateConfig = z.infer<typeof pluginStateSchema>;

export const pluginStateModule: ConfigModule<PluginStateConfig> = {
  id: 'plugin-state',
  version: 1,
  schema: pluginStateSchema,
  defaults: { enabledPlugins: [] },
  store: 'json',
};

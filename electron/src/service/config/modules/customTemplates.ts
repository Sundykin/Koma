/**
 * 自定义 Prompt 模板配置模块
 * 只存储用户自定义的模板覆盖，默认模板在前端代码中
 */
import { z } from 'zod';
import type { ConfigModule } from '../types';

const customTemplatesSchema = z.record(
  z.string(),
  z.object({
    id: z.string(),
    name: z.string(),
    description: z.string(),
    template: z.string(),
    variables: z.array(z.string()),
    isCustom: z.literal(true),
  })
).default({});

export type CustomTemplatesData = z.infer<typeof customTemplatesSchema>;

export const customTemplatesModule: ConfigModule<CustomTemplatesData> = {
  id: 'custom-templates',
  version: 1,
  schema: customTemplatesSchema,
  defaults: {},
  store: 'json',
};

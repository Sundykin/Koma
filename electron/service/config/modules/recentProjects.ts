/**
 * 最近项目配置模块
 */
import { z } from 'zod';
import type { ConfigModule } from '../types';

const recentProjectSchema = z.object({
  id: z.string(),
  title: z.string(),
  path: z.string(),
  lastOpened: z.number(),
  thumbnailPath: z.string().optional(),
});

const recentProjectsSchema = z.array(recentProjectSchema).default([]);

export type RecentProjectsData = z.infer<typeof recentProjectsSchema>;

export const recentProjectsModule: ConfigModule<RecentProjectsData> = {
  id: 'recent-projects',
  version: 1,
  schema: recentProjectsSchema,
  defaults: [],
  store: 'json',
};

/**
 * 聊天会话元数据模块
 * 存储会话列表（不含消息体，消息体存独立文件）
 */
import { z } from 'zod';
import type { ConfigModule } from '../types';

const sessionMetaSchema = z.object({
  id: z.string(),
  title: z.string(),
  createdAt: z.number(),
  updatedAt: z.number(),
  messageCount: z.number(),
});

const chatSessionsSchema = z.object({
  sessions: z.array(sessionMetaSchema).default([]),
  currentSessionId: z.string().nullable().default(null),
});

export type ChatSessionsData = z.infer<typeof chatSessionsSchema>;

export const chatSessionsModule: ConfigModule<ChatSessionsData> = {
  id: 'chat-sessions',
  version: 1,
  schema: chatSessionsSchema,
  defaults: {
    sessions: [],
    currentSessionId: null,
  },
  store: 'json',
};

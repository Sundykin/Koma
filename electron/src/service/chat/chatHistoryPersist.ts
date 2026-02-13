/**
 * 聊天历史持久化
 * 每个会话的消息体存为独立 JSON 文件，避免 localStorage 容量限制
 */
import * as fs from 'fs/promises';
import * as path from 'path';
import { storagePathLoader } from '../config/bootstrap/storagePath';

export interface PersistedSessionData {
  id: string;
  title: string;
  messages: any[];
  systemPrompt?: string;
  schemaVersion: number;
  createdAt: number;
  updatedAt: number;
}

function getChatDir(): string {
  const paths = storagePathLoader.getPaths();
  return path.join(path.dirname(paths.dataDir), 'chat');
}

function getSessionPath(sessionId: string): string {
  const safe = sessionId.replace(/[^a-zA-Z0-9_-]/g, '_');
  return path.join(getChatDir(), `${safe}.json`);
}

export async function ensureChatDir(): Promise<void> {
  await fs.mkdir(getChatDir(), { recursive: true });
}

export async function loadSessionMessages(
  sessionId: string
): Promise<PersistedSessionData | null> {
  try {
    const content = await fs.readFile(getSessionPath(sessionId), 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

export async function saveSessionMessages(
  data: PersistedSessionData
): Promise<void> {
  await ensureChatDir();
  await fs.writeFile(
    getSessionPath(data.id),
    JSON.stringify(data, null, 2),
    'utf-8'
  );
}

export async function deleteSessionFile(sessionId: string): Promise<void> {
  try {
    await fs.unlink(getSessionPath(sessionId));
  } catch {
    // ignore
  }
}

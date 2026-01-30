/**
 * 对话历史存储
 * 使用 Zustand + localStorage 管理会话历史
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ChatMessage } from '../chat/types';
import { extractThinkFromText } from '../chat/utils/messageUtils';

// 当前 schema 版本
const SCHEMA_VERSION = 2;

// 会话元数据
export interface SessionMeta {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
}

// 完整会话数据
export interface SessionData extends SessionMeta {
  messages: ChatMessage[];
  systemPrompt?: string;
  schemaVersion?: number;
}

// Store 状态
interface ChatHistoryState {
  sessions: SessionMeta[];
  currentSessionId: string | null;

  // 操作
  loadSessions: () => void;
  createSession: (title?: string) => string;
  updateSession: (id: string, data: Partial<SessionMeta>) => void;
  deleteSession: (id: string) => Promise<void>;
  setCurrentSession: (id: string | null) => void;

  // 消息操作
  saveMessages: (sessionId: string, messages: ChatMessage[], systemPrompt?: string) => void;
  loadMessages: (sessionId: string) => SessionData | null;
}

// 存储键
const SESSIONS_KEY = 'chat_sessions';
const SESSION_DATA_PREFIX = 'chat_session_';

// 生成会话标题
function generateTitle(messages: ChatMessage[]): string {
  const firstUserMsg = messages.find(m => m.role === 'user');
  if (firstUserMsg) {
    const content = typeof firstUserMsg.content === 'string'
      ? firstUserMsg.content
      : firstUserMsg.content.find(p => p.type === 'text')?.text || '';
    return content.slice(0, 30) + (content.length > 30 ? '...' : '');
  }
  return '新对话';
}

/**
 * 迁移旧版本会话数据
 * v1 -> v2: 从 content 中提取 <think> 标签到 reasoning 字段
 */
function migrateSessionData(data: SessionData): SessionData {
  // 已是最新版本
  if (data.schemaVersion === SCHEMA_VERSION) {
    return data;
  }

  // 迁移消息
  const migratedMessages = data.messages.map(msg => {
    // 只处理 assistant 消息且没有 reasoning 的
    if (msg.role === 'assistant' && !msg.reasoning && typeof msg.content === 'string') {
      const { content, reasoning } = extractThinkFromText(msg.content);
      if (reasoning) {
        return { ...msg, content, reasoning };
      }
    }
    return msg;
  });

  return {
    ...data,
    messages: migratedMessages,
    schemaVersion: SCHEMA_VERSION,
  };
}

export const useChatHistoryStore = create<ChatHistoryState>()(
  persist(
    (set, get) => ({
      sessions: [],
      currentSessionId: null,

      loadSessions: () => {
        try {
          const stored = localStorage.getItem(SESSIONS_KEY);
          if (stored) {
            const sessions = JSON.parse(stored) as SessionMeta[];
            // 按更新时间排序
            sessions.sort((a, b) => b.updatedAt - a.updatedAt);
            set({ sessions });
          }
        } catch (e) {
          console.error('加载会话列表失败:', e);
        }
      },

      createSession: (title?: string) => {
        const id = `session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const now = Date.now();
        const session: SessionMeta = {
          id,
          title: title || '新对话',
          createdAt: now,
          updatedAt: now,
          messageCount: 0,
        };

        set(state => {
          const sessions = [session, ...state.sessions];
          localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
          return { sessions, currentSessionId: id };
        });

        return id;
      },

      updateSession: (id, data) => {
        set(state => {
          const sessions = state.sessions.map(s =>
            s.id === id ? { ...s, ...data, updatedAt: Date.now() } : s
          );
          sessions.sort((a, b) => b.updatedAt - a.updatedAt);
          localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
          return { sessions };
        });
      },

      deleteSession: async (id) => {
        // 删除会话数据
        localStorage.removeItem(`${SESSION_DATA_PREFIX}${id}`);

        set(state => {
          const sessions = state.sessions.filter(s => s.id !== id);
          localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
          return {
            sessions,
            currentSessionId: state.currentSessionId === id ? null : state.currentSessionId,
          };
        });
      },

      setCurrentSession: (id) => {
        set({ currentSessionId: id });
      },

      saveMessages: (sessionId, messages, systemPrompt) => {
        const { sessions, updateSession } = get();
        const session = sessions.find(s => s.id === sessionId);

        // 保存消息数据（包含 schema 版本）
        const data: SessionData = {
          id: sessionId,
          title: session?.title || generateTitle(messages),
          createdAt: session?.createdAt || Date.now(),
          updatedAt: Date.now(),
          messageCount: messages.length,
          messages,
          systemPrompt,
          schemaVersion: SCHEMA_VERSION,
        };

        localStorage.setItem(`${SESSION_DATA_PREFIX}${sessionId}`, JSON.stringify(data));

        // 更新会话元数据
        if (session) {
          updateSession(sessionId, {
            title: data.title,
            messageCount: messages.length,
          });
        } else {
          // 新会话
          set(state => {
            const newSession: SessionMeta = {
              id: sessionId,
              title: data.title,
              createdAt: data.createdAt,
              updatedAt: data.updatedAt,
              messageCount: messages.length,
            };
            const sessions = [newSession, ...state.sessions];
            localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
            return { sessions };
          });
        }
      },

      loadMessages: (sessionId) => {
        try {
          const stored = localStorage.getItem(`${SESSION_DATA_PREFIX}${sessionId}`);
          if (stored) {
            const data = JSON.parse(stored) as SessionData;
            // 懒迁移：加载时检查并迁移旧版本数据
            const migratedData = migrateSessionData(data);
            // 如果进行了迁移，写回存储
            if (data.schemaVersion !== migratedData.schemaVersion) {
              localStorage.setItem(`${SESSION_DATA_PREFIX}${sessionId}`, JSON.stringify(migratedData));
            }
            return migratedData;
          }
        } catch (e) {
          console.error('加载会话数据失败:', e);
        }
        return null;
      },
    }),
    {
      name: 'chat-history',
      partialize: (state) => ({
        currentSessionId: state.currentSessionId,
      }),
    }
  )
);

export default useChatHistoryStore;

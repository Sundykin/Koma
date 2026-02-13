/**
 * 对话历史存储
 * 双写迁移：优先使用后端文件存储，fallback 到 localStorage
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ChatMessage } from '../chat/types';
import { extractThinkFromText } from '../chat/utils/messageUtils';
import { configBridge } from '../services/configBridge';

const SCHEMA_VERSION = 2;
const MAX_TITLE_LENGTH = 30;

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
  loadSessions: () => void;
  createSession: (title?: string) => string;
  updateSession: (id: string, data: Partial<SessionMeta>) => void;
  deleteSession: (id: string) => Promise<void>;
  setCurrentSession: (id: string | null) => void;
  saveMessages: (sessionId: string, messages: ChatMessage[], systemPrompt?: string) => void;
  loadMessages: (sessionId: string) => SessionData | null;
}

// localStorage 键
const SESSIONS_KEY = 'chat_sessions';
const SESSION_DATA_PREFIX = 'chat_session_';

// 后端 API
function getChatHistoryAPI(): any {
  if (typeof window !== 'undefined' && (window as any).electronAPI?.chat?.history) {
    return (window as any).electronAPI.chat.history;
  }
  return null;
}

function normalizeTitle(text: string): string {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (!cleaned) return '';
  return cleaned.length > MAX_TITLE_LENGTH
    ? `${cleaned.slice(0, MAX_TITLE_LENGTH)}...`
    : cleaned;
}

function extractMessageText(message: ChatMessage): string {
  if (typeof message.content === 'string') {
    if (message.role === 'assistant') {
      return extractThinkFromText(message.content).content;
    }
    return message.content;
  }
  return message.content.reduce((acc, part) => {
    if (part.type === 'text') return acc ? `${acc} ${part.text}` : part.text;
    return acc;
  }, '');
}

function generateTitle(messages: ChatMessage[]): string {
  const firstAssistantMsg = messages.find(m => m.role === 'assistant');
  if (firstAssistantMsg) {
    const title = normalizeTitle(extractMessageText(firstAssistantMsg));
    if (title) return title;
  }
  const firstUserMsg = messages.find(m => m.role === 'user');
  if (firstUserMsg) {
    const title = normalizeTitle(extractMessageText(firstUserMsg));
    if (title) return title;
  }
  return '新对话';
}

function migrateSessionData(data: SessionData): SessionData {
  if (data.schemaVersion === SCHEMA_VERSION) return data;
  const migratedMessages = data.messages.map(msg => {
    if (msg.role === 'assistant' && !msg.reasoning && typeof msg.content === 'string') {
      const { content, reasoning } = extractThinkFromText(msg.content);
      if (reasoning) return { ...msg, content, reasoning };
    }
    return msg;
  });
  return { ...data, messages: migratedMessages, schemaVersion: SCHEMA_VERSION };
}

// 持久化会话列表到后端（异步，不阻塞 UI）
function persistSessionList(sessions: SessionMeta[], currentSessionId: string | null) {
  // localStorage 双写
  localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
  // 后端持久化
  configBridge.set('chat-sessions', { sessions, currentSessionId }).catch(() => {});
}

export const useChatHistoryStore = create<ChatHistoryState>()(
  persist(
    (set, get) => ({
      sessions: [],
      currentSessionId: null,

      loadSessions: () => {
        // 优先从后端加载
        configBridge.get<{ sessions: SessionMeta[]; currentSessionId: string | null }>('chat-sessions')
          .then(data => {
            if (data?.sessions?.length) {
              const sessions = [...data.sessions].sort((a, b) => b.updatedAt - a.updatedAt);
              set({ sessions, currentSessionId: data.currentSessionId });
              return;
            }
            // fallback: localStorage
            const stored = localStorage.getItem(SESSIONS_KEY);
            if (stored) {
              const sessions = (JSON.parse(stored) as SessionMeta[]).sort((a, b) => b.updatedAt - a.updatedAt);
              set({ sessions });
              // 自动同步到后端
              configBridge.set('chat-sessions', { sessions, currentSessionId: null }).catch(() => {});
            }
          })
          .catch(() => {
            // fallback: localStorage
            try {
              const stored = localStorage.getItem(SESSIONS_KEY);
              if (stored) {
                const sessions = (JSON.parse(stored) as SessionMeta[]).sort((a, b) => b.updatedAt - a.updatedAt);
                set({ sessions });
              }
            } catch {}
          });
      },

      createSession: (title?: string) => {
        const id = `session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const now = Date.now();
        const session: SessionMeta = { id, title: title || '新对话', createdAt: now, updatedAt: now, messageCount: 0 };
        set(state => {
          const sessions = [session, ...state.sessions];
          persistSessionList(sessions, id);
          return { sessions, currentSessionId: id };
        });
        return id;
      },

      updateSession: (id, data) => {
        set(state => {
          const sessions = state.sessions
            .map(s => s.id === id ? { ...s, ...data, updatedAt: Date.now() } : s)
            .sort((a, b) => b.updatedAt - a.updatedAt);
          persistSessionList(sessions, state.currentSessionId);
          return { sessions };
        });
      },

      deleteSession: async (id) => {
        // 删除消息文件
        const api = getChatHistoryAPI();
        if (api) {
          await api.deleteMessages(id).catch(() => {});
        }
        localStorage.removeItem(`${SESSION_DATA_PREFIX}${id}`);

        set(state => {
          const sessions = state.sessions.filter(s => s.id !== id);
          const currentSessionId = state.currentSessionId === id ? null : state.currentSessionId;
          persistSessionList(sessions, currentSessionId);
          return { sessions, currentSessionId };
        });
      },

      setCurrentSession: (id) => set({ currentSessionId: id }),

      saveMessages: (sessionId, messages, systemPrompt) => {
        const { sessions, updateSession } = get();
        const session = sessions.find(s => s.id === sessionId);
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

        // 双写：localStorage + 后端文件
        localStorage.setItem(`${SESSION_DATA_PREFIX}${sessionId}`, JSON.stringify(data));
        const api = getChatHistoryAPI();
        if (api) {
          api.saveMessages(data).catch(() => {});
        }

        if (session) {
          updateSession(sessionId, { title: data.title, messageCount: messages.length });
        } else {
          set(state => {
            const newSession: SessionMeta = {
              id: sessionId, title: data.title,
              createdAt: data.createdAt, updatedAt: data.updatedAt,
              messageCount: messages.length,
            };
            const sessions = [newSession, ...state.sessions];
            persistSessionList(sessions, state.currentSessionId);
            return { sessions };
          });
        }
      },

      loadMessages: (sessionId) => {
        // 同步加载：先 localStorage，异步后端加载会在下次调用时生效
        try {
          const stored = localStorage.getItem(`${SESSION_DATA_PREFIX}${sessionId}`);
          if (stored) {
            const data = JSON.parse(stored) as SessionData;
            const migrated = migrateSessionData(data);
            if (data.schemaVersion !== migrated.schemaVersion) {
              localStorage.setItem(`${SESSION_DATA_PREFIX}${sessionId}`, JSON.stringify(migrated));
            }
            return migrated;
          }
        } catch {}

        // 尝试从后端异步加载（触发后台同步）
        const api = getChatHistoryAPI();
        if (api) {
          api.loadMessages(sessionId).then((data: SessionData | null) => {
            if (data) {
              // 写回 localStorage 作为缓存
              localStorage.setItem(`${SESSION_DATA_PREFIX}${sessionId}`, JSON.stringify(data));
            }
          }).catch(() => {});
        }
        return null;
      },
    }),
    {
      name: 'chat-history',
      partialize: (state) => ({ currentSessionId: state.currentSessionId }),
    }
  )
);

export default useChatHistoryStore;

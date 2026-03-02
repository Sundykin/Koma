/**
 * 历史对话侧边栏
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Empty, Tooltip, Popconfirm } from 'antd';
import { PlusOutlined, DeleteOutlined, MessageOutlined } from '@ant-design/icons';
import { useChatHistoryStore, type SessionMeta } from '../../store/chatHistoryStore';

interface HistorySidebarProps {
  currentSessionId?: string | null;
  onSelectSession: (sessionId: string) => void;
  onNewChat: () => void;
}

// 格式化时间
function formatTime(timestamp: number, t: (key: string, options?: any) => string): string {
  const now = Date.now();
  const diff = now - timestamp;
  const day = 24 * 60 * 60 * 1000;

  if (diff < day) {
    return t('history.today');
  } else if (diff < 2 * day) {
    return t('history.yesterday');
  } else if (diff < 7 * day) {
    return t('history.daysAgo', { count: Math.floor(diff / day) });
  } else {
    const date = new Date(timestamp);
    return `${date.getMonth() + 1}/${date.getDate()}`;
  }
}

// 按时间分组
function groupSessions(sessions: SessionMeta[], t: (key: string) => string): { label: string; sessions: SessionMeta[] }[] {
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;

  const today: SessionMeta[] = [];
  const yesterday: SessionMeta[] = [];
  const week: SessionMeta[] = [];
  const older: SessionMeta[] = [];

  for (const session of sessions) {
    const diff = now - session.updatedAt;
    if (diff < day) {
      today.push(session);
    } else if (diff < 2 * day) {
      yesterday.push(session);
    } else if (diff < 7 * day) {
      week.push(session);
    } else {
      older.push(session);
    }
  }

  const groups: { label: string; sessions: SessionMeta[] }[] = [];
  if (today.length > 0) groups.push({ label: t('history.today'), sessions: today });
  if (yesterday.length > 0) groups.push({ label: t('history.yesterday'), sessions: yesterday });
  if (week.length > 0) groups.push({ label: t('history.last7Days'), sessions: week });
  if (older.length > 0) groups.push({ label: t('history.older'), sessions: older });

  return groups;
}

export const HistorySidebar: React.FC<HistorySidebarProps> = ({
  currentSessionId: propCurrentSessionId,
  onSelectSession,
  onNewChat,
}) => {
  const { t } = useTranslation('chat');
  const { sessions, currentSessionId: storeCurrentSessionId, loadSessions, deleteSession, setCurrentSession } = useChatHistoryStore();
  const [groups, setGroups] = useState<{ label: string; sessions: SessionMeta[] }[]>([]);

  // 优先使用 props 传入的 currentSessionId
  const currentSessionId = propCurrentSessionId ?? storeCurrentSessionId;

  // 加载会话列表
  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  // 分组会话
  useEffect(() => {
    setGroups(groupSessions(sessions, t));
  }, [sessions, t]);

  // 选择会话
  const handleSelect = useCallback((session: SessionMeta) => {
    setCurrentSession(session.id);
    onSelectSession(session.id);
  }, [setCurrentSession, onSelectSession]);

  // 删除会话
  const handleDelete = useCallback(async (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    await deleteSession(sessionId);
  }, [deleteSession]);

  // 判断是否为新对话状态（没有选中任何会话或选中的会话没有消息）
  const isNewChatActive = !currentSessionId || !sessions.some(s => s.id === currentSessionId);

  return (
    <div className="flex flex-col h-full bg-[#09090b]">
      {/* 新建对话按钮 */}
      <div className="p-4 border-b border-[#27272a]">
        <Button
          type={isNewChatActive ? 'primary' : 'default'}
          className={isNewChatActive ? '!bg-emerald-500 !border-emerald-500' : ''}
          icon={<PlusOutlined />}
          onClick={onNewChat}
          block
        >
          {t('history.newChat')}
        </Button>
      </div>

      {/* 会话列表 */}
      <div className="flex-1 overflow-y-auto p-2">
        {groups.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={t('history.empty')}
            className="mt-10 [&_.ant-empty-description]:text-[#71717a]"
          />
        ) : (
          groups.map(group => (
            <div key={group.label} className="mb-4">
              <div className="py-2 px-3 text-xs font-medium text-[#71717a] uppercase">{group.label}</div>
              {group.sessions.map(session => (
                <div
                  key={session.id}
                  className={`group flex items-center gap-2.5 py-2.5 px-3 rounded-lg cursor-pointer transition-colors duration-200 hover:bg-[#27272a] ${
                    session.id === currentSessionId ? 'bg-[#27272a]' : ''
                  }`}
                  onClick={() => handleSelect(session)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleSelect(session); } }}
                  aria-label={session.title}
                >
                  <MessageOutlined className="shrink-0 text-[#71717a] text-sm" />
                  <span className="flex-1 text-sm text-[#d4d4d8] overflow-hidden text-ellipsis whitespace-nowrap">{session.title}</span>
                  <Popconfirm
                    title={t('history.confirmDelete')}
                    onConfirm={(e) => handleDelete(e as any, session.id)}
                    okText={t('common:delete')}
                    cancelText={t('common:cancel')}
                  >
                    <Tooltip title={t('history.deleteTooltip')}>
                      <button
                        className="shrink-0 w-6 h-6 flex items-center justify-center bg-transparent border-none rounded text-[#71717a] cursor-pointer opacity-0 transition-[opacity,background-color,color] duration-200 group-hover:opacity-100 hover:bg-[#3f3f46] hover:text-red-500"
                        onClick={(e) => e.stopPropagation()}
                        aria-label={t('history.deleteAriaLabel', { title: session.title })}
                      >
                        <DeleteOutlined />
                      </button>
                    </Tooltip>
                  </Popconfirm>
                </div>
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default HistorySidebar;

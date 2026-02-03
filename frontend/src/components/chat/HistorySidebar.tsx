/**
 * 历史对话侧边栏
 */
import React, { useState, useEffect, useCallback } from 'react';
import { Button, Empty, Tooltip, Popconfirm } from 'antd';
import { PlusOutlined, DeleteOutlined, MessageOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useChatHistoryStore } from '../../store/chatHistoryStore';
import type { SessionMeta } from '../../store/chatHistoryStore';
import styles from './HistorySidebar.module.css';

interface HistorySidebarProps {
  currentSessionId?: string | null;
  onSelectSession: (sessionId: string) => void;
  onNewChat: () => void;
}

// 格式化时间
function useFormatTime() {
  const { t } = useTranslation();

  return (timestamp: number): string => {
    const now = Date.now();
    const diff = now - timestamp;
    const day = 24 * 60 * 60 * 1000;

    if (diff < day) {
      return t('chat.today');
    } else if (diff < 2 * day) {
      return t('chat.yesterday');
    } else if (diff < 7 * day) {
      return `${Math.floor(diff / day)} ${t('chat.daysAgo')}`;
    } else {
      const date = new Date(timestamp);
      return `${date.getMonth() + 1}/${date.getDate()}`;
    }
  };
}

// 按时间分组
function useGroupSessions() {
  const { t } = useTranslation();

  return (sessions: SessionMeta[]): { label: string; sessions: SessionMeta[] }[] => {
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
    if (today.length > 0) groups.push({ label: t('chat.today'), sessions: today });
    if (yesterday.length > 0) groups.push({ label: t('chat.yesterday'), sessions: yesterday });
    if (week.length > 0) groups.push({ label: t('chat.last7Days'), sessions: week });
    if (older.length > 0) groups.push({ label: t('chat.earlier'), sessions: older });

    return groups;
  };
}

export const HistorySidebar: React.FC<HistorySidebarProps> = ({
  currentSessionId: propCurrentSessionId,
  onSelectSession,
  onNewChat,
}) => {
  const { t } = useTranslation();
  const groupSessions = useGroupSessions();
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
    setGroups(groupSessions(sessions));
  }, [sessions, groupSessions]);

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
    <div className={styles.sidebar}>
      {/* 新建对话按钮 */}
      <div className={styles.header}>
        <Button
          type={isNewChatActive ? 'primary' : 'default'}
          className={isNewChatActive ? styles.activeNewChat : ''}
          icon={<PlusOutlined />}
          onClick={onNewChat}
          block
        >
          {t('chat.newChat')}
        </Button>
      </div>

      {/* 会话列表 */}
      <div className={styles.list}>
        {groups.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={t('chat.noHistory')}
            className={styles.empty}
          />
        ) : (
          groups.map(group => (
            <div key={group.label} className={styles.group}>
              <div className={styles.groupLabel}>{group.label}</div>
              {group.sessions.map(session => (
                <div
                  key={session.id}
                  className={`${styles.sessionItem} ${
                    session.id === currentSessionId ? styles.active : ''
                  }`}
                  onClick={() => handleSelect(session)}
                >
                  <MessageOutlined className={styles.sessionIcon} />
                  <span className={styles.sessionTitle}>{session.title}</span>
                  <Popconfirm
                    title={t('chat.confirmDeleteChat')}
                    onConfirm={(e) => handleDelete(e as any, session.id)}
                    okText={t('common.delete')}
                    cancelText={t('common.cancel')}
                  >
                    <Tooltip title={t('common.delete')}>
                      <button
                        className={styles.deleteButton}
                        onClick={(e) => e.stopPropagation()}
                        aria-label={`${t('chat.deleteChat')}: ${session.title}`}
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

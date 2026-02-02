/**
 * 历史对话侧边栏
 */
import React, { useState, useEffect, useCallback } from 'react';
import { Button, Empty, Tooltip, Popconfirm } from 'antd';
import { PlusOutlined, DeleteOutlined, MessageOutlined } from '@ant-design/icons';
import { useChatHistoryStore, type SessionMeta } from '../../store/chatHistoryStore';
import styles from './HistorySidebar.module.css';

interface HistorySidebarProps {
  currentSessionId?: string | null;
  onSelectSession: (sessionId: string) => void;
  onNewChat: () => void;
}

// 格式化时间
function formatTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const day = 24 * 60 * 60 * 1000;

  if (diff < day) {
    return '今天';
  } else if (diff < 2 * day) {
    return '昨天';
  } else if (diff < 7 * day) {
    return `${Math.floor(diff / day)} 天前`;
  } else {
    const date = new Date(timestamp);
    return `${date.getMonth() + 1}/${date.getDate()}`;
  }
}

// 按时间分组
function groupSessions(sessions: SessionMeta[]): { label: string; sessions: SessionMeta[] }[] {
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
  if (today.length > 0) groups.push({ label: '今天', sessions: today });
  if (yesterday.length > 0) groups.push({ label: '昨天', sessions: yesterday });
  if (week.length > 0) groups.push({ label: '最近 7 天', sessions: week });
  if (older.length > 0) groups.push({ label: '更早', sessions: older });

  return groups;
}

export const HistorySidebar: React.FC<HistorySidebarProps> = ({
  currentSessionId: propCurrentSessionId,
  onSelectSession,
  onNewChat,
}) => {
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
  }, [sessions]);

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
          新建对话
        </Button>
      </div>

      {/* 会话列表 */}
      <div className={styles.list}>
        {groups.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="暂无历史对话"
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
                    title="确定删除此对话？"
                    onConfirm={(e) => handleDelete(e as any, session.id)}
                    okText="删除"
                    cancelText="取消"
                  >
                    <Tooltip title="删除">
                      <button
                        className={styles.deleteButton}
                        onClick={(e) => e.stopPropagation()}
                        aria-label={`删除对话: ${session.title}`}
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

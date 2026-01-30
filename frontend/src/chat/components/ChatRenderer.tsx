/**
 * 对话渲染组件
 * 使用 ds-markdown 渲染流式 Markdown
 */
import React, { useRef, useEffect } from 'react';
import { Avatar } from 'antd';
import { RobotOutlined, MessageOutlined, UserOutlined } from '@ant-design/icons';
import { Markdown } from 'ds-markdown';
import 'ds-markdown/style.css';
import type { ChatMessage, ToolCall } from '../types';
import { MessageBubble } from './MessageBubble';
import styles from './ChatRenderer.module.css';

export interface ChatRendererProps {
  messages: ChatMessage[];
  streaming?: boolean;
  streamingContent?: string;
  streamingReasoning?: string;
  onRetry?: (messageId: string) => void;
  onCopy?: (content: string) => void;
  renderAvatar?: (role: string) => React.ReactNode;
  renderToolCall?: (toolCall: ToolCall) => React.ReactNode;
  emptyText?: string;
}

// 思考指示器
const ThinkingIndicator: React.FC = () => (
  <div className={styles.thinkingIndicator}>
    <div className={styles.thinkingDots}>
      <span className={styles.thinkingDot} />
      <span className={styles.thinkingDot} />
      <span className={styles.thinkingDot} />
    </div>
    <span>正在思考...</span>
  </div>
);

// 流式消息组件
const StreamingMessage: React.FC<{ content: string; reasoning?: string }> = ({ content, reasoning }) => {
  if (!content && !reasoning) {
    return (
      <div className={styles.streamingMessage}>
        <Avatar size={32} icon={<RobotOutlined />} className={styles.assistantAvatar} />
        <div className={styles.streamingContent}>
          <ThinkingIndicator />
        </div>
      </div>
    );
  }

  return (
    <div className={styles.streamingMessage}>
      <Avatar size={32} icon={<RobotOutlined />} className={styles.assistantAvatar} />
      <div className={styles.streamingContent}>
        {reasoning && (
          <div className={styles.reasoningBlock}>
            <div className={styles.reasoningHeader}>
              <span className={styles.reasoningLabel}>正在思考...</span>
            </div>
            <div className={styles.reasoningContent}>
              <pre>{reasoning}</pre>
            </div>
          </div>
        )}
        <Markdown>{content}</Markdown>
      </div>
    </div>
  );
};

// 空状态
const EmptyState: React.FC<{ text?: string }> = ({ text = '开始对话吧' }) => (
  <div className={styles.emptyState}>
    <MessageOutlined className={styles.emptyIcon} />
    <span className={styles.emptyText}>{text}</span>
  </div>
);

export const ChatRenderer: React.FC<ChatRendererProps> = ({
  messages,
  streaming,
  streamingContent,
  streamingReasoning,
  onRetry,
  onCopy,
  renderAvatar,
  renderToolCall,
  emptyText,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  // 自动滚动到底部
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [messages, streamingContent, streamingReasoning]);

  const renderMarkdownContent = (content: string, isUser: boolean) => {
    if (!content) return null;
    // 用户消息直接显示文本，助手消息使用 Markdown 渲染
    if (isUser) {
      return <span>{content}</span>;
    }
    return <Markdown>{content}</Markdown>;
  };

  if (messages.length === 0 && !streaming) {
    return <EmptyState text={emptyText} />;
  }

  return (
    <div ref={containerRef} className={styles.chatContainer}>
      {messages.map(msg => (
        <MessageBubble
          key={msg.id}
          message={msg}
          onRetry={onRetry}
          onCopy={onCopy}
          renderAvatar={renderAvatar}
          renderToolCall={renderToolCall}
          renderContent={(content) => renderMarkdownContent(content, msg.role === 'user')}
        />
      ))}

      {streaming && (
        <StreamingMessage content={streamingContent || ''} reasoning={streamingReasoning} />
      )}
    </div>
  );
};

export default ChatRenderer;

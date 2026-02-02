/**
 * 消息气泡组件
 */
import React, { useState, useMemo } from 'react';
import { Avatar, Typography, Button, Tooltip } from 'antd';
import { UserOutlined, RobotOutlined, CopyOutlined, ReloadOutlined, DownOutlined, RightOutlined } from '@ant-design/icons';
import type { ChatMessage, ToolCall } from '../types';
import { normalizeMessage } from '../utils/messageUtils';
import styles from './ChatRenderer.module.css';

const { Text } = Typography;

interface MessageBubbleProps {
  message: ChatMessage;
  onRetry?: (messageId: string) => void;
  onCopy?: (content: string) => void;
  renderAvatar?: (role: string) => React.ReactNode;
  renderToolCall?: (toolCall: ToolCall) => React.ReactNode;
  renderContent: (content: string) => React.ReactNode;
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({
  message,
  onRetry,
  onCopy,
  renderAvatar,
  renderToolCall,
  renderContent,
}) => {
  const isUser = message.role === 'user';
  const isAssistant = message.role === 'assistant';
  const isTool = message.role === 'tool';
  const [reasoningExpanded, setReasoningExpanded] = useState(false);

  // 归一化消息内容（兜底处理 <think> 标签）
  const { displayContent, displayReasoning } = useMemo(
    () => normalizeMessage(message),
    [message]
  );

  const handleCopy = () => {
    navigator.clipboard.writeText(displayContent);
    onCopy?.(displayContent);
  };

  const renderDefaultAvatar = () => {
    if (renderAvatar) {
      return renderAvatar(message.role);
    }

    if (isUser) {
      return (
        <Avatar size={32} icon={<UserOutlined />} className={styles.userAvatar} />
      );
    }

    return (
      <Avatar size={32} icon={<RobotOutlined />} className={styles.assistantAvatar} />
    );
  };

  if (isTool) {
    return (
      <div className={styles.toolMessage}>
        <Text type="secondary" className={styles.toolLabel}>
          工具结果: {message.name}
        </Text>
        <pre className={styles.toolContent}>{displayContent}</pre>
      </div>
    );
  }

  return (
    <div className={`${styles.messageBubble} ${isUser ? styles.userBubble : styles.assistantBubble}`}>
      <div className={styles.avatarWrapper}>
        {renderDefaultAvatar()}
      </div>

      <div className={styles.messageContent}>
        <div className={styles.messageBody}>
          {/* 思考过程展示（使用归一化后的 displayReasoning） */}
          {isAssistant && displayReasoning && (
            <div className={styles.reasoningBlock}>
              <div
                className={styles.reasoningHeader}
                onClick={() => setReasoningExpanded(!reasoningExpanded)}
              >
                {reasoningExpanded ? <DownOutlined /> : <RightOutlined />}
                <span className={styles.reasoningLabel}>思考过程</span>
              </div>
              {reasoningExpanded && (
                <div className={styles.reasoningContent}>
                  <pre>{displayReasoning}</pre>
                </div>
              )}
            </div>
          )}
          {renderContent(displayContent)}

          {message.toolCalls?.map((tc, index) => (
            <div key={tc.id || index} className={styles.toolCallWrapper}>
              {renderToolCall ? (
                renderToolCall(tc)
              ) : (
                <div className={styles.toolCall}>
                  <Text type="secondary">调用工具: {tc.name}</Text>
                  <pre className={styles.toolArgs}>
                    {JSON.stringify(tc.arguments, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          ))}
        </div>

        {isAssistant && (
          <div className={styles.messageActions}>
            <Tooltip title="复制">
              <Button
                type="text"
                size="small"
                icon={<CopyOutlined />}
                onClick={handleCopy}
              />
            </Tooltip>
            {onRetry && (
              <Tooltip title="重新生成">
                <Button
                  type="text"
                  size="small"
                  icon={<ReloadOutlined />}
                  onClick={() => onRetry(message.id)}
                />
              </Tooltip>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

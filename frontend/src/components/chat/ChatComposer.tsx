/**
 * 对话输入组件
 * 支持文本输入、附件上传、快捷键
 */
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Button, Tooltip, Upload, message } from 'antd';
import {
  SendOutlined,
  StopOutlined,
  PaperClipOutlined,
  CloseOutlined,
  FileImageOutlined,
  FileTextOutlined,
  FileOutlined,
} from '@ant-design/icons';
import type { UploadFile } from 'antd/es/upload/interface';
import styles from './ChatComposer.module.css';

// 支持的文件类型
const ACCEPTED_TYPES = {
  image: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
  document: ['application/pdf', 'text/plain', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  code: ['text/javascript', 'text/typescript', 'text/x-python', 'text/x-java', 'text/x-c', 'text/x-cpp'],
};

const ALL_ACCEPTED = [...ACCEPTED_TYPES.image, ...ACCEPTED_TYPES.document, ...ACCEPTED_TYPES.code].join(',');
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export interface AttachmentFile {
  id: string;
  file: File;
  preview?: string;
  type: 'image' | 'document' | 'code' | 'other';
}

interface ChatComposerProps {
  onSend: (text: string, attachments?: AttachmentFile[]) => void;
  onStop?: () => void;
  isLoading?: boolean;
  isStreaming?: boolean;
  disabled?: boolean;
  placeholder?: string;
  maxRows?: number;
}

export const ChatComposer: React.FC<ChatComposerProps> = ({
  onSend,
  onStop,
  isLoading = false,
  isStreaming = false,
  disabled = false,
  placeholder = '输入消息... (Enter 发送, Shift+Enter 换行)',
  maxRows = 6,
}) => {
  const [text, setText] = useState('');
  const [attachments, setAttachments] = useState<AttachmentFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const composerRef = useRef<HTMLDivElement>(null);

  // 自动调整高度
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto'; // 先重置高度以获取准确的 scrollHeight
      const lineHeight = 24;
      const maxHeight = lineHeight * maxRows;
      const currentScrollHeight = textarea.scrollHeight;
      
      textarea.style.height = `${Math.min(currentScrollHeight, maxHeight)}px`;
      
      // 只有内容超过最大高度时才显示滚动条，防止 windows 下空行也显示滚动轴
      textarea.style.overflowY = currentScrollHeight > maxHeight ? 'auto' : 'hidden';
    }
  }, [text, maxRows]);

  // 获取文件类型
  const getFileType = (file: File): AttachmentFile['type'] => {
    if (ACCEPTED_TYPES.image.includes(file.type)) return 'image';
    if (ACCEPTED_TYPES.document.includes(file.type)) return 'document';
    if (ACCEPTED_TYPES.code.includes(file.type) || file.name.match(/\.(js|ts|py|java|c|cpp|go|rs|rb|php)$/)) return 'code';
    return 'other';
  };

  // 处理文件添加
  const handleFilesAdd = useCallback(async (files: File[]) => {
    const validFiles: AttachmentFile[] = [];

    for (const file of files) {
      if (file.size > MAX_FILE_SIZE) {
        message.warning(`文件 ${file.name} 超过 10MB 限制`);
        continue;
      }

      const type = getFileType(file);
      const attachment: AttachmentFile = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        file,
        type,
      };

      // 图片生成预览
      if (type === 'image') {
        attachment.preview = URL.createObjectURL(file);
      }

      validFiles.push(attachment);
    }

    setAttachments(prev => [...prev, ...validFiles]);
  }, []);

  // 移除附件
  const handleRemoveAttachment = useCallback((id: string) => {
    setAttachments(prev => {
      const attachment = prev.find(a => a.id === id);
      if (attachment?.preview) {
        URL.revokeObjectURL(attachment.preview);
      }
      return prev.filter(a => a.id !== id);
    });
  }, []);

  // 发送消息
  const handleSend = useCallback(() => {
    const trimmedText = text.trim();
    if (!trimmedText && attachments.length === 0) return;
    if (disabled || isLoading) return;

    onSend(trimmedText, attachments.length > 0 ? attachments : undefined);
    setText('');
    setAttachments([]);
    textareaRef.current?.focus();
  }, [text, attachments, disabled, isLoading, onSend]);

  // 键盘事件
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  // 拖拽事件
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      handleFilesAdd(files);
    }
  }, [handleFilesAdd]);

  // 粘贴事件（支持粘贴图片）
  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    const files: File[] = [];

    for (const item of items) {
      if (item.kind === 'file') {
        const file = item.getAsFile();
        if (file) files.push(file);
      }
    }

    if (files.length > 0) {
      e.preventDefault();
      handleFilesAdd(files);
    }
  }, [handleFilesAdd]);

  // 文件选择
  const handleFileSelect = useCallback((info: { file: UploadFile }) => {
    if (info.file.originFileObj) {
      handleFilesAdd([info.file.originFileObj]);
    }
  }, [handleFilesAdd]);

  // 获取附件图标
  const getAttachmentIcon = (type: AttachmentFile['type']) => {
    switch (type) {
      case 'image': return <FileImageOutlined />;
      case 'document': return <FileTextOutlined />;
      case 'code': return <FileTextOutlined />;
      default: return <FileOutlined />;
    }
  };

  const canSend = (text.trim() || attachments.length > 0) && !disabled && !isLoading;

  return (
    <div
      ref={composerRef}
      className={`${styles.composer} ${isDragging ? styles.dragging : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* 拖拽提示 */}
      {isDragging && (
        <div className={styles.dropOverlay}>
          <PaperClipOutlined />
          <span>拖放文件到这里</span>
        </div>
      )}

      {/* 附件预览区 */}
      {attachments.length > 0 && (
        <div className={styles.attachments}>
          {attachments.map(attachment => (
            <div key={attachment.id} className={styles.attachmentItem}>
              {attachment.type === 'image' && attachment.preview ? (
                <img src={attachment.preview} alt={attachment.file.name} className={styles.attachmentImage} />
              ) : (
                <div className={styles.attachmentFile}>
                  {getAttachmentIcon(attachment.type)}
                </div>
              )}
              <span className={styles.attachmentName}>{attachment.file.name}</span>
              <button
                className={styles.attachmentRemove}
                onClick={() => handleRemoveAttachment(attachment.id)}
                aria-label={`移除附件: ${attachment.file.name}`}
              >
                <CloseOutlined />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* 输入区域 */}
      <div className={styles.inputRow}>
        {/* 附件按钮 */}
        <Upload
          accept={ALL_ACCEPTED}
          showUploadList={false}
          beforeUpload={() => false}
          onChange={handleFileSelect}
          multiple
        >
          <Tooltip title="添加附件">
            <Button
              type="text"
              icon={<PaperClipOutlined />}
              className={styles.attachButton}
              disabled={disabled}
            />
          </Tooltip>
        </Upload>

        {/* 文本输入 */}
        <textarea
          ref={textareaRef}
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder={placeholder}
          disabled={disabled || isLoading}
          className={styles.textarea}
          rows={1}
        />

        {/* 发送/停止按钮 */}
        {isStreaming ? (
          <Tooltip title="停止生成">
            <Button
              type="primary"
              danger
              icon={<StopOutlined />}
              onClick={onStop}
              className={styles.sendButton}
            />
          </Tooltip>
        ) : (
          <Tooltip title="发送 (Enter)">
            <Button
              type="primary"
              icon={<SendOutlined />}
              onClick={handleSend}
              disabled={!canSend}
              loading={isLoading}
              className={styles.sendButton}
            />
          </Tooltip>
        )}
      </div>
    </div>
  );
};

export default ChatComposer;

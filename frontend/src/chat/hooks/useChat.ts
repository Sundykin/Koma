/**
 * useChat Hook
 * 对话状态管理
 */
import { useState, useCallback, useRef, useEffect } from 'react';
import type { ChatAdapter } from '../adapters/types';
import type { ChatMessage, ChatChunk, ChatOptions, ContentPart } from '../types';
import type { ChatPlugin } from '../plugins/types';
import { ChatSession } from '../ChatSession';
import { ChatError } from '../types';

export interface UseChatOptions {
  adapter: ChatAdapter;
  systemPrompt?: string;
  plugins?: ChatPlugin[];
  maxHistoryLength?: number;
  onError?: (error: Error) => void;
  onStreamStart?: () => void;
  onStreamEnd?: () => void;
}

export interface UseChatReturn {
  messages: ChatMessage[];
  isLoading: boolean;
  isStreaming: boolean;
  streamingContent: string;
  streamingReasoning: string;
  error: Error | null;
  sessionId: string;

  send: (content: string | ContentPart[], options?: ChatOptions) => Promise<void>;
  sendStream: (content: string | ContentPart[], options?: ChatOptions) => Promise<void>;
  retry: (messageId: string) => Promise<void>;
  clear: () => void;
  loadMessages: (data: { id: string; messages: ChatMessage[]; systemPrompt?: string }) => void;
  setSystemPrompt: (prompt: string) => void;
  stop: () => void;
}

export function useChat(options: UseChatOptions): UseChatReturn {
  const sessionRef = useRef<ChatSession | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [streamingReasoning, setStreamingReasoning] = useState('');
  const [error, setError] = useState<Error | null>(null);

  // 初始化会话
  useEffect(() => {
    sessionRef.current = new ChatSession(
      options.adapter,
      {
        systemPrompt: options.systemPrompt,
        maxHistoryLength: options.maxHistoryLength,
      },
      options.plugins || []
    );
  }, [options.adapter]);

  // 更新系统提示词
  useEffect(() => {
    if (sessionRef.current && options.systemPrompt !== undefined) {
      sessionRef.current.setSystemPrompt(options.systemPrompt);
    }
  }, [options.systemPrompt]);

  const syncMessages = useCallback(() => {
    if (sessionRef.current) {
      setMessages(sessionRef.current.getMessages());
    }
  }, []);

  const send = useCallback(async (content: string | ContentPart[], chatOptions?: ChatOptions) => {
    if (!sessionRef.current) return;

    setIsLoading(true);
    setError(null);

    try {
      abortControllerRef.current = new AbortController();
      await sessionRef.current.send(content, {
        ...chatOptions,
        signal: abortControllerRef.current.signal,
      });
      syncMessages();
    } catch (err) {
      const error = err instanceof Error ? err : new Error('未知错误');
      setError(error);
      options.onError?.(error);
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  }, [options.onError, syncMessages]);

  const sendStream = useCallback(async (content: string | ContentPart[], chatOptions?: ChatOptions) => {
    if (!sessionRef.current) return;

    // 乐观更新：立即添加用户消息并同步到 UI
    sessionRef.current.addUserMessage(content);
    syncMessages();

    setIsLoading(true);
    setIsStreaming(true);
    setStreamingContent('');
    setStreamingReasoning('');
    setError(null);
    options.onStreamStart?.();

    try {
      abortControllerRef.current = new AbortController();

      let fullContent = '';
      let fullReasoning = '';

      // 使用 sendStreamWithoutUserMessage 避免重复添加用户消息
      for await (const chunk of sessionRef.current.sendStreamWithoutUserMessage({
        ...chatOptions,
        signal: abortControllerRef.current.signal,
      })) {
        fullContent += chunk.content;
        fullReasoning += chunk.reasoning || '';
        setStreamingContent(fullContent);
        setStreamingReasoning(fullReasoning);
      }

      syncMessages();
    } catch (err) {
      if (err instanceof ChatError && err.code === 'ABORTED') {
        // 用户取消，不算错误
        syncMessages();
      } else {
        const error = err instanceof Error ? err : new Error('未知错误');
        setError(error);
        options.onError?.(error);
      }
    } finally {
      setIsLoading(false);
      setIsStreaming(false);
      setStreamingContent('');
      setStreamingReasoning('');
      options.onStreamEnd?.();
      abortControllerRef.current = null;
    }
  }, [options.onError, options.onStreamStart, options.onStreamEnd, syncMessages]);

  const retry = useCallback(async (messageId: string) => {
    if (!sessionRef.current) return;

    const msgs = sessionRef.current.getMessages();
    const index = msgs.findIndex(m => m.id === messageId);
    if (index === -1) return;

    // 找到对应的用户消息
    let userMsgIndex = index;
    if (msgs[index].role === 'assistant') {
      userMsgIndex = index - 1;
    }

    if (userMsgIndex < 0 || msgs[userMsgIndex].role !== 'user') return;

    const userContent = msgs[userMsgIndex].content;

    // 清除该消息及之后的所有消息
    sessionRef.current.clearMessages();
    for (let i = 0; i < userMsgIndex; i++) {
      if (msgs[i].role === 'user') {
        sessionRef.current.addUserMessage(msgs[i].content);
      } else if (msgs[i].role === 'assistant') {
        sessionRef.current.addAssistantMessage(
          typeof msgs[i].content === 'string' ? msgs[i].content : '',
          msgs[i].toolCalls
        );
      }
    }

    // 重新发送
    await sendStream(userContent);
  }, [sendStream]);

  const clear = useCallback(() => {
    if (sessionRef.current) {
      sessionRef.current.clearMessages();
      syncMessages();
    }
    setError(null);
    setStreamingContent('');
    setStreamingReasoning('');
  }, [syncMessages]);

  // 加载历史消息
  const loadMessages = useCallback((data: { id: string; messages: ChatMessage[]; systemPrompt?: string }) => {
    const session = ChatSession.fromJSON(
      {
        id: data.id,
        messages: data.messages,
        systemPrompt: data.systemPrompt || '',
        options: {
          systemPrompt: data.systemPrompt,
          maxHistoryLength: options.maxHistoryLength,
        },
      },
      options.adapter,
      options.plugins || []
    );
    sessionRef.current = session;
    setMessages(session.getMessages());
    setError(null);
    setIsLoading(false);
    setIsStreaming(false);
    setStreamingContent('');
    setStreamingReasoning('');
  }, [options.adapter, options.maxHistoryLength, options.plugins]);

  const setSystemPrompt = useCallback((prompt: string) => {
    if (sessionRef.current) {
      sessionRef.current.setSystemPrompt(prompt);
    }
  }, []);

  const stop = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  }, []);

  return {
    messages,
    isLoading,
    isStreaming,
    streamingContent,
    streamingReasoning,
    error,
    sessionId: sessionRef.current?.getId() || '',
    send,
    sendStream,
    retry,
    clear,
    loadMessages,
    setSystemPrompt,
    stop,
  };
}

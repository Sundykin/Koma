/**
 * 对话页面组件 (IPC 版本)
 * 通过 IPC 与 Electron 主进程通信
 */
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { message, Button, Tooltip, Spin } from 'antd';
import { ClearOutlined, HistoryOutlined, ApiOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { ChatRenderer } from '../../chat';
import { useChat, chatIPC } from '../../chat/ipc';
import type { SessionConfig, ContentPart, ChatMessage } from '../../chat/ipc';
import { loadSettings } from '../../store/globalStore';
import { activationService } from '../../services/activationService';
import { useChatHistoryStore } from '../../store/chatHistoryStore';
import { saveMCPServers } from '../../store/settings/chatSettings';
import type { AppSettings } from '../../types';
import { ChatLayout } from './ChatLayout';
import { ChatComposer } from './ChatComposer';
import type { AttachmentFile } from './ChatComposer';
import {
  generateChatMedia,
  uploadAttachmentImagesToHosting,
  extractChatImageMentionLabels,
  type ChatImageRef,
  type ChatMediaMode,
  type ChatMediaParams,
  type MediaResultMeta,
} from './chatMediaGeneration';
import { classifyChatIntent } from '../../services/chatIntentRouter';
import { HistorySidebar } from './HistorySidebar';
import { MCPSettings } from './MCPSettings';
import type { MCPServerConfig } from '../../chat/ipc';
import { createLogger } from '../../store/logger';
import styles from './ChatPage.module.css';
import {
  buildLLMConfigFromContext,
  listConfiguredModelSelectOptions,
  resolveConfiguredChannelModel,
  serializeMediaSelection,
} from '../../providers/channel/resolver';
import { getDurationSpecForITVSelection, type VideoDurationSpec } from '../../providers/itv/durationSpec';
import {
  buildChatSessionConfig,
  formatChatErrorMessage,
  resolveInitialChatLLMSelection,
} from './chatPageUtils';

const logger = createLogger('ChatPage');

export const ChatPage: React.FC = () => {
  const { t } = useTranslation();
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [llmOptions, setLlmOptions] = useState<ReturnType<typeof listConfiguredModelSelectOptions>>([]);
  const [selectedSelectionKey, setSelectedSelectionKey] = useState<string>('');
  const [showSidebar, setShowSidebar] = useState(true);
  const [showMcpSettings, setShowMcpSettings] = useState(false);
  const [mcpConfigs, setMcpConfigs] = useState<MCPServerConfig[]>([]);
  const [isConfigLoaded, setIsConfigLoaded] = useState(false);
  const [isGeneratingMedia, setIsGeneratingMedia] = useState(false);
  const [chatImageRefs, setChatImageRefs] = useState<ChatImageRef[]>([]);

  // 获取当前选中的 LLM 配置
  const selectedConfig = useMemo(() => {
    if (!settings || !selectedSelectionKey) return null;
    const context = resolveConfiguredChannelModel(settings, 'llm', selectedSelectionKey, 'llm.chat');
    return context ? buildLLMConfigFromContext(context) : null;
  }, [settings, selectedSelectionKey]);

  // 构建 Session 配置
  const sessionConfig = useMemo((): SessionConfig => (
    buildChatSessionConfig(selectedConfig)
  ), [selectedConfig]);

  // 使用 IPC 版本的 useChat
  const {
    messages,
    isLoading,
    isStreaming,
    streamingContent,
    streamingReasoning,
    isReady,
    sessionId,
    sendStream,
    clear,
    stop,
    updateConfig,
    appendAssistantMessage,
    appendUserMessage,
    updateMessage,
    removeMessage,
    restoreMessages,
  } = useChat({
    config: sessionConfig,
    onError: (err) => {
      message.error(formatChatErrorMessage(err));
    },
  });

  // 加载配置
  useEffect(() => {
    const loadConfigs = async () => {
      try {
        const activationInfo = await activationService.getActivationInfo();
        const settings = await loadSettings();
        setSettings(settings);
        const options = listConfiguredModelSelectOptions(settings, 'llm', 'llm.chat');
        setLlmOptions(options);
        setMcpConfigs((settings as any).mcpServers || []);

        const activeSelection = resolveInitialChatLLMSelection(settings, activationInfo);
        const activeSelectionKey = serializeMediaSelection(activeSelection);
        if (activeSelectionKey) {
          setSelectedSelectionKey(activeSelectionKey);
        }

        setIsConfigLoaded(true);
      } catch (err) {
        logger.error('加载配置失败', err);
        setIsConfigLoaded(true);
      }
    };
    loadConfigs();
  }, []);

  // 连接 MCP 服务器
  useEffect(() => {
    if (!isReady || !chatIPC.isElectron()) return;

    const connectMCPServers = async () => {
      for (const config of mcpConfigs) {
        try {
          await chatIPC.mcp.connect(config);
        } catch (err) {
          logger.error(`连接 MCP 服务器 ${config.name} 失败`, err);
        }
      }
    };

    connectMCPServers();
  }, [isReady, mcpConfigs]);

  // 切换 LLM 配置
  const handleConfigChange = useCallback(async (selectionKey: string) => {
    setSelectedSelectionKey(selectionKey);
    const config = settings
      ? (() => {
          const context = resolveConfiguredChannelModel(settings, 'llm', selectionKey, 'llm.chat');
          return context ? buildLLMConfigFromContext(context) : null;
        })()
      : null;
    if (config && isReady) {
      try {
        await updateConfig(buildChatSessionConfig(config));
      } catch (err: unknown) {
        const errorMessage = formatChatErrorMessage(err);
        message.error(t('chat.configUpdateFailed', { error: errorMessage }));
      }
    }
  }, [isReady, settings, updateConfig, t]);

  const [ttiSelectionKey, setTtiSelectionKey] = useState<string | undefined>(undefined);
  const [itvSelectionKey, setItvSelectionKey] = useState<string | undefined>(undefined);

  // 把 settings.mediaDefaults 里的默认 tti / itv 选择灌进本地 state，作为初值
  useEffect(() => {
    if (!settings) return;
    setTtiSelectionKey(prev => prev ?? (settings.mediaDefaults?.tti ? serializeMediaSelection(settings.mediaDefaults.tti) : undefined));
    setItvSelectionKey(prev => prev ?? (settings.mediaDefaults?.itv ? serializeMediaSelection(settings.mediaDefaults.itv) : undefined));
  }, [settings]);

  const chatModelOptions = useMemo(() => (
    llmOptions.map(c => ({ value: c.value, label: `${c.channelLabel} / ${c.modelLabel}` }))
  ), [llmOptions]);

  const ttiModelOptions = useMemo(() => {
    if (!settings) return [] as { value: string; label: string }[];
    return listConfiguredModelSelectOptions(settings, 'tti', 'image.text-to-image').map(c => ({
      value: c.value,
      label: `${c.channelLabel} / ${c.modelLabel}`,
    }));
  }, [settings]);

  const itvModelOptions = useMemo(() => {
    if (!settings) return [] as { value: string; label: string }[];
    return listConfiguredModelSelectOptions(settings, 'itv', 'video.image-to-video').map(c => ({
      value: c.value,
      label: `${c.channelLabel} / ${c.modelLabel}`,
    }));
  }, [settings]);

  // 当前选中 ITV 模型的视频时长 spec（enum 或 range，从渠道能力订阅）
  const itvDurationSpec = useMemo<VideoDurationSpec | undefined>(() => {
    if (!settings || !itvSelectionKey) return undefined;
    const channels = (settings.channelConfigs ?? [])
      .filter(c => c.category === 'itv')
      .map(c => ({ id: c.id, providerType: c.providerType }));
    return getDurationSpecForITVSelection(itvSelectionKey, channels);
  }, [settings, itvSelectionKey]);

  // 当前选中 ITV 模型的 video.* capabilities（决定子模式 popover 列出哪几项）
  const itvCapabilities = useMemo<string[] | undefined>(() => {
    if (!settings || !itvSelectionKey) return undefined;
    const ctx = resolveConfiguredChannelModel(settings, 'itv', itvSelectionKey);
    return ctx?.model.capabilities.filter((c) => c.startsWith('video.'));
  }, [settings, itvSelectionKey]);

  // 选图后立即上传到图床，加进 chatImageRefs 并标记 pending=true（待跟随消息送出）
  const handleUploadImage = useCallback(async (file: File): Promise<void> => {
    try {
      const url = (await uploadAttachmentImagesToHosting([{
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        file,
        type: 'image',
      } as AttachmentFile]))[0];
      if (!url) return;
      // 关键：用函数式 setter 取最新 prev.length，避免并发上传时所有闭包共用旧 length 导致全叫"图片1"
      setChatImageRefs(prev => {
        const number = prev.length + 1;
        const newRef: ChatImageRef = {
          id: `chat-image-${Date.now()}-${number}-${Math.random().toString(36).slice(2, 8)}`,
          label: `图片${number}`,
          source: url,
          mimeType: file.type,
          origin: 'upload',
          pending: true,
        };
        return [...prev, newRef];
      });
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      message.error(`图片上传失败：${errorMessage}`);
      throw err;
    }
  }, []);

  // 用 ref 把 handleSend 暴露给前面定义的 handleMediaRegenerate（避免循环依赖）
  const handleSendRef = useRef<((text: string, mode?: ChatMediaMode, mediaParams?: ChatMediaParams) => Promise<void>) | null>(null);

  // 历史存储（提前到 handleSend 之前，让 handleSend 能在入口处主动建 session）
  const {
    loadMessages: loadHistoryMessages,
    saveMessages,
    createSession: createHistorySession,
    currentSessionId,
    setCurrentSession,
    loadSessions: reloadSessionsList,
  } = useChatHistoryStore();

  // 发送消息
  const handleSend = useCallback(async (
    text: string,
    selectedMode: ChatMediaMode = 'chat',
    mediaParams: ChatMediaParams = {},
  ) => {
    // 触发任何对话前确保有 currentSessionId，新对话则立即建一个，立即写入侧栏
    if (!currentSessionId) {
      const newId = createHistorySession();
      logger.info('handleSend: 创建新会话', { newId });
    }

    // 携带哪些图发送：
    //  - 文本里有 @ 引用 → 严格按 @ 出现顺序送（pending 忽略，用户的 @ 顺序就是 provider 接收顺序）
    //  - 文本无 @ → 送所有 pending（按缩略图区顺序）
    const pendingImageRefs = chatImageRefs.filter(r => r.pending);
    const mentionedLabels = extractChatImageMentionLabels(text);
    const mentionedRefs = mentionedLabels
      .map(label => chatImageRefs.find(r => r.label === label))
      .filter(Boolean) as ChatImageRef[];
    // 去重但保持出现顺序
    const seenIds = new Set<string>();
    const dedupKeepOrder = (arr: ChatImageRef[]) => arr.filter(r => {
      if (seenIds.has(r.id)) return false;
      seenIds.add(r.id);
      return true;
    });
    const refsToSend: ChatImageRef[] = mentionedRefs.length > 0
      ? dedupKeepOrder(mentionedRefs)
      : pendingImageRefs;

    // 意图路由
    const hasImageInput = refsToSend.length > 0;
    const inferredMode: ChatMediaMode = selectedMode !== 'chat'
      ? selectedMode
      : selectedConfig
        ? await classifyChatIntent({ text, hasImageInput, llmConfig: selectedConfig })
        : 'chat';

    // pending → 翻成已发送（仅 pending 那批，@ 引用的早就 pending=false 不影响）
    const consumePending = () => {
      setChatImageRefs(prev => prev.map(r => (r.pending ? { ...r, pending: false } : r)));
    };

    if (inferredMode !== 'chat') {
      // 当前选中的模型 label / selectionKey（用于 metadata）
      const isVideoMode = inferredMode === 'text-to-video'
        || inferredMode === 'image-to-video'
        || inferredMode === 'start-end-to-video'
        || inferredMode === 'reference-to-video';
      const modelLabel = isVideoMode
        ? itvModelOptions.find(o => o.value === itvSelectionKey)?.label
        : ttiModelOptions.find(o => o.value === ttiSelectionKey)?.label;
      const modelSelectionKey = isVideoMode ? itvSelectionKey : ttiSelectionKey;

      // 1. 用户消息进对话流（文字 + 本次精确携带的图）
      const userParts: ContentPart[] = [];
      if (text) userParts.push({ type: 'text', text });
      refsToSend.forEach(ref => {
        userParts.push({ type: 'image', imageUrl: ref.source, mimeType: ref.mimeType });
      });
      if (userParts.length > 0) {
        appendUserMessage(userParts.length === 1 && userParts[0].type === 'text' ? userParts[0].text : userParts);
      }
      consumePending();

      // 2. 占位 assistant 消息：用 metadata.mediaResult 标识，UI 走专用卡片渲染
      const initialMeta: MediaResultMeta = {
        kind: 'media-result',
        mode: inferredMode,
        prompt: text,
        modelLabel,
        modelSelectionKey,
        aspectRatio: mediaParams.aspectRatio,
        resolution: mediaParams.resolution,
        duration: mediaParams.duration,
        count: mediaParams.count,
        generating: true,
        sourceImageRefs: refsToSend.map(r => ({ ...r, pending: false })),
      };
      const placeholder = appendAssistantMessage('');
      updateMessage(placeholder.id, (msg) => ({
        ...msg,
        metadata: { ...(msg.metadata || {}), mediaResult: initialMeta },
      }));

      setIsGeneratingMedia(true);
      try {
        const result = await generateChatMedia({
          text,
          attachments: [],
          mode: inferredMode,
          imageRefs: chatImageRefs,
          ttiSelection: ttiSelectionKey,
          itvSelection: itvSelectionKey,
          existingImageCount: chatImageRefs.length,
          mediaParams,
        });
        if (result.images.length > 0) {
          setChatImageRefs(prev => [...prev, ...result.images]);
        }
        const finalMeta: MediaResultMeta = {
          ...initialMeta,
          generating: false,
          images: result.images,
          video: result.video,
        };
        updateMessage(placeholder.id, (msg) => ({
          ...msg,
          metadata: { ...(msg.metadata || {}), mediaResult: finalMeta },
        }));
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        message.error(`媒体生成失败：${errorMessage}`);
        const errMeta: MediaResultMeta = { ...initialMeta, generating: false, error: errorMessage };
        updateMessage(placeholder.id, (msg) => ({
          ...msg,
          metadata: { ...(msg.metadata || {}), mediaResult: errMeta },
        }));
      } finally {
        setIsGeneratingMedia(false);
      }
      return;
    }

    if (!isReady) {
      message.warning(t('chat.sessionNotReady'));
      return;
    }
    if (!selectedConfig) {
      message.warning(t('chat.configLLMFirst'));
      return;
    }

    try {
      // 构建 chat user content（pending + @ 引用合并去重）
      let content: string | ContentPart[];
      if (refsToSend.length > 0) {
        const parts: ContentPart[] = [];
        if (text) parts.push({ type: 'text', text });
        refsToSend.forEach(ref => {
          parts.push({ type: 'image', imageUrl: ref.source, mimeType: ref.mimeType });
        });
        content = parts;
      } else {
        content = text;
      }
      consumePending();
      await sendStream(content);
    } catch (err: unknown) {
      const errorMessage = formatChatErrorMessage(err);
      message.error(t('chat.sendFailed', { error: errorMessage }));
      logger.error('发送消息失败', err);
    }
  }, [appendAssistantMessage, appendUserMessage, chatImageRefs, isReady, itvSelectionKey, selectedConfig, sendStream, t, ttiSelectionKey, updateMessage, ttiModelOptions, itvModelOptions]);

  // 把 handleSend 暴露到 ref 给前面定义的 handleMediaRegenerate 使用
  useEffect(() => {
    handleSendRef.current = handleSend;
  }, [handleSend]);

  // 加载历史会话
  const handleLoadSession = useCallback(async (historySessionId: string) => {
    try {
      const sessionData = await loadHistoryMessages(historySessionId);
      if (!sessionData) {
        logger.warn('加载历史会话：DB 中未找到，从侧栏移除该 ghost session', { sessionId: historySessionId });
        // 重新从 DB 拉一次 sessions 列表，把内存中残留的"未持久化"幽灵会话清掉
        await reloadSessionsList();
        message.error('该会话已不存在，已从列表清理');
        return;
      }
      logger.info('加载历史会话', {
        sessionId: historySessionId,
        title: sessionData.title,
        messageCount: sessionData.messages.length,
      });
      // 重启后中断处理：已落库为"生成中"的媒体卡片必然是上次未完成的（应用已重启，无法收到结果），
      // 恢复时把 generating:true 全部转成 error，避免界面卡在"正在创作..."。
      const recoveredMessages = sessionData.messages.map((msg) => {
        const meta = (msg.metadata as { mediaResult?: MediaResultMeta } | undefined)?.mediaResult;
        if (meta?.generating) {
          return {
            ...msg,
            metadata: {
              ...(msg.metadata || {}),
              mediaResult: {
                ...meta,
                generating: false,
                error: '任务被中断（应用已重启），请使用"再次生成"重试',
              },
            },
          };
        }
        return msg;
      });
      // 顺序：先标记当前会话，再灌入消息（避免后续 auto-save 因 sessionId 缺失重建）
      setCurrentSession(historySessionId);
      restoreMessages(recoveredMessages);
      // 加载成功不弹 toast，避免打扰
    } catch (err) {
      logger.error('加载历史会话失败', err);
      message.error(t('chat.loadChatFailed'));
    }
  }, [loadHistoryMessages, restoreMessages, setCurrentSession, reloadSessionsList, t]);

  // 新建对话
  const handleNewChat = useCallback(async () => {
    try {
      const newSessionId = createHistorySession();
      setCurrentSession(newSessionId);
      await clear();
      message.success(t('chat.newChatCreated'));
    } catch (err: unknown) {
      const errorMessage = formatChatErrorMessage(err);
      message.error(t('chat.createChatFailed', { error: errorMessage }));
    }
  }, [createHistorySession, setCurrentSession, clear, t]);

  // 诊断：跟踪 messages 状态变化，便于排查"加载后不显示"问题
  useEffect(() => {
    logger.info('messages 状态', { count: messages.length, currentSessionId });
  }, [messages.length, currentSessionId]);

  // 保存当前会话：handleSend 入口已确保 currentSessionId 存在，这里只负责把 messages 落库。
  // 用 messages 引用比较去重（每次 setMessages 都会换引用；如果引用相同说明没实质变化）。
  // 注意：不能用 length+lastId 作签名 —— updateMessage 改 metadata 时这两者都不变，
  // 会导致媒体生成结果（generating→done）的更新被吞掉，重启后还是"正在生成..."状态。
  const lastSavedMessagesRef = useRef<ChatMessage[] | null>(null);
  useEffect(() => {
    if (messages.length === 0) return;
    if (!currentSessionId) return; // 等 handleSend 建好 session 再存
    if (lastSavedMessagesRef.current === messages) return; // 同一引用，跳过
    lastSavedMessagesRef.current = messages;
    void saveMessages(currentSessionId, messages);
  }, [messages, currentSessionId, saveMessages]);

  // MCP 配置保存
  const handleSaveMcpConfigs = useCallback(async (configs: MCPServerConfig[]) => {
    try {
      setMcpConfigs(configs);
      await saveMCPServers(configs);

      // 重新连接 MCP 服务器
      if (chatIPC.isElectron()) {
        // 断开所有现有连接
        const { connections } = await chatIPC.mcp.list();
        for (const conn of connections) {
          await chatIPC.mcp.disconnect(conn.name);
        }
        // 连接新配置
        for (const config of configs) {
          try {
            await chatIPC.mcp.connect(config);
          } catch (err) {
            logger.error(`连接 MCP 服务器 ${config.name} 失败`, err);
          }
        }
      }
    } catch (err: unknown) {
      const errorMessage = formatChatErrorMessage(err);
      message.error(t('chat.mcpSaveFailed', { error: errorMessage }));
      logger.error('保存 MCP 配置失败', err);
    }
  }, [t]);

  // 切换 pending：只是"是否带到下次发送"，仍保留在 @ 引用池里
  const handleToggleImageRefPending = useCallback((id: string) => {
    setChatImageRefs(prev => prev.map(ref => (ref.id === id ? { ...ref, pending: !ref.pending } : ref)));
  }, []);

  // 真删除：从 @ 引用池移除（缩略图也消失，下次也不能 @）
  const handleDeleteImageRef = useCallback((id: string) => {
    setChatImageRefs(prev => prev.filter(ref => ref.id !== id));
  }, []);

  // 重新编辑 / 再次生成 / 删除批次 — 回填或直接触发
  const [composerSeed, setComposerSeed] = useState<{
    seedAt: number;
    text: string;
    mode: ChatMediaMode;
    aspectRatio?: string;
    resolution?: string;
    duration?: number;
    count?: number;
  } | null>(null);

  const handleMediaReedit = useCallback((messageId: string) => {
    const msg = messages.find(m => m.id === messageId);
    const meta = (msg?.metadata as { mediaResult?: MediaResultMeta } | undefined)?.mediaResult;
    if (!meta) return;
    // 恢复模型选择
    if (meta.modelSelectionKey) {
      const isVideoMeta = meta.mode === 'text-to-video'
        || meta.mode === 'image-to-video'
        || meta.mode === 'start-end-to-video'
        || meta.mode === 'reference-to-video';
      if (isVideoMeta) setItvSelectionKey(meta.modelSelectionKey);
      else setTtiSelectionKey(meta.modelSelectionKey);
    }
    // 把源图重新挂回 pending（若已经在 refs 里则不重复）
    if (meta.sourceImageRefs?.length) {
      setChatImageRefs(prev => {
        const existing = new Set(prev.map(r => r.id));
        const restored = meta.sourceImageRefs!
          .filter(r => !existing.has(r.id))
          .map(r => ({ ...r, pending: true }));
        return [...prev, ...restored];
      });
    }
    // 触发 ChatComposer 应用 seed
    setComposerSeed({
      seedAt: Date.now(),
      text: meta.prompt,
      mode: meta.mode,
      aspectRatio: meta.aspectRatio,
      resolution: meta.resolution,
      duration: meta.duration,
      count: meta.count,
    });
  }, [messages]);

  const handleMediaRegenerate = useCallback(async (messageId: string) => {
    const msg = messages.find(m => m.id === messageId);
    const meta = (msg?.metadata as { mediaResult?: MediaResultMeta } | undefined)?.mediaResult;
    if (!meta) return;
    if (meta.sourceImageRefs?.length) {
      setChatImageRefs(prev => {
        const existing = new Set(prev.map(r => r.id));
        const restored = meta.sourceImageRefs!
          .filter(r => !existing.has(r.id))
          .map(r => ({ ...r, pending: true }));
        return [...prev, ...restored];
      });
    }
    // 直接触发一次新生成（不改顶部模型选择）
    setTimeout(() => {
      void handleSendRef.current?.(meta.prompt, meta.mode, {
        aspectRatio: meta.aspectRatio,
        resolution: meta.resolution,
        duration: meta.duration,
        count: meta.count,
      });
    }, 0);
  }, [messages]);

  const handleMediaDelete = useCallback((messageId: string) => {
    removeMessage(messageId);
  }, [removeMessage]);

  // 把生成结果作为参考图加到下次输入（pending=true）
  const handleMediaUseAsReference = useCallback((_messageId: string, images: ChatImageRef[]) => {
    if (!images.length) return;
    setChatImageRefs(prev => {
      const map = new Map(prev.map(r => [r.id, r]));
      images.forEach(img => {
        if (map.has(img.id)) {
          map.set(img.id, { ...map.get(img.id)!, pending: true });
        } else {
          map.set(img.id, { ...img, pending: true });
        }
      });
      return Array.from(map.values());
    });
    message.success(`已添加 ${images.length} 张作为参考图`);
  }, []);

  // 删除已加入对话的图/视频/文件 part
  const handleRemoveContentPart = useCallback((messageId: string, partIndex: number) => {
    updateMessage(messageId, (msg) => {
      if (typeof msg.content === 'string') return msg;
      const nextContent = msg.content.filter((_, idx) => idx !== partIndex);
      return { ...msg, content: nextContent };
    });
  }, [updateMessage]);

  // 加载中显示
  if (!isConfigLoaded) {
    return (
      <div className={styles.container} style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <Spin description={t('chat.loadingConfig')} />
      </div>
    );
  }

  // 工具栏：模型选择已下沉到输入框，这里只保留侧栏切换 / MCP / 清空
  const toolbar = (
    <div className={styles.toolbar}>
      <div className={styles.toolbarLeft}>
        <Tooltip title={showSidebar ? t('chat.hideHistory') : t('chat.showHistory')}>
          <Button
            type="text"
            icon={<HistoryOutlined />}
            onClick={() => setShowSidebar(!showSidebar)}
          />
        </Tooltip>
        {!isReady && <Spin size="small" style={{ marginLeft: 8 }} />}
      </div>
      <div className={styles.toolbarRight}>
        <Tooltip title={t('chat.mcpConfig')}>
          <Button
            type="text"
            icon={<ApiOutlined />}
            onClick={() => setShowMcpSettings(true)}
          />
        </Tooltip>
        <Tooltip title={t('chat.clearChat')}>
          <Button
            type="text"
            icon={<ClearOutlined />}
            onClick={async () => {
              try {
                await clear();
                message.success(t('chat.chatCleared'));
              } catch (err: unknown) {
                const errorMessage = formatChatErrorMessage(err);
                message.error(t('chat.clearFailed', { error: errorMessage }));
              }
            }}
            disabled={messages.length === 0}
          />
        </Tooltip>
      </div>
    </div>
  );

  // 消息列表
  const messageList = (
    <ChatRenderer
      messages={messages}
      streaming={isStreaming}
      streamingContent={streamingContent}
      streamingReasoning={streamingReasoning}
      emptyText={llmOptions.length === 0 ? t('chat.noLLMConfig') : t('chat.startChat')}
      onRemoveContentPart={handleRemoveContentPart}
      onMediaReedit={handleMediaReedit}
      onMediaRegenerate={handleMediaRegenerate}
      onMediaDelete={handleMediaDelete}
      onMediaUseAsReference={handleMediaUseAsReference}
    />
  );

  // 输入组件
  const composer = (
    <ChatComposer
      onUploadImage={handleUploadImage}
      onSend={handleSend}
      onStop={stop}
      isLoading={isLoading || isGeneratingMedia}
      isStreaming={isStreaming || isGeneratingMedia}
      disabled={!isReady || !selectedConfig || isGeneratingMedia}
      imageRefs={chatImageRefs}
      onTogglePending={handleToggleImageRefPending}
      onDeleteImageRef={handleDeleteImageRef}
      chatModelOptions={chatModelOptions}
      chatModelValue={selectedSelectionKey || undefined}
      onChatModelChange={handleConfigChange}
      ttiModelOptions={ttiModelOptions}
      ttiModelValue={ttiSelectionKey}
      onTtiModelChange={setTtiSelectionKey}
      itvModelOptions={itvModelOptions}
      itvModelValue={itvSelectionKey}
      onItvModelChange={setItvSelectionKey}
      itvDurationSpec={itvDurationSpec}
      itvCapabilities={itvCapabilities}
      seed={composerSeed}
    />
  );

  // 侧边栏
  const sidebar = showSidebar ? (
    <HistorySidebar
      currentSessionId={currentSessionId}
      onSelectSession={handleLoadSession}
      onNewChat={handleNewChat}
    />
  ) : undefined;

  return (
    <div className={styles.container}>
      <ChatLayout
        hasMessages={messages.length > 0}
        sidebar={sidebar}
        toolbar={toolbar}
        settingsPanel={null}
        messageList={messageList}
        composer={composer}
      />

      {/* MCP 配置弹窗 */}
      <MCPSettings
        visible={showMcpSettings}
        onClose={() => setShowMcpSettings(false)}
        configs={mcpConfigs}
        onSave={handleSaveMcpConfigs}
      />
    </div>
  );
};

export default ChatPage;

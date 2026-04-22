/**
 * 对话页面组件 (IPC 版本)
 * 通过 IPC 与 Electron 主进程通信
 */
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Select, message, Button, Tooltip, Spin } from 'antd';
import { ClearOutlined, SettingOutlined, HistoryOutlined, ApiOutlined, RobotOutlined, TeamOutlined } from '@ant-design/icons';
import { Input } from 'antd';
import { useTranslation } from 'react-i18next';
import { ChatRenderer } from '../../chat';
import { useChat, chatIPC } from '../../chat/ipc';
import type { SessionConfig, ContentPart } from '../../chat/ipc';
import { loadSettings } from '../../store/globalStore';
import { useChatHistoryStore } from '../../store/chatHistoryStore';
import { saveMCPServers, saveAgentTemplates, setActiveAgentId as persistActiveAgentId } from '../../store/settings/chatSettings';
import type { AppSettings, LLMModelConfig } from '../../types';
import { ChatLayout } from './ChatLayout';
import { ChatComposer } from './ChatComposer';
import type { AttachmentFile } from './ChatComposer';
import { HistorySidebar } from './HistorySidebar';
import { MCPSettings } from './MCPSettings';
import { AgentTemplates, PRESET_TEMPLATES } from './AgentTemplates';
import type { AgentTemplate } from './AgentTemplates';
import type { MCPServerConfig } from '../../chat/ipc';
import { createLogger } from '../../store/logger';
import styles from './ChatPage.module.css';
import {
  buildLLMConfigFromContext,
  getDefaultMediaSelection,
  listConfiguredModelSelectOptions,
  resolveConfiguredChannelModel,
} from '../../providers/channel/resolver';

const logger = createLogger('ChatPage');

const { TextArea } = Input;

export const ChatPage: React.FC = () => {
  const { t } = useTranslation();
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [llmOptions, setLlmOptions] = useState<ReturnType<typeof listConfiguredModelSelectOptions>>([]);
  const [selectedSelectionKey, setSelectedSelectionKey] = useState<string>('');
  const [systemPrompt, setSystemPrompt] = useState(t('chat.defaultSystemPrompt'));
  const [showSettings, setShowSettings] = useState(false);
  const [showSidebar, setShowSidebar] = useState(true);
  const [showMcpSettings, setShowMcpSettings] = useState(false);
  const [showAgentTemplates, setShowAgentTemplates] = useState(false);
  const [mcpConfigs, setMcpConfigs] = useState<MCPServerConfig[]>([]);
  const [agentTemplates, setAgentTemplates] = useState<AgentTemplate[]>([]);
  const [activeAgentId, setActiveAgentId] = useState<string | null>(null);
  const [isConfigLoaded, setIsConfigLoaded] = useState(false);

  // 获取当前选中的 LLM 配置
  const selectedConfig = useMemo(() => {
    if (!settings) return null;
    const context = resolveConfiguredChannelModel(settings, 'llm', selectedSelectionKey, 'llm.chat');
    return context ? buildLLMConfigFromContext(context) : null;
  }, [settings, selectedSelectionKey]);

  // 构建 Session 配置
  const sessionConfig = useMemo((): SessionConfig => {
    if (!selectedConfig) {
      return { systemPrompt };
    }

    const config = {
      systemPrompt,
      llmProfileId: selectedConfig.profileId,
      modelProvider: selectedConfig.provider,
      modelName: selectedConfig.modelName,
    };
    return config;
  }, [selectedConfig, systemPrompt]);

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
  } = useChat({
    config: sessionConfig,
    onError: (err) => {
      message.error(err.message);
    },
  });

  // 加载配置
  useEffect(() => {
    const loadConfigs = async () => {
      try {
        const settings = await loadSettings();
        setSettings(settings);
        const options = listConfiguredModelSelectOptions(settings, 'llm', 'llm.chat');
        setLlmOptions(options);
        setMcpConfigs((settings as any).mcpServers || []);
        setAgentTemplates((settings as any).agentTemplates || []);
        setActiveAgentId((settings as any).activeAgentId || null);

        const activeSelection = getDefaultMediaSelection(settings, 'llm', 'llm.chat');
        if (activeSelection) {
          setSelectedSelectionKey(`${activeSelection.channelId}::${activeSelection.modelId}`);
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

  // 所有智能体模板
  const allAgentTemplates = useMemo(() => (
    [...PRESET_TEMPLATES, ...agentTemplates]
  ), [agentTemplates]);

  // 智能体切换时更新系统提示词和工具
  useEffect(() => {
    if (!activeAgentId) return;
    const template = allAgentTemplates.find(t => t.id === activeAgentId);
    if (template) {
      setSystemPrompt(template.systemPrompt);
      // 同时更新 enabledTools 到会话
      if (isReady && template.tools && template.tools.length > 0) {
        updateConfig({ enabledTools: template.tools });
      }
    }
  }, [activeAgentId, allAgentTemplates, isReady, updateConfig]);

  // 系统提示词变化时更新会话配置
  useEffect(() => {
    if (isReady && sessionId) {
      updateConfig({ systemPrompt });
    }
  }, [systemPrompt, isReady, sessionId, updateConfig]);

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
        await updateConfig({
          llmProfileId: config.profileId,
          modelProvider: config.provider,
          modelName: config.modelName,
        });
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        message.error(t('chat.configUpdateFailed', { error: errorMessage }));
      }
    }
  }, [isReady, settings, updateConfig, t]);

  // 发送消息
  const handleSend = useCallback(async (text: string, attachments?: AttachmentFile[]) => {
    if (!isReady) {
      message.warning(t('chat.sessionNotReady'));
      return;
    }

    if (!selectedConfig) {
      message.warning(t('chat.configLLMFirst'));
      return;
    }

    try {
      // 构建消息内容
      let content: string | ContentPart[];
      if (attachments && attachments.length > 0) {
        const parts: ContentPart[] = [];

        if (text) {
          parts.push({ type: 'text', text });
        }

        for (const attachment of attachments) {
          if (attachment.type === 'image') {
            const base64 = await fileToBase64(attachment.file);
            parts.push({
              type: 'image',
              imageUrl: `data:${attachment.file.type};base64,${base64}`,
              mimeType: attachment.file.type,
            });
          } else {
            const base64 = await fileToBase64(attachment.file);
            parts.push({
              type: 'file',
              fileName: attachment.file.name,
              fileData: base64,
              mimeType: attachment.file.type,
            });
          }
        }
        content = parts;
      } else {
        content = text;
      }

      await sendStream(content);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      message.error(t('chat.sendFailed', { error: errorMessage }));
      logger.error('发送消息失败', err);
    }
  }, [isReady, selectedConfig, sendStream, t]);

  // 历史存储
  const {
    loadMessages: loadHistoryMessages,
    saveMessages,
    createSession: createHistorySession,
    currentSessionId,
    setCurrentSession,
  } = useChatHistoryStore();

  // 加载历史会话
  const handleLoadSession = useCallback((historySessionId: string) => {
    const sessionData = loadHistoryMessages(historySessionId);
    if (sessionData) {
      if (sessionData.systemPrompt) {
        setSystemPrompt(sessionData.systemPrompt);
      }
      setCurrentSession(historySessionId);
      message.success(`${t('chat.loadedChat')}: ${sessionData.title}`);
    } else {
      message.error(t('chat.loadChatFailed'));
    }
  }, [loadHistoryMessages, setCurrentSession, t]);

  // 新建对话
  const handleNewChat = useCallback(async () => {
    try {
      const newSessionId = createHistorySession();
      setCurrentSession(newSessionId);
      await clear();
      message.success(t('chat.newChatCreated'));
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      message.error(t('chat.createChatFailed', { error: errorMessage }));
    }
  }, [createHistorySession, setCurrentSession, clear, t]);

  // 保存当前会话（懒创建会话 ID）
  useEffect(() => {
    if (messages.length === 0) return;

    // 如果没有当前会话 ID，自动创建
    const sessionIdToSave = currentSessionId ?? createHistorySession();
    if (!currentSessionId) {
      setCurrentSession(sessionIdToSave);
    }
    saveMessages(sessionIdToSave, messages, systemPrompt);
  }, [messages, currentSessionId, systemPrompt, saveMessages, createHistorySession, setCurrentSession]);

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
      const errorMessage = err instanceof Error ? err.message : String(err);
      message.error(t('chat.mcpSaveFailed', { error: errorMessage }));
      logger.error('保存 MCP 配置失败', err);
    }
  }, [t]);

  // 智能体模板保存
  const handleSaveAgentTemplates = useCallback(async (templates: AgentTemplate[]) => {
    try {
      setAgentTemplates(templates);
      await saveAgentTemplates(templates);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      message.error(t('chat.templateSaveFailed', { error: errorMessage }));
    }
  }, [t]);

  // 智能体选择
  const handleSelectAgentTemplate = useCallback(async (template: AgentTemplate) => {
    try {
      setSystemPrompt(template.systemPrompt);
      setActiveAgentId(template.id);
      await persistActiveAgentId(template.id);

      // 更新会话配置中的 enabledTools
      if (isReady && template.tools) {
        await updateConfig({ enabledTools: template.tools });
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      message.error(t('chat.agentSelectFailed', { error: errorMessage }));
    }
  }, [isReady, updateConfig, t]);

  const configOptions = useMemo(() => {
    return llmOptions.map(config => ({
      value: config.value,
      label: `${config.channelLabel} / ${config.modelLabel}`,
    }));
  }, [llmOptions]);

  // 获取当前激活的智能体信息
  const activeAgent = useMemo(() => {
    if (!activeAgentId) return null;
    return allAgentTemplates.find(t => t.id === activeAgentId) || null;
  }, [activeAgentId, allAgentTemplates]);

  // 加载中显示
  if (!isConfigLoaded) {
    return (
      <div className={styles.container} style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <Spin description={t('chat.loadingConfig')} />
      </div>
    );
  }

  // 工具栏 - 始终渲染，修复设置按钮 bug
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
        {activeAgent && (
          <div
            className={styles.agentBadge}
            onClick={() => setShowAgentTemplates(true)}
          >
            <span className={styles.agentIcon}>{activeAgent.icon || '🤖'}</span>
            <span className={styles.agentName}>{activeAgent.name}</span>
          </div>
        )}
        <Select
          value={selectedSelectionKey || undefined}
          onChange={handleConfigChange}
          options={configOptions}
          placeholder={t('chat.selectModel')}
          style={{ width: 200 }}
          disabled={isLoading}
        />
        {!isReady && <Spin size="small" style={{ marginLeft: 8 }} />}
      </div>
      <div className={styles.toolbarRight}>
        <Tooltip title={t('chat.multiAgent')}>
          <Button
            type="text"
            icon={<TeamOutlined />}
            onClick={async () => {
              if (!isReady) {
                message.warning(t('chat.sessionNotReady'));
                return;
              }
              try {
                await updateConfig({ agentMode: 'orchestrated' });
                message.success(t('chat.multiAgentEnabled'));
              } catch (err: any) {
                message.error(t('chat.configUpdateFailed', { error: err.message }));
              }
            }}
          />
        </Tooltip>
        <Tooltip title={t('chat.agentTemplate')}>
          <Button
            type="text"
            icon={<RobotOutlined />}
            onClick={() => setShowAgentTemplates(true)}
          />
        </Tooltip>
        <Tooltip title={t('chat.mcpConfig')}>
          <Button
            type="text"
            icon={<ApiOutlined />}
            onClick={() => setShowMcpSettings(true)}
          />
        </Tooltip>
        <Tooltip title={t('common.settings')}>
          <Button
            type="text"
            icon={<SettingOutlined />}
            onClick={() => setShowSettings(!showSettings)}
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
                const errorMessage = err instanceof Error ? err.message : String(err);
                message.error(t('chat.clearFailed', { error: errorMessage }));
              }
            }}
            disabled={messages.length === 0}
          />
        </Tooltip>
      </div>
    </div>
  );

  // 设置面板（独立于消息状态）
  const settingsPanel = showSettings ? (
    <div className={styles.settingsPanel}>
      <div className={styles.settingsItem}>
        <label>{t('chat.systemPrompt')}</label>
        <TextArea
          value={systemPrompt}
          onChange={(e) => setSystemPrompt(e.target.value)}
          placeholder={t('chat.systemPromptPlaceholder')}
          autoSize={{ minRows: 2, maxRows: 4 }}
        />
      </div>
    </div>
  ) : null;

  // 消息列表
  const messageList = (
    <>
      <ChatRenderer
        messages={messages}
        streaming={isStreaming}
        streamingContent={streamingContent}
        streamingReasoning={streamingReasoning}
        emptyText={llmOptions.length === 0 ? t('chat.noLLMConfig') : t('chat.startChat')}
      />
    </>
  );

  // 输入组件
  const composer = (
    <ChatComposer
      onSend={handleSend}
      onStop={stop}
      isLoading={isLoading}
      isStreaming={isStreaming}
      disabled={!isReady || !selectedConfig}
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
        settingsPanel={settingsPanel}
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

      {/* 智能体模板弹窗 */}
      <AgentTemplates
        visible={showAgentTemplates}
        onClose={() => setShowAgentTemplates(false)}
        templates={agentTemplates}
        onSave={handleSaveAgentTemplates}
        onSelect={handleSelectAgentTemplate}
      />
    </div>
  );
};

// 文件转 Base64
async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default ChatPage;

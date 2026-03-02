/**
 * 对话页面组件 (IPC 版本)
 * 通过 IPC 与 Electron 主进程通信
 */
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Select, message, Button, Tooltip, Spin } from 'antd';
import { ClearOutlined, SettingOutlined, HistoryOutlined, ApiOutlined, RobotOutlined, TeamOutlined } from '@ant-design/icons';
import { Input } from 'antd';
import { ChatRenderer } from '../../chat';
import { useChat, type SessionConfig, type ContentPart, chatIPC } from '../../chat/ipc';
import { getActiveLLMConfig, loadSettings } from '../../store/globalStore';
import { useChatHistoryStore } from '../../store/chatHistoryStore';
import { saveMCPServers, saveAgentTemplates, setActiveAgentId as persistActiveAgentId } from '../../store/settings/chatSettings';
import type { LLMModelConfig } from '../../types';
import { ChatLayout } from './ChatLayout';
import { ChatComposer, type AttachmentFile } from './ChatComposer';
import { HistorySidebar } from './HistorySidebar';
import { MCPSettings } from './MCPSettings';
import { AgentTemplates, type AgentTemplate, PRESET_TEMPLATES } from './AgentTemplates';
import type { MCPServerConfig } from '../../chat/ipc';
import { toUserMessage } from '../../utils/errorMessages';

const { TextArea } = Input;

export const ChatPage: React.FC = () => {
  const { t } = useTranslation('chat');
  const [llmConfigs, setLlmConfigs] = useState<LLMModelConfig[]>([]);
  const [selectedConfigId, setSelectedConfigId] = useState<string>('');
  const [systemPrompt, setSystemPrompt] = useState(t('page.defaultSystemPrompt'));
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
    return llmConfigs.find(c => c.id === selectedConfigId);
  }, [llmConfigs, selectedConfigId]);

  // 构建 Session 配置
  const sessionConfig = useMemo((): SessionConfig => {
    if (!selectedConfig) {
      console.log('[ChatPage] No selectedConfig, returning minimal sessionConfig');
      return { systemPrompt };
    }

    const config = {
      systemPrompt,
      modelProvider: selectedConfig.provider as 'openai' | 'anthropic' | 'google',
      modelName: selectedConfig.modelName,
      apiKey: selectedConfig.apiKey,
      baseUrl: selectedConfig.baseUrl,
    };
    console.log('[ChatPage] Built sessionConfig:', { ...config, apiKey: config.apiKey ? '***' : undefined });
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
      message.error(toUserMessage(err));
    },
  });

  // 加载配置
  useEffect(() => {
    const loadConfigs = async () => {
      try {
        const settings = await loadSettings();
        const configs = settings?.llmConfigs || [];
        console.log('[ChatPage] Loaded LLM configs:', configs.length, configs.map(c => ({ id: c.id, name: c.name, hasApiKey: !!c.apiKey })));
        setLlmConfigs(configs);
        setMcpConfigs((settings as any).mcpServers || []);
        setAgentTemplates((settings as any).agentTemplates || []);
        setActiveAgentId((settings as any).activeAgentId || null);

        const activeConfig = await getActiveLLMConfig();
        console.log('[ChatPage] Active LLM config:', activeConfig ? { id: activeConfig.id, name: activeConfig.name, hasApiKey: !!activeConfig.apiKey } : null);
        if (activeConfig) {
          setSelectedConfigId(activeConfig.id || '');
        }

        setIsConfigLoaded(true);
      } catch (err) {
        console.error('加载配置失败:', err);
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
          console.error(`连接 MCP 服务器 ${config.name} 失败:`, err);
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
  const handleConfigChange = useCallback(async (configId: string) => {
    setSelectedConfigId(configId);
    const config = llmConfigs.find(c => c.id === configId);
    if (config && isReady) {
      await updateConfig({
        modelProvider: config.provider as 'openai' | 'anthropic' | 'google',
        modelName: config.modelName,
        apiKey: config.apiKey,
        baseUrl: config.baseUrl,
      });
    }
  }, [llmConfigs, isReady, updateConfig]);

  // 发送消息
  const handleSend = useCallback(async (text: string, attachments?: AttachmentFile[]) => {
    if (!isReady) {
      message.warning(t('page.warnSessionNotReady'));
      return;
    }

    if (!selectedConfig) {
      message.warning(t('page.warnNoLLMConfig'));
      return;
    }

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
            data: base64,
            mimeType: attachment.file.type,
          });
        }
      }
      content = parts;
    } else {
      content = text;
    }

    await sendStream(content);
  }, [isReady, selectedConfig, sendStream]);

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
      message.success(t('page.successSessionLoaded', { title: sessionData.title }));
    } else {
      message.error(t('page.errorLoadSession'));
    }
  }, [loadHistoryMessages, setCurrentSession]);

  // 新建对话
  const handleNewChat = useCallback(async () => {
    const newSessionId = createHistorySession();
    setCurrentSession(newSessionId);
    await clear();
    message.success(t('page.successNewChat'));
  }, [createHistorySession, setCurrentSession, clear]);

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
          console.error(`连接 MCP 服务器 ${config.name} 失败:`, err);
        }
      }
    }
  }, []);

  // 智能体模板保存
  const handleSaveAgentTemplates = useCallback(async (templates: AgentTemplate[]) => {
    setAgentTemplates(templates);
    await saveAgentTemplates(templates);
  }, []);

  // 智能体选择
  const handleSelectAgentTemplate = useCallback(async (template: AgentTemplate) => {
    setSystemPrompt(template.systemPrompt);
    setActiveAgentId(template.id);
    await persistActiveAgentId(template.id);

    // 更新会话配置中的 enabledTools
    if (isReady && template.tools) {
      await updateConfig({ enabledTools: template.tools });
    }
  }, [isReady, updateConfig]);

  const configOptions = useMemo(() => {
    return llmConfigs.map(config => ({
      value: config.id,
      label: `${config.name} (${config.provider})`,
    }));
  }, [llmConfigs]);

  // 获取当前激活的智能体信息
  const activeAgent = useMemo(() => {
    if (!activeAgentId) return null;
    return allAgentTemplates.find(t => t.id === activeAgentId) || null;
  }, [activeAgentId, allAgentTemplates]);

  // 加载中显示
  if (!isConfigLoaded) {
    return (
      <div className="flex flex-col h-full bg-[#18181b] justify-center items-center">
        <Spin tip={t('page.loadingConfig')} />
      </div>
    );
  }

  // 工具栏 - 始终渲染，修复设置按钮 bug
  const toolbar = (
    <div className="flex justify-between items-center py-3 px-4 border-b border-[#27272a] bg-[#09090b]">
      <div className="flex items-center gap-3">
        <Tooltip title={showSidebar ? t('page.hideHistory') : t('page.showHistory')}>
          <Button
            type="text"
            aria-label={showSidebar ? t('page.hideHistory') : t('page.showHistory')}
            icon={<HistoryOutlined />}
            onClick={() => setShowSidebar(!showSidebar)}
          />
        </Tooltip>
        {activeAgent && (
          <div
            className="flex items-center gap-2 py-1 px-3 bg-[#27272a] rounded-md border border-[#3f3f46] cursor-pointer transition-all duration-200 h-8 hover:bg-[#3f3f46] hover:border-emerald-500"
            onClick={() => setShowAgentTemplates(true)}
          >
            <span className="text-base">{activeAgent.icon || '🤖'}</span>
            <span className="text-sm font-medium text-[#fafafa]">{activeAgent.name}</span>
          </div>
        )}
        <Select
          value={selectedConfigId || undefined}
          onChange={handleConfigChange}
          options={configOptions}
          placeholder={t('page.selectModel')}
          style={{ width: 200 }}
          disabled={isLoading}
        />
        {!isReady && <Spin size="small" style={{ marginLeft: 8 }} />}
      </div>
      <div className="flex items-center gap-1">
        <Tooltip title={t('page.multiAgentOrchestration')}>
          <Button
            type="text"
            aria-label={t('page.multiAgentOrchestration')}
            icon={<TeamOutlined />}
            onClick={async () => {
              if (!isReady) {
                message.warning(t('page.warnSessionNotReady'));
                return;
              }
              await updateConfig({ agentMode: 'orchestrated' });
              message.success(t('page.successMultiAgentEnabled'));
            }}
          />
        </Tooltip>
        <Tooltip title={t('page.agentTemplates')}>
          <Button
            type="text"
            aria-label={t('page.agentTemplates')}
            icon={<RobotOutlined />}
            onClick={() => setShowAgentTemplates(true)}
          />
        </Tooltip>
        <Tooltip title={t('page.mcpConfig')}>
          <Button
            type="text"
            aria-label={t('page.mcpConfig')}
            icon={<ApiOutlined />}
            onClick={() => setShowMcpSettings(true)}
          />
        </Tooltip>
        <Tooltip title={t('page.settings')}>
          <Button
            type="text"
            aria-label={t('page.settings')}
            icon={<SettingOutlined />}
            onClick={() => setShowSettings(!showSettings)}
          />
        </Tooltip>
        <Tooltip title={t('page.clearConversation')}>
          <Button
            type="text"
            aria-label={t('page.clearConversation')}
            icon={<ClearOutlined />}
            onClick={() => { clear(); message.success(t('page.successCleared')); }}
            disabled={messages.length === 0}
          />
        </Tooltip>
      </div>
    </div>
  );

  // 设置面板（独立于消息状态）
  const settingsPanel = showSettings ? (
    <div className="p-4 border-b border-[#27272a] bg-[#0f0f11]">
      <div className="flex flex-col gap-2 [&_label]:text-[13px] [&_label]:text-[#a1a1aa]">
        <label>{t('page.systemPrompt')}</label>
        <TextArea
          value={systemPrompt}
          onChange={(e) => setSystemPrompt(e.target.value)}
          placeholder={t('page.systemPromptPlaceholder')}
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
        emptyText={llmConfigs.length === 0 ? t('page.emptyNoLLM') : t('page.emptyStartChat')}
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
    <div className="flex flex-col h-full bg-[#18181b]">
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

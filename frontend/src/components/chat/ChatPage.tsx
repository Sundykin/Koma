/**
 * 对话页面组件
 * 使用全局 LLM 配置
 */
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Select, message, Empty, Button, Tooltip } from 'antd';
import { ClearOutlined, SettingOutlined, HistoryOutlined, ApiOutlined, RobotOutlined } from '@ant-design/icons';
import { Input } from 'antd';
import { ChatRenderer, useChat, createChatAdapterFromLLMConfig } from '../../chat';
import type { ChatAdapter, ContentPart } from '../../chat';
import type { MCPServerConfig } from '../../chat/plugins/MCPPlugin';
import { getActiveLLMConfig, loadSettings } from '../../store/globalStore';
import { useChatHistoryStore } from '../../store/chatHistoryStore';
import { saveMCPServers, saveAgentTemplates, setActiveAgentId as persistActiveAgentId } from '../../store/settings/chatSettings';
import type { LLMModelConfig } from '../../types';
import { ChatLayout } from './ChatLayout';
import { ChatComposer, type AttachmentFile } from './ChatComposer';
import { HistorySidebar } from './HistorySidebar';
import { MCPSettings } from './MCPSettings';
import { AgentTemplates, type AgentTemplate, PRESET_TEMPLATES } from './AgentTemplates';
import styles from './ChatPage.module.css';

const { TextArea } = Input;

export const ChatPage: React.FC = () => {
  const [adapter, setAdapter] = useState<ChatAdapter | null>(null);
  const [llmConfigs, setLlmConfigs] = useState<LLMModelConfig[]>([]);
  const [selectedConfigId, setSelectedConfigId] = useState<string>('');
  const [systemPrompt, setSystemPrompt] = useState('你是一个有帮助的 AI 助手。');
  const [showSettings, setShowSettings] = useState(false);
  const [showSidebar, setShowSidebar] = useState(true);
  const [showMcpSettings, setShowMcpSettings] = useState(false);
  const [showAgentTemplates, setShowAgentTemplates] = useState(false);
  const [mcpConfigs, setMcpConfigs] = useState<MCPServerConfig[]>([]);
  const [agentTemplates, setAgentTemplates] = useState<AgentTemplate[]>([]);
  const [activeAgentId, setActiveAgentId] = useState<string | null>(null);

  // 加载 LLM 配置
  useEffect(() => {
    const loadConfigs = async () => {
      try {
        const settings = await loadSettings();
        const configs = settings?.llmConfigs || [];
        setLlmConfigs(configs);
        setMcpConfigs((settings as any).mcpServers || []);
        setAgentTemplates((settings as any).agentTemplates || []);
        setActiveAgentId((settings as any).activeAgentId || null);

        const activeConfig = await getActiveLLMConfig();
        if (activeConfig) {
          setSelectedConfigId(activeConfig.id || '');
          const newAdapter = createChatAdapterFromLLMConfig({
            provider: activeConfig.provider,
            apiKey: activeConfig.apiKey,
            baseUrl: activeConfig.baseUrl,
            modelName: activeConfig.modelName,
          });
          setAdapter(newAdapter);
        }
      } catch (err) {
        console.error('加载 LLM 配置失败:', err);
      }
    };
    loadConfigs();
  }, []);

  // 所有智能体模板
  const allAgentTemplates = useMemo(() => (
    [...PRESET_TEMPLATES, ...agentTemplates]
  ), [agentTemplates]);

  // 智能体切换时更新系统提示词
  useEffect(() => {
    if (!activeAgentId) return;
    const template = allAgentTemplates.find(t => t.id === activeAgentId);
    if (template) setSystemPrompt(template.systemPrompt);
  }, [activeAgentId, allAgentTemplates]);

  // 切换配置时更新适配器
  const handleConfigChange = (configId: string) => {
    setSelectedConfigId(configId);
    const config = llmConfigs.find(c => c.id === configId);
    if (config) {
      const newAdapter = createChatAdapterFromLLMConfig({
        provider: config.provider,
        apiKey: config.apiKey,
        baseUrl: config.baseUrl,
        modelName: config.modelName,
      });
      setAdapter(newAdapter);
    }
  };

  // 使用 useChat hook
  const {
    messages,
    isLoading,
    isStreaming,
    streamingContent,
    streamingReasoning,
    sendStream,
    clear,
    loadMessages: loadChatMessages,
    stop,
    setSystemPrompt: updateSystemPrompt,
  } = useChat({
    adapter: adapter!,
    systemPrompt,
    onError: (err) => {
      message.error(err.message);
    },
  });

  // 更新系统提示词
  useEffect(() => {
    updateSystemPrompt(systemPrompt);
  }, [systemPrompt, updateSystemPrompt]);

  // 发送消息
  const handleSend = useCallback(async (text: string, attachments?: AttachmentFile[]) => {
    if (!adapter) {
      message.warning('请先配置 LLM 模型');
      return;
    }

    // 构建消息内容
    let content: string | ContentPart[];
    if (attachments && attachments.length > 0) {
      const parts: ContentPart[] = [];

      // 添加文本
      if (text) {
        parts.push({ type: 'text', text });
      }

      // 添加附件
      for (const attachment of attachments) {
        if (attachment.type === 'image') {
          const base64 = await fileToBase64(attachment.file);
          parts.push({
            type: 'image',
            imageBase64: base64,
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
  }, [adapter, sendStream]);

  // 历史存储
  const {
    loadMessages: loadHistoryMessages,
    saveMessages,
    createSession,
    currentSessionId,
    setCurrentSession,
  } = useChatHistoryStore();

  // 加载历史会话
  const handleLoadSession = useCallback((sessionId: string) => {
    const sessionData = loadHistoryMessages(sessionId);
    if (sessionData) {
      // 使用 loadChatMessages 回灌消息
      loadChatMessages({
        id: sessionId,
        messages: sessionData.messages,
        systemPrompt: sessionData.systemPrompt,
      });
      if (sessionData.systemPrompt) {
        setSystemPrompt(sessionData.systemPrompt);
      }
      setCurrentSession(sessionId);
      message.success(`已加载对话: ${sessionData.title}`);
    } else {
      message.error('加载对话失败');
    }
  }, [loadHistoryMessages, loadChatMessages, setCurrentSession]);

  // 新建对话
  const handleNewChat = useCallback(() => {
    const newSessionId = createSession();
    loadChatMessages({
      id: newSessionId,
      messages: [],
      systemPrompt,
    });
    setCurrentSession(newSessionId);
    message.success('已创建新对话');
  }, [createSession, loadChatMessages, setCurrentSession, systemPrompt]);

  // 保存当前会话
  useEffect(() => {
    if (messages.length > 0 && currentSessionId) {
      saveMessages(currentSessionId, messages, systemPrompt);
    }
  }, [messages, currentSessionId, systemPrompt, saveMessages]);

  // MCP 配置保存
  const handleSaveMcpConfigs = useCallback(async (configs: MCPServerConfig[]) => {
    setMcpConfigs(configs);
    await saveMCPServers(configs);
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
  }, []);

  const configOptions = useMemo(() => {
    return llmConfigs.map(config => ({
      value: config.id,
      label: `${config.name} (${config.provider})`,
    }));
  }, [llmConfigs]);

  // 获取当前激活的智能体信息（必须在早期 return 之前）
  const activeAgent = useMemo(() => {
    if (!activeAgentId) return null;
    return allAgentTemplates.find(t => t.id === activeAgentId) || null;
  }, [activeAgentId, allAgentTemplates]);

  if (!adapter && llmConfigs.length === 0) {
    return (
      <div className={styles.container}>
        <Empty
          description="未配置 LLM 模型"
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        >
          <Button type="primary" onClick={() => window.location.hash = '#settings'}>
            前往设置
          </Button>
        </Empty>
      </div>
    );
  }

  // 工具栏
  const toolbar = (
    <div className={styles.toolbar}>
      <div className={styles.toolbarLeft}>
        <Tooltip title={showSidebar ? '隐藏历史' : '显示历史'}>
          <Button
            type="text"
            icon={<HistoryOutlined />}
            onClick={() => setShowSidebar(!showSidebar)}
          />
        </Tooltip>
        {/* 当前激活智能体徽章 */}
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
          value={selectedConfigId}
          onChange={handleConfigChange}
          options={configOptions}
          placeholder="选择模型"
          style={{ width: 200 }}
          disabled={isLoading}
        />
      </div>
      <div className={styles.toolbarRight}>
        <Tooltip title="智能体模板">
          <Button
            type="text"
            icon={<RobotOutlined />}
            onClick={() => setShowAgentTemplates(true)}
          />
        </Tooltip>
        <Tooltip title="MCP 配置">
          <Button
            type="text"
            icon={<ApiOutlined />}
            onClick={() => setShowMcpSettings(true)}
          />
        </Tooltip>
        <Tooltip title="设置">
          <Button
            type="text"
            icon={<SettingOutlined />}
            onClick={() => setShowSettings(!showSettings)}
          />
        </Tooltip>
        <Tooltip title="清空对话">
          <Button
            type="text"
            icon={<ClearOutlined />}
            onClick={() => { clear(); message.success('对话已清空'); }}
            disabled={messages.length === 0}
          />
        </Tooltip>
      </div>
    </div>
  );

  // 消息列表
  const messageList = (
    <>
      {showSettings && (
        <div className={styles.settingsPanel}>
          <div className={styles.settingsItem}>
            <label>系统提示词</label>
            <TextArea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              placeholder="设置 AI 的角色和行为..."
              autoSize={{ minRows: 2, maxRows: 4 }}
            />
          </div>
        </div>
      )}
      <ChatRenderer
        messages={messages}
        streaming={isStreaming}
        streamingContent={streamingContent}
        streamingReasoning={streamingReasoning}
        emptyText="开始与 AI 对话吧"
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
      disabled={!adapter}
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
      // 移除 data:xxx;base64, 前缀
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default ChatPage;

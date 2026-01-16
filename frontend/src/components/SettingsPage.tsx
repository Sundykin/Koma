import React, { useState, useEffect } from 'react';
import {
  Tabs,
  Form,
  Input,
  Select,
  Button,
  Space,
  message,
  Divider,
  Statistic,
  Row,
  Col,
  Modal,
  Progress,
  Tooltip,
  Card,
  List,
  Popconfirm,
  Empty,
} from 'antd';
import {
  SaveOutlined,
  KeyOutlined,
  ApiOutlined,
  SoundOutlined,
  VideoCameraOutlined,
  PictureOutlined,
  FolderOutlined,
  DeleteOutlined,
  ExperimentOutlined,
  CheckCircleOutlined,
  LoadingOutlined,
  ImportOutlined,
  ExportOutlined,
  PlusOutlined,
  EditOutlined,
  FileTextOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import type { AppSettings, TTSProviderType, ITVProviderType, CustomLLMChannel } from '../types';
import { loadSettings, saveSettings } from '../store/globalStore';
import {
  getStorageConfig,
  validateStoragePath,
  updateStoragePath,
} from '../store/storageConfig';
import { clearCache as clearProjectCache } from '../store/projectStore';
import { electronService } from '../services/electronService';
import { createLLMProvider as getLLMProvider } from '../providers';
import {
  loadPromptTemplates,
  saveCustomTemplate,
  resetTemplate,
  getDefaultTemplate,
  type PromptTemplate,
  type PromptTemplateType,
} from '../store/promptTemplates';

interface SettingsPageProps {
  settings: AppSettings;
  onSave: (newSettings: AppSettings) => void;
}

export const SettingsPage: React.FC<SettingsPageProps> = ({
  settings,
  onSave,
}) => {
  const [form] = Form.useForm();
  const [channelForm] = Form.useForm();
  const [activeTab, setActiveTab] = useState('llm');
  const [saving, setSaving] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [storagePath, setStoragePath] = useState('');
  const [storageSize, setStorageSize] = useState('计算中...');
  const [clearingCache, setClearingCache] = useState(false);

  // 自定义渠道状态
  const [customChannels, setCustomChannels] = useState<CustomLLMChannel[]>(
    settings.customChannels || []
  );
  const [channelModalVisible, setChannelModalVisible] = useState(false);
  const [editingChannel, setEditingChannel] = useState<CustomLLMChannel | null>(null);

  // Prompt 模板状态
  const [promptTemplates, setPromptTemplates] = useState<Record<PromptTemplateType, PromptTemplate>>({} as any);
  const [editingTemplate, setEditingTemplate] = useState<PromptTemplate | null>(null);
  const [templateModalVisible, setTemplateModalVisible] = useState(false);
  const [templateContent, setTemplateContent] = useState('');

  useEffect(() => {
    form.setFieldsValue(flattenSettings(settings));
  }, [settings, form]);

  // 初始化存储路径
  useEffect(() => {
    const config = getStorageConfig();
    if (config) {
      setStoragePath(config.rootPath || '~/.koma');
    }
  }, []);

  // 同步自定义渠道
  useEffect(() => {
    setCustomChannels(settings.customChannels || []);
  }, [settings.customChannels]);

  // 加载 Prompt 模板
  useEffect(() => {
    loadPromptTemplates().then(setPromptTemplates);
  }, []);

  // ========== Prompt 模板管理 ==========

  const handleEditTemplate = (template: PromptTemplate) => {
    setEditingTemplate(template);
    setTemplateContent(template.template);
    setTemplateModalVisible(true);
  };

  const handleSaveTemplate = async () => {
    if (!editingTemplate) return;
    try {
      const updatedTemplate = { ...editingTemplate, template: templateContent };
      await saveCustomTemplate(updatedTemplate);
      const newTemplates = await loadPromptTemplates();
      setPromptTemplates(newTemplates);
      setTemplateModalVisible(false);
      message.success('模板已保存');
    } catch (err: any) {
      message.error(`保存失败: ${err.message}`);
    }
  };

  const handleResetTemplate = async (type: PromptTemplateType) => {
    try {
      await resetTemplate(type);
      const newTemplates = await loadPromptTemplates();
      setPromptTemplates(newTemplates);
      message.success('模板已重置为默认');
    } catch (err: any) {
      message.error(`重置失败: ${err.message}`);
    }
  };

  // ========== 自定义渠道管理 ==========

  const openChannelModal = (channel?: CustomLLMChannel) => {
    if (channel) {
      setEditingChannel(channel);
      channelForm.setFieldsValue(channel);
    } else {
      setEditingChannel(null);
      channelForm.resetFields();
    }
    setChannelModalVisible(true);
  };

  const handleSaveChannel = async () => {
    try {
      const values = await channelForm.validateFields();
      let updatedChannels: CustomLLMChannel[];

      if (editingChannel) {
        // 编辑现有渠道
        updatedChannels = customChannels.map(c =>
          c.id === editingChannel.id ? { ...c, ...values } : c
        );
      } else {
        // 新建渠道
        const newChannel: CustomLLMChannel = {
          ...values,
          id: `channel_${Date.now()}`,
          createdAt: Date.now(),
        };
        updatedChannels = [...customChannels, newChannel];
      }

      setCustomChannels(updatedChannels);
      setChannelModalVisible(false);
      message.success(editingChannel ? '渠道已更新' : '渠道已添加');
    } catch (err) {
      // 表单验证失败
    }
  };

  const handleDeleteChannel = (channelId: string) => {
    const updatedChannels = customChannels.filter(c => c.id !== channelId);
    setCustomChannels(updatedChannels);
    message.success('渠道已删除');
  };

  const handleTestChannel = async (channel: CustomLLMChannel) => {
    try {
      const response = await fetch(`${channel.baseUrl}/models`, {
        headers: {
          Authorization: `Bearer ${channel.apiKey}`,
        },
      });
      if (response.ok) {
        message.success(`渠道 "${channel.name}" 连接成功`);
      } else {
        message.error(`渠道 "${channel.name}" 连接失败: ${response.status}`);
      }
    } catch (err: any) {
      message.error(`渠道 "${channel.name}" 连接失败: ${err.message}`);
    }
  };

  // 测试 LLM 连接
  const handleTestConnection = async () => {
    setTestingConnection(true);
    try {
      const values = form.getFieldsValue();
      const llmProvider = values['llm.provider'];

      // 解析 provider，支持 custom:channelId 格式
      let provider = llmProvider;
      let channelId: string | undefined;
      if (llmProvider?.startsWith('custom:')) {
        provider = 'custom';
        channelId = llmProvider.split(':')[1];
      }

      const llmProviderInstance = getLLMProvider(
        {
          provider,
          apiKey: values['llm.apiKey'],
          baseUrl: values['llm.baseUrl'],
          modelName: values['llm.modelName'],
          channelId,
        },
        customChannels
      );

      if (llmProviderInstance?.testConnection) {
        const result = await llmProviderInstance.testConnection();
        if (result) {
          message.success('连接成功！');
        } else {
          message.error('连接失败，请检查配置');
        }
      } else {
        message.info('当前 Provider 不支持连接测试');
      }
    } catch (err: any) {
      message.error(`测试失败: ${err.message}`);
    } finally {
      setTestingConnection(false);
    }
  };

  // 修改存储位置
  const handleChangeStoragePath = async () => {
    if (!electronService.isElectron()) {
      message.warning('仅支持桌面版');
      return;
    }

    const result = await electronService.dialog.openDirectory();
    if (result.filePaths && result.filePaths.length > 0) {
      const newPath = result.filePaths[0];

      Modal.confirm({
        title: '修改存储位置',
        content: (
          <div>
            <p>新位置: {newPath}</p>
            <p>是否同时迁移现有数据？</p>
          </div>
        ),
        okText: '迁移并修改',
        cancelText: '仅修改',
        onOk: async () => {
          try {
            await updateStoragePath(newPath, true);
            setStoragePath(newPath);
            message.success('存储位置已修改并迁移数据');
          } catch (err: any) {
            message.error(`迁移失败: ${err.message}`);
          }
        },
        onCancel: async () => {
          try {
            await updateStoragePath(newPath, false);
            setStoragePath(newPath);
            message.success('存储位置已修改');
          } catch (err: any) {
            message.error(`修改失败: ${err.message}`);
          }
        },
      });
    }
  };

  // 清理缓存
  const handleClearCache = async () => {
    Modal.confirm({
      title: '确认清理缓存',
      content: '这将清理所有项目的缓存文件（缩略图、波形、预览帧），不会影响素材和项目数据。',
      okText: '清理',
      okType: 'danger',
      onOk: async () => {
        setClearingCache(true);
        try {
          // 清理所有项目缓存逻辑（需要实现）
          message.success('缓存已清理');
        } catch (err: any) {
          message.error(`清理失败: ${err.message}`);
        } finally {
          setClearingCache(false);
        }
      },
    });
  };

  // 导出配置
  const handleExportConfig = async () => {
    try {
      const config = JSON.stringify(settings, null, 2);
      if (electronService.isElectron()) {
        const result = await electronService.dialog.saveFile({
          title: '导出配置',
          defaultPath: 'koma-settings.json',
          filters: [{ name: 'JSON', extensions: ['json'] }],
        });
        if (result.filePath) {
          await electronService.fs.writeFile(result.filePath, config);
          message.success('配置已导出');
        }
      } else {
        // 浏览器环境：下载文件
        const blob = new Blob([config], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'koma-settings.json';
        a.click();
        URL.revokeObjectURL(url);
        message.success('配置已导出');
      }
    } catch (err: any) {
      message.error(`导出失败: ${err.message}`);
    }
  };

  // 导入配置
  const handleImportConfig = async () => {
    try {
      if (electronService.isElectron()) {
        const result = await electronService.dialog.openFile({
          title: '导入配置',
          filters: [{ name: 'JSON', extensions: ['json'] }],
        });
        if (result.filePaths && result.filePaths.length > 0) {
          const content = await electronService.fs.readFile(result.filePaths[0]);
          const imported = JSON.parse(content) as AppSettings;
          form.setFieldsValue(flattenSettings(imported));
          message.success('配置已导入，点击保存生效');
        }
      } else {
        // 浏览器环境：文件选择
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = async (e: any) => {
          const file = e.target.files[0];
          if (file) {
            const content = await file.text();
            const imported = JSON.parse(content) as AppSettings;
            form.setFieldsValue(flattenSettings(imported));
            message.success('配置已导入，点击保存生效');
          }
        };
        input.click();
      }
    } catch (err: any) {
      message.error(`导入失败: ${err.message}`);
    }
  };

  // 将嵌套设置展平为表单字段
  const flattenSettings = (s: AppSettings) => {
    // 处理自定义渠道的 provider 格式
    let llmProvider = s.llm.provider;
    if (s.llm.provider === 'custom' && s.llm.channelId) {
      llmProvider = `custom:${s.llm.channelId}`;
    }

    return {
      'llm.provider': llmProvider,
      'llm.apiKey': s.llm.apiKey,
      'llm.baseUrl': s.llm.baseUrl || '',
      'llm.modelName': s.llm.modelName,
      'tti.provider': s.tti.provider,
      'tti.apiKey': s.tti.apiKey,
      'tti.baseUrl': s.tti.baseUrl || '',
      'tti.modelName': s.tti.modelName,
      'itv.provider': s.itv.provider,
      'itv.apiKey': s.itv.apiKey || '',
      'itv.baseUrl': s.itv.baseUrl || '',
      'itv.defaultDuration': s.itv.defaultDuration || 4,
      'tts.provider': s.tts.provider,
      'tts.apiKey': s.tts.apiKey || '',
      'tts.defaultVoice': s.tts.defaultVoice || '',
    };
  };

  // 将表单值还原为嵌套结构
  const unflattenSettings = (values: any): AppSettings => {
    // 解析 provider，支持 custom:channelId 格式
    const llmProvider = values['llm.provider'];
    let provider = llmProvider;
    let channelId: string | undefined;
    if (llmProvider?.startsWith('custom:')) {
      provider = 'custom';
      channelId = llmProvider.split(':')[1];
    }

    return {
      llm: {
        provider,
        apiKey: values['llm.apiKey'],
        baseUrl: values['llm.baseUrl'] || undefined,
        modelName: values['llm.modelName'],
        channelId,
      },
      tti: {
        provider: values['tti.provider'],
        apiKey: values['tti.apiKey'],
        baseUrl: values['tti.baseUrl'] || undefined,
        modelName: values['tti.modelName'],
      },
      itv: {
        provider: values['itv.provider'],
        apiKey: values['itv.apiKey'] || undefined,
        baseUrl: values['itv.baseUrl'] || undefined,
        defaultDuration: values['itv.defaultDuration'],
      },
      tts: {
        provider: values['tts.provider'],
        apiKey: values['tts.apiKey'] || undefined,
        defaultVoice: values['tts.defaultVoice'] || undefined,
      },
    };
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const values = await form.validateFields();
      const newSettings = unflattenSettings(values);
      // 包含自定义渠道
      newSettings.customChannels = customChannels;
      await saveSettings(newSettings);
      onSave(newSettings);
      message.success('设置已保存');
    } catch (err) {
      message.error('保存失败');
    } finally {
      setSaving(false);
    }
  };

  const tabItems = [
    {
      key: 'llm',
      label: (
        <span>
          <ExperimentOutlined /> LLM 大模型
        </span>
      ),
      children: (
        <div style={{ padding: 16 }}>
          <Form.Item
            name="llm.provider"
            label="模型厂商"
            rules={[{ required: true }]}
          >
            <Select
              options={[
                { value: 'gemini', label: 'Google Gemini' },
                { value: 'openai', label: 'OpenAI (GPT)' },
                ...customChannels.map(ch => ({
                  value: `custom:${ch.id}`,
                  label: `🔗 ${ch.name}`,
                })),
              ]}
            />
          </Form.Item>
          <Form.Item
            name="llm.modelName"
            label="模型名称"
            rules={[{ required: true }]}
          >
            <Input placeholder="gemini-2.0-flash / gpt-4o" />
          </Form.Item>
          <Form.Item
            name="llm.apiKey"
            label="API Key"
            rules={[{ required: true, message: '请输入 API Key' }]}
          >
            <Input.Password
              prefix={<KeyOutlined />}
              placeholder="sk-... / AIza..."
            />
          </Form.Item>
          <Form.Item name="llm.baseUrl" label="代理地址 (可选)">
            <Input
              prefix={<ApiOutlined />}
              placeholder="https://api.openai.com/v1"
            />
          </Form.Item>
          <Button
            type="default"
            icon={testingConnection ? <LoadingOutlined /> : <CheckCircleOutlined />}
            onClick={handleTestConnection}
            loading={testingConnection}
          >
            测试连接
          </Button>

          {/* 自定义渠道管理 */}
          <Divider orientation="left">自定义 OpenAI 兼容渠道</Divider>
          {customChannels.length === 0 ? (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="暂无自定义渠道"
            >
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => openChannelModal()}
              >
                添加渠道
              </Button>
            </Empty>
          ) : (
            <>
              <List
                size="small"
                dataSource={customChannels}
                renderItem={(channel) => (
                  <List.Item
                    actions={[
                      <Tooltip title="测试连接" key="test">
                        <Button
                          type="text"
                          size="small"
                          icon={<CheckCircleOutlined />}
                          onClick={() => handleTestChannel(channel)}
                        />
                      </Tooltip>,
                      <Tooltip title="编辑" key="edit">
                        <Button
                          type="text"
                          size="small"
                          icon={<EditOutlined />}
                          onClick={() => openChannelModal(channel)}
                        />
                      </Tooltip>,
                      <Popconfirm
                        key="delete"
                        title="确定删除此渠道？"
                        onConfirm={() => handleDeleteChannel(channel.id)}
                        okText="删除"
                        cancelText="取消"
                      >
                        <Tooltip title="删除">
                          <Button
                            type="text"
                            size="small"
                            danger
                            icon={<DeleteOutlined />}
                          />
                        </Tooltip>
                      </Popconfirm>,
                    ]}
                  >
                    <List.Item.Meta
                      title={channel.name}
                      description={
                        <span style={{ fontSize: 12, color: '#888' }}>
                          {channel.baseUrl}
                        </span>
                      }
                    />
                  </List.Item>
                )}
              />
              <Button
                type="dashed"
                icon={<PlusOutlined />}
                onClick={() => openChannelModal()}
                style={{ marginTop: 8, width: '100%' }}
              >
                添加渠道
              </Button>
            </>
          )}
        </div>
      ),
    },
    {
      key: 'tti',
      label: (
        <span>
          <PictureOutlined /> 文生图 (TTI)
        </span>
      ),
      children: (
        <div style={{ padding: 16 }}>
          <Form.Item name="tti.provider" label="Provider">
            <Select
              options={[
                { value: 'comfyui', label: 'ComfyUI (本地)' },
                { value: 'midjourney', label: 'Midjourney' },
                { value: 'openai', label: 'DALL-E 3' },
              ]}
            />
          </Form.Item>
          <Form.Item name="tti.baseUrl" label="ComfyUI 地址">
            <Input placeholder="http://127.0.0.1:8188" />
          </Form.Item>
          <Form.Item name="tti.apiKey" label="API Key (如需)">
            <Input.Password prefix={<KeyOutlined />} />
          </Form.Item>
        </div>
      ),
    },
    {
      key: 'itv',
      label: (
        <span>
          <VideoCameraOutlined /> 图生视频 (ITV)
        </span>
      ),
      children: (
        <div style={{ padding: 16 }}>
          <Form.Item name="itv.provider" label="Provider">
            <Select
              options={[
                { value: 'runway', label: 'Runway Gen-3' },
                { value: 'kling', label: '可灵 (Kling)' },
                { value: 'pika', label: 'Pika' },
                { value: 'comfyui-animatediff', label: 'ComfyUI + AnimateDiff' },
              ]}
            />
          </Form.Item>
          <Form.Item name="itv.apiKey" label="API Key">
            <Input.Password prefix={<KeyOutlined />} />
          </Form.Item>
          <Form.Item name="itv.defaultDuration" label="默认视频时长 (秒)">
            <Select
              options={[
                { value: 4, label: '4 秒' },
                { value: 6, label: '6 秒' },
                { value: 10, label: '10 秒' },
              ]}
            />
          </Form.Item>
        </div>
      ),
    },
    {
      key: 'tts',
      label: (
        <span>
          <SoundOutlined /> 语音合成 (TTS)
        </span>
      ),
      children: (
        <div style={{ padding: 16 }}>
          <Form.Item name="tts.provider" label="Provider">
            <Select
              options={[
                { value: 'edge-tts', label: 'Edge TTS (免费)' },
                { value: 'openai-tts', label: 'OpenAI TTS' },
                { value: 'fish-audio', label: 'Fish Audio' },
                { value: 'gpt-sovits', label: 'GPT-SoVITS (本地)' },
              ]}
            />
          </Form.Item>
          <Form.Item name="tts.apiKey" label="API Key (如需)">
            <Input.Password prefix={<KeyOutlined />} />
          </Form.Item>
          <Form.Item name="tts.defaultVoice" label="默认音色">
            <Select
              placeholder="选择默认音色"
              options={[
                { value: 'zh-CN-XiaoxiaoNeural', label: '晓晓 (女声)' },
                { value: 'zh-CN-YunxiNeural', label: '云希 (男声)' },
                { value: 'zh-CN-YunjianNeural', label: '云健 (男声)' },
              ]}
            />
          </Form.Item>
        </div>
      ),
    },
    {
      key: 'storage',
      label: (
        <span>
          <FolderOutlined /> 存储设置
        </span>
      ),
      children: (
        <div style={{ padding: 16 }}>
          <Row gutter={16}>
            <Col span={12}>
              <Statistic
                title="存储位置"
                value={storagePath || '~/.koma'}
                valueStyle={{ fontSize: 14, fontFamily: 'monospace' }}
              />
            </Col>
            <Col span={12}>
              <Statistic title="已用空间" value={storageSize} />
            </Col>
          </Row>
          <Divider />
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            <Space>
              <Button
                icon={<FolderOutlined />}
                onClick={handleChangeStoragePath}
              >
                修改存储位置
              </Button>
              <Button
                icon={<DeleteOutlined />}
                danger
                loading={clearingCache}
                onClick={handleClearCache}
              >
                清理缓存
              </Button>
            </Space>
            <Space>
              <Button icon={<ExportOutlined />} onClick={handleExportConfig}>
                导出配置
              </Button>
              <Button icon={<ImportOutlined />} onClick={handleImportConfig}>
                导入配置
              </Button>
            </Space>
          </Space>
        </div>
      ),
    },
    {
      key: 'prompts',
      label: (
        <span>
          <FileTextOutlined /> Prompt 模板
        </span>
      ),
      children: (
        <div style={{ padding: 16 }}>
          <p style={{ marginBottom: 16, color: '#888' }}>
            自定义 AI 功能使用的 Prompt 模板，支持变量替换。
          </p>
          <List
            dataSource={Object.values(promptTemplates)}
            renderItem={(template) => (
              <List.Item
                actions={[
                  <Button
                    key="edit"
                    type="link"
                    icon={<EditOutlined />}
                    onClick={() => handleEditTemplate(template)}
                  >
                    编辑
                  </Button>,
                  template.isCustom && (
                    <Popconfirm
                      key="reset"
                      title="确定重置为默认模板？"
                      onConfirm={() => handleResetTemplate(template.id)}
                      okText="重置"
                      cancelText="取消"
                    >
                      <Button type="link" icon={<ReloadOutlined />} danger>
                        重置
                      </Button>
                    </Popconfirm>
                  ),
                ].filter(Boolean)}
              >
                <List.Item.Meta
                  title={
                    <span>
                      {template.name}
                      {template.isCustom && (
                        <span style={{ marginLeft: 8, color: '#1890ff', fontSize: 12 }}>
                          (已自定义)
                        </span>
                      )}
                    </span>
                  }
                  description={
                    <span style={{ color: '#888' }}>
                      {template.description}
                      <br />
                      <span style={{ fontSize: 12 }}>
                        变量: {template.variables.map(v => `{{${v}}}`).join(', ')}
                      </span>
                    </span>
                  }
                />
              </List.Item>
            )}
          />
        </div>
      ),
    },
  ];

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: 24 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 24,
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 600 }}>
            全局设置
          </h1>
          <p style={{ margin: '8px 0 0', color: '#888' }}>
            配置 AI 模型、语音合成、视频生成等服务
          </p>
        </div>
        <Button
          type="primary"
          icon={<SaveOutlined />}
          size="large"
          loading={saving}
          onClick={handleSave}
        >
          保存配置
        </Button>
      </div>

      <Form
        form={form}
        layout="vertical"
        initialValues={flattenSettings(settings)}
      >
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          items={tabItems}
          type="card"
        />
      </Form>

      {/* 渠道编辑 Modal */}
      <Modal
        title={editingChannel ? '编辑渠道' : '添加自定义渠道'}
        open={channelModalVisible}
        onOk={handleSaveChannel}
        onCancel={() => setChannelModalVisible(false)}
        okText="保存"
        cancelText="取消"
        destroyOnClose
      >
        <Form form={channelForm} layout="vertical">
          <Form.Item
            name="name"
            label="渠道名称"
            rules={[{ required: true, message: '请输入渠道名称' }]}
          >
            <Input placeholder="如：DeepSeek / 智谱 AI" />
          </Form.Item>
          <Form.Item
            name="baseUrl"
            label="API 基础地址"
            rules={[{ required: true, message: '请输入 API 地址' }]}
          >
            <Input placeholder="https://api.deepseek.com/v1" />
          </Form.Item>
          <Form.Item
            name="apiKey"
            label="API Key"
            rules={[{ required: true, message: '请输入 API Key' }]}
          >
            <Input.Password prefix={<KeyOutlined />} placeholder="sk-..." />
          </Form.Item>
          <Form.Item name="defaultModel" label="默认模型 (可选)">
            <Input placeholder="deepseek-chat" />
          </Form.Item>
        </Form>
      </Modal>

      {/* Prompt 模板编辑 Modal */}
      <Modal
        title={editingTemplate ? `编辑模板: ${editingTemplate.name}` : '编辑模板'}
        open={templateModalVisible}
        onOk={handleSaveTemplate}
        onCancel={() => setTemplateModalVisible(false)}
        okText="保存"
        cancelText="取消"
        width={800}
        destroyOnClose
      >
        {editingTemplate && (
          <div>
            <p style={{ marginBottom: 8, color: '#888' }}>
              {editingTemplate.description}
            </p>
            <p style={{ marginBottom: 16, fontSize: 12, color: '#666' }}>
              可用变量: {editingTemplate.variables.map(v => `{{${v}}}`).join(', ')}
            </p>
            <Input.TextArea
              value={templateContent}
              onChange={(e) => setTemplateContent(e.target.value)}
              rows={20}
              style={{ fontFamily: 'monospace', fontSize: 13 }}
            />
          </div>
        )}
      </Modal>
    </div>
  );
};


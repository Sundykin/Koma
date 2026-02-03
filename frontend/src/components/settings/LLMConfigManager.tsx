import React, { useState, useEffect } from 'react';
import {
  Card,
  Row,
  Col,
  Button,
  Modal,
  Form,
  Input,
  Select,
  AutoComplete,
  Space,
  Tag,
  Tooltip,
  Empty,
  Popconfirm,
  Spin,
  App,
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  CheckCircleOutlined,
  StarOutlined,
  StarFilled,
  ApiOutlined,
  KeyOutlined,
  LoadingOutlined,
} from '@ant-design/icons';
import type { LLMModelConfig, LLMProviderType } from '../../types';
import {
  loadSettings,
  addLLMConfig,
  updateLLMConfig,
  deleteLLMConfig,
  setDefaultLLMConfig,
  LLM_CHANNEL_PRESETS,
} from '../../store/globalStore';
import { testLLMConnection } from '../../providers';

interface LLMConfigManagerProps {
  onConfigChange?: () => void;
}

export const LLMConfigManager: React.FC<LLMConfigManagerProps> = ({ onConfigChange }) => {
  const { message } = App.useApp();
  const [configs, setConfigs] = useState<LLMModelConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingConfig, setEditingConfig] = useState<LLMModelConfig | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [form] = Form.useForm();

  const loadConfigs = async () => {
    setLoading(true);
    try {
      const settings = await loadSettings();
      setConfigs(settings.llmConfigs || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadConfigs();
  }, []);

  const openModal = (config?: LLMModelConfig) => {
    if (config) {
      setEditingConfig(config);
      form.setFieldsValue({
        name: config.name,
        provider: config.provider,
        presetId: getPresetIdFromBaseUrl(config.baseUrl),
        baseUrl: config.baseUrl,
        apiKey: config.apiKey,
        modelName: config.modelName,
      });
    } else {
      setEditingConfig(null);
      form.resetFields();
      form.setFieldsValue({ provider: 'openai-compatible' });
    }
    setModalVisible(true);
  };

  const getPresetIdFromBaseUrl = (baseUrl?: string): string | undefined => {
    if (!baseUrl) return undefined;
    const preset = LLM_CHANNEL_PRESETS.find(p => p.baseUrl === baseUrl);
    return preset?.id;
  };

  const handleProviderChange = (provider: LLMProviderType) => {
    if (provider === 'gemini') {
      form.setFieldsValue({
        presetId: undefined,
        modelName: 'gemini-2.0-flash',
        // 保留 baseUrl 供代理使用
      });
    } else if (provider === 'claude') {
      form.setFieldsValue({
        baseUrl: 'https://api.anthropic.com',
        presetId: undefined,
        modelName: 'claude-sonnet-4-20250514',
      });
    } else {
      // openai-compatible
      form.setFieldsValue({
        presetId: undefined,
        baseUrl: undefined,
        modelName: undefined,
      });
    }
  };

  const handlePresetChange = (presetId: string) => {
    const preset = LLM_CHANNEL_PRESETS.find(p => p.id === presetId);
    if (preset) {
      form.setFieldsValue({
        baseUrl: preset.baseUrl,
        modelName: preset.models[0],
      });
    }
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      const configData = {
        name: values.name,
        provider: values.provider as LLMProviderType,
        baseUrl: values.baseUrl,
        apiKey: values.apiKey,
        modelName: values.modelName,
        isDefault: editingConfig?.isDefault || configs.length === 0,
      };

      if (editingConfig) {
        await updateLLMConfig(editingConfig.id, configData);
        message.success('配置已更新');
      } else {
        await addLLMConfig(configData);
        message.success('配置已添加');
      }

      setModalVisible(false);
      await loadConfigs();
      onConfigChange?.();
    } catch (err: any) {
      if (err.errorFields) return;
      message.error(`保存失败: ${err.message}`);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteLLMConfig(id);
      message.success('配置已删除');
      await loadConfigs();
      onConfigChange?.();
    } catch (err: any) {
      message.error(`删除失败: ${err.message}`);
    }
  };

  const handleSetDefault = async (id: string) => {
    try {
      await setDefaultLLMConfig(id);
      message.success('已设为默认');
      await loadConfigs();
      onConfigChange?.();
    } catch (err: any) {
      message.error(`设置失败: ${err.message}`);
    }
  };

  const handleTestConnection = async (config: LLMModelConfig) => {
    setTestingId(config.id);
    try {
      const result = await testLLMConnection({
        provider: config.provider as any,
        apiKey: config.apiKey,
        baseUrl: config.baseUrl,
        modelName: config.modelName,
      });
      if (result.success) {
        message.success(`"${config.name}" 连接成功`);
      } else {
        message.error(`"${config.name}" ${result.message}`);
      }
    } catch (err: any) {
      message.error(`连接测试失败: ${err.message}`);
    } finally {
      setTestingId(null);
    }
  };

  const getProviderLabel = (provider: LLMProviderType) => {
    switch (provider) {
      case 'gemini': return 'Gemini';
      case 'claude': return 'Claude';
      case 'openai-compatible': return 'OpenAI 兼容';
      default: return provider;
    }
  };

  const getProviderColor = (provider: LLMProviderType) => {
    switch (provider) {
      case 'gemini': return 'blue';
      case 'claude': return 'orange';
      case 'openai-compatible': return 'purple';
      default: return 'default';
    }
  };

  const currentProvider = Form.useWatch('provider', form);
  const currentPresetId = Form.useWatch('presetId', form);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <span style={{ fontSize: 14, color: '#888' }}>
            已配置 <strong>{configs.length}</strong> 个模型
          </span>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => openModal()}>
          添加模型
        </Button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <Spin />
        </div>
      ) : configs.length === 0 ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="还没有配置任何 LLM 模型"
        >
          <Button type="primary" icon={<PlusOutlined />} onClick={() => openModal()}>
            添加第一个模型
          </Button>
        </Empty>
      ) : (
        <Row gutter={[16, 16]}>
          {configs.map((config: LLMModelConfig) => (
            <Col key={config.id} xs={24} sm={12}>
              <Card
                size="small"
                title={
                  <Space>
                    {config.isDefault ? (
                      <StarFilled style={{ color: '#faad14' }} />
                    ) : (
                      <Tooltip title="设为默认">
                        <StarOutlined
                          style={{ cursor: 'pointer', color: '#d9d9d9' }}
                          onClick={() => handleSetDefault(config.id)}
                        />
                      </Tooltip>
                    )}
                    <span>{config.name}</span>
                    <Tag color={getProviderColor(config.provider)}>
                      {getProviderLabel(config.provider)}
                    </Tag>
                  </Space>
                }
                extra={
                  <Space size="small">
                    <Tooltip title="测试连接">
                      <Button
                        type="text"
                        size="small"
                        icon={testingId === config.id ? <LoadingOutlined /> : <CheckCircleOutlined />}
                        onClick={() => handleTestConnection(config)}
                        disabled={testingId === config.id}
                      />
                    </Tooltip>
                    <Tooltip title="编辑">
                      <Button
                        type="text"
                        size="small"
                        icon={<EditOutlined />}
                        onClick={() => openModal(config)}
                      />
                    </Tooltip>
                    <Popconfirm
                      title="确定删除此配置？"
                      onConfirm={() => handleDelete(config.id)}
                      okText="删除"
                      cancelText="取消"
                    >
                      <Tooltip title="删除">
                        <Button type="text" size="small" danger icon={<DeleteOutlined />} />
                      </Tooltip>
                    </Popconfirm>
                  </Space>
                }
              >
                <div style={{ fontSize: 13, color: '#666' }}>
                  <div><strong>模型:</strong> {config.modelName}</div>
                  {config.baseUrl && (
                    <div style={{ marginTop: 4 }}>
                      <strong>地址:</strong>{' '}
                      <span style={{ fontSize: 12, fontFamily: 'monospace' }}>
                        {config.baseUrl.replace(/https?:\/\//, '').slice(0, 30)}...
                      </span>
                    </div>
                  )}
                </div>
              </Card>
            </Col>
          ))}
        </Row>
      )}

      <Modal
        title={editingConfig ? '编辑模型配置' : '添加模型配置'}
        open={modalVisible}
        onOk={handleSave}
        onCancel={() => setModalVisible(false)}
        okText="保存"
        cancelText="取消"
        width={500}
        maskClosable={false}
        destroyOnHidden
        className="dark-modal"
        styles={{
          header: { background: '#18181b', borderBottom: '1px solid #3f3f46' },
          body: { background: '#18181b' },
          footer: { background: '#18181b', borderTop: '1px solid #3f3f46' },
        }}
      >
        <Form form={form} layout="vertical" className="mt-4">
          <Form.Item
            name="name"
            label="配置名称"
            rules={[{ required: true, message: '请输入配置名称' }]}
          >
            <Input placeholder="如: DeepSeek Chat" />
          </Form.Item>

          <Form.Item
            name="provider"
            label="模型类型"
            rules={[{ required: true }]}
          >
            <Select onChange={handleProviderChange}>
              <Select.Option value="openai-compatible">OpenAI 兼容 (推荐)</Select.Option>
              <Select.Option value="gemini">Google Gemini</Select.Option>
              <Select.Option value="claude">Anthropic Claude</Select.Option>
            </Select>
          </Form.Item>

          {currentProvider === 'openai-compatible' && (
            <Form.Item name="presetId" label="快速选择渠道">
              <Select
                placeholder="选择预设渠道自动填充地址"
                allowClear
                onChange={handlePresetChange}
              >
                {LLM_CHANNEL_PRESETS.map(preset => (
                  <Select.Option key={preset.id} value={preset.id}>
                    {preset.name}
                  </Select.Option>
                ))}
              </Select>
            </Form.Item>
          )}

          <Form.Item
            name="baseUrl"
            label={
              <span>
                API 地址
                {currentProvider !== 'openai-compatible' && (
                  <span className="text-zinc-500 ml-2 text-xs">(可选，用于代理)</span>
                )}
              </span>
            }
            rules={[{ required: currentProvider === 'openai-compatible', message: '请输入 API 地址' }]}
            extra={
              currentProvider === 'gemini'
                ? '留空使用官方地址 generativelanguage.googleapis.com'
                : currentProvider === 'claude'
                ? '留空使用官方地址 api.anthropic.com'
                : undefined
            }
          >
            <Input
              prefix={<ApiOutlined />}
              placeholder={
                currentProvider === 'gemini'
                  ? 'https://your-proxy.com/v1beta 或留空'
                  : currentProvider === 'claude'
                  ? 'https://api.anthropic.com 或代理地址'
                  : 'https://api.deepseek.com/v1'
              }
            />
          </Form.Item>

          <Form.Item
            name="modelName"
            label="模型名称"
            rules={[{ required: true, message: '请输入模型名称' }]}
          >
            <AutoComplete
              placeholder="输入或选择模型，如: deepseek-chat, gpt-4o"
              options={
                currentPresetId
                  ? LLM_CHANNEL_PRESETS.find(p => p.id === currentPresetId)?.models.map(model => ({
                      value: model,
                      label: model,
                    })) || []
                  : []
              }
              filterOption={(inputValue, option) =>
                option?.value.toLowerCase().includes(inputValue.toLowerCase()) ?? false
              }
            />
          </Form.Item>

          <Form.Item
            name="apiKey"
            label="API Key"
            rules={[{ required: true, message: '请输入 API Key' }]}
          >
            <Input.Password prefix={<KeyOutlined />} placeholder="sk-..." />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

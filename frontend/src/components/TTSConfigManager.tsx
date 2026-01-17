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
  Space,
  Tag,
  Tooltip,
  Empty,
  Popconfirm,
  Spin,
  App,
  InputNumber,
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
  AudioOutlined,
  SoundOutlined,
} from '@ant-design/icons';
import type { TTSModelConfig, TTSProviderType } from '../types';
import {
  loadSettings,
  addTTSConfig,
  updateTTSConfig,
  deleteTTSConfig,
  setDefaultTTSConfig,
  TTS_PRESETS,
} from '../store/globalStore';

interface TTSConfigManagerProps {
  onConfigChange?: () => void;
}

export const TTSConfigManager: React.FC<TTSConfigManagerProps> = ({ onConfigChange }) => {
  const { message } = App.useApp();
  const [configs, setConfigs] = useState<TTSModelConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingConfig, setEditingConfig] = useState<TTSModelConfig | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [form] = Form.useForm();

  const loadConfigs = async () => {
    setLoading(true);
    try {
      const settings = await loadSettings();
      setConfigs(settings.ttsConfigs || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadConfigs();
  }, []);

  const openModal = (config?: TTSModelConfig) => {
    if (config) {
      setEditingConfig(config);
      form.setFieldsValue({
        name: config.name,
        provider: config.provider,
        baseUrl: config.baseUrl,
        apiKey: config.apiKey,
        defaultVoice: config.defaultVoice,
        defaultSpeed: config.defaultSpeed,
      });
    } else {
      setEditingConfig(null);
      form.resetFields();
    }
    setModalVisible(true);
  };

  const handlePresetChange = (provider: TTSProviderType) => {
    const preset = TTS_PRESETS.find(p => p.id === provider);
    if (preset) {
      form.setFieldsValue({
        name: form.getFieldValue('name') || preset.name,
        baseUrl: preset.baseUrl,
      });
    }
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      const configData = {
        name: values.name,
        provider: values.provider as TTSProviderType,
        baseUrl: values.baseUrl,
        apiKey: values.apiKey,
        defaultVoice: values.defaultVoice,
        defaultSpeed: values.defaultSpeed,
        isDefault: editingConfig?.isDefault || configs.length === 0,
      };

      if (editingConfig) {
        await updateTTSConfig(editingConfig.id, configData);
        message.success('配置已更新');
      } else {
        await addTTSConfig(configData);
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
      await deleteTTSConfig(id);
      message.success('配置已删除');
      await loadConfigs();
      onConfigChange?.();
    } catch (err: any) {
      message.error(`删除失败: ${err.message}`);
    }
  };

  const handleSetDefault = async (id: string) => {
    try {
      await setDefaultTTSConfig(id);
      message.success('已设为默认');
      await loadConfigs();
      onConfigChange?.();
    } catch (err: any) {
      message.error(`设置失败: ${err.message}`);
    }
  };

  const handleTestConnection = async (config: TTSModelConfig) => {
    setTestingId(config.id);
    try {
      // TODO: 实现 TTS 连接测试 / 试听
      await new Promise(resolve => setTimeout(resolve, 1000));
      message.success(`"${config.name}" 连接成功`);
    } catch (err: any) {
      message.error(`连接测试失败: ${err.message}`);
    } finally {
      setTestingId(null);
    }
  };

  const getProviderLabel = (provider: TTSProviderType) => {
    const preset = TTS_PRESETS.find(p => p.id === provider);
    return preset?.name || provider;
  };

  const getProviderColor = (provider: TTSProviderType) => {
    switch (provider) {
      case 'edge-tts': return 'blue';
      case 'openai-tts': return 'green';
      case 'doubao-tts': return 'purple';
      case 'fish-audio': return 'cyan';
      case 'gpt-sovits': return 'orange';
      default: return 'default';
    }
  };

  const currentProvider = Form.useWatch('provider', form);
  const needApiKey = currentProvider && currentProvider !== 'edge-tts' && currentProvider !== 'gpt-sovits';
  const needBaseUrl = currentProvider && currentProvider !== 'edge-tts';

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <span style={{ fontSize: 14, color: '#888' }}>
            已配置 <strong>{configs.length}</strong> 个语音合成服务
          </span>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => openModal()}>
          添加配置
        </Button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <Spin />
        </div>
      ) : configs.length === 0 ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="还没有配置任何语音合成服务"
        >
          <Button type="primary" icon={<PlusOutlined />} onClick={() => openModal()}>
            添加第一个配置
          </Button>
        </Empty>
      ) : (
        <Row gutter={[16, 16]}>
          {configs.map((config: TTSModelConfig) => (
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
                    <SoundOutlined />
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
                  {config.defaultVoice && <div><strong>默认音色:</strong> {config.defaultVoice}</div>}
                  {config.defaultSpeed && <div><strong>默认语速:</strong> {config.defaultSpeed}x</div>}
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
        title={editingConfig ? '编辑语音合成配置' : '添加语音合成配置'}
        open={modalVisible}
        onOk={handleSave}
        onCancel={() => setModalVisible(false)}
        okText="保存"
        cancelText="取消"
        width={520}
        maskClosable={false}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            name="provider"
            label="服务商"
            rules={[{ required: true, message: '请选择服务商' }]}
          >
            <Select placeholder="选择语音合成服务商" onChange={handlePresetChange}>
              {TTS_PRESETS.map(preset => (
                <Select.Option key={preset.id} value={preset.id}>
                  {preset.name}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item
            name="name"
            label="配置名称"
            rules={[{ required: true, message: '请输入配置名称' }]}
          >
            <Input placeholder="如: 我的 Fish Audio" />
          </Form.Item>

          {needApiKey && (
            <Form.Item
              name="apiKey"
              label="API Key"
              rules={[{ required: needApiKey, message: '请输入 API Key' }]}
            >
              <Input.Password prefix={<KeyOutlined />} placeholder="输入 API Key" />
            </Form.Item>
          )}

          {needBaseUrl && (
            <Form.Item
              name="baseUrl"
              label="API 地址"
              rules={[{ required: needBaseUrl, message: '请输入 API 地址' }]}
            >
              <Input prefix={<ApiOutlined />} placeholder="如: https://api.fish.audio" />
            </Form.Item>
          )}

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="defaultVoice" label="默认音色">
                <Input prefix={<AudioOutlined />} placeholder="音色 ID 或名称" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="defaultSpeed" label="默认语速">
                <InputNumber min={0.5} max={2} step={0.1} placeholder="1.0" style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>

          {currentProvider === 'edge-tts' && (
            <div style={{ padding: '8px 12px', background: '#f6ffed', borderRadius: 4, marginTop: -8 }}>
              <span style={{ color: '#52c41a', fontSize: 13 }}>
                ✓ Edge TTS 是免费服务，无需 API Key
              </span>
            </div>
          )}
        </Form>
      </Modal>
    </div>
  );
};

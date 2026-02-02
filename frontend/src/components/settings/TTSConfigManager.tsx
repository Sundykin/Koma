import React, { useState, useEffect, useMemo } from 'react';
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
import type { TTSModelConfig, TTSProviderType } from '../../types';
import {
  loadSettings,
  addTTSConfig,
  updateTTSConfig,
  deleteTTSConfig,
  setDefaultTTSConfig,
} from '../../store/globalStore';
import { listProviders, createProviderInstance, type ProviderDefinition } from '../../providers/registry';
import type { TTSProvider } from '../../providers/tts/types';

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

  // ? Registry ??????? TTS Provider
  const availableProviders = useMemo(() => {
    return listProviders('tts');
  }, []);

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

  const handlePresetChange = (providerType: TTSProviderType) => {
    const provider = availableProviders.find(p => p.type === providerType);
    if (provider) {
      // ? configSchema ? default ???????
      const defaults: Record<string, any> = {};
      if (provider.configSchema?.properties) {
        for (const [key, field] of Object.entries(provider.configSchema.properties)) {
          if ((field as any).default !== undefined) {
            defaults[key] = (field as any).default;
          }
        }
      }
      form.setFieldsValue({
        name: form.getFieldValue('name') || provider.name,
        ...defaults,
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
        message.success('???????');
      } else {
        await addTTSConfig(configData);
        message.success('???????');
      }

      setModalVisible(false);
      await loadConfigs();
      onConfigChange?.();
    } catch (err: any) {
      if (err.errorFields) return;
      message.error(??????: \);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteTTSConfig(id);
      message.success('???????');
      await loadConfigs();
      onConfigChange?.();
    } catch (err: any) {
      message.error(??????: \);
    }
  };

  const handleSetDefault = async (id: string) => {
    try {
      await setDefaultTTSConfig(id);
      message.success('???????');
      await loadConfigs();
      onConfigChange?.();
    } catch (err: any) {
      message.error(??????: \);
    }
  };

  const handleTestConnection = async (config: TTSModelConfig) => {
    setTestingId(config.id);
    try {
      // 1. ??? Provider ???
      const provider = createProviderInstance<TTSProvider>(
        'tts',
        config.provider,
        config
      );

      // 2. ??????
      const isConnected = await provider.testConnection();
      if (!isConnected) {
        throw new Error('Connection test failed');
      }

      // 3. ?????????
      const text = "????????????????????????????????????";
      let voiceId = config.defaultVoice;
      
      if (!voiceId) {
        // ?????????????????????????????????
        try {
          const voices = await provider.listVoices();
          if (voices.length > 0) {
            voiceId = voices[0].id;
          }
        } catch (e) {
          console.warn('Failed to list voices:', e);
        }
      }

      if (!voiceId) {
        throw new Error('????????????');
      }

      const result = await provider.synthesize(text, voiceId, {
        rate: config.defaultSpeed || 1.0
      });

      // 4. ??????
      let src = result.path;
      // ?????????????????? koma-local ???
      if (!src.startsWith('http') && !src.startsWith('blob:') && !src.startsWith('data:')) {
         src = koma-local:///\;
      }

      const audio = new Audio(src);
      await audio.play();

      message.success("\" ???????????????????...);
    } catch (err: any) {
      console.error(err);
      message.error(?????????: \);
    } finally {
      setTestingId(null);
    }
  };

  const getProviderLabel = (providerType: TTSProviderType) => {
    const provider = availableProviders.find(p => p.type === providerType);
    return provider?.name || providerType;
  };

  const getProviderColor = (provider: TTSProviderType) => {
    switch (provider) {
      case 'edge-tts': return 'blue';
      case 'openai-tts': return 'green';
      case 'doubao-tts': return 'purple';
      case 'fish-audio': return 'cyan';
      case 'gpt-sovits': return 'orange';
      default: return 'default'; // ??? Provider
    }
  };

  const currentProvider = Form.useWatch('provider', form);
  const currentProviderDef = useMemo(() => {
    return availableProviders.find(p => p.type === currentProvider);
  }, [currentProvider, availableProviders]);

  // ??? configSchema ?????????
  const needApiKey = useMemo(() => {
    if (!currentProviderDef?.configSchema?.properties) return false;
    const apiKeyField = currentProviderDef.configSchema.properties.apiKey;
    return !!apiKeyField;
  }, [currentProviderDef]);

  const needBaseUrl = useMemo(() => {
    if (!currentProviderDef?.configSchema?.properties) return false;
    const baseUrlField = currentProviderDef.configSchema.properties.baseUrl;
    return !!baseUrlField;
  }, [currentProviderDef]);

  const isApiKeyRequired = useMemo(() => {
    if (!currentProviderDef?.configSchema) return false;
    return currentProviderDef.configSchema.required?.includes('apiKey') || false;
  }, [currentProviderDef]);

  // ????????????????? configSchema?
  const renderDynamicFields = () => {
    if (!currentProviderDef?.configSchema?.properties) {
      // ? schema???????????
      return (
        <>
          <Form.Item name="apiKey" label="API Key">
            <Input.Password prefix={<KeyOutlined />} placeholder="??? API Key" />
          </Form.Item>
          <Form.Item name="baseUrl" label="API ???">
            <Input prefix={<ApiOutlined />} placeholder="??? API ???" />
          </Form.Item>
        </>
      );
    }

    const fields: React.ReactNode[] = [];
    const props = currentProviderDef.configSchema.properties;

    // apiKey ? baseUrl ??????
    if (props.apiKey) {
      fields.push(
        <Form.Item
          key="apiKey"
          name="apiKey"
          label={props.apiKey.title || 'API Key'}
          rules={[{ required: isApiKeyRequired, message: ???? \ }]}
        >
          <Input.Password prefix={<KeyOutlined />} placeholder={??? \} />
        </Form.Item>
      );
    }

    if (props.baseUrl) {
      fields.push(
        <Form.Item
          key="baseUrl"
          name="baseUrl"
          label={props.baseUrl.title || 'API ???'}
          rules={[{ required: currentProviderDef.configSchema.required?.includes('baseUrl'), message: '???? API ???' }]}
        >
          <Input prefix={<ApiOutlined />} placeholder={props.baseUrl.default || '??? API ???'} />
        </Form.Item>
      );
    }

    return fields;
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <span style={{ fontSize: 14, color: '#888' }}>
            ???? <strong>{configs.length}</strong> ??????????
          </span>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => openModal()}>
          ??????
        </Button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <Spin />
        </div>
      ) : configs.length === 0 ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="???????????????????"
        >
          <Button type="primary" icon={<PlusOutlined />} onClick={() => openModal()}>
            ??????????
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
                      <Tooltip title="??????">
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
                    <Tooltip title="??????">
                      <Button
                        type="text"
                        size="small"
                        icon={testingId === config.id ? <LoadingOutlined /> : <CheckCircleOutlined />}
                        onClick={() => handleTestConnection(config)}
                        disabled={testingId === config.id}
                      />
                    </Tooltip>
                    <Tooltip title="???">
                      <Button
                        type="text"
                        size="small"
                        icon={<EditOutlined />}
                        onClick={() => openModal(config)}
                      />
                    </Tooltip>
                    <Popconfirm
                      title="????????????"
                      onConfirm={() => handleDelete(config.id)}
                      okText="???"
                      cancelText="???"
                    >
                      <Tooltip title="???">
                        <Button type="text" size="small" danger icon={<DeleteOutlined />} />
                      </Tooltip>
                    </Popconfirm>
                  </Space>
                }
              >
                <div style={{ fontSize: 13, color: '#666' }}>
                  {config.defaultVoice && <div><strong>??????:</strong> {config.defaultVoice}</div>}
                  {config.defaultSpeed && <div><strong>??????:</strong> {config.defaultSpeed}x</div>}
                  {config.baseUrl && (
                    <div style={{ marginTop: 4 }}>
                      <strong>???:</strong>{' '}
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
        title={editingConfig ? '????????????' : '????????????'}
        open={modalVisible}
        onOk={handleSave}
        onCancel={() => setModalVisible(false)}
        okText="???"
        cancelText="???"
        width={520}
        maskClosable={false}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            name="provider"
            label="????"
            rules={[{ required: true, message: '?????????' }]}
          >
            <Select placeholder="?????????????" onChange={handlePresetChange}>
              {availableProviders.map(provider => (
                <Select.Option key={provider.type} value={provider.type}>
                  <Space>
                    <span>{provider.name}</span>
                    {provider.pluginId && <Tag size="small">???</Tag>}
                  </Space>
                </Select.Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item
            name="name"
            label="??????"
            rules={[{ required: true, message: '??????????' }]}
          >
            <Input placeholder="?: ??? Fish Audio" />
          </Form.Item>

          {renderDynamicFields()}

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="defaultVoice" label="??????">
                <Input prefix={<AudioOutlined />} placeholder="??? ID ????" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="defaultSpeed" label="??????">
                <InputNumber min={0.5} max={2} step={0.1} placeholder="1.0" style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>

          {currentProvider === 'edge-tts' && (
            <div style={{ padding: '8px 12px', background: '#f6ffed', borderRadius: 4, marginTop: -8 }}>
              <span style={{ color: '#52c41a', fontSize: 13 }}>
                ? Edge TTS ???????????? API Key
              </span>
            </div>
          )}
        </Form>
      </Modal>
    </div>
  );
};

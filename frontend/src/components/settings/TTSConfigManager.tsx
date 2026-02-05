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
import { useTranslation } from 'react-i18next';
import type { TTSModelConfig, TTSProviderType } from '../../types';
import {
  loadSettings,
  addTTSConfig,
  updateTTSConfig,
  deleteTTSConfig,
  setDefaultTTSConfig,
} from '../../store/globalStore';
import type { ProviderDefinition } from '../../providers/registry.types';
import { listProviders, createTTSProviderFromConfig } from '../../providers';

interface TTSConfigManagerProps {
  onConfigChange?: () => void;
}

export const TTSConfigManager: React.FC<TTSConfigManagerProps> = ({ onConfigChange }) => {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const [configs, setConfigs] = useState<TTSModelConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingConfig, setEditingConfig] = useState<TTSModelConfig | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [availableProviders, setAvailableProviders] = useState<ProviderDefinition<any>[]>([]);
  const [form] = Form.useForm();

  // 从 Registry 获取可用的 TTS Provider
  useEffect(() => {
    setAvailableProviders(listProviders('tts'));
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
      // 从 configSchema 的 default 值填充表单
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
        message.success(t('settings.configUpdated'));
      } else {
        await addTTSConfig(configData);
        message.success(t('settings.configAdded'));
      }

      setModalVisible(false);
      await loadConfigs();
      onConfigChange?.();
    } catch (err: any) {
      if (err.errorFields) return;
      message.error(`${t('common.saveFailed')}: ${err.message}`);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteTTSConfig(id);
      message.success(t('settings.configDeleted'));
      await loadConfigs();
      onConfigChange?.();
    } catch (err: any) {
      message.error(`${t('error.deleteFailed')}: ${err.message}`);
    }
  };

  const handleSetDefault = async (id: string) => {
    try {
      await setDefaultTTSConfig(id);
      message.success(t('settings.defaultSet'));
      await loadConfigs();
      onConfigChange?.();
    } catch (err: any) {
      message.error(`${t('common.error')}: ${err.message}`);
    }
  };

  const handleTestConnection = async (config: TTSModelConfig) => {
    setTestingId(config.id);
    try {
      const provider = createTTSProviderFromConfig(config);

      if (!provider.validate()) {
        throw new Error(t('settings.configValidationFailed'));
      }

      const success = await provider.testConnection();
      if (success) {
        message.success(`"${config.name}" ${t('settings.connectionSuccess')}`);
      } else {
        message.error(`"${config.name}" ${t('settings.connectionFailedCheck')}`);
      }
    } catch (err: any) {
      message.error(`${t('settings.connectionFailed')}: ${err.message}`);
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
      default: return 'default'; // 插件 Provider
    }
  };

  const currentProvider = Form.useWatch('provider', form);
  const currentProviderDef = useMemo(() => {
    return availableProviders.find(p => p.type === currentProvider);
  }, [currentProvider, availableProviders]);

  // 根据 configSchema 判断字段需求
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

  // 渲染动态表单字段（基于 configSchema）
  const renderDynamicFields = () => {
    if (!currentProviderDef?.configSchema?.properties) {
      // 无 schema，显示基础字段
      return (
        <>
          <Form.Item name="apiKey" label={t('settings.apiKey')}>
            <Input.Password prefix={<KeyOutlined />} placeholder={t('settings.enterApiKey')} />
          </Form.Item>
          <Form.Item name="baseUrl" label={t('settings.apiAddress')}>
            <Input prefix={<ApiOutlined />} placeholder={t('settings.enterApiAddress')} />
          </Form.Item>
        </>
      );
    }

    const fields: React.ReactNode[] = [];
    const props = currentProviderDef.configSchema.properties;

    // apiKey 和 baseUrl 优先渲染
    if (props.apiKey) {
      fields.push(
        <Form.Item
          key="apiKey"
          name="apiKey"
          label={props.apiKey.title || t('settings.apiKey')}
          rules={[{ required: isApiKeyRequired, message: `${t('settings.pleaseEnter')} ${props.apiKey.title || t('settings.apiKey')}` }]}
        >
          <Input.Password prefix={<KeyOutlined />} placeholder={`${t('settings.pleaseEnter')} ${props.apiKey.title || t('settings.apiKey')}`} />
        </Form.Item>
      );
    }

    if (props.baseUrl) {
      fields.push(
        <Form.Item
          key="baseUrl"
          name="baseUrl"
          label={props.baseUrl.title || t('settings.apiAddress')}
          rules={[{ required: currentProviderDef.configSchema.required?.includes('baseUrl'), message: `${t('settings.pleaseEnter')} ${t('settings.apiAddress')}` }]}
        >
          <Input prefix={<ApiOutlined />} placeholder={props.baseUrl.default || t('settings.enterApiAddress')} />
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
            {t('settings.ttsConfigured', { count: configs.length })}
          </span>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => openModal()}>
          {t('settings.addConfig')}
        </Button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <Spin />
        </div>
      ) : configs.length === 0 ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={t('settings.noTTSConfigs')}
        >
          <Button type="primary" icon={<PlusOutlined />} onClick={() => openModal()}>
            {t('settings.addFirstConfig')}
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
                      <Tooltip title={t('settings.setAsDefault')}>
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
                    <Tooltip title={t('settings.testConnection')}>
                      <Button
                        type="text"
                        size="small"
                        icon={testingId === config.id ? <LoadingOutlined /> : <CheckCircleOutlined />}
                        onClick={() => handleTestConnection(config)}
                        disabled={testingId === config.id}
                      />
                    </Tooltip>
                    <Tooltip title={t('common.edit')}>
                      <Button
                        type="text"
                        size="small"
                        icon={<EditOutlined />}
                        onClick={() => openModal(config)}
                      />
                    </Tooltip>
                    <Popconfirm
                      title={t('settings.confirmDeleteConfig')}
                      onConfirm={() => handleDelete(config.id)}
                      okText={t('common.delete')}
                      cancelText={t('common.cancel')}
                    >
                      <Tooltip title={t('common.delete')}>
                        <Button type="text" size="small" danger icon={<DeleteOutlined />} />
                      </Tooltip>
                    </Popconfirm>
                  </Space>
                }
              >
                <div style={{ fontSize: 13, color: '#666' }}>
                  {config.defaultVoice && <div><strong>{t('settings.defaultVoice')}:</strong> {config.defaultVoice}</div>}
                  {config.defaultSpeed && <div><strong>{t('settings.defaultSpeed')}:</strong> {config.defaultSpeed}x</div>}
                  {config.baseUrl && (
                    <div style={{ marginTop: 4 }}>
                      <strong>{t('settings.apiAddress')}:</strong>{' '}
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
        title={editingConfig ? t('settings.editTTSConfig') : t('settings.addTTSConfig')}
        open={modalVisible}
        onOk={handleSave}
        onCancel={() => setModalVisible(false)}
        okText={t('common.save')}
        cancelText={t('common.cancel')}
        width={520}
        maskClosable={false}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            name="provider"
            label={t('settings.provider')}
            required
            rules={[{ required: true, message: `${t('settings.pleaseSelect')} ${t('settings.provider')}` }]}
          >
            <Select placeholder={t('settings.selectProvider')} onChange={handlePresetChange}>
              {availableProviders.map(provider => (
                <Select.Option key={provider.type} value={provider.type}>
                  <Space>
                    <span>{provider.name}</span>
                    {provider.pluginId && <Tag className="text-xs">{t('plugin.title')}</Tag>}
                  </Space>
                </Select.Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item
            name="name"
            label={t('settings.configName')}
            required
            rules={[{ required: true, message: `${t('settings.pleaseEnter')} ${t('settings.configName')}` }]}
          >
            <Input placeholder={t('settings.configNamePlaceholder')} />
          </Form.Item>

          {renderDynamicFields()}

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="defaultVoice" label={t('settings.defaultVoice')}>
                <Input prefix={<AudioOutlined />} placeholder={t('settings.voiceIdPlaceholder')} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="defaultSpeed" label={t('settings.defaultSpeed')}>
                <InputNumber min={0.5} max={2} step={0.1} placeholder="1.0" style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>

          {currentProvider === 'edge-tts' && (
            <div style={{ padding: '8px 12px', background: '#f6ffed', borderRadius: 4, marginTop: -8 }}>
              <span style={{ color: '#52c41a', fontSize: 13 }}>
                ✓ {t('settings.edgeTTSFree')}
              </span>
            </div>
          )}
        </Form>
      </Modal>
    </div>
  );
};

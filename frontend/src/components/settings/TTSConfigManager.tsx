import React, { useCallback, useMemo } from 'react';
import {
  App,
  Button,
  Card,
  Col,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Row,
  Select,
  Space,
  Spin,
  Tag,
  Tooltip,
} from 'antd';
import {
  AudioOutlined,
  CheckCircleOutlined,
  DeleteOutlined,
  EditOutlined,
  LoadingOutlined,
  PlusOutlined,
  SoundOutlined,
  StarFilled,
  StarOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import type { AppSettings, TTSModelConfig } from '../../types';
import { createTTSProvider } from '../../providers/tts';
import { buildTTSConfigFromContext } from '../../providers/channel/resolver';
import type { ChannelModelDefinition } from '../../providers/channel/types';
import {
  addChannelConfig,
  deleteChannelConfig,
  generateId,
  setDefaultMediaModelSelection,
  updateChannelConfig,
} from '../../store/globalStore';
import { ChannelModelsEditor } from './ChannelModelsEditor';
import {
  buildChannelFormValues,
  buildManagedChannelCards,
  getPreferredChannelModelId,
  listBuiltInChannelOptions,
} from './channelManagerShared';
import { useMediaConfigManager } from './useMediaConfigManager';

interface TTSConfigManagerProps {
  onConfigChange?: () => void;
}

function getProviderColor(providerType: string) {
  switch (providerType) {
    case 'edge-tts': return 'blue';
    case 'openai-tts': return 'green';
    case 'fish-audio': return 'cyan';
    case 'gpt-sovits': return 'orange';
    default: return 'default';
  }
}

function getChannelDefaults(definition?: ReturnType<typeof listBuiltInChannelOptions>[number]) {
  if (!definition) {
    return {};
  }

  const schemaProperties = (definition.configSchema as { properties?: Record<string, { default?: unknown }> } | undefined)?.properties || {};
  const defaults = Object.fromEntries(
    Object.entries(schemaProperties)
      .filter(([, field]) => field?.default !== undefined)
      .map(([key, field]) => [key, field.default]),
  );

  return {
    name: definition.name,
    ...defaults,
  };
}

export const TTSConfigManager: React.FC<TTSConfigManagerProps> = ({ onConfigChange }) => {
  const { t } = useTranslation();
  const { message } = App.useApp();

  const channelDefinitions = useMemo(() => listBuiltInChannelOptions('tts'), []);
  const definitionMap = useMemo(
    () => new Map(channelDefinitions.map((definition) => [definition.id, definition])),
    [channelDefinitions],
  );

  const loadBuiltins = useCallback(
    (settings: AppSettings) => buildManagedChannelCards(settings, 'tts', buildTTSConfigFromContext),
    [],
  );

  const {
    configs,
    loading,
    modalVisible,
    setModalVisible,
    editingChannel,
    setEditingChannel,
    testingId,
    setTestingId,
    form,
    settings,
    loadConfigs,
  } = useMediaConfigManager<TTSModelConfig>('tts', loadBuiltins, onConfigChange);

  const currentProviderType = Form.useWatch('providerType', form) as string | undefined;
  const currentDefinition = currentProviderType ? definitionMap.get(currentProviderType) : undefined;
  const watchedModels = Form.useWatch('models', form) as Array<Partial<ChannelModelDefinition>> | undefined;
  const modelOptions = useMemo(() => (
    (watchedModels || [])
      .filter((model) => Boolean(model && model.id))
      .map((model) => ({
        label: (String(model.label || '').trim()
          || String(model.providerModelName || '').trim()
          || String(model.id || '').trim()),
        value: String(model.id),
      }))
  ), [watchedModels]);

  const normalizeModels = useCallback((raw: unknown): ChannelModelDefinition[] => {
    const models = (Array.isArray(raw) ? raw : []) as Array<Partial<ChannelModelDefinition>>;
    if (models.length === 0) {
      throw new Error('请至少添加一个模型');
    }

    return models.map((item) => {
      const providerModelName = String(item.providerModelName || '').trim();
      if (!providerModelName) {
        throw new Error('模型名称不能为空');
      }
      const label = String(item.label || '').trim() || providerModelName;
      const id = String(item.id || '').trim() || generateId();

      return {
        id,
        label,
        providerModelName,
        capabilities: ['speech.text-to-speech'],
      };
    });
  }, []);

  const openModal = useCallback((config?: typeof configs[number]) => {
    if (config) {
      setEditingChannel(config.channel);
      form.setFieldsValue(buildChannelFormValues(config.channel, config.definition));
    } else {
      const firstDefinition = channelDefinitions[0];
      const modelId = generateId();
      setEditingChannel(null);
      form.resetFields();
      form.setFieldsValue({
        providerType: firstDefinition?.id,
        ...getChannelDefaults(firstDefinition),
        models: [{
          id: modelId,
          providerModelName: '',
          label: '',
          capabilities: ['speech.text-to-speech'],
        }],
        defaultModelId: modelId,
      });
    }
    setModalVisible(true);
  }, [channelDefinitions, configs, form, setEditingChannel, setModalVisible]);

  const handleProviderChange = useCallback((providerType: string) => {
    const definition = definitionMap.get(providerType);
    if (!definition) {
      return;
    }

    const existingModels = form.getFieldValue('models');
    const normalizedModels = Array.isArray(existingModels) && existingModels.length > 0
      ? existingModels
      : [{
          id: generateId(),
          providerModelName: '',
          label: '',
          capabilities: ['speech.text-to-speech'],
        }];

    const currentDefaultModelId = String(form.getFieldValue('defaultModelId') || '');
    const nextDefaultModelId = currentDefaultModelId && normalizedModels.some((model: any) => String(model?.id) === currentDefaultModelId)
      ? currentDefaultModelId
      : String(normalizedModels[0]?.id || '');

    const previousName = form.getFieldValue('name');
    form.setFieldsValue({
      providerType,
      name: previousName || definition.name,
      ...getChannelDefaults(definition),
      models: normalizedModels,
      defaultModelId: nextDefaultModelId,
    });
  }, [definitionMap, form]);

  React.useEffect(() => {
    const models = watchedModels || [];
    if (models.length === 0) {
      return;
    }
    const current = String(form.getFieldValue('defaultModelId') || '');
    if (!current || !models.some((item) => String(item?.id || '') === current)) {
      const next = String(models[0]?.id || '');
      if (next) {
        form.setFieldValue('defaultModelId', next);
      }
    }
  }, [form, watchedModels]);

  const handleSave = useCallback(async () => {
    try {
      const values = await form.validateFields();
      const definition = definitionMap.get(values.providerType);
      if (!definition) {
        throw new Error('未找到对应的语音渠道定义');
      }

      const models = normalizeModels(values.models);
      const modelIdSet = new Set(models.map((model) => model.id));
      const defaultModelId = modelIdSet.has(values.defaultModelId)
        ? values.defaultModelId
        : models[0]?.id;
      if (!defaultModelId) throw new Error('请至少添加一个模型');

      const payload = {
        name: values.name,
        description: definition.description,
        category: 'tts' as const,
        providerType: definition.id,
        providerConfig: {
          apiKey: values.apiKey,
          baseUrl: values.baseUrl,
          defaultVoice: values.defaultVoice,
          defaultSpeed: values.defaultSpeed,
        },
        defaultModelId,
        models,
        enabled: true,
        source: 'builtin' as const,
      };

      const saved = editingChannel
        ? await updateChannelConfig(editingChannel.id, payload)
        : await addChannelConfig(payload);

      if (!saved) {
        throw new Error('保存渠道配置失败');
      }

      const shouldUpdateDefault = !settings?.mediaDefaults?.tts
        || settings.mediaDefaults.tts.channelId === saved.id;
      if (shouldUpdateDefault) {
        await setDefaultMediaModelSelection('tts', { channelId: saved.id, modelId: defaultModelId });
      }

      message.success(editingChannel ? t('settings.configUpdated') : t('settings.configAdded'));
      setModalVisible(false);
      await loadConfigs();
      onConfigChange?.();
    } catch (err: any) {
      if (err?.errorFields) return;
      message.error(`${t('common.saveFailed')}: ${err?.message || String(err)}`);
    }
  }, [definitionMap, editingChannel, form, loadConfigs, message, onConfigChange, setModalVisible, settings?.mediaDefaults?.tts, t]);

  const handleDelete = useCallback(async (id: string) => {
    try {
      await deleteChannelConfig(id);
      message.success(t('settings.configDeleted'));
      await loadConfigs();
      onConfigChange?.();
    } catch (err: any) {
      message.error(`${t('error.deleteFailed')}: ${err?.message || String(err)}`);
    }
  }, [loadConfigs, message, onConfigChange, t]);

  const handleSetDefault = useCallback(async (channelId: string, modelId?: string) => {
    if (!modelId) {
      message.error('当前渠道没有可用模型');
      return;
    }

    try {
      await setDefaultMediaModelSelection('tts', { channelId, modelId });
      message.success(t('settings.defaultSet'));
      await loadConfigs();
      onConfigChange?.();
    } catch (err: any) {
      message.error(`${t('common.error')}: ${err?.message || String(err)}`);
    }
  }, [loadConfigs, message, onConfigChange, t]);

  const handleTestConnection = useCallback(async (config: typeof configs[number]) => {
    setTestingId(config.channel.id);
    try {
      const provider = createTTSProvider({
        provider: config.resolvedConfig.provider,
        apiKey: config.resolvedConfig.apiKey,
        baseUrl: config.resolvedConfig.baseUrl,
        defaultVoice: config.resolvedConfig.defaultVoice,
      });
      if (!provider.validate()) {
        throw new Error(t('settings.configValidationFailed'));
      }
      const success = await provider.testConnection();
      if (success) {
        message.success(`"${config.channel.name}" ${t('settings.connectionSuccess')}`);
      } else {
        message.error(`"${config.channel.name}" ${t('settings.connectionFailedCheck')}`);
      }
    } catch (err: any) {
      message.error(`${t('settings.connectionFailed')}: ${err?.message || String(err)}`);
    } finally {
      setTestingId(null);
    }
  }, [message, setTestingId, t]);

  const renderModelTags = useCallback((models: ChannelModelDefinition[], defaultModelId?: string) => (
    <Space wrap size={[6, 6]}>
      {models.map((model) => (
        <Tag key={model.id} color={model.id === defaultModelId ? 'gold' : 'default'}>
          {model.label}
        </Tag>
      ))}
    </Space>
  ), []);

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
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('settings.noTTSConfigs')}>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => openModal()}>
            {t('settings.addFirstConfig')}
          </Button>
        </Empty>
      ) : (
        <Row gutter={[16, 16]}>
          {configs.map((config) => {
            const preferredModelId = getPreferredChannelModelId(config.channel, config.definition);
            return (
              <Col key={config.channel.id} xs={24} sm={12}>
                <Card
                  size="small"
                  title={(
                    <Space>
                      {config.isDefault ? (
                        <StarFilled style={{ color: '#faad14' }} />
                      ) : (
                        <Tooltip title={t('settings.setAsDefault')}>
                          <StarOutlined
                            style={{ cursor: 'pointer', color: '#d9d9d9' }}
                            onClick={() => handleSetDefault(config.channel.id, preferredModelId)}
                          />
                        </Tooltip>
                      )}
                      <SoundOutlined />
                      <span>{config.channel.name}</span>
                      <Tag color={getProviderColor(config.definition.id)}>{config.definition.name}</Tag>
                    </Space>
                  )}
                  extra={(
                    <Space size="small">
                      <Tooltip title={t('settings.testConnection')}>
                        <Button
                          type="text"
                          size="small"
                          icon={testingId === config.channel.id ? <LoadingOutlined /> : <CheckCircleOutlined />}
                          onClick={() => handleTestConnection(config)}
                          disabled={testingId === config.channel.id}
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
                        onConfirm={() => handleDelete(config.channel.id)}
                        okText={t('common.delete')}
                        cancelText={t('common.cancel')}
                      >
                        <Tooltip title={t('common.delete')}>
                          <Button type="text" size="small" danger icon={<DeleteOutlined />} />
                        </Tooltip>
                      </Popconfirm>
                    </Space>
                  )}
                >
                  <div style={{ fontSize: 13, color: '#666' }}>
                    <div style={{ marginBottom: 8 }}>
                      <strong>模型列表:</strong>
                      <div style={{ marginTop: 6 }}>
                        {renderModelTags(config.enabledModels, config.channel.defaultModelId)}
                      </div>
                    </div>
                    {config.resolvedConfig.defaultVoice && <div><strong>{t('settings.defaultVoice')}:</strong> {config.resolvedConfig.defaultVoice}</div>}
                    {config.channel.providerConfig.defaultSpeed && <div><strong>{t('settings.defaultSpeed')}:</strong> {String(config.channel.providerConfig.defaultSpeed)}x</div>}
                    {config.resolvedConfig.baseUrl && (
                      <div style={{ marginTop: 6 }}>
                        <strong>{t('settings.apiAddress')}:</strong>{' '}
                        <span style={{ fontSize: 12, fontFamily: 'monospace' }}>
                          {config.resolvedConfig.baseUrl.replace(/https?:\/\//, '').slice(0, 36)}
                        </span>
                      </div>
                    )}
                  </div>
                </Card>
              </Col>
            );
          })}
        </Row>
      )}

      <Modal
        title={editingChannel ? t('settings.editTTSConfig') : t('settings.addTTSConfig')}
        open={modalVisible}
        onOk={handleSave}
        onCancel={() => setModalVisible(false)}
        okText={t('common.save')}
        cancelText={t('common.cancel')}
        width={520}
        mask={{ closable: false }}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            name="providerType"
            label={t('settings.provider')}
            required
            rules={[{ required: true, message: `${t('settings.pleaseSelect')} ${t('settings.provider')}` }]}
          >
            <Select placeholder={t('settings.selectProvider')} onChange={handleProviderChange}>
              {channelDefinitions.map((definition) => (
                <Select.Option key={definition.id} value={definition.id}>
                  {definition.name}
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

          <Form.Item
            label="模型列表"
            required
          >
            <ChannelModelsEditor
              fixedCapabilities={['speech.text-to-speech']}
              helpText="模型列表为手动维护。若渠道不区分模型，可填写任意占位名（如: default）。"
              modelNamePlaceholder="填写模型名称，如: tts-1 / tts-1-hd / default"
            />
          </Form.Item>

          <Form.Item
            name="defaultModelId"
            label="默认模型"
            required
            rules={[{ required: true, message: '请选择默认模型' }]}
          >
            <Select
              placeholder="选择默认模型"
              options={modelOptions}
            />
          </Form.Item>

          {currentProviderType !== 'edge-tts' && (
            <Form.Item
              name="apiKey"
              label={t('settings.apiKey')}
              rules={[{
                required: currentProviderType !== 'gpt-sovits' && currentProviderType !== 'edge-tts',
                message: `${t('settings.pleaseEnter')} ${t('settings.apiKey')}`,
              }]}
            >
              <Input.Password placeholder={t('settings.enterApiKey')} />
            </Form.Item>
          )}

          {currentProviderType !== 'edge-tts' && (
            <Form.Item name="baseUrl" label={t('settings.apiAddress')}>
              <Input placeholder={t('settings.enterApiAddress')} />
            </Form.Item>
          )}

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

          {currentProviderType === 'edge-tts' && (
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

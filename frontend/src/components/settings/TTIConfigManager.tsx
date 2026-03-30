import React, { useCallback, useMemo, useState } from 'react';
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
  AppstoreOutlined,
  CheckCircleOutlined,
  DeleteOutlined,
  EditOutlined,
  LoadingOutlined,
  NodeIndexOutlined,
  PictureOutlined,
  PlusOutlined,
  SettingOutlined,
  StarFilled,
  StarOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import type { AppSettings, TTIModelConfig } from '../../types';
import { buildTTIConfigFromContext } from '../../providers/channel/resolver';
import type { ChannelConfig, ChannelModelDefinition } from '../../providers/channel/types';
import {
  addChannelConfig,
  deleteChannelConfig,
  generateId,
  setDefaultMediaModelSelection,
  updateChannelConfig,
} from '../../store/globalStore';
import { createTTIProvider } from '../../providers/tti';
import { WorkflowUploader } from './WorkflowUploader';
import { ProviderPluginModal } from '../plugins/ProviderPluginModal';
import { ChannelModelsEditor } from './ChannelModelsEditor';
import {
  buildChannelFormValues,
  buildManagedChannelCards,
  getPreferredChannelModelId,
  listBuiltInChannelOptions,
} from './channelManagerShared';
import { useMediaConfigManager } from './useMediaConfigManager';

interface TTIConfigManagerProps {
  onConfigChange?: () => void;
}

const CAPABILITY_LABELS: Record<string, string> = {
  'image.text-to-image': '文生图',
  'image.image-to-image': '图生图',
};

function getProviderColor(provider: string) {
  switch (provider) {
    case 'comfyui': return 'orange';
    case 'openai-compatible-tti': return 'lime';
    case 'grok2api-imagine-tti': return 'purple';
    case 'gemini-native-tti': return 'blue';
    case 'nano-banana': return 'gold';
    case 'gemini-3-pro': return 'volcano';
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

export const TTIConfigManager: React.FC<TTIConfigManagerProps> = ({ onConfigChange }) => {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const [workflowData, setWorkflowData] = useState<{
    workflowPath?: string;
    workflowMapping?: Record<string, string>;
    workflowJson?: string;
  }>({});

  const channelDefinitions = useMemo(() => listBuiltInChannelOptions('tti'), []);
  const definitionMap = useMemo(
    () => new Map(channelDefinitions.map((definition) => [definition.id, definition])),
    [channelDefinitions],
  );

  const loadBuiltins = useCallback(
    (settings: AppSettings) => buildManagedChannelCards(settings, 'tti', buildTTIConfigFromContext),
    [],
  );

  const {
    configs,
    pluginChannels,
    settings,
    loading,
    modalVisible,
    setModalVisible,
    editingChannel,
    setEditingChannel,
    testingId,
    setTestingId,
    form,
    pluginModalVisible,
    activePluginId,
    loadConfigs,
    openPluginModal,
    closePluginModal,
    handlePluginConfigSaved,
  } = useMediaConfigManager<TTIModelConfig>('tti', loadBuiltins, onConfigChange);

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
      const capabilities = Array.isArray(item.capabilities) ? item.capabilities : [];
      if (capabilities.length === 0) {
        throw new Error('请为每个模型至少选择一个能力');
      }

      return {
        id,
        label,
        providerModelName,
        capabilities,
      };
    });
  }, []);

  const openModal = useCallback((config?: typeof configs[number]) => {
    if (config) {
      setEditingChannel(config.channel);
      form.setFieldsValue(buildChannelFormValues(config.channel, config.definition));
      setWorkflowData({
        workflowPath: config.channel.providerConfig.workflowPath as string | undefined,
        workflowMapping: config.channel.providerConfig.workflowMapping as Record<string, string> | undefined,
      });
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
          capabilities: ['image.text-to-image'],
        }],
        defaultModelId: modelId,
      });
      setWorkflowData({});
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
          capabilities: ['image.text-to-image'],
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
    });
    setWorkflowData({});
    form.setFieldsValue({
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
        throw new Error('未找到对应的图片渠道定义');
      }

      const models = normalizeModels(values.models);
      const modelIdSet = new Set(models.map((model) => model.id));
      const defaultModelId = modelIdSet.has(values.defaultModelId)
        ? values.defaultModelId
        : models[0]?.id;
      if (!defaultModelId) throw new Error('请至少添加一个模型');

      const providerConfig = {
        baseUrl: values.baseUrl,
        apiKey: values.apiKey,
        promptProtocol: values.promptProtocol || undefined,
        defaultSize: values.defaultSize || undefined,
        defaultSteps: values.defaultSteps || undefined,
        workflowPath: workflowData.workflowPath,
        workflowMapping: workflowData.workflowMapping,
      };

      const payload = {
        name: values.name,
        description: definition.description,
        category: 'tti' as const,
        providerType: definition.id,
        providerConfig,
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

      const shouldUpdateDefault = !settings?.mediaDefaults?.tti
        || settings.mediaDefaults.tti.channelId === saved.id;
      if (shouldUpdateDefault) {
        await setDefaultMediaModelSelection('tti', { channelId: saved.id, modelId: defaultModelId });
      }

      message.success(editingChannel ? t('settings.configUpdated') : t('settings.configAdded'));
      setModalVisible(false);
      await loadConfigs();
      onConfigChange?.();
    } catch (err: any) {
      if (err?.errorFields) return;
      message.error(`${t('common.saveFailed')}: ${err?.message || String(err)}`);
    }
  }, [definitionMap, editingChannel, form, loadConfigs, message, onConfigChange, setModalVisible, settings?.mediaDefaults?.tti, t, workflowData]);

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

  const handleSetDefault = useCallback(async (channel: ChannelConfig, modelId?: string) => {
    if (!modelId) {
      message.error('当前渠道没有可用模型');
      return;
    }

    try {
      await setDefaultMediaModelSelection('tti', { channelId: channel.id, modelId });
      message.success(t('settings.defaultSet'));
      await loadConfigs();
      onConfigChange?.();
    } catch (err: any) {
      message.error(`${t('common.error')}: ${err?.message || String(err)}`);
    }
  }, [loadConfigs, message, onConfigChange, t]);

  const handleSetPluginDefault = useCallback(async (channel: ChannelConfig) => {
    if (!channel.defaultModelId) {
      message.warning('插件渠道尚未声明默认模型');
      return;
    }

    await handleSetDefault(channel, channel.defaultModelId);
  }, [handleSetDefault, message]);

  const handleTestConnection = useCallback(async (config: typeof configs[number]) => {
    setTestingId(config.channel.id);
    try {
      const provider = createTTIProvider(config.resolvedConfig);
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
  }, [configs, message, setTestingId, t]);

  const renderModelTags = useCallback((models: ChannelModelDefinition[], defaultModelId?: string) => (
    <Space wrap size={[6, 6]}>
      {models.map((model) => (
        <Tag key={model.id} color={model.id === defaultModelId ? 'gold' : 'default'}>
          {model.label}
        </Tag>
      ))}
    </Space>
  ), []);

  const renderCapabilityTags = useCallback((models: ChannelModelDefinition[]) => {
    const capabilities = Array.from(new Set(models.flatMap((model) => model.capabilities)));
    return (
      <Space wrap size={[6, 6]}>
        {capabilities.map((capability) => (
          <Tag key={capability} color="green">
            {CAPABILITY_LABELS[capability] || capability}
          </Tag>
        ))}
      </Space>
    );
  }, []);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <span style={{ fontSize: 14, color: '#888' }}>
            {t('settings.ttiConfigured', { count: configs.length })}
            {pluginChannels.length > 0 && <span>，{t('settings.pluginChannels', { count: pluginChannels.length })}</span>}
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
      ) : configs.length === 0 && pluginChannels.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('settings.noTTIConfigs')}>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => openModal()}>
            {t('settings.addBuiltinService')}
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
                            onClick={() => handleSetDefault(config.channel, preferredModelId)}
                          />
                        </Tooltip>
                      )}
                      <PictureOutlined />
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
                    <div style={{ marginBottom: 8 }}>
                      <strong>能力:</strong>
                      <div style={{ marginTop: 6 }}>
                        {renderCapabilityTags(config.enabledModels)}
                      </div>
                    </div>
                    {config.resolvedConfig.defaultSize && <div><strong>{t('settings.defaultSize')}:</strong> {config.resolvedConfig.defaultSize}</div>}
                    {config.channel.providerConfig.workflowPath && (
                      <div style={{ marginTop: 6 }}>
                        <Tag icon={<NodeIndexOutlined />} color="orange">
                          {t('settings.workflow')}: {String(config.channel.providerConfig.workflowPath)}
                        </Tag>
                      </div>
                    )}
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

          {pluginChannels.map((channel) => (
            <Col key={channel.id} xs={24} sm={12}>
              <Card
                size="small"
                title={(
                  <Space>
                    {settings?.mediaDefaults?.tti?.channelId === channel.id ? (
                      <StarFilled style={{ color: '#faad14' }} />
                    ) : (
                      <Tooltip title={t('settings.setAsDefault')}>
                        <StarOutlined
                          style={{ cursor: 'pointer', color: '#d9d9d9' }}
                          onClick={() => handleSetPluginDefault(channel)}
                        />
                      </Tooltip>
                    )}
                    <AppstoreOutlined />
                    <span>{channel.name}</span>
                    <Tag color="blue">{t('plugin.title')}</Tag>
                  </Space>
                )}
                extra={channel.pluginId ? (
                  <Tooltip title={t('settings.configSettings')}>
                    <Button
                      type="text"
                      size="small"
                      icon={<SettingOutlined />}
                      onClick={() => openPluginModal(channel.pluginId!)}
                    />
                  </Tooltip>
                ) : null}
              >
                <div style={{ fontSize: 13, color: '#666' }}>
                  {channel.description && <div>{channel.description}</div>}
                  <div style={{ marginTop: 6 }}><strong>Provider:</strong> {channel.providerType}</div>
                  {channel.defaultModelId && <div style={{ marginTop: 6 }}><strong>默认模型:</strong> {channel.defaultModelId}</div>}
                </div>
              </Card>
            </Col>
          ))}
        </Row>
      )}

      <ProviderPluginModal
        visible={pluginModalVisible}
        pluginId={activePluginId}
        onClose={closePluginModal}
        onConfigSaved={handlePluginConfigSaved}
      />

      <Modal
        title={editingChannel ? t('settings.editTTIConfig') : t('settings.addTTIConfig')}
        open={modalVisible}
        onOk={handleSave}
        onCancel={() => setModalVisible(false)}
        okText={t('common.save')}
        cancelText={t('common.cancel')}
        width={560}
        mask={{ closable: false }}
        destroyOnHidden
        className="dark-modal"
      >
        <Form form={form} layout="vertical" className="mt-4">
          <Form.Item
            name="providerType"
            label={t('settings.provider')}
            required
            rules={[{ required: true, message: `${t('settings.pleaseSelect')} ${t('settings.provider')}` }]}
          >
            <Select placeholder={t('settings.selectTTIProvider')} onChange={handleProviderChange}>
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
              capabilityOptions={[
                { value: 'image.text-to-image', label: '文生图' },
                { value: 'image.image-to-image', label: '图生图' },
              ]}
              defaultCapabilities={['image.text-to-image']}
              helpText="模型列表为手动维护。请为每个模型勾选其真实支持的能力。"
              modelNamePlaceholder="填写模型名称，如: sd_xl_base_1.0.safetensors / gemini-3-pro-image-preview"
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

          {currentProviderType !== 'comfyui' && (
            <Form.Item
              name="apiKey"
              label={t('settings.apiKey')}
              rules={[{ required: currentProviderType !== 'comfyui', message: `${t('settings.pleaseEnter')} ${t('settings.apiKey')}` }]}
            >
              <Input.Password placeholder={t('settings.enterApiKey')} />
            </Form.Item>
          )}

          <Form.Item
            name="baseUrl"
            label={t('settings.apiAddress')}
            rules={[{ required: true, message: `${t('settings.pleaseEnter')} ${t('settings.apiAddress')}` }]}
          >
            <Input placeholder="http://127.0.0.1:8188" />
          </Form.Item>

          <Form.Item
            name="promptProtocol"
            label="Prompt 编译协议"
            tooltip="为特定渠道启用提示词编译与参考图数组对齐。"
          >
            <Select allowClear placeholder="不启用（默认）">
              <Select.Option value="grok-image-index">grok-image-index (@Image N)</Select.Option>
            </Select>
          </Form.Item>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="defaultSize" label={t('settings.defaultSize')}>
                <Select placeholder={t('settings.selectSize')} allowClear>
                  <Select.Option value="512x512">512 × 512</Select.Option>
                  <Select.Option value="768x768">768 × 768</Select.Option>
                  <Select.Option value="1024x1024">1024 × 1024</Select.Option>
                  <Select.Option value="1024x768">1024 × 768</Select.Option>
                  <Select.Option value="768x1024">768 × 1024</Select.Option>
                  <Select.Option value="1280x720">1280 × 720 (16:9)</Select.Option>
                  <Select.Option value="720x1280">720 × 1280 (9:16)</Select.Option>
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="defaultSteps" label={t('settings.defaultSteps')}>
                <InputNumber min={1} max={150} placeholder="20" style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>

          {currentProviderType === 'comfyui' && (
            <Form.Item label={t('settings.comfyuiWorkflow')}>
              <WorkflowUploader value={workflowData} onChange={setWorkflowData} />
            </Form.Item>
          )}
        </Form>
      </Modal>
    </div>
  );
};

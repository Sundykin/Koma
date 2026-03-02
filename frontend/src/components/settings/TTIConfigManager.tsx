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
  PictureOutlined,
  NodeIndexOutlined,
  SettingOutlined,
  AppstoreOutlined,
} from '@ant-design/icons';
import type { TTIModelConfig, TTIProviderType } from '../../types';
import type { ChannelConfig } from '../../providers/channel/types';
import {
  loadSettings,
  addTTIConfig,
  updateTTIConfig,
  deleteTTIConfig,
  setDefaultTTIConfig,
  setDefaultChannelConfig,
  TTI_PRESETS,
} from '../../store/globalStore';
import { getChannelConfigs, updateChannelConfig } from '../../store/settings/channelConfig';
import { testTTIConnection } from '../../providers';
import { toUserMessage } from '../../utils/errorMessages';
import { useTranslation } from 'react-i18next';
import { WorkflowUploader } from './WorkflowUploader';
import { ProviderPluginModal } from '../plugins/ProviderPluginModal';

interface TTIConfigManagerProps {
  onConfigChange?: () => void;
}

export const TTIConfigManager: React.FC<TTIConfigManagerProps> = ({ onConfigChange }) => {
  const { message } = App.useApp();
  const { t } = useTranslation('settings');
  const [configs, setConfigs] = useState<TTIModelConfig[]>([]);
  const [pluginChannels, setPluginChannels] = useState<ChannelConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingConfig, setEditingConfig] = useState<TTIModelConfig | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [workflowData, setWorkflowData] = useState<{
    workflowPath?: string;
    workflowMapping?: Record<string, string>;
    workflowJson?: string;
  }>({});
  const [form] = Form.useForm();

  // 插件配置弹窗状态
  const [pluginModalVisible, setPluginModalVisible] = useState(false);
  const [activePluginId, setActivePluginId] = useState<string>('');

  const loadConfigs = async () => {
    setLoading(true);
    try {
      const settings = await loadSettings();
      setConfigs(settings.ttiConfigs || []);
      // 加载插件注册的渠道配置
      const channels = await getChannelConfigs();
      console.log('[TTIConfigManager] 所有渠道配置:', channels);
      console.log('[TTIConfigManager] 所有渠道的 capabilities:', channels.map(c => ({ id: c.id, name: c.name, source: c.source, enabled: c.enabled, capabilities: c.capabilities })));
      const filtered = channels.filter(c =>
        c.source === 'plugin' &&
        c.enabled &&
        c.capabilities.includes('tti')
      );
      console.log('[TTIConfigManager] 过滤后的 TTI 插件渠道:', filtered);
      setPluginChannels(filtered);
    } finally {
      setLoading(false);
    }
  };

  // 打开插件配置弹窗
  const openPluginModal = (pluginId: string) => {
    setActivePluginId(pluginId);
    setPluginModalVisible(true);
  };

  // 关闭插件配置弹窗
  const closePluginModal = () => {
    setPluginModalVisible(false);
    setActivePluginId('');
  };

  // 插件配置保存后刷新渠道列表
  const handlePluginConfigSaved = async () => {
    await loadConfigs();
    onConfigChange?.();
  };

  useEffect(() => {
    loadConfigs();
  }, []);

  const openModal = (config?: TTIModelConfig) => {
    if (config) {
      setEditingConfig(config);
      form.setFieldsValue({
        name: config.name,
        provider: config.provider,
        baseUrl: config.baseUrl,
        apiKey: config.apiKey,
        modelName: config.modelName,
        defaultSize: config.defaultSize,
        defaultSteps: config.defaultSteps,
      });
      setWorkflowData({
        workflowPath: config.workflowPath,
        workflowMapping: config.workflowMapping,
      });
    } else {
      setEditingConfig(null);
      form.resetFields();
      setWorkflowData({});
    }
    setModalVisible(true);
  };

  const handlePresetChange = (provider: TTIProviderType) => {
    const preset = TTI_PRESETS.find(p => p.id === provider);
    if (preset) {
      form.setFieldsValue({
        name: form.getFieldValue('name') || preset.name,
        baseUrl: preset.baseUrl,
        modelName: preset.models?.[0],
      });
    }
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      const configData = {
        name: values.name,
        provider: values.provider as TTIProviderType,
        baseUrl: values.baseUrl,
        apiKey: values.apiKey,
        modelName: values.modelName,
        defaultSize: values.defaultSize,
        defaultSteps: values.defaultSteps,
        workflowPath: workflowData.workflowPath,
        workflowMapping: workflowData.workflowMapping,
        isDefault: editingConfig?.isDefault || configs.length === 0,
      };

      if (editingConfig) {
        await updateTTIConfig(editingConfig.id, configData);
        message.success(t('common.updateSuccess'));
      } else {
        await addTTIConfig(configData);
        message.success(t('common.addSuccess'));
      }

      setModalVisible(false);
      await loadConfigs();
      onConfigChange?.();
    } catch (err: any) {
      if (err.errorFields) return;
      message.error(t('common.saveFailed', { error: toUserMessage(err) }));
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteTTIConfig(id);
      message.success(t('common.deleteSuccess'));
      await loadConfigs();
      onConfigChange?.();
    } catch (err: any) {
      message.error(t('common.deleteFailed', { error: toUserMessage(err) }));
    }
  };

  // 设置内置配置为默认（同时清除插件渠道的默认状态）
  const handleSetDefault = async (id: string) => {
    try {
      // 清除所有插件渠道的默认状态
      for (const channel of pluginChannels) {
        if (channel.isDefault) {
          await updateChannelConfig(channel.id, { isDefault: false });
        }
      }
      // 设置内置配置为默认
      await setDefaultTTIConfig(id);
      message.success(t('common.setDefaultSuccess'));
      await loadConfigs();
      onConfigChange?.();
    } catch (err: any) {
      message.error(t('common.setDefaultFailed', { error: toUserMessage(err) }));
    }
  };

  // 设置插件渠道为默认（同时清除内置配置的默认状态）
  const handleSetChannelDefault = async (id: string) => {
    try {
      // 清除所有内置配置的默认状态
      for (const config of configs) {
        if (config.isDefault) {
          await updateTTIConfig(config.id, { isDefault: false });
        }
      }
      // 设置插件渠道为默认
      await setDefaultChannelConfig(id, 'tti');
      message.success(t('common.setDefaultSuccess'));
      await loadConfigs();
      onConfigChange?.();
    } catch (err: any) {
      message.error(t('common.setDefaultFailed', { error: toUserMessage(err) }));
    }
  };

  const handleTestConnection = async (config: TTIModelConfig) => {
    setTestingId(config.id);
    try {
      const result = await testTTIConnection(config);
      if (result.success) {
        const latency = result.latency ? ` (${result.latency}ms)` : '';
        message.success(t('common.connectionSuccess', { name: config.name, latency }));
      } else {
        message.error(`"${config.name}" ${result.message}`);
      }
    } catch (err: any) {
      message.error(t('common.connectionTestFailed', { error: toUserMessage(err) }));
    } finally {
      setTestingId(null);
    }
  };

  const getProviderLabel = (provider: TTIProviderType) => {
    const preset = TTI_PRESETS.find(p => p.id === provider);
    return preset?.name || provider;
  };

  const getProviderColor = (provider: TTIProviderType) => {
    switch (provider) {
      case 'comfyui': return 'orange';
      case 'dall-e': return 'green';
      case 'midjourney': return 'blue';
      case 'qwen-image': return 'purple';
      case 'jimeng': return 'magenta';
      case 'flux': return 'cyan';
      case 'nano-banana': return 'geekblue';
      case 'gemini-3-pro': return 'volcano';
      default: return 'default';
    }
  };

  const currentProvider = Form.useWatch('provider', form);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <span style={{ fontSize: 14, color: '#888' }}>
            {t('tti.configuredCount', { count: configs.length })}
            {pluginChannels.length > 0 && (
              <span>, {t('tti.pluginChannelCount', { count: pluginChannels.length })}</span>
            )}
          </span>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => openModal()}>
          {t('common.addConfigBtn')}
        </Button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <Spin />
        </div>
      ) : configs.length === 0 && pluginChannels.length === 0 ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={t('tti.emptyDesc')}
        >
          <Button type="primary" icon={<PlusOutlined />} onClick={() => openModal()}>
            {t('tti.addBuiltinBtn')}
          </Button>
        </Empty>
      ) : (
        <Row gutter={[16, 16]}>
          {/* 内置服务配置卡片 */}
          {configs.map((config: TTIModelConfig) => (
            <Col key={config.id} xs={24} sm={12}>
              <Card
                size="small"
                title={
                  <Space>
                    {config.isDefault ? (
                      <StarFilled style={{ color: '#faad14' }} />
                    ) : (
                      <Tooltip title={t('common.setDefault')}>
                        <StarOutlined
                          style={{ cursor: 'pointer', color: '#d9d9d9' }}
                          onClick={() => handleSetDefault(config.id)}
                        />
                      </Tooltip>
                    )}
                    <PictureOutlined />
                    <span>{config.name}</span>
                    <Tag color={getProviderColor(config.provider)}>
                      {getProviderLabel(config.provider)}
                    </Tag>
                  </Space>
                }
                extra={
                  <Space size="small">
                    <Tooltip title={t('common.testConnection')}>
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
                      title={t('common.confirmDelete')}
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
                  {config.modelName && <div><strong>{t('tti.cardModelLabel')}</strong> {config.modelName}</div>}
                  {config.defaultSize && <div><strong>{t('tti.cardDefaultSize')}</strong> {config.defaultSize}</div>}
                  {config.workflowPath && (
                    <div style={{ marginTop: 4 }}>
                      <Tag icon={<NodeIndexOutlined />} color="orange">
                        {t('tti.workflowTag', { path: config.workflowPath })}
                      </Tag>
                    </div>
                  )}
                  {config.baseUrl && (
                    <div style={{ marginTop: 4 }}>
                      <strong>{t('common.cardUrlLabel')}</strong>{' '}
                      <span style={{ fontSize: 12, fontFamily: 'monospace' }}>
                        {config.baseUrl.replace(/https?:\/\//, '').slice(0, 30)}...
                      </span>
                    </div>
                  )}
                </div>
              </Card>
            </Col>
          ))}

          {/* 插件注册的渠道卡片 */}
          {pluginChannels.map((channel) => (
            <Col key={channel.id} xs={24} sm={12}>
              <Card
                size="small"
                title={
                  <Space>
                    {channel.isDefault ? (
                      <StarFilled style={{ color: '#faad14' }} />
                    ) : (
                      <Tooltip title={t('common.setDefault')}>
                        <StarOutlined
                          style={{ cursor: 'pointer', color: '#d9d9d9' }}
                          onClick={() => handleSetChannelDefault(channel.id)}
                        />
                      </Tooltip>
                    )}
                    <AppstoreOutlined />
                    <span>{channel.name}</span>
                    <Tag color="blue">{t('common.pluginTag')}</Tag>
                  </Space>
                }
                extra={
                  channel.pluginId && (
                    <Tooltip title={t('common.configure')}>
                      <Button
                        type="text"
                        size="small"
                        icon={<SettingOutlined />}
                        onClick={() => openPluginModal(channel.pluginId!)}
                      />
                    </Tooltip>
                  )
                }
              >
                <div style={{ fontSize: 13, color: '#666' }}>
                  {channel.description && <div>{channel.description}</div>}
                  <div style={{ marginTop: 4 }}>
                    <strong>Provider:</strong> {channel.providerType}
                  </div>
                </div>
              </Card>
            </Col>
          ))}
        </Row>
      )}

      {/* Provider 插件配置弹窗 */}
      <ProviderPluginModal
        visible={pluginModalVisible}
        pluginId={activePluginId}
        onClose={closePluginModal}
        onConfigSaved={handlePluginConfigSaved}
      />

      <Modal
        title={editingConfig ? t('tti.editTitle') : t('tti.addTitle')}
        open={modalVisible}
        onOk={handleSave}
        onCancel={() => setModalVisible(false)}
        okText={t('common.save')}
        cancelText={t('common.cancel')}
        width={520}
        maskClosable={false}
        destroyOnHidden
        className="dark-modal"
      >
        <Form form={form} layout="vertical" className="mt-4">
          <Form.Item
            name="provider"
            label={t('common.form.providerLabel')}
            rules={[{ required: true, message: t('common.form.providerRequired') }]}
          >
            <Select placeholder={t('tti.form.providerPlaceholder')} onChange={handlePresetChange}>
              {TTI_PRESETS.map(preset => (
                <Select.Option key={preset.id} value={preset.id}>
                  {preset.name}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item
            name="name"
            label={t('common.form.nameLabel')}
            rules={[{ required: true, message: t('common.form.nameRequired') }]}
          >
            <Input placeholder="如: 我的 ComfyUI" />
          </Form.Item>

          {currentProvider !== 'comfyui' && (
            <Form.Item
              name="apiKey"
              label="API Key"
              rules={[{ required: currentProvider !== 'comfyui', message: t('common.form.apiKeyRequired') }]}
            >
              <Input.Password prefix={<KeyOutlined />} placeholder={t('common.form.apiKeyPlaceholder')} />
            </Form.Item>
          )}

          <Form.Item
            name="baseUrl"
            label={t('common.form.baseUrlLabel')}
            rules={[{ required: true, message: t('common.form.baseUrlRequired') }]}
          >
            <Input prefix={<ApiOutlined />} placeholder="如: http://127.0.0.1:8188" />
          </Form.Item>

          {TTI_PRESETS.find(p => p.id === currentProvider)?.models && (
            <Form.Item name="modelName" label={t('tti.form.modelLabel')}>
              <Select placeholder={t('tti.form.modelPlaceholder')} allowClear>
                {TTI_PRESETS.find(p => p.id === currentProvider)?.models?.map(model => (
                  <Select.Option key={model} value={model}>{model}</Select.Option>
                ))}
              </Select>
            </Form.Item>
          )}

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="defaultSize" label={t('tti.form.defaultSizeLabel')}>
                <Select placeholder={t('tti.form.sizePlaceholder')} allowClear>
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
              <Form.Item name="defaultSteps" label={t('tti.form.defaultStepsLabel')}>
                <InputNumber min={1} max={150} placeholder="20" style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>

          {currentProvider === 'comfyui' && (
            <Form.Item label={t('tti.form.workflowLabel')}>
              <WorkflowUploader
                value={workflowData}
                onChange={setWorkflowData}
              />
            </Form.Item>
          )}
        </Form>
      </Modal>
    </div>
  );
};

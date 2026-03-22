import React from 'react';
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
  VideoCameraOutlined,
  SettingOutlined,
  AppstoreOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import type { ITVModelConfig, ITVProviderType } from '../../types';
import {
  addITVConfig,
  updateITVConfig,
  deleteITVConfig,
  setDefaultITVConfig,
  ITV_PRESETS,
} from '../../store/globalStore';
import { ProviderPluginModal } from '../plugins/ProviderPluginModal';
import { createITVProvider } from '../../providers/itv';
import { useMediaConfigManager } from './useMediaConfigManager';

interface ITVConfigManagerProps {
  onConfigChange?: () => void;
}

const itvActions = {
  getConfigs: (settings: any) => settings.itvConfigs || [],
  updateConfig: updateITVConfig,
  setDefaultConfig: setDefaultITVConfig,
  capability: 'itv' as const,
};

export const ITVConfigManager: React.FC<ITVConfigManagerProps> = ({ onConfigChange }) => {
  const { t } = useTranslation();
  const { message } = App.useApp();

  const {
    configs,
    pluginChannels,
    loading,
    modalVisible,
    setModalVisible,
    editingConfig,
    setEditingConfig,
    testingId,
    setTestingId,
    form,
    pluginModalVisible,
    activePluginId,
    loadConfigs,
    openPluginModal,
    closePluginModal,
    handlePluginConfigSaved,
    handleSetDefault,
    handleSetChannelDefault,
  } = useMediaConfigManager<ITVModelConfig>(itvActions, onConfigChange);

  const openModal = (config?: ITVModelConfig) => {
    if (config) {
      setEditingConfig(config);
      form.setFieldsValue({
        name: config.name,
        provider: config.provider,
        baseUrl: config.baseUrl,
        apiKey: config.apiKey,
        modelName: config.modelName,
        promptProtocol: (config as any).promptProtocol,
        defaultDuration: config.defaultDuration,
        defaultResolution: config.defaultResolution,
      });
    } else {
      setEditingConfig(null);
      form.resetFields();
    }
    setModalVisible(true);
  };

  const handlePresetChange = (provider: ITVProviderType) => {
    const preset = ITV_PRESETS.find(p => p.id === provider);
    if (preset) {
      form.setFieldsValue({
        name: form.getFieldValue('name') || preset.name,
        baseUrl: preset.baseUrl,
        modelName: preset.models?.[0] ?? undefined,
      });
    }
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      const configData = {
        name: values.name,
        provider: values.provider as ITVProviderType,
        baseUrl: values.baseUrl,
        apiKey: values.apiKey,
        modelName: values.modelName,
        promptProtocol: values.promptProtocol || undefined,
        defaultDuration: values.defaultDuration,
        defaultResolution: values.defaultResolution,
        isDefault: editingConfig?.isDefault || configs.length === 0,
      };

      if (editingConfig) {
        await updateITVConfig(editingConfig.id, configData);
        message.success(t('settings.configUpdated'));
      } else {
        await addITVConfig(configData);
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
      await deleteITVConfig(id);
      message.success(t('settings.configDeleted'));
      await loadConfigs();
      onConfigChange?.();
    } catch (err: any) {
      message.error(`${t('error.deleteFailed')}: ${err.message}`);
    }
  };

  const handleTestConnection = async (config: ITVModelConfig) => {
    setTestingId(config.id);
    try {
      const provider = createITVProvider(config);

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

  const getProviderLabel = (provider: ITVProviderType) => {
    const preset = ITV_PRESETS.find(p => p.id === provider);
    return preset?.name || provider;
  };

  const getProviderColor = (provider: ITVProviderType) => {
    switch (provider) {
      case 'runway': return 'blue';
      case 'kling': return 'purple';
      case 'pika': return 'magenta';
      case 'minimax': return 'green';
      case 'comfyui-animatediff': return 'orange';
      case 'sora2': return 'geekblue';
      default: return 'default';
    }
  };

  const currentProvider = Form.useWatch('provider', form);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <span style={{ fontSize: 14, color: '#888' }}>
            {t('settings.itvConfigured', { count: configs.length })}
            {pluginChannels.length > 0 && (
              <span>，{t('settings.pluginChannels', { count: pluginChannels.length })}</span>
            )}
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
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={t('settings.noITVConfigs')}
        >
          <Button type="primary" icon={<PlusOutlined />} onClick={() => openModal()}>
            {t('settings.addBuiltinService')}
          </Button>
        </Empty>
      ) : (
        <Row gutter={[16, 16]}>
          {/* 内置服务配置卡片 */}
          {configs.map((config: ITVModelConfig) => (
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
                          onClick={() => handleSetDefault(config.id, message, t)}
                        />
                      </Tooltip>
                    )}
                    <VideoCameraOutlined />
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
                  {config.defaultDuration && <div><strong>{t('settings.defaultDuration')}:</strong> {config.defaultDuration}s</div>}
                  {config.defaultResolution && <div><strong>{t('settings.defaultResolution')}:</strong> {config.defaultResolution}</div>}
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
                      <Tooltip title={t('settings.setAsDefault')}>
                        <StarOutlined
                          style={{ cursor: 'pointer', color: '#d9d9d9' }}
                          onClick={() => handleSetChannelDefault(channel.id, message, t)}
                        />
                      </Tooltip>
                    )}
                    <AppstoreOutlined />
                    <span>{channel.name}</span>
                    <Tag color="blue">{t('plugin.title')}</Tag>
                  </Space>
                }
                extra={
                  channel.pluginId && (
                    <Tooltip title={t('settings.configSettings')}>
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
        title={editingConfig ? t('settings.editITVConfig') : t('settings.addITVConfig')}
        open={modalVisible}
        onOk={handleSave}
        onCancel={() => setModalVisible(false)}
        okText={t('common.save')}
        cancelText={t('common.cancel')}
        width={520}
        mask={{ closable: false }}
        destroyOnHidden
        className="dark-modal"
      >
        <Form form={form} layout="vertical" className="mt-4">
          <Form.Item
            name="provider"
            label={t('settings.provider')}
            required
            rules={[{ required: true, message: `${t('settings.pleaseSelect')} ${t('settings.provider')}` }]}
          >
            <Select placeholder={t('settings.selectITVProvider')} onChange={handlePresetChange}>
              {ITV_PRESETS.map(preset => (
                <Select.Option key={preset.id} value={preset.id}>
                  {preset.name}
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

          {currentProvider !== 'comfyui-animatediff' && (
            <Form.Item
              name="apiKey"
              label={t('settings.apiKey')}
              rules={[{ required: currentProvider !== 'comfyui-animatediff', message: `${t('settings.pleaseEnter')} ${t('settings.apiKey')}` }]}
            >
              <Input.Password prefix={<KeyOutlined />} placeholder={t('settings.enterApiKey')} />
            </Form.Item>
          )}

          <Form.Item
            name="baseUrl"
            label={t('settings.apiAddress')}
            required
            rules={[{ required: true, message: `${t('settings.pleaseEnter')} ${t('settings.apiAddress')}` }]}
          >
            <Input prefix={<ApiOutlined />} placeholder="https://api.klingai.com" />
          </Form.Item>

          <Form.Item
            name="modelName"
            label={t('settings.model')}
          >
            <Select
              placeholder={t('settings.selectModel')}
              allowClear
              showSearch
              options={
                ITV_PRESETS.find(p => p.id === currentProvider)?.models?.map(m => ({ label: m, value: m })) || []
              }
            />
          </Form.Item>

          <Form.Item
            name="promptProtocol"
            label="Prompt 编译协议"
            tooltip="为特定渠道启用提示词编译与参考图数组对齐（例如 Grok 的 @Image N 协议）。"
          >
            <Select allowClear placeholder="不启用（默认）">
              <Select.Option value="grok-image-index">grok-image-index (@Image N)</Select.Option>
            </Select>
          </Form.Item>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="defaultDuration" label={`${t('settings.defaultDuration')} (s)`}>
                <InputNumber min={1} max={60} placeholder="5" style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="defaultResolution" label={t('settings.defaultResolution')}>
                <Select placeholder={t('settings.selectSize')} allowClear>
                  <Select.Option value="1280x720">1280 × 720 (720p)</Select.Option>
                  <Select.Option value="1920x1080">1920 × 1080 (1080p)</Select.Option>
                  <Select.Option value="720x1280">720 × 1280 ({t('settings.portrait')})</Select.Option>
                  <Select.Option value="1080x1920">1080 × 1920 ({t('settings.portrait')})</Select.Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>
    </div>
  );
};

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
  VideoCameraOutlined,
  SettingOutlined,
  AppstoreOutlined,
} from '@ant-design/icons';
import type { ITVModelConfig, ITVProviderType } from '../../types';
import type { ChannelConfig } from '../../providers/channel/types';
import {
  loadSettings,
  addITVConfig,
  updateITVConfig,
  deleteITVConfig,
  setDefaultITVConfig,
  setDefaultChannelConfig,
  ITV_PRESETS,
} from '../../store/globalStore';
import { getChannelConfigs, updateChannelConfig } from '../../store/settings/channelConfig';
import { testITVConnection } from '../../providers';
import { itvRegistry } from '../../providers/registry';
import { toUserMessage } from '../../utils/errorMessages';
import { ProviderPluginModal } from '../plugins/ProviderPluginModal';

interface ITVConfigManagerProps {
  onConfigChange?: () => void;
}

export const ITVConfigManager: React.FC<ITVConfigManagerProps> = ({ onConfigChange }) => {
  const { message } = App.useApp();
  const [configs, setConfigs] = useState<ITVModelConfig[]>([]);
  const [pluginChannels, setPluginChannels] = useState<ChannelConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingConfig, setEditingConfig] = useState<ITVModelConfig | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [form] = Form.useForm();

  // 插件配置弹窗状态
  const [pluginModalVisible, setPluginModalVisible] = useState(false);
  const [activePluginId, setActivePluginId] = useState<string>('');

  const loadConfigs = async () => {
    setLoading(true);
    try {
      const settings = await loadSettings();
      setConfigs(settings.itvConfigs || []);
      // 加载插件注册的渠道配置
      const channels = await getChannelConfigs();
      console.log('[ITVConfigManager] 所有渠道配置:', channels);
      console.log('[ITVConfigManager] 所有渠道的 capabilities:', channels.map(c => ({ id: c.id, name: c.name, source: c.source, enabled: c.enabled, capabilities: c.capabilities })));
      const filtered = channels.filter(c =>
        c.source === 'plugin' &&
        c.enabled &&
        c.capabilities.includes('itv')
      );
      console.log('[ITVConfigManager] 过滤后的 ITV 插件渠道:', filtered);
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

  const openModal = (config?: ITVModelConfig) => {
    if (config) {
      setEditingConfig(config);
      form.setFieldsValue({
        name: config.name,
        provider: config.provider,
        baseUrl: config.baseUrl,
        apiKey: config.apiKey,
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
        defaultDuration: values.defaultDuration,
        defaultResolution: values.defaultResolution,
        isDefault: editingConfig?.isDefault || configs.length === 0,
      };

      if (editingConfig) {
        await updateITVConfig(editingConfig.id, configData);
        message.success('配置已更新');
      } else {
        await addITVConfig(configData);
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
      await deleteITVConfig(id);
      message.success('配置已删除');
      await loadConfigs();
      onConfigChange?.();
    } catch (err: any) {
      message.error(`删除失败: ${err.message}`);
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
      await setDefaultITVConfig(id);
      message.success('已设为默认');
      await loadConfigs();
      onConfigChange?.();
    } catch (err: any) {
      message.error(`设置失败: ${err.message}`);
    }
  };

  // 设置插件渠道为默认（同时清除内置配置的默认状态）
  const handleSetChannelDefault = async (id: string) => {
    try {
      // 清除所有内置配置的默认状态
      for (const config of configs) {
        if (config.isDefault) {
          await updateITVConfig(config.id, { isDefault: false });
        }
      }
      // 设置插件渠道为默认
      await setDefaultChannelConfig(id, 'itv');
      message.success('已设为默认');
      await loadConfigs();
      onConfigChange?.();
    } catch (err: any) {
      message.error(`设置失败: ${err.message}`);
    }
  };

  const handleTestConnection = async (config: ITVModelConfig) => {
    setTestingId(config.id);
    try {
      const result = await testITVConnection(config);
      if (result.success) {
        const latency = result.latency ? ` (${result.latency}ms)` : '';
        message.success(`"${config.name}" 连接成功${latency}`);
      } else {
        message.error(`"${config.name}" ${result.message}`);
      }
    } catch (err: any) {
      message.error(`连接测试失败: ${toUserMessage(err)}`);
    } finally {
      setTestingId(null);
    }
  };

  const getProviderLabel = (provider: ITVProviderType) => {
    const preset = ITV_PRESETS.find(p => p.id === provider);
    return preset?.name || provider;
  };

  const isComingSoon = (provider: ITVProviderType): boolean => {
    const def = itvRegistry.get(provider);
    return def?.status === 'coming-soon';
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
            已配置 <strong>{configs.length}</strong> 个图生视频服务
            {pluginChannels.length > 0 && (
              <span>，<strong>{pluginChannels.length}</strong> 个插件渠道</span>
            )}
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
      ) : configs.length === 0 && pluginChannels.length === 0 ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="还没有配置任何图生视频服务"
        >
          <Button type="primary" icon={<PlusOutlined />} onClick={() => openModal()}>
            添加内置服务
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
                      <Tooltip title="设为默认">
                        <StarOutlined
                          style={{ cursor: 'pointer', color: '#d9d9d9' }}
                          onClick={() => handleSetDefault(config.id)}
                        />
                      </Tooltip>
                    )}
                    <VideoCameraOutlined />
                    <span>{config.name}</span>
                    <Tag color={getProviderColor(config.provider)}>
                      {getProviderLabel(config.provider)}
                    </Tag>
                    {isComingSoon(config.provider) && (
                      <Tag color="default">即将支持</Tag>
                    )}
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
                  {config.defaultDuration && <div><strong>默认时长:</strong> {config.defaultDuration}s</div>}
                  {config.defaultResolution && <div><strong>默认分辨率:</strong> {config.defaultResolution}</div>}
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
                      <Tooltip title="设为默认">
                        <StarOutlined
                          style={{ cursor: 'pointer', color: '#d9d9d9' }}
                          onClick={() => handleSetChannelDefault(channel.id)}
                        />
                      </Tooltip>
                    )}
                    <AppstoreOutlined />
                    <span>{channel.name}</span>
                    <Tag color="blue">插件</Tag>
                  </Space>
                }
                extra={
                  channel.pluginId && (
                    <Tooltip title="配置">
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
        title={editingConfig ? '编辑图生视频配置' : '添加图生视频配置'}
        open={modalVisible}
        onOk={handleSave}
        onCancel={() => setModalVisible(false)}
        okText="保存"
        cancelText="取消"
        width={520}
        maskClosable={false}
        destroyOnHidden
        className="dark-modal"
      >
        <Form form={form} layout="vertical" className="mt-4">
          <Form.Item
            name="provider"
            label="服务商"
            rules={[{ required: true, message: '请选择服务商' }]}
          >
            <Select placeholder="选择图生视频服务商" onChange={handlePresetChange}>
              {ITV_PRESETS.map(preset => (
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
            <Input placeholder="如: 我的可灵账号" />
          </Form.Item>

          {currentProvider !== 'comfyui-animatediff' && (
            <Form.Item
              name="apiKey"
              label="API Key"
              rules={[{ required: currentProvider !== 'comfyui-animatediff', message: '请输入 API Key' }]}
            >
              <Input.Password prefix={<KeyOutlined />} placeholder="输入 API Key" />
            </Form.Item>
          )}

          <Form.Item
            name="baseUrl"
            label="API 地址"
            rules={[{ required: true, message: '请输入 API 地址' }]}
          >
            <Input prefix={<ApiOutlined />} placeholder="如: https://api.klingai.com" />
          </Form.Item>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="defaultDuration" label="默认时长 (秒)">
                <InputNumber min={1} max={60} placeholder="5" style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="defaultResolution" label="默认分辨率">
                <Select placeholder="选择分辨率" allowClear>
                  <Select.Option value="1280x720">1280 × 720 (720p)</Select.Option>
                  <Select.Option value="1920x1080">1920 × 1080 (1080p)</Select.Option>
                  <Select.Option value="720x1280">720 × 1280 (竖屏)</Select.Option>
                  <Select.Option value="1080x1920">1080 × 1920 (竖屏)</Select.Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>
    </div>
  );
};

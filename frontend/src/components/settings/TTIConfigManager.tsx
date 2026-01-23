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
  Divider,
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
} from '@ant-design/icons';
import type { TTIModelConfig, TTIProviderType } from '../../types';
import type { UnifiedChannelConfig } from '../../providers/channel/types';
import {
  loadSettings,
  addTTIConfig,
  updateTTIConfig,
  deleteTTIConfig,
  setDefaultTTIConfig,
  TTI_PRESETS,
  getUnifiedChannels,
  addUnifiedChannel,
  updateUnifiedChannel,
  deleteUnifiedChannel,
  testUnifiedChannel,
} from '../../store/globalStore';
import { WorkflowUploader } from './WorkflowUploader';
import { getChannelCapabilities } from '../../providers/channel/types';

interface TTIConfigManagerProps {
  onConfigChange?: () => void;
}

export const TTIConfigManager: React.FC<TTIConfigManagerProps> = ({ onConfigChange }) => {
  const { message } = App.useApp();
  const [configs, setConfigs] = useState<TTIModelConfig[]>([]);
  const [unifiedChannels, setUnifiedChannels] = useState<UnifiedChannelConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [channelModalVisible, setChannelModalVisible] = useState(false);
  const [editingConfig, setEditingConfig] = useState<TTIModelConfig | null>(null);
  const [editingChannel, setEditingChannel] = useState<UnifiedChannelConfig | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [workflowData, setWorkflowData] = useState<{
    workflowPath?: string;
    workflowMapping?: Record<string, string>;
    workflowJson?: string;
  }>({});
  const [form] = Form.useForm();
  const [channelForm] = Form.useForm();

  const loadConfigs = async () => {
    setLoading(true);
    try {
      const settings = await loadSettings();
      setConfigs(settings.ttiConfigs || []);
      // 加载具有 TTI 能力的统一渠道
      const channels = await getUnifiedChannels();
      setUnifiedChannels(channels.filter(c => c.tti && c.enabled));
    } finally {
      setLoading(false);
    }
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
        message.success('配置已更新');
      } else {
        await addTTIConfig(configData);
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
      await deleteTTIConfig(id);
      message.success('配置已删除');
      await loadConfigs();
      onConfigChange?.();
    } catch (err: any) {
      message.error(`删除失败: ${err.message}`);
    }
  };

  const handleSetDefault = async (id: string) => {
    try {
      await setDefaultTTIConfig(id);
      message.success('已设为默认');
      await loadConfigs();
      onConfigChange?.();
    } catch (err: any) {
      message.error(`设置失败: ${err.message}`);
    }
  };

  const handleTestConnection = async (config: TTIModelConfig) => {
    setTestingId(config.id);
    try {
      // TODO: 实现 TTI 连接测试
      await new Promise(resolve => setTimeout(resolve, 1000));
      message.success(`"${config.name}" 连接成功`);
    } catch (err: any) {
      message.error(`连接测试失败: ${err.message}`);
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

  // 打开自定义渠道 Modal
  const openChannelModal = (channel?: UnifiedChannelConfig) => {
    if (channel) {
      setEditingChannel(channel);
      channelForm.setFieldsValue({
        channelName: channel.name,
        channelDescription: channel.description,
        channelBaseUrl: channel.baseUrl,
        channelAuthType: channel.auth.type,
        channelApiKey: channel.auth.keyValue,
        channelPollingInterval: channel.polling.interval,
        channelPollingMaxDuration: channel.polling.maxDuration,
      });
    } else {
      setEditingChannel(null);
      channelForm.resetFields();
    }
    setChannelModalVisible(true);
  };

  // 保存自定义渠道
  const handleSaveChannel = async () => {
    try {
      const values = await channelForm.validateFields();

      const channelConfig: Omit<UnifiedChannelConfig, 'id' | 'createdAt' | 'updatedAt'> = {
        name: values.channelName,
        description: values.channelDescription,
        baseUrl: values.channelBaseUrl,
        auth: {
          type: values.channelAuthType || 'bearer',
          keyValue: values.channelApiKey || '',
        },
        polling: {
          interval: values.channelPollingInterval || 5000,
          maxDuration: values.channelPollingMaxDuration || 600000,
          initialDelay: 3000,
        },
        enabled: true,
        tti: {
          generate: {
            url: values.ttiGenerateUrl || `{{baseUrl}}/v1/images/generations`,
            method: values.ttiGenerateMethod || 'POST',
            bodyTemplate: values.ttiGenerateBody || '{}',
            responseMapping: { taskId: values.ttiGenerateTaskIdPath || '$.id' },
          },
          query: {
            url: values.ttiQueryUrl || `{{baseUrl}}/v1/images/generations/{{taskId}}`,
            method: values.ttiQueryMethod || 'GET',
            responseMapping: {
              status: values.ttiQueryStatusPath || '$.status',
              progress: values.ttiQueryProgressPath || '$.progress',
              resultUrl: values.ttiQueryResultPath || '$.result.data[0].url',
              error: values.ttiQueryErrorPath || '$.error.message',
            },
            statusMapping: {
              pending: ['queued', 'pending'],
              processing: ['in_progress', 'processing'],
              completed: ['completed', 'succeeded'],
              failed: ['failed', 'error'],
            },
          },
        },
      };

      if (editingChannel) {
        await updateUnifiedChannel(editingChannel.id, channelConfig);
        message.success('自定义渠道已更新');
      } else {
        await addUnifiedChannel(channelConfig);
        message.success('自定义渠道已添加');
      }

      setChannelModalVisible(false);
      await loadConfigs();
      onConfigChange?.();
    } catch (err: any) {
      if (err.errorFields) return;
      message.error(`保存失败: ${err.message}`);
    }
  };

  // 删除自定义渠道
  const handleDeleteChannel = async (id: string) => {
    try {
      await deleteUnifiedChannel(id);
      message.success('自定义渠道已删除');
      await loadConfigs();
      onConfigChange?.();
    } catch (err: any) {
      message.error(`删除失败: ${err.message}`);
    }
  };

  // 测试自定义渠道连接
  const handleTestChannelConnection = async (channel: UnifiedChannelConfig) => {
    setTestingId(channel.id);
    try {
      const result = await testUnifiedChannel(channel, 'tti');
      if (result) {
        message.success(`"${channel.name}" 连接成功`);
      } else {
        message.error('连接测试失败，请检查配置');
      }
    } catch (err: any) {
      message.error(`测试失败: ${err.message}`);
    } finally {
      setTestingId(null);
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <span style={{ fontSize: 14, color: '#888' }}>
            已配置 <strong>{configs.length}</strong> 个文生图服务
            {unifiedChannels.length > 0 && (
              <span>，<strong>{unifiedChannels.length}</strong> 个自定义渠道</span>
            )}
          </span>
        </div>
        <Space>
          <Button icon={<SettingOutlined />} onClick={() => openChannelModal()}>
            添加自定义渠道
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => openModal()}>
            添加配置
          </Button>
        </Space>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <Spin />
        </div>
      ) : configs.length === 0 && unifiedChannels.length === 0 ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="还没有配置任何文生图服务"
        >
          <Space>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => openModal()}>
              添加内置服务
            </Button>
            <Button icon={<SettingOutlined />} onClick={() => openChannelModal()}>
              添加自定义渠道
            </Button>
          </Space>
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
                      <Tooltip title="设为默认">
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
                  {config.modelName && <div><strong>模型:</strong> {config.modelName}</div>}
                  {config.defaultSize && <div><strong>默认尺寸:</strong> {config.defaultSize}</div>}
                  {config.workflowPath && (
                    <div style={{ marginTop: 4 }}>
                      <Tag icon={<NodeIndexOutlined />} color="orange">
                        工作流: {config.workflowPath}
                      </Tag>
                    </div>
                  )}
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

          {/* 自定义渠道卡片 */}
          {unifiedChannels.map((channel) => (
            <Col key={channel.id} xs={24} sm={12}>
              <Card
                size="small"
                title={
                  <Space>
                    <SettingOutlined />
                    <span>{channel.name}</span>
                    <Tag color="purple">自定义</Tag>
                  </Space>
                }
                extra={
                  <Space size="small">
                    <Tooltip title="测试连接">
                      <Button
                        type="text"
                        size="small"
                        icon={testingId === channel.id ? <LoadingOutlined /> : <CheckCircleOutlined />}
                        onClick={() => handleTestChannelConnection(channel)}
                        disabled={testingId === channel.id}
                      />
                    </Tooltip>
                    <Tooltip title="编辑">
                      <Button
                        type="text"
                        size="small"
                        icon={<EditOutlined />}
                        onClick={() => openChannelModal(channel)}
                      />
                    </Tooltip>
                    <Popconfirm
                      title="确定删除此自定义渠道？"
                      onConfirm={() => handleDeleteChannel(channel.id)}
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
                  {channel.description && <div>{channel.description}</div>}
                  <div style={{ marginTop: 4 }}>
                    <strong>地址:</strong>{' '}
                    <span style={{ fontSize: 12, fontFamily: 'monospace' }}>
                      {channel.baseUrl.replace(/https?:\/\//, '').slice(0, 30)}...
                    </span>
                  </div>
                </div>
              </Card>
            </Col>
          ))}
        </Row>
      )}

      <Modal
        title={editingConfig ? '编辑文生图配置' : '添加文生图配置'}
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
            <Select placeholder="选择文生图服务商" onChange={handlePresetChange}>
              {TTI_PRESETS.map(preset => (
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
            <Input placeholder="如: 我的 ComfyUI" />
          </Form.Item>

          {currentProvider !== 'comfyui' && (
            <Form.Item
              name="apiKey"
              label="API Key"
              rules={[{ required: currentProvider !== 'comfyui', message: '请输入 API Key' }]}
            >
              <Input.Password prefix={<KeyOutlined />} placeholder="输入 API Key" />
            </Form.Item>
          )}

          <Form.Item
            name="baseUrl"
            label="API 地址"
            rules={[{ required: true, message: '请输入 API 地址' }]}
          >
            <Input prefix={<ApiOutlined />} placeholder="如: http://127.0.0.1:8188" />
          </Form.Item>

          {TTI_PRESETS.find(p => p.id === currentProvider)?.models && (
            <Form.Item name="modelName" label="模型">
              <Select placeholder="选择模型" allowClear>
                {TTI_PRESETS.find(p => p.id === currentProvider)?.models?.map(model => (
                  <Select.Option key={model} value={model}>{model}</Select.Option>
                ))}
              </Select>
            </Form.Item>
          )}

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="defaultSize" label="默认尺寸">
                <Select placeholder="选择尺寸" allowClear>
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
              <Form.Item name="defaultSteps" label="默认步数">
                <InputNumber min={1} max={150} placeholder="20" style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>

          {currentProvider === 'comfyui' && (
            <Form.Item label="ComfyUI 工作流">
              <WorkflowUploader
                value={workflowData}
                onChange={setWorkflowData}
              />
            </Form.Item>
          )}
        </Form>
      </Modal>

      {/* 自定义渠道 Modal */}
      <Modal
        title={editingChannel ? '编辑自定义渠道' : '添加自定义渠道'}
        open={channelModalVisible}
        onOk={handleSaveChannel}
        onCancel={() => setChannelModalVisible(false)}
        okText="保存"
        cancelText="取消"
        width={700}
        maskClosable={false}
        destroyOnHidden
      >
        <Form form={channelForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            name="channelName"
            label="渠道名称"
            rules={[{ required: true, message: '请输入渠道名称' }]}
          >
            <Input placeholder="如: 我的 Gemini 3 Pro" />
          </Form.Item>

          <Form.Item name="channelDescription" label="描述">
            <Input placeholder="可选描述" />
          </Form.Item>

          <Form.Item
            name="channelBaseUrl"
            label="Base URL"
            rules={[{ required: true, message: '请输入 Base URL' }]}
          >
            <Input prefix={<ApiOutlined />} placeholder="https://toapis.com" />
          </Form.Item>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="channelAuthType" label="鉴权方式" initialValue="bearer">
                <Select>
                  <Select.Option value="bearer">Bearer Token</Select.Option>
                  <Select.Option value="header">自定义 Header</Select.Option>
                  <Select.Option value="query">Query 参数</Select.Option>
                  <Select.Option value="none">无鉴权</Select.Option>
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="channelApiKey" label="API Key">
                <Input.Password prefix={<KeyOutlined />} placeholder="输入 API Key" />
              </Form.Item>
            </Col>
          </Row>

          <Divider>接口配置</Divider>

          {/* 生成接口 */}
          <div style={{ background: '#fafafa', padding: 12, borderRadius: 4, marginBottom: 12 }}>
            <div style={{ fontWeight: 500, marginBottom: 8 }}>生成接口</div>
            <Row gutter={16}>
              <Col span={18}>
                <Form.Item
                  name="ttiGenerateUrl"
                  label="URL"
                  initialValue="{{baseUrl}}/v1/images/generations"
                >
                  <Input placeholder="{{baseUrl}}/v1/images/generations" />
                </Form.Item>
              </Col>
              <Col span={6}>
                <Form.Item name="ttiGenerateMethod" label="方法" initialValue="POST">
                  <Select>
                    <Select.Option value="POST">POST</Select.Option>
                    <Select.Option value="PUT">PUT</Select.Option>
                  </Select>
                </Form.Item>
              </Col>
            </Row>
            <Form.Item
              name="ttiGenerateBody"
              label="请求体模板"
              initialValue='{"model": "{{model}}", "prompt": "{{prompt}}", "n": 1, "size": "{{size}}"}'
            >
              <Input.TextArea rows={3} style={{ fontFamily: 'monospace', fontSize: 12 }} />
            </Form.Item>
            <Form.Item name="ttiGenerateTaskIdPath" label="TaskId 路径" initialValue="$.id">
              <Input placeholder="$.id" />
            </Form.Item>
          </div>

          {/* 查询接口 */}
          <div style={{ background: '#fafafa', padding: 12, borderRadius: 4, marginBottom: 12 }}>
            <div style={{ fontWeight: 500, marginBottom: 8 }}>查询接口</div>
            <Row gutter={16}>
              <Col span={18}>
                <Form.Item
                  name="ttiQueryUrl"
                  label="URL"
                  initialValue="{{baseUrl}}/v1/images/generations/{{taskId}}"
                >
                  <Input placeholder="{{baseUrl}}/v1/images/generations/{{taskId}}" />
                </Form.Item>
              </Col>
              <Col span={6}>
                <Form.Item name="ttiQueryMethod" label="方法" initialValue="GET">
                  <Select>
                    <Select.Option value="GET">GET</Select.Option>
                    <Select.Option value="POST">POST</Select.Option>
                  </Select>
                </Form.Item>
              </Col>
            </Row>
            <Row gutter={16}>
              <Col span={12}>
                <Form.Item name="ttiQueryStatusPath" label="状态路径" initialValue="$.status">
                  <Input placeholder="$.status" />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="ttiQueryResultPath" label="结果URL路径" initialValue="$.result.data[0].url">
                  <Input placeholder="$.result.data[0].url" />
                </Form.Item>
              </Col>
            </Row>
          </div>

          <Divider>轮询配置</Divider>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="channelPollingInterval" label="轮询间隔(ms)" initialValue={3000}>
                <InputNumber min={1000} max={60000} step={1000} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="channelPollingMaxDuration" label="最大等待(ms)" initialValue={120000}>
                <InputNumber min={60000} max={600000} step={60000} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>
    </div>
  );
};

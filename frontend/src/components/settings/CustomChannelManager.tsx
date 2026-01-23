/**
 * 自定义渠道配置管理器
 * 允许用户通过 JSON 配置添加自定义渠道
 */
import React, { useState, useEffect } from 'react';
import {
  Card,
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
  Collapse,
  Typography,
  Alert,
  InputNumber,
  Divider,
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  CheckCircleOutlined,
  ApiOutlined,
  CodeOutlined,
  LoadingOutlined,
  CopyOutlined,
} from '@ant-design/icons';
import type { ChannelConfig, ChannelType } from '../../providers/channel/types';
import { validateChannelConfig, CHANNEL_TEMPLATES } from '../../providers/channel';

const { TextArea } = Input;
const { Text, Paragraph } = Typography;
const { Panel } = Collapse;

// 渠道类型选项
const CHANNEL_TYPE_OPTIONS: { value: ChannelType; label: string }[] = [
  { value: 'tti', label: '文生图 (TTI)' },
  { value: 'itv', label: '图生视频 (ITV)' },
  { value: 'character', label: '角色提取' },
  { value: 'remix', label: '视频混音' },
  { value: 'tts', label: '语音合成 (TTS)' },
];

// 鉴权类型选项
const AUTH_TYPE_OPTIONS = [
  { value: 'bearer', label: 'Bearer Token' },
  { value: 'header', label: '自定义 Header' },
  { value: 'query', label: 'Query 参数' },
  { value: 'none', label: '无鉴权' },
];

interface CustomChannelManagerProps {
  channels: ChannelConfig[];
  onAdd: (config: ChannelConfig) => Promise<void>;
  onUpdate: (id: string, config: Partial<ChannelConfig>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onTest?: (config: ChannelConfig) => Promise<boolean>;
}

export const CustomChannelManager: React.FC<CustomChannelManagerProps> = ({
  channels,
  onAdd,
  onUpdate,
  onDelete,
  onTest,
}) => {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingChannel, setEditingChannel] = useState<ChannelConfig | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [jsonMode, setJsonMode] = useState(false);
  const [jsonValue, setJsonValue] = useState('');
  const [form] = Form.useForm();

  // 生成唯一 ID
  const generateId = () => `channel_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

  // 打开新增/编辑对话框
  const openModal = (channel?: ChannelConfig) => {
    if (channel) {
      setEditingChannel(channel);
      form.setFieldsValue({
        name: channel.name,
        type: channel.type,
        description: channel.description,
        baseUrl: channel.baseUrl,
        authType: channel.auth.type,
        authKeyName: channel.auth.keyName,
        authKeyValue: channel.auth.keyValue,
        generateUrl: channel.generate.url,
        generateMethod: channel.generate.method,
        generateBodyTemplate: channel.generate.bodyTemplate,
        generateTaskIdPath: channel.generate.responseMapping.taskId,
        queryUrl: channel.query.url,
        queryMethod: channel.query.method,
        queryStatusPath: channel.query.responseMapping.status,
        queryProgressPath: channel.query.responseMapping.progress,
        queryResultUrlPath: channel.query.responseMapping.resultUrl,
        queryErrorPath: channel.query.responseMapping.error,
        statusPending: channel.query.statusMapping.pending.join(', '),
        statusProcessing: channel.query.statusMapping.processing.join(', '),
        statusCompleted: channel.query.statusMapping.completed.join(', '),
        statusFailed: channel.query.statusMapping.failed.join(', '),
        pollingInterval: channel.polling.interval,
        pollingMaxDuration: channel.polling.maxDuration,
      });
      setJsonValue(JSON.stringify(channel, null, 2));
    } else {
      setEditingChannel(null);
      form.resetFields();
      setJsonValue('');
    }
    setModalVisible(true);
    setJsonMode(false);
  };

  // 应用模板
  const applyTemplate = (templateId: string) => {
    const template = CHANNEL_TEMPLATES[templateId];
    if (template) {
      form.setFieldsValue({
        type: template.type,
        baseUrl: template.baseUrl,
        authType: template.auth?.type,
        generateUrl: template.generate?.url,
        generateMethod: template.generate?.method,
        generateBodyTemplate: template.generate?.bodyTemplate,
        generateTaskIdPath: template.generate?.responseMapping?.taskId,
        queryUrl: template.query?.url,
        queryMethod: template.query?.method,
        queryStatusPath: template.query?.responseMapping?.status,
        queryProgressPath: template.query?.responseMapping?.progress,
        queryResultUrlPath: template.query?.responseMapping?.resultUrl,
        queryErrorPath: template.query?.responseMapping?.error,
        statusPending: template.query?.statusMapping?.pending?.join(', '),
        statusProcessing: template.query?.statusMapping?.processing?.join(', '),
        statusCompleted: template.query?.statusMapping?.completed?.join(', '),
        statusFailed: template.query?.statusMapping?.failed?.join(', '),
        pollingInterval: template.polling?.interval,
        pollingMaxDuration: template.polling?.maxDuration,
      });
      message.success('已应用模板');
    }
  };

  // 构建配置对象
  const buildConfig = (values: any): ChannelConfig => {
    const now = Date.now();
    return {
      id: editingChannel?.id || generateId(),
      name: values.name,
      type: values.type,
      description: values.description,
      baseUrl: values.baseUrl,
      auth: {
        type: values.authType,
        keyName: values.authKeyName,
        keyValue: values.authKeyValue || '',
      },
      generate: {
        url: values.generateUrl,
        method: values.generateMethod || 'POST',
        bodyTemplate: values.generateBodyTemplate,
        responseMapping: {
          taskId: values.generateTaskIdPath,
        },
      },
      query: {
        url: values.queryUrl,
        method: values.queryMethod || 'GET',
        responseMapping: {
          status: values.queryStatusPath,
          progress: values.queryProgressPath,
          resultUrl: values.queryResultUrlPath,
          error: values.queryErrorPath,
        },
        statusMapping: {
          pending: (values.statusPending || '').split(',').map((s: string) => s.trim()).filter(Boolean),
          processing: (values.statusProcessing || '').split(',').map((s: string) => s.trim()).filter(Boolean),
          completed: (values.statusCompleted || '').split(',').map((s: string) => s.trim()).filter(Boolean),
          failed: (values.statusFailed || '').split(',').map((s: string) => s.trim()).filter(Boolean),
        },
      },
      polling: {
        interval: values.pollingInterval || 5000,
        maxDuration: values.pollingMaxDuration || 300000,
      },
      enabled: true,
      createdAt: editingChannel?.createdAt || now,
      updatedAt: now,
    };
  };

  // 保存
  const handleSave = async () => {
    try {
      let config: ChannelConfig;

      if (jsonMode) {
        // JSON 模式
        try {
          config = JSON.parse(jsonValue);
          if (!config.id) {
            config.id = generateId();
          }
          config.updatedAt = Date.now();
          if (!config.createdAt) {
            config.createdAt = Date.now();
          }
        } catch (e) {
          message.error('JSON 格式错误');
          return;
        }
      } else {
        // 表单模式
        const values = await form.validateFields();
        config = buildConfig(values);
      }

      // 验证配置
      const validation = validateChannelConfig(config);
      if (!validation.valid) {
        message.error(`配置验证失败: ${validation.errors.join(', ')}`);
        return;
      }
      if (validation.warnings.length > 0) {
        message.warning(`警告: ${validation.warnings.join(', ')}`);
      }

      setLoading(true);
      if (editingChannel) {
        await onUpdate(editingChannel.id, config);
        message.success('渠道配置已更新');
      } else {
        await onAdd(config);
        message.success('渠道配置已添加');
      }
      setModalVisible(false);
    } catch (err: any) {
      if (err.errorFields) return;
      message.error(`保存失败: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // 删除
  const handleDelete = async (id: string) => {
    try {
      await onDelete(id);
      message.success('渠道配置已删除');
    } catch (err: any) {
      message.error(`删除失败: ${err.message}`);
    }
  };

  // 测试连接
  const handleTest = async (config: ChannelConfig) => {
    if (!onTest) return;
    setTestingId(config.id);
    try {
      const success = await onTest(config);
      if (success) {
        message.success(`"${config.name}" 连接成功`);
      } else {
        message.error(`"${config.name}" 连接失败`);
      }
    } catch (err: any) {
      message.error(`连接测试失败: ${err.message}`);
    } finally {
      setTestingId(null);
    }
  };

  // 复制配置
  const handleCopy = (config: ChannelConfig) => {
    navigator.clipboard.writeText(JSON.stringify(config, null, 2));
    message.success('配置已复制到剪贴板');
  };

  const getTypeColor = (type: ChannelType) => {
    switch (type) {
      case 'tti': return 'blue';
      case 'itv': return 'green';
      case 'character': return 'purple';
      case 'remix': return 'orange';
      case 'tts': return 'cyan';
      default: return 'default';
    }
  };

  const getTypeLabel = (type: ChannelType) => {
    return CHANNEL_TYPE_OPTIONS.find(o => o.value === type)?.label || type;
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <Text type="secondary">
            已配置 <strong>{channels.length}</strong> 个自定义渠道
          </Text>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => openModal()}>
          添加自定义渠道
        </Button>
      </div>

      {channels.length === 0 ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="还没有配置任何自定义渠道"
        >
          <Button type="primary" icon={<PlusOutlined />} onClick={() => openModal()}>
            添加第一个自定义渠道
          </Button>
        </Empty>
      ) : (
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          {channels.map(channel => (
            <Card
              key={channel.id}
              size="small"
              title={
                <Space>
                  <ApiOutlined />
                  <span>{channel.name}</span>
                  <Tag color={getTypeColor(channel.type)}>{getTypeLabel(channel.type)}</Tag>
                  {!channel.enabled && <Tag color="red">已禁用</Tag>}
                </Space>
              }
              extra={
                <Space size="small">
                  {onTest && (
                    <Tooltip title="测试连接">
                      <Button
                        type="text"
                        size="small"
                        icon={testingId === channel.id ? <LoadingOutlined /> : <CheckCircleOutlined />}
                        onClick={() => handleTest(channel)}
                        disabled={testingId === channel.id}
                      />
                    </Tooltip>
                  )}
                  <Tooltip title="复制配置">
                    <Button
                      type="text"
                      size="small"
                      icon={<CopyOutlined />}
                      onClick={() => handleCopy(channel)}
                    />
                  </Tooltip>
                  <Tooltip title="编辑">
                    <Button
                      type="text"
                      size="small"
                      icon={<EditOutlined />}
                      onClick={() => openModal(channel)}
                    />
                  </Tooltip>
                  <Popconfirm
                    title="确定删除此渠道配置？"
                    onConfirm={() => handleDelete(channel.id)}
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
                {channel.description && <div style={{ marginBottom: 4 }}>{channel.description}</div>}
                <div><strong>Base URL:</strong> <Text code>{channel.baseUrl}</Text></div>
                <div><strong>鉴权:</strong> {AUTH_TYPE_OPTIONS.find(o => o.value === channel.auth.type)?.label}</div>
              </div>
            </Card>
          ))}
        </Space>
      )}

      <Modal
        title={editingChannel ? '编辑自定义渠道' : '添加自定义渠道'}
        open={modalVisible}
        onOk={handleSave}
        onCancel={() => setModalVisible(false)}
        okText="保存"
        cancelText="取消"
        confirmLoading={loading}
        width={720}
        maskClosable={false}
        destroyOnHidden
      >
        <div style={{ marginBottom: 16 }}>
          <Space>
            <Button
              type={jsonMode ? 'default' : 'primary'}
              size="small"
              onClick={() => setJsonMode(false)}
            >
              表单模式
            </Button>
            <Button
              type={jsonMode ? 'primary' : 'default'}
              size="small"
              icon={<CodeOutlined />}
              onClick={() => {
                if (!jsonMode) {
                  // 切换到 JSON 模式时，生成当前表单的 JSON
                  try {
                    const values = form.getFieldsValue();
                    const config = buildConfig(values);
                    setJsonValue(JSON.stringify(config, null, 2));
                  } catch {
                    setJsonValue('{}');
                  }
                }
                setJsonMode(true);
              }}
            >
              JSON 模式
            </Button>
            {!jsonMode && (
              <>
                <Divider type="vertical" />
                <Text type="secondary">应用模板:</Text>
                <Select
                  placeholder="选择模板"
                  style={{ width: 180 }}
                  allowClear
                  onChange={applyTemplate}
                >
                  <Select.Option value="toapis-tti">toapis 文生图</Select.Option>
                  <Select.Option value="toapis-itv">toapis 图生视频</Select.Option>
                  <Select.Option value="toapis-character">toapis 角色提取</Select.Option>
                </Select>
              </>
            )}
          </Space>
        </div>

        {jsonMode ? (
          <div>
            <Alert
              message="JSON 配置模式"
              description="直接编辑渠道配置的 JSON 格式。适合高级用户或从其他地方导入配置。"
              type="info"
              showIcon
              style={{ marginBottom: 16 }}
            />
            <TextArea
              value={jsonValue}
              onChange={e => setJsonValue(e.target.value)}
              rows={20}
              style={{ fontFamily: 'monospace', fontSize: 12 }}
              placeholder='{\n  "name": "我的渠道",\n  "type": "tti",\n  ...\n}'
            />
          </div>
        ) : (
          <Form form={form} layout="vertical" style={{ maxHeight: 500, overflow: 'auto' }}>
            <Collapse defaultActiveKey={['basic', 'auth', 'generate', 'query', 'polling']}>
              <Panel header="基本信息" key="basic">
                <Form.Item
                  name="name"
                  label="渠道名称"
                  rules={[{ required: true, message: '请输入渠道名称' }]}
                >
                  <Input placeholder="如: 我的文生图服务" />
                </Form.Item>
                <Form.Item
                  name="type"
                  label="渠道类型"
                  rules={[{ required: true, message: '请选择渠道类型' }]}
                >
                  <Select placeholder="选择渠道类型">
                    {CHANNEL_TYPE_OPTIONS.map(opt => (
                      <Select.Option key={opt.value} value={opt.value}>{opt.label}</Select.Option>
                    ))}
                  </Select>
                </Form.Item>
                <Form.Item name="description" label="描述">
                  <Input placeholder="可选描述信息" />
                </Form.Item>
                <Form.Item
                  name="baseUrl"
                  label="Base URL"
                  rules={[{ required: true, message: '请输入 Base URL' }]}
                >
                  <Input placeholder="如: https://api.example.com" />
                </Form.Item>
              </Panel>

              <Panel header="鉴权配置" key="auth">
                <Form.Item name="authType" label="鉴权类型" initialValue="bearer">
                  <Select>
                    {AUTH_TYPE_OPTIONS.map(opt => (
                      <Select.Option key={opt.value} value={opt.value}>{opt.label}</Select.Option>
                    ))}
                  </Select>
                </Form.Item>
                <Form.Item name="authKeyName" label="Header/参数名">
                  <Input placeholder="如: Authorization, X-API-Key" />
                </Form.Item>
                <Form.Item name="authKeyValue" label="API Key">
                  <Input.Password placeholder="输入 API Key" />
                </Form.Item>
              </Panel>

              <Panel header="生成接口配置" key="generate">
                <Form.Item
                  name="generateUrl"
                  label="生成接口 URL"
                  rules={[{ required: true, message: '请输入生成接口 URL' }]}
                >
                  <Input placeholder="如: {{baseUrl}}/v1/images/generations" />
                </Form.Item>
                <Form.Item name="generateMethod" label="请求方法" initialValue="POST">
                  <Select>
                    <Select.Option value="POST">POST</Select.Option>
                    <Select.Option value="PUT">PUT</Select.Option>
                  </Select>
                </Form.Item>
                <Form.Item
                  name="generateBodyTemplate"
                  label="请求体模板 (JSON)"
                  tooltip="支持 {{prompt}}, {{imageUrl}}, {{duration}} 等变量"
                >
                  <TextArea
                    rows={6}
                    placeholder='{"model": "{{model}}", "prompt": "{{prompt}}"}'
                    style={{ fontFamily: 'monospace', fontSize: 12 }}
                  />
                </Form.Item>
                <Form.Item
                  name="generateTaskIdPath"
                  label="任务ID路径 (JSONPath)"
                  rules={[{ required: true, message: '请输入任务ID路径' }]}
                >
                  <Input placeholder="如: $.id 或 $.data.task_id" />
                </Form.Item>
              </Panel>

              <Panel header="查询接口配置" key="query">
                <Form.Item
                  name="queryUrl"
                  label="查询接口 URL"
                  rules={[{ required: true, message: '请输入查询接口 URL' }]}
                >
                  <Input placeholder="如: {{baseUrl}}/v1/images/generations/{{taskId}}" />
                </Form.Item>
                <Form.Item name="queryMethod" label="请求方法" initialValue="GET">
                  <Select>
                    <Select.Option value="GET">GET</Select.Option>
                    <Select.Option value="POST">POST</Select.Option>
                  </Select>
                </Form.Item>
                <Form.Item
                  name="queryStatusPath"
                  label="状态路径 (JSONPath)"
                  rules={[{ required: true, message: '请输入状态路径' }]}
                >
                  <Input placeholder="如: $.status" />
                </Form.Item>
                <Form.Item name="queryProgressPath" label="进度路径 (JSONPath)">
                  <Input placeholder="如: $.progress" />
                </Form.Item>
                <Form.Item name="queryResultUrlPath" label="结果URL路径 (JSONPath)">
                  <Input placeholder="如: $.result.data[0].url" />
                </Form.Item>
                <Form.Item name="queryErrorPath" label="错误信息路径 (JSONPath)">
                  <Input placeholder="如: $.error.message" />
                </Form.Item>

                <Divider>状态映射</Divider>
                <Form.Item name="statusPending" label="等待状态值 (逗号分隔)">
                  <Input placeholder="如: queued, pending" />
                </Form.Item>
                <Form.Item name="statusProcessing" label="处理中状态值 (逗号分隔)">
                  <Input placeholder="如: in_progress, processing, running" />
                </Form.Item>
                <Form.Item name="statusCompleted" label="完成状态值 (逗号分隔)">
                  <Input placeholder="如: completed, succeeded, done" />
                </Form.Item>
                <Form.Item name="statusFailed" label="失败状态值 (逗号分隔)">
                  <Input placeholder="如: failed, error" />
                </Form.Item>
              </Panel>

              <Panel header="轮询配置" key="polling">
                <Form.Item name="pollingInterval" label="轮询间隔 (毫秒)" initialValue={5000}>
                  <InputNumber min={1000} max={60000} style={{ width: '100%' }} />
                </Form.Item>
                <Form.Item name="pollingMaxDuration" label="最大等待时间 (毫秒)" initialValue={300000}>
                  <InputNumber min={10000} max={3600000} style={{ width: '100%' }} />
                </Form.Item>
              </Panel>
            </Collapse>
          </Form>
        )}
      </Modal>
    </div>
  );
};

export default CustomChannelManager;

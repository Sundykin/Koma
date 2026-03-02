/**
 * MCP 服务器配置管理器
 * 用于在设置页面管理 MCP 服务器连接
 */
import React, { useState, useEffect, useCallback } from 'react';
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
  Empty,
  Popconfirm,
  Spin,
  App,
  Typography,
  Divider,
  Statistic,
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  LoadingOutlined,
  ApiOutlined,
  ToolOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import type { MCPServerConfig, MCPConnection } from '../../types/mcp';
import { mcpService } from '../../services/mcpService';
import { toUserMessage } from '../../utils/errorMessages';
import { useTranslation } from 'react-i18next';

const { Text, Paragraph } = Typography;

interface MCPConfigManagerProps {
  onConfigChange?: () => void;
}

type TransportType = 'stdio' | 'sse' | 'websocket';

interface FormData {
  name: string;
  transport: TransportType;
  command?: string;
  args?: string;
  url?: string;
  env?: string;
}

export const MCPConfigManager: React.FC<MCPConfigManagerProps> = ({ onConfigChange }) => {
  const { message } = App.useApp();
  const { t } = useTranslation('settings');
  const [connections, setConnections] = useState<MCPConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingConfig, setEditingConfig] = useState<MCPServerConfig | null>(null);
  const [connectingName, setConnectingName] = useState<string | null>(null);
  const [form] = Form.useForm<FormData>();

  // 加载连接列表
  const loadConnections = useCallback(async () => {
    setLoading(true);
    try {
      const conns = await mcpService.getConnections(true);
      setConnections(conns);
    } catch (err) {
      console.error('Failed to load MCP connections:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadConnections();
  }, [loadConnections]);

  // 打开新建/编辑模态框
  const openModal = (config?: MCPServerConfig) => {
    if (config) {
      setEditingConfig(config);
      form.setFieldsValue({
        name: config.name,
        transport: config.transport as TransportType,
        command: config.command,
        args: config.args?.join(' '),
        url: config.url,
        env: config.env ? JSON.stringify(config.env, null, 2) : '',
      });
    } else {
      setEditingConfig(null);
      form.resetFields();
      form.setFieldsValue({ transport: 'stdio' });
    }
    setModalVisible(true);
  };

  // 保存配置并连接
  const handleSave = async () => {
    try {
      const values = await form.validateFields();

      const config: MCPServerConfig = {
        id: editingConfig?.id || `mcp-${Date.now()}`,
        name: values.name,
        transport: values.transport,
        command: values.transport === 'stdio' ? values.command : undefined,
        args: values.transport === 'stdio' && values.args
          ? values.args.split(/\s+/).filter(Boolean)
          : undefined,
        url: values.transport !== 'stdio' ? values.url : undefined,
        env: values.env ? JSON.parse(values.env) : undefined,
      };

      setConnectingName(config.name);
      await mcpService.connect(config);

      message.success(editingConfig ? t('mcp.updateAndReconnectSuccess') : t('mcp.addAndConnectSuccess'));
      setModalVisible(false);
      loadConnections();
      onConfigChange?.();
    } catch (err: any) {
      if (err instanceof SyntaxError) {
        message.error(t('mcp.envJsonError'));
      } else {
        message.error(t('mcp.connectFailed', { error: toUserMessage(err) }));
      }
    } finally {
      setConnectingName(null);
    }
  };

  // 断开连接
  const handleDisconnect = async (name: string) => {
    try {
      await mcpService.disconnect(name);
      message.success(t('mcp.disconnectSuccess'));
      loadConnections();
      onConfigChange?.();
    } catch (err: any) {
      message.error(t('mcp.disconnectFailed', { error: toUserMessage(err) }));
    }
  };

  // 重新连接
  const handleReconnect = async (conn: MCPConnection) => {
    const config: MCPServerConfig = {
      id: conn.name,
      name: conn.name,
      transport: conn.transport,
    };
    setConnectingName(conn.name);
    try {
      await mcpService.connect(config);
      message.success(t('mcp.reconnectSuccess'));
      loadConnections();
    } catch (err: any) {
      message.error(t('mcp.connectFailed', { error: toUserMessage(err) }));
    } finally {
      setConnectingName(null);
    }
  };

  // 获取状态图标
  const getStatusIcon = (status: MCPConnection['status'], name: string) => {
    if (connectingName === name) {
      return <LoadingOutlined spin style={{ color: '#1890ff' }} />;
    }
    switch (status) {
      case 'connected':
        return <CheckCircleOutlined style={{ color: '#52c41a' }} />;
      case 'connecting':
        return <LoadingOutlined spin style={{ color: '#1890ff' }} />;
      case 'error':
        return <CloseCircleOutlined style={{ color: '#ff4d4f' }} />;
      default:
        return <CloseCircleOutlined style={{ color: '#999' }} />;
    }
  };

  // 获取状态文本
  const getStatusText = (status: MCPConnection['status']) => {
    switch (status) {
      case 'connected': return t('mcp.status.connected');
      case 'connecting': return t('mcp.status.connecting');
      case 'error': return t('mcp.status.error');
      default: return t('mcp.status.disconnected');
    }
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 48 }}>
        <Spin size="large" tip={t('mcp.loadingTip')} />
      </div>
    );
  }

  return (
    <div style={{ padding: 16 }}>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <Typography.Title level={5} style={{ margin: 0 }}>
            <ApiOutlined style={{ marginRight: 8 }} />
            MCP {t('mcp.sectionTitle')}
          </Typography.Title>
          <Text type="secondary">{t('mcp.sectionDesc')}</Text>
        </div>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={loadConnections}>
            {t('mcp.refreshBtn')}
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => openModal()}>
            {t('mcp.addServerBtn')}
          </Button>
        </Space>
      </div>

      {connections.length === 0 ? (
        <Empty
          description={t('mcp.emptyDesc')}
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        >
          <Button type="primary" icon={<PlusOutlined />} onClick={() => openModal()}>
            {t('mcp.addFirstBtn')}
          </Button>
        </Empty>
      ) : (
        <Row gutter={[16, 16]}>
          {connections.map(conn => (
            <Col key={conn.name} xs={24} sm={12} lg={8}>
              <Card
                size="small"
                title={
                  <Space>
                    {getStatusIcon(conn.status, conn.name)}
                    <span>{conn.name}</span>
                  </Space>
                }
                extra={
                  <Tag color={
                    conn.transport === 'stdio' ? 'blue' :
                    conn.transport === 'sse' ? 'green' : 'purple'
                  }>
                    {conn.transport.toUpperCase()}
                  </Tag>
                }
                actions={[
                  conn.status === 'connected' ? (
                    <Popconfirm
                      key="disconnect"
                      title={t('mcp.confirmDisconnect')}
                      onConfirm={() => handleDisconnect(conn.name)}
                    >
                      <Button type="text" size="small" danger>
                        {t('mcp.disconnectBtn')}
                      </Button>
                    </Popconfirm>
                  ) : (
                    <Button
                      key="reconnect"
                      type="text"
                      size="small"
                      onClick={() => handleReconnect(conn)}
                      loading={connectingName === conn.name}
                    >
                      {t('mcp.connectBtn')}
                    </Button>
                  ),
                  <Button
                    key="edit"
                    type="text"
                    size="small"
                    icon={<EditOutlined />}
                    onClick={() => openModal({ id: conn.name, name: conn.name, transport: conn.transport })}
                  />,
                  <Popconfirm
                    key="delete"
                    title={t('mcp.confirmDeleteServer')}
                    onConfirm={() => handleDisconnect(conn.name)}
                  >
                    <Button type="text" size="small" danger icon={<DeleteOutlined />} />
                  </Popconfirm>,
                ]}
              >
                <Row gutter={16}>
                  <Col span={12}>
                    <Statistic
                      title={t('mcp.toolsLabel')}
                      value={conn.tools?.length || 0}
                      prefix={<ToolOutlined />}
                      valueStyle={{ fontSize: 20 }}
                    />
                  </Col>
                  <Col span={12}>
                    <Statistic
                      title={t('mcp.statusLabel')}
                      value={getStatusText(conn.status)}
                      valueStyle={{
                        fontSize: 14,
                        color: conn.status === 'connected' ? '#52c41a' :
                               conn.status === 'error' ? '#ff4d4f' : '#999'
                      }}
                    />
                  </Col>
                </Row>
                {conn.error && (
                  <Paragraph type="danger" ellipsis style={{ marginTop: 8, marginBottom: 0 }}>
                    {conn.error}
                  </Paragraph>
                )}
              </Card>
            </Col>
          ))}
        </Row>
      )}

      {/* 新建/编辑模态框 */}
      <Modal
        title={editingConfig ? t('mcp.editTitle') : t('mcp.addTitle')}
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        onOk={handleSave}
        confirmLoading={!!connectingName}
        okText={editingConfig ? t('mcp.saveAndConnectBtn') : t('mcp.addAndConnectBtn')}
        width={500}
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="name"
            label={t('mcp.form.nameLabel')}
            rules={[{ required: true, message: t('mcp.form.nameRequired') }]}
          >
            <Input placeholder="例如：filesystem" disabled={!!editingConfig} />
          </Form.Item>

          <Form.Item
            name="transport"
            label={t('mcp.form.transportLabel')}
            rules={[{ required: true }]}
          >
            <Select>
              <Select.Option value="stdio">{t('mcp.form.transportStdio')}</Select.Option>
              <Select.Option value="sse">{t('mcp.form.transportSSE')}</Select.Option>
              <Select.Option value="websocket">WebSocket</Select.Option>
            </Select>
          </Form.Item>

          <Form.Item
            noStyle
            shouldUpdate={(prev, curr) => prev.transport !== curr.transport}
          >
            {({ getFieldValue }) => {
              const transport = getFieldValue('transport');
              if (transport === 'stdio') {
                return (
                  <>
                    <Form.Item
                      name="command"
                      label={t('mcp.form.commandLabel')}
                      rules={[{ required: true, message: t('mcp.form.commandRequired') }]}
                    >
                      <Input placeholder="例如：npx" />
                    </Form.Item>
                    <Form.Item name="args" label={t('mcp.form.argsLabel')}>
                      <Input placeholder="例如：-y @anthropic/mcp-server-filesystem" />
                    </Form.Item>
                  </>
                );
              }
              return (
                <Form.Item
                  name="url"
                  label="URL"
                  rules={[{ required: true, message: t('mcp.form.urlRequired') }]}
                >
                  <Input placeholder="例如：http://localhost:3000/mcp" />
                </Form.Item>
              );
            }}
          </Form.Item>

          <Form.Item name="env" label={t('mcp.form.envLabel')}>
            <Input.TextArea
              placeholder='{"API_KEY": "xxx"}'
              autoSize={{ minRows: 2, maxRows: 4 }}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default MCPConfigManager;

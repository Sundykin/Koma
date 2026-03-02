/**
 * MCP 服务器配置界面
 */
import React, { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Modal,
  Form,
  Input,
  Select,
  Button,
  Table,
  Switch,
  Space,
  message,
  Popconfirm,
  Tag,
  Upload,
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  ApiOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  LoadingOutlined,
  ToolOutlined,
  ImportOutlined,
} from '@ant-design/icons';
import type { MCPServerConfig } from '../../types/mcp';
import { toUserMessage } from '../../utils/errorMessages';

interface MCPSettingsProps {
  visible: boolean;
  onClose: () => void;
  configs: MCPServerConfig[];
  onSave: (configs: MCPServerConfig[]) => void;
  onTest?: (config: MCPServerConfig) => Promise<boolean>;
}

type TransportType = 'stdio' | 'sse' | 'websocket';

interface ConfigFormData {
  name: string;
  transport: TransportType;
  command?: string;
  args?: string;
  url?: string;
  env?: string;
  enabled: boolean;
}

export const MCPSettings: React.FC<MCPSettingsProps> = ({
  visible,
  onClose,
  configs,
  onSave,
  onTest,
}) => {
  const { t } = useTranslation('chat');
  const [form] = Form.useForm<ConfigFormData>();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, boolean>>({});

  // 打开新建表单
  const handleAdd = useCallback(() => {
    form.resetFields();
    form.setFieldsValue({ transport: 'stdio', enabled: true });
    setEditingId(null);
    setShowForm(true);
  }, [form]);

  // 打开编辑表单
  const handleEdit = useCallback((config: MCPServerConfig) => {
    form.setFieldsValue({
      name: config.name,
      transport: config.transport,
      command: config.command,
      args: config.args?.join(' '),
      url: config.url,
      env: config.env ? JSON.stringify(config.env, null, 2) : '',
      enabled: true,
    });
    setEditingId(config.name);
    setShowForm(true);
  }, [form]);

  // 保存配置
  const handleSave = useCallback(async () => {
    try {
      const values = await form.validateFields();

      const config: MCPServerConfig = {
        name: values.name,
        transport: values.transport,
        command: values.transport === 'stdio' ? values.command : undefined,
        args: values.transport === 'stdio' && values.args
          ? values.args.split(/\s+/).filter(Boolean)
          : undefined,
        url: values.transport !== 'stdio' ? values.url : undefined,
        env: values.env ? JSON.parse(values.env) : undefined,
      };

      let newConfigs: MCPServerConfig[];
      if (editingId) {
        newConfigs = configs.map(c => c.name === editingId ? config : c);
      } else {
        if (configs.some(c => c.name === config.name)) {
          message.error(t('mcp.errorNameExists'));
          return;
        }
        newConfigs = [...configs, config];
      }

      onSave(newConfigs);
      setShowForm(false);
      message.success(editingId ? t('mcp.successUpdated') : t('mcp.successAdded'));
    } catch (e) {
      if (e instanceof SyntaxError) {
        message.error(t('mcp.errorEnvJson'));
      }
    }
  }, [form, editingId, configs, onSave]);

  // 删除配置
  const handleDelete = useCallback((name: string) => {
    const newConfigs = configs.filter(c => c.name !== name);
    onSave(newConfigs);
    message.success(t('mcp.successDeleted'));
  }, [configs, onSave]);

  // 导入 JSON 配置
  const handleImport = useCallback(async (file: File) => {
    try {
      const text = await file.text();
      const json = JSON.parse(text);

      if (!Array.isArray(json)) {
        throw new Error(t('mcp.errorFormat'));
      }

      const newConfigs = json.filter((item: any) =>
        item.name && item.transport && !configs.some(c => c.name === item.name)
      );

      if (newConfigs.length === 0) {
        message.warning(t('mcp.warnNoNewConfigs'));
        return;
      }

      onSave([...configs, ...newConfigs]);
      message.success(t('mcp.successImported', { count: newConfigs.length }));
    } catch (e) {
      message.error(toUserMessage(e));
    }
  }, [configs, onSave]);

  // 测试连接
  const handleTest = useCallback(async (config: MCPServerConfig) => {
    if (!onTest) return;

    setTestingId(config.name);
    try {
      const result = await onTest(config);
      setTestResults(prev => ({ ...prev, [config.name]: result }));
      message.success(result ? t('mcp.successConnected') : t('mcp.failedConnected'));
    } catch (e) {
      setTestResults(prev => ({ ...prev, [config.name]: false }));
      message.error(toUserMessage(e));
    } finally {
      setTestingId(null);
    }
  }, [onTest]);

  // 表格列
  const columns = [
    {
      title: t('mcp.colName'),
      dataIndex: 'name',
      key: 'name',
      render: (name: string) => (
        <Space>
          <ApiOutlined />
          {name}
        </Space>
      ),
    },
    {
      title: t('mcp.colType'),
      dataIndex: 'transport',
      key: 'transport',
      render: (transport: TransportType) => (
        <Tag color={transport === 'stdio' ? 'blue' : transport === 'sse' ? 'green' : 'purple'}>
          {transport.toUpperCase()}
        </Tag>
      ),
    },
    {
      title: t('mcp.colAddress'),
      key: 'address',
      render: (_: unknown, record: MCPServerConfig) => (
        <span className="font-mono text-xs text-[#a1a1aa]">
          {record.transport === 'stdio' ? record.command : record.url}
        </span>
      ),
    },
    {
      title: t('mcp.colTools'),
      key: 'tools',
      width: 100,
      render: (_: unknown, record: MCPServerConfig) => {
        // 工具发现需要连接 MCP 服务器
        // 当前显示占位提示，连接后可获取具体工具列表
        if (record.name in testResults && testResults[record.name]) {
          return (
            <Tag color="cyan" icon={<ToolOutlined />}>
              {t('mcp.connected')}
            </Tag>
          );
        }
        return (
          <Tag color="default">
            {t('mcp.pending')}
          </Tag>
        );
      },
    },
    {
      title: t('mcp.colStatus'),
      key: 'status',
      width: 80,
      render: (_: unknown, record: MCPServerConfig) => {
        if (testingId === record.name) {
          return <LoadingOutlined spin />;
        }
        if (record.name in testResults) {
          return testResults[record.name]
            ? <CheckCircleOutlined style={{ color: '#10b981' }} />
            : <CloseCircleOutlined style={{ color: '#ef4444' }} />;
        }
        return null;
      },
    },
    {
      title: t('mcp.colActions'),
      key: 'actions',
      width: 150,
      render: (_: unknown, record: MCPServerConfig) => (
        <Space>
          {onTest && (
            <Button
              type="text"
              size="small"
              onClick={() => handleTest(record)}
              loading={testingId === record.name}
            >
              {t('mcp.test')}
            </Button>
          )}
          <Button
            type="text"
            size="small"
            icon={<EditOutlined />}
            onClick={() => handleEdit(record)}
          />
          <Popconfirm
            title={t('mcp.confirmDelete')}
            onConfirm={() => handleDelete(record.name)}
            okText={t('common:delete')}
            cancelText={t('common:cancel')}
          >
            <Button
              type="text"
              size="small"
              danger
              icon={<DeleteOutlined />}
            />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <Modal
      title={t('mcp.modalTitle')}
      open={visible}
      onCancel={onClose}
      width={800}
      footer={null}
      className="[&_.ant-modal-content]:bg-[#18181b] [&_.ant-modal-header]:bg-[#18181b] [&_.ant-modal-header]:border-b [&_.ant-modal-header]:border-[#27272a] [&_.ant-modal-title]:text-[#fafafa] [&_.ant-modal-close-x]:text-[#a1a1aa] [&_.ant-table]:bg-transparent [&_.ant-table-thead>tr>th]:bg-[#27272a] [&_.ant-table-thead>tr>th]:text-[#a1a1aa] [&_.ant-table-thead>tr>th]:border-b [&_.ant-table-thead>tr>th]:border-[#3f3f46] [&_.ant-table-tbody>tr>td]:border-b [&_.ant-table-tbody>tr>td]:border-[#27272a] [&_.ant-table-tbody>tr>td]:text-[#d4d4d8] [&_.ant-table-tbody>tr:hover>td]:bg-[#27272a] [&_.ant-empty-description]:text-[#71717a]"
    >
      {/* 配置列表 */}
      {!showForm && (
        <>
          <div className="mb-4">
            <Space>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={handleAdd}
              >
                {t('mcp.addServer')}
              </Button>
              <Upload
                beforeUpload={(file) => { handleImport(file); return false; }}
                showUploadList={false}
                accept=".json"
              >
                <Button icon={<ImportOutlined />}>
                  {t('mcp.importConfig')}
                </Button>
              </Upload>
            </Space>
          </div>
          <Table
            dataSource={configs}
            columns={columns}
            rowKey="name"
            pagination={false}
            size="small"
            locale={{ emptyText: t('mcp.emptyTable') }}
          />
        </>
      )}

      {/* 配置表单 */}
      {showForm && (
        <Form
          form={form}
          layout="vertical"
          className="py-4"
        >
          <Form.Item
            name="name"
            label={t('mcp.form.serverName')}
            rules={[{ required: true, message: t('mcp.form.serverNameRequired') }]}
          >
            <Input placeholder="例如：filesystem" disabled={!!editingId} />
          </Form.Item>

          <Form.Item
            name="transport"
            label={t('mcp.form.transportType')}
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
                      label={t('mcp.form.command')}
                      rules={[{ required: true, message: t('mcp.form.commandRequired') }]}
                    >
                      <Input placeholder="例如：npx" />
                    </Form.Item>
                    <Form.Item
                      name="args"
                      label={t('mcp.form.args')}
                    >
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

          <Form.Item
            name="env"
            label={t('mcp.form.envVars')}
          >
            <Input.TextArea
              placeholder='{"API_KEY": "xxx"}'
              autoSize={{ minRows: 2, maxRows: 4 }}
            />
          </Form.Item>

          <Form.Item className="!mb-0 text-right">
            <Space>
              <Button onClick={() => setShowForm(false)}>{t('common:cancel')}</Button>
              <Button type="primary" onClick={handleSave}>
                {editingId ? t('agent.update') : t('mcp.addServer')}
              </Button>
            </Space>
          </Form.Item>
        </Form>
      )}
    </Modal>
  );
};

export default MCPSettings;

/**
 * 智能体模板管理 (增强版)
 * 支持 MCP 工具配置、温度和最大 token 设置
 */
import React, { useState, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Modal,
  Form,
  Input,
  Button,
  Card,
  Row,
  Col,
  Tag,
  Space,
  message,
  Popconfirm,
  Empty,
  Slider,
  InputNumber,
  Select,
  Spin,
  Divider,
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  CopyOutlined,
  ToolOutlined,
} from '@ant-design/icons';
import { chatIPC, type MCPToolDefinition } from '../../chat/ipc';

// 智能体模板
export interface AgentTemplate {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  tools?: string[];
  temperature?: number;
  maxTokens?: number;
  icon?: string;
  color?: string;
}

// 预设模板
export const PRESET_TEMPLATES: AgentTemplate[] = [
  {
    id: 'assistant',
    name: '通用助手',
    description: '一个有帮助的 AI 助手，可以回答各种问题',
    systemPrompt: '你是一个有帮助的 AI 助手。请用简洁、准确的方式回答用户的问题。',
    icon: '🤖',
    color: '#10b981',
  },
  {
    id: 'coder',
    name: '编程助手',
    description: '专注于编程和代码相关问题的助手',
    systemPrompt: '你是一个专业的编程助手。请帮助用户解决编程问题，提供代码示例和最佳实践建议。使用 Markdown 格式化代码块。',
    icon: '💻',
    color: '#3b82f6',
  },
  {
    id: 'writer',
    name: '写作助手',
    description: '帮助用户进行写作、润色和翻译',
    systemPrompt: '你是一个专业的写作助手。请帮助用户改进文章、润色文字、进行翻译或创作内容。注重语言的流畅性和表达的准确性。',
    icon: '✍️',
    color: '#8b5cf6',
  },
  {
    id: 'analyst',
    name: '数据分析师',
    description: '帮助分析数据和生成报告',
    systemPrompt: '你是一个数据分析专家。请帮助用户分析数据、解读结果、生成可视化建议和撰写分析报告。',
    icon: '📊',
    color: '#f59e0b',
  },
];

interface AgentTemplatesProps {
  visible: boolean;
  onClose: () => void;
  templates: AgentTemplate[];
  onSave: (templates: AgentTemplate[]) => void;
  onSelect: (template: AgentTemplate) => void;
}

export const AgentTemplates: React.FC<AgentTemplatesProps> = ({
  visible,
  onClose,
  templates,
  onSave,
  onSelect,
}) => {
  const { t } = useTranslation('chat');
  const [form] = Form.useForm();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [mcpTools, setMcpTools] = useState<MCPToolDefinition[]>([]);
  const [loadingTools, setLoadingTools] = useState(false);

  // 所有模板（预设 + 自定义）
  const allTemplates = [...PRESET_TEMPLATES, ...templates];

  // 加载工具列表（合并外部 MCP + 插件内部 MCP）
  useEffect(() => {
    if (visible && chatIPC.isElectron()) {
      setLoadingTools(true);
      chatIPC.tools.listAll()
        .then(tools => {
          setMcpTools(tools);
        })
        .catch(err => {
          console.error('加载工具列表失败:', err);
        })
        .finally(() => {
          setLoadingTools(false);
        });
    }
  }, [visible]);

  // 打开新建表单
  const handleAdd = useCallback(() => {
    form.resetFields();
    form.setFieldsValue({
      temperature: 0.7,
      maxTokens: 4096,
      tools: [],
    });
    setEditingId(null);
    setShowForm(true);
  }, [form]);

  // 从预设复制
  const handleCopyPreset = useCallback((template: AgentTemplate) => {
    form.setFieldsValue({
      name: t('agent.copyNameSuffix', { name: template.name }),
      description: template.description,
      systemPrompt: template.systemPrompt,
      temperature: template.temperature ?? 0.7,
      maxTokens: template.maxTokens ?? 4096,
      tools: template.tools || [],
    });
    setEditingId(null);
    setShowForm(true);
  }, [form]);

  // 编辑自定义模板
  const handleEdit = useCallback((template: AgentTemplate) => {
    form.setFieldsValue({
      name: template.name,
      description: template.description,
      systemPrompt: template.systemPrompt,
      temperature: template.temperature ?? 0.7,
      maxTokens: template.maxTokens ?? 4096,
      tools: template.tools || [],
    });
    setEditingId(template.id);
    setShowForm(true);
  }, [form]);

  // 保存模板
  const handleSave = useCallback(async () => {
    try {
      const values = await form.validateFields();

      const template: AgentTemplate = {
        id: editingId || `custom_${Date.now()}`,
        name: values.name,
        description: values.description,
        systemPrompt: values.systemPrompt,
        tools: values.tools,
        temperature: values.temperature,
        maxTokens: values.maxTokens,
        icon: '🎯',
        color: '#71717a',
      };

      let newTemplates: AgentTemplate[];
      if (editingId) {
        newTemplates = templates.map(t => t.id === editingId ? template : t);
      } else {
        newTemplates = [...templates, template];
      }

      onSave(newTemplates);
      setShowForm(false);
      message.success(editingId ? t('agent.successUpdated') : t('agent.successCreated'));
    } catch (e) {
      // 表单验证失败
    }
  }, [form, editingId, templates, onSave]);

  // 删除模板
  const handleDelete = useCallback((id: string) => {
    const newTemplates = templates.filter(t => t.id !== id);
    onSave(newTemplates);
    message.success(t('agent.successDeleted'));
  }, [templates, onSave]);

  // 使用模板
  const handleUse = useCallback((template: AgentTemplate) => {
    onSelect(template);
    onClose();
    message.success(t('agent.successSwitched', { name: template.name }));
  }, [onSelect, onClose]);

  // 判断是否为预设模板
  const isPreset = (id: string) => PRESET_TEMPLATES.some(t => t.id === id);

  // 工具选项
  const toolOptions = mcpTools.map(tool => ({
    value: tool.name,
    label: (
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>{tool.name}</span>
        <Tag color={(tool as any).source === 'plugin' ? 'green' : 'blue'} style={{ marginLeft: 8 }}>
          {(tool as any).source === 'plugin' ? t('agent.tagPlugin') : tool.serverName}
        </Tag>
      </div>
    ),
    description: tool.description,
  }));

  return (
    <Modal
      title={t('agent.modalTitle')}
      open={visible}
      onCancel={onClose}
      width={900}
      footer={null}
      className="[&_.ant-modal-content]:bg-[#18181b] [&_.ant-modal-header]:bg-[#18181b] [&_.ant-modal-header]:border-b [&_.ant-modal-header]:border-[#27272a] [&_.ant-modal-title]:text-[#fafafa] [&_.ant-modal-close-x]:text-[#a1a1aa]"
    >
      {!showForm ? (
        <>
          <div className="mb-4">
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={handleAdd}
            >
              {t('agent.createTemplate')}
            </Button>
          </div>

          {allTemplates.length === 0 ? (
            <Empty description={t('agent.emptyTemplates')} />
          ) : (
            <Row gutter={[16, 16]}>
              {allTemplates.map(template => (
                <Col key={template.id} xs={24} sm={12} md={8}>
                  <Card
                    className="!bg-[#27272a] !border !border-[#3f3f46] !rounded-xl transition-[border-color,transform] duration-200 h-full !flex flex-col hover:!border-emerald-500 hover:-translate-y-0.5 [&_.ant-card-body]:flex-1 [&_.ant-card-body]:flex [&_.ant-card-body]:flex-col"
                    hoverable
                    onClick={() => handleUse(template)}
                  >
                    <div className="flex items-center gap-3 mb-3">
                      <span
                        className="w-10 h-10 flex items-center justify-center rounded-[10px] text-xl"
                        style={{ backgroundColor: template.color }}
                      >
                        {template.icon || '🤖'}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-base font-medium text-[#fafafa]">{template.name}</span>
                        {isPreset(template.id) && (
                          <Tag color="blue" className="!m-0">{t('agent.tagPreset')}</Tag>
                        )}
                      </div>
                    </div>
                    <p className="text-[13px] text-[#a1a1aa] mb-3 leading-normal line-clamp-2 mt-0">{template.description}</p>
                    {/* 显示工具数量 */}
                    {template.tools && template.tools.length > 0 && (
                      <div className="flex items-center text-xs text-[#71717a] mb-2">
                        <ToolOutlined style={{ marginRight: 4 }} />
                        <span>{t('agent.toolCount', { count: template.tools.length })}</span>
                      </div>
                    )}
                    <div className="flex justify-end border-t border-[#3f3f46] pt-3 mt-auto" onClick={e => e.stopPropagation()}>
                      {isPreset(template.id) ? (
                        <Button
                          type="text"
                          size="small"
                          icon={<CopyOutlined />}
                          onClick={() => handleCopyPreset(template)}
                        >
                          {t('agent.copy')}
                        </Button>
                      ) : (
                        <Space>
                          <Button
                            type="text"
                            size="small"
                            icon={<EditOutlined />}
                            onClick={() => handleEdit(template)}
                          >
                            {t('common:edit')}
                          </Button>
                          <Popconfirm
                            title={t('agent.confirmDelete')}
                            onConfirm={() => handleDelete(template.id)}
                            okText={t('common:delete')}
                            cancelText={t('common:cancel')}
                          >
                            <Button
                              type="text"
                              size="small"
                              danger
                              icon={<DeleteOutlined />}
                            >
                              {t('common:delete')}
                            </Button>
                          </Popconfirm>
                        </Space>
                      )}
                    </div>
                  </Card>
                </Col>
              ))}
            </Row>
          )}
        </>
      ) : (
        <Form
          form={form}
          layout="vertical"
          className="py-4"
        >
          <Form.Item
            name="name"
            label={t('agent.form.name')}
            rules={[{ required: true, message: t('agent.form.nameRequired') }]}
          >
            <Input placeholder={t('agent.form.namePlaceholder')} />
          </Form.Item>

          <Form.Item
            name="description"
            label={t('agent.form.description')}
            rules={[{ required: true, message: t('agent.form.descriptionRequired') }]}
          >
            <Input placeholder={t('agent.form.descriptionPlaceholder')} />
          </Form.Item>

          <Form.Item
            name="systemPrompt"
            label={t('agent.form.systemPrompt')}
            rules={[{ required: true, message: t('agent.form.systemPromptRequired') }]}
          >
            <Input.TextArea
              placeholder={t('agent.form.systemPromptPlaceholder')}
              autoSize={{ minRows: 4, maxRows: 8 }}
            />
          </Form.Item>

          <Divider>{t('agent.advancedSettings')}</Divider>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="temperature"
                label={t('agent.form.temperature')}
                tooltip={t('agent.form.temperatureTooltip')}
              >
                <Slider
                  min={0}
                  max={2}
                  step={0.1}
                  marks={{
                    0: t('agent.form.tempPrecise'),
                    0.7: t('agent.form.tempBalanced'),
                    1: t('agent.form.tempCreative'),
                    2: t('agent.form.tempRandom'),
                  }}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="maxTokens"
                label={t('agent.form.maxTokens')}
                tooltip={t('agent.form.maxTokensTooltip')}
              >
                <InputNumber
                  min={256}
                  max={128000}
                  step={256}
                  style={{ width: '100%' }}
                  placeholder="4096"
                />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item
            name="tools"
            label={
              <span>
                {t('agent.form.mcpTools')}
                {loadingTools && <Spin size="small" style={{ marginLeft: 8 }} />}
              </span>
            }
            tooltip={t('agent.form.mcpToolsTooltip')}
          >
            <Select
              mode="multiple"
              placeholder={mcpTools.length === 0 ? t('agent.form.noToolsPlaceholder') : t('agent.form.selectToolsPlaceholder')}
              options={toolOptions}
              disabled={mcpTools.length === 0}
              optionFilterProp="label"
              showSearch
              allowClear
              maxTagCount={3}
              optionRender={(option) => (
                <div>
                  <div style={{ fontWeight: 500 }}>{option.value}</div>
                  {option.data.description && (
                    <div style={{ fontSize: 12, color: '#999' }}>
                      {option.data.description}
                    </div>
                  )}
                </div>
              )}
            />
          </Form.Item>
          {mcpTools.length === 0 && !loadingTools && (
            <div style={{ color: '#999', fontSize: 12, marginTop: -16, marginBottom: 16 }}>
              {t('agent.form.toolsHint')}
            </div>
          )}

          <Form.Item className="!mb-0 text-right">
            <Space>
              <Button onClick={() => setShowForm(false)}>{t('common:cancel')}</Button>
              <Button type="primary" onClick={handleSave}>
                {editingId ? t('agent.update') : t('agent.create')}
              </Button>
            </Space>
          </Form.Item>
        </Form>
      )}
    </Modal>
  );
};

export default AgentTemplates;

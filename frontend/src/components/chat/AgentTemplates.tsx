/**
 * 智能体模板管理
 */
import React, { useState, useCallback } from 'react';
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
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  RobotOutlined,
  CopyOutlined,
} from '@ant-design/icons';
import styles from './AgentTemplates.module.css';

// 智能体模板
export interface AgentTemplate {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  tools?: string[];
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
  const [form] = Form.useForm();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  // 所有模板（预设 + 自定义）
  const allTemplates = [...PRESET_TEMPLATES, ...templates];

  // 打开新建表单
  const handleAdd = useCallback(() => {
    form.resetFields();
    setEditingId(null);
    setShowForm(true);
  }, [form]);

  // 从预设复制
  const handleCopyPreset = useCallback((template: AgentTemplate) => {
    form.setFieldsValue({
      name: `${template.name} (副本)`,
      description: template.description,
      systemPrompt: template.systemPrompt,
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
      message.success(editingId ? '模板已更新' : '模板已创建');
    } catch (e) {
      // 表单验证失败
    }
  }, [form, editingId, templates, onSave]);

  // 删除模板
  const handleDelete = useCallback((id: string) => {
    const newTemplates = templates.filter(t => t.id !== id);
    onSave(newTemplates);
    message.success('模板已删除');
  }, [templates, onSave]);

  // 使用模板
  const handleUse = useCallback((template: AgentTemplate) => {
    onSelect(template);
    onClose();
    message.success(`已切换到 ${template.name}`);
  }, [onSelect, onClose]);

  // 判断是否为预设模板
  const isPreset = (id: string) => PRESET_TEMPLATES.some(t => t.id === id);

  return (
    <Modal
      title="智能体模板"
      open={visible}
      onCancel={onClose}
      width={900}
      footer={null}
      className={styles.modal}
    >
      {!showForm ? (
        <>
          <div className={styles.header}>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={handleAdd}
            >
              创建模板
            </Button>
          </div>

          {allTemplates.length === 0 ? (
            <Empty description="暂无智能体模板" />
          ) : (
            <Row gutter={[16, 16]}>
              {allTemplates.map(template => (
                <Col key={template.id} xs={24} sm={12} md={8}>
                  <Card
                    className={styles.card}
                    hoverable
                    onClick={() => handleUse(template)}
                  >
                    <div className={styles.cardHeader}>
                      <span
                        className={styles.icon}
                        style={{ backgroundColor: template.color }}
                      >
                        {template.icon || '🤖'}
                      </span>
                      <div className={styles.cardTitle}>
                        <span className={styles.name}>{template.name}</span>
                        {isPreset(template.id) && (
                          <Tag color="blue" className={styles.tag}>预设</Tag>
                        )}
                      </div>
                    </div>
                    <p className={styles.description}>{template.description}</p>
                    <div className={styles.cardActions} onClick={e => e.stopPropagation()}>
                      {isPreset(template.id) ? (
                        <Button
                          type="text"
                          size="small"
                          icon={<CopyOutlined />}
                          onClick={() => handleCopyPreset(template)}
                        >
                          复制
                        </Button>
                      ) : (
                        <Space>
                          <Button
                            type="text"
                            size="small"
                            icon={<EditOutlined />}
                            onClick={() => handleEdit(template)}
                          >
                            编辑
                          </Button>
                          <Popconfirm
                            title="确定删除此模板？"
                            onConfirm={() => handleDelete(template.id)}
                            okText="删除"
                            cancelText="取消"
                          >
                            <Button
                              type="text"
                              size="small"
                              danger
                              icon={<DeleteOutlined />}
                            >
                              删除
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
          className={styles.form}
        >
          <Form.Item
            name="name"
            label="模板名称"
            rules={[{ required: true, message: '请输入模板名称' }]}
          >
            <Input placeholder="例如：代码审查助手" />
          </Form.Item>

          <Form.Item
            name="description"
            label="描述"
            rules={[{ required: true, message: '请输入描述' }]}
          >
            <Input placeholder="简要描述这个智能体的功能" />
          </Form.Item>

          <Form.Item
            name="systemPrompt"
            label="系统提示词"
            rules={[{ required: true, message: '请输入系统提示词' }]}
          >
            <Input.TextArea
              placeholder="定义智能体的角色、能力和行为规范..."
              autoSize={{ minRows: 4, maxRows: 8 }}
            />
          </Form.Item>

          <Form.Item className={styles.formActions}>
            <Space>
              <Button onClick={() => setShowForm(false)}>取消</Button>
              <Button type="primary" onClick={handleSave}>
                {editingId ? '更新' : '创建'}
              </Button>
            </Space>
          </Form.Item>
        </Form>
      )}
    </Modal>
  );
};

export default AgentTemplates;

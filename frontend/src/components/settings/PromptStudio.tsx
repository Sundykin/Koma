import React, { useState, useEffect, useMemo } from 'react';
import {
  App,
  Input,
  List,
  Button,
  Tag,
  Typography,
  Space,
  Badge,
  Popconfirm,
  Empty,
  Tooltip,
} from 'antd';
import {
  SearchOutlined,
  SaveOutlined,
  ReloadOutlined,
  CodeOutlined,
} from '@ant-design/icons';
import {
  loadPromptTemplates,
  saveCustomTemplate,
  resetTemplate,
  type PromptTemplate,
  type PromptTemplateType,
} from '../../store/promptTemplates';

const { Title, Text } = Typography;
const { TextArea, Search } = Input;

export const PromptStudio: React.FC = () => {
  const { message } = App.useApp();
  const [templates, setTemplates] = useState<Record<PromptTemplateType, PromptTemplate>>({} as any);
  const [selectedId, setSelectedId] = useState<string>('');
  const [searchText, setSearchText] = useState('');
  const [editingContent, setEditingContent] = useState('');
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const data = await loadPromptTemplates();
    setTemplates(data);
    if (!selectedId && Object.keys(data).length > 0) {
      setSelectedId(Object.keys(data)[0]);
    }
  };

  useEffect(() => {
    if (selectedId && templates[selectedId as PromptTemplateType]) {
      setEditingContent(templates[selectedId as PromptTemplateType].template);
      setHasUnsavedChanges(false);
    }
  }, [selectedId, templates]);

  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setEditingContent(e.target.value);
    setHasUnsavedChanges(true);
  };

  const handleSave = async () => {
    if (!selectedId) return;
    try {
      const currentTemplate = templates[selectedId as PromptTemplateType];
      const updatedTemplate = { ...currentTemplate, template: editingContent };
      await saveCustomTemplate(updatedTemplate);
      await loadData();
      setHasUnsavedChanges(false);
      message.success('模板已保存');
    } catch (err: any) {
      message.error(`保存失败: ${err.message}`);
    }
  };

  const handleReset = async () => {
    if (!selectedId) return;
    try {
      await resetTemplate(selectedId as PromptTemplateType);
      await loadData();
      setHasUnsavedChanges(false);
      message.success('模板已重置为默认');
    } catch (err: any) {
      message.error(`重置失败: ${err.message}`);
    }
  };

  const filteredTemplates = useMemo(() => {
    return Object.values(templates).filter(t =>
      t.name.toLowerCase().includes(searchText.toLowerCase()) ||
      t.description.toLowerCase().includes(searchText.toLowerCase())
    );
  }, [templates, searchText]);

  const selectedTemplate = templates[selectedId as PromptTemplateType];

  return (
    <div style={{ display: 'flex', height: '100%', border: '1px solid #e8e8e8', borderRadius: 8, overflow: 'hidden' }}>
      {/* 左侧模板列表 */}
      <div style={{ width: 320, borderRight: '1px solid #e8e8e8', background: '#fafafa', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: 16, borderBottom: '1px solid #e8e8e8', background: '#fff' }}>
          <Search
            placeholder="搜索模板..."
            allowClear
            onChange={e => setSearchText(e.target.value)}
            prefix={<SearchOutlined style={{ color: '#999' }} />}
          />
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: 8 }}>
          <List
            dataSource={filteredTemplates}
            renderItem={item => (
              <div
                onClick={() => setSelectedId(item.id)}
                style={{
                  padding: 12,
                  marginBottom: 8,
                  borderRadius: 8,
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  border: selectedId === item.id ? '1px solid #1890ff' : '1px solid transparent',
                  background: selectedId === item.id ? '#e6f7ff' : '#fff',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <span style={{ fontWeight: 500, color: selectedId === item.id ? '#1890ff' : '#333' }}>
                    {item.name}
                  </span>
                  {item.isCustom && <Badge color="blue" />}
                </div>
                <div style={{ fontSize: 12, color: '#888', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {item.description}
                </div>
              </div>
            )}
          />
        </div>
      </div>

      {/* 右侧编辑器 */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#fff', minWidth: 0 }}>
        {selectedTemplate ? (
          <>
            <div style={{ padding: 16, borderBottom: '1px solid #e8e8e8', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fafafa' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Title level={5} style={{ margin: 0 }}>{selectedTemplate.name}</Title>
                  {selectedTemplate.isCustom && <Tag color="blue">已修改</Tag>}
                  {hasUnsavedChanges && <Tag color="warning">未保存</Tag>}
                </div>
                <Text type="secondary" style={{ fontSize: 12 }}>{selectedTemplate.description}</Text>
              </div>
              <Space>
                {selectedTemplate.isCustom && (
                  <Popconfirm title="确定重置为默认模板？" onConfirm={handleReset}>
                    <Button icon={<ReloadOutlined />} size="small">重置</Button>
                  </Popconfirm>
                )}
                <Button
                  type="primary"
                  icon={<SaveOutlined />}
                  onClick={handleSave}
                  disabled={!hasUnsavedChanges}
                >
                  保存
                </Button>
              </Space>
            </div>

            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <div style={{ flex: 1, position: 'relative' }}>
                <TextArea
                  value={editingContent}
                  onChange={handleContentChange}
                  style={{
                    fontFamily: "'Fira Code', 'Menlo', 'Monaco', 'Courier New', monospace",
                    fontSize: 14,
                    lineHeight: 1.6,
                    resize: 'none',
                    border: 'none',
                    height: '100%',
                    padding: 16,
                    background: '#fafafa',
                  }}
                  spellCheck={false}
                />
              </div>

              {selectedTemplate.variables.length > 0 && (
                <div style={{ padding: 12, background: '#e6f7ff', borderTop: '1px solid #91d5ff', flexShrink: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <CodeOutlined style={{ color: '#1890ff' }} />
                    <Text strong style={{ fontSize: 12, color: '#1890ff', textTransform: 'uppercase' }}>可用变量</Text>
                  </div>
                  <Space size={[4, 8]} wrap>
                    {selectedTemplate.variables.map(v => (
                      <Tooltip title={`点击复制 {{${v}}}`} key={v}>
                        <Tag
                          color="blue"
                          style={{ fontFamily: 'monospace', cursor: 'pointer', margin: 0, marginRight: 8 }}
                          onClick={() => {
                            navigator.clipboard.writeText(`{{${v}}}`);
                            message.success('已复制');
                          }}
                        >
                          {`{{${v}}}`}
                        </Tag>
                      </Tooltip>
                    ))}
                  </Space>
                </div>
              )}
            </div>
          </>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#999' }}>
            <Empty description="请从左侧选择一个模板" />
          </div>
        )}
      </div>
    </div>
  );
};

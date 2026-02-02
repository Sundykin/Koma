import React, { useState, useEffect, useMemo } from 'react';
import {
  App,
  Input,
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
    <div className="flex h-full border border-zinc-700 rounded-lg overflow-hidden">
      {/* 左侧模板列表 */}
      <div className="w-80 border-r border-zinc-700 bg-zinc-900 flex flex-col">
        <div className="p-4 border-b border-zinc-700 bg-zinc-800">
          <Search
            placeholder="搜索模板..."
            allowClear
            onChange={e => setSearchText(e.target.value)}
            prefix={<SearchOutlined className="text-zinc-500" />}
          />
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {filteredTemplates.map(item => (
            <div
              key={item.id}
              onClick={() => setSelectedId(item.id)}
              className={`p-3 mb-2 rounded-lg cursor-pointer transition-all border ${
                selectedId === item.id
                  ? 'border-emerald-600 bg-emerald-900/30'
                  : 'border-transparent bg-zinc-800 hover:bg-zinc-700'
              }`}
            >
              <div className="flex justify-between items-center mb-1">
                <span className={`font-medium ${selectedId === item.id ? 'text-emerald-400' : 'text-zinc-200'}`}>
                  {item.name}
                </span>
                {item.isCustom && <Badge color="green" />}
              </div>
              <div className="text-xs text-zinc-500 overflow-hidden text-ellipsis whitespace-nowrap">
                {item.description}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 右侧编辑器 */}
      <div className="flex-1 flex flex-col bg-zinc-950 min-w-0">
        {selectedTemplate ? (
          <>
            <div className="p-4 border-b border-zinc-700 flex justify-between items-center bg-zinc-900">
              <div>
                <div className="flex items-center gap-2">
                  <Title level={5} className="!m-0 !text-zinc-100">{selectedTemplate.name}</Title>
                  {selectedTemplate.isCustom && <Tag color="green">已修改</Tag>}
                  {hasUnsavedChanges && <Tag color="warning">未保存</Tag>}
                </div>
                <Text className="text-xs !text-zinc-500">{selectedTemplate.description}</Text>
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

            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="flex-1 relative">
                <TextArea
                  value={editingContent}
                  onChange={handleContentChange}
                  className="!bg-zinc-900 !text-zinc-200 !border-none"
                  style={{
                    fontFamily: "'Fira Code', 'Menlo', 'Monaco', 'Courier New', monospace",
                    fontSize: 14,
                    lineHeight: 1.6,
                    resize: 'none',
                    height: '100%',
                    padding: 16,
                  }}
                  spellCheck={false}
                />
              </div>

              {selectedTemplate.variables.length > 0 && (
                <div className="p-3 bg-emerald-900/20 border-t border-emerald-800/50 shrink-0">
                  <div className="flex items-center gap-2 mb-2">
                    <CodeOutlined className="text-emerald-500" />
                    <Text strong className="text-xs !text-emerald-500 uppercase">可用变量</Text>
                  </div>
                  <Space size={[4, 8]} wrap>
                    {selectedTemplate.variables.map(v => (
                      <Tooltip title={`点击复制 {{${v}}}`} key={v}>
                        <Tag
                          color="green"
                          className="font-mono cursor-pointer !m-0 !mr-2"
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
          <div className="flex flex-col items-center justify-center h-full text-zinc-500">
            <Empty description="请从左侧选择一个模板" />
          </div>
        )}
      </div>
    </div>
  );
};

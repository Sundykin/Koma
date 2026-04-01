import React, { useState, useEffect, useMemo } from 'react';
import {
  App,
  Alert,
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
  validatePromptTemplateDraft,
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
  const [validationErrors, setValidationErrors] = useState<{ unknownVariables: string[]; missingRequiredVariables: string[] }>({
    unknownVariables: [],
    missingRequiredVariables: [],
  });

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
      const nextTemplate = templates[selectedId as PromptTemplateType].template;
      setEditingContent(nextTemplate);
      setHasUnsavedChanges(false);
      const validation = validatePromptTemplateDraft(selectedId as PromptTemplateType, nextTemplate);
      setValidationErrors({
        unknownVariables: validation.unknownVariables,
        missingRequiredVariables: validation.missingRequiredVariables,
      });
    }
  }, [selectedId, templates]);

  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const nextContent = e.target.value;
    setEditingContent(nextContent);
    setHasUnsavedChanges(true);
    if (selectedId) {
      const validation = validatePromptTemplateDraft(selectedId as PromptTemplateType, nextContent);
      setValidationErrors({
        unknownVariables: validation.unknownVariables,
        missingRequiredVariables: validation.missingRequiredVariables,
      });
    }
  };

  const handleSave = async () => {
    if (!selectedId) return;
    try {
      const validation = validatePromptTemplateDraft(selectedId as PromptTemplateType, editingContent);
      if (!validation.isValid) {
        setValidationErrors({
          unknownVariables: validation.unknownVariables,
          missingRequiredVariables: validation.missingRequiredVariables,
        });
        message.error('模板校验未通过，请先修正变量');
        return;
      }

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
  const hasValidationErrors = validationErrors.unknownVariables.length > 0 || validationErrors.missingRequiredVariables.length > 0;

  return (
    <div className="prompt-studio-shell">
      {/* 左侧模板列表 */}
      <div className="prompt-studio-sidebar">
        <div className="prompt-studio-sidebar-header">
          <Search
            placeholder="搜索模板..."
            allowClear
            onChange={e => setSearchText(e.target.value)}
            prefix={<SearchOutlined className="text-zinc-500" />}
            size="small"
          />
        </div>
        <div className="prompt-studio-sidebar-list">
          {filteredTemplates.map(item => (
            <div
              key={item.id}
              onClick={() => setSelectedId(item.id)}
              className={`prompt-studio-list-item${selectedId === item.id ? ' is-active' : ''}`}
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
      <div className="prompt-studio-editor">
        {selectedTemplate ? (
          <>
            <div className="prompt-studio-editor-header">
              <div className="prompt-studio-editor-meta">
                <div className="flex items-center gap-2">
                  <Title level={5} className="!m-0 !text-zinc-100">{selectedTemplate.name}</Title>
                  {selectedTemplate.isCustom && <Tag color="green">已修改</Tag>}
                  {hasUnsavedChanges && <Tag color="warning">未保存</Tag>}
                </div>
                <Text className="text-xs !text-zinc-500">{selectedTemplate.description}</Text>
              </div>
              <Space size="small" wrap>
                {selectedTemplate.isCustom && (
                  <Popconfirm title="确定重置为默认模板？" onConfirm={handleReset}>
                    <Button icon={<ReloadOutlined />} size="small">重置</Button>
                  </Popconfirm>
                )}
                <Button
                  type="primary"
                  icon={<SaveOutlined />}
                  size="small"
                  onClick={handleSave}
                  disabled={!hasUnsavedChanges || hasValidationErrors}
                >
                  保存
                </Button>
              </Space>
            </div>

            <div className="prompt-studio-editor-main">
              {hasValidationErrors && (
                <div className="prompt-studio-validation">
                  <Alert
                    type="error"
                    showIcon
                    message="模板变量校验失败"
                    description={
                      <div className="text-xs">
                        {validationErrors.unknownVariables.length > 0 && (
                          <div>未知变量：{validationErrors.unknownVariables.join(', ')}</div>
                        )}
                        {validationErrors.missingRequiredVariables.length > 0 && (
                          <div>缺失必需变量：{validationErrors.missingRequiredVariables.join(', ')}</div>
                        )}
                      </div>
                    }
                  />
                </div>
              )}

              <div className="prompt-studio-textarea-shell">
                <TextArea
                  value={editingContent}
                  onChange={handleContentChange}
                  className="!bg-zinc-900 !text-zinc-200 !border-none"
                  autoSize={false}
                  style={{
                    height: '100%',
                  }}
                  spellCheck={false}
                />
              </div>

              {selectedTemplate.variables.length > 0 && (
                <div className="prompt-studio-vars">
                  <div className="flex items-center gap-2 mb-2">
                    <CodeOutlined className="text-emerald-500" />
                    <Text strong className="text-xs !text-emerald-500 uppercase">可用变量</Text>
                  </div>
                  <div className="prompt-studio-vars-grid">
                    {selectedTemplate.variables.map(v => (
                      <div
                        key={v.name}
                        className="prompt-studio-var-card"
                      >
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <Tooltip title={`点击复制 {{${v.name}}}`}>
                            <Tag
                              color="green"
                              className="font-mono cursor-pointer !m-0"
                              onClick={() => {
                                navigator.clipboard.writeText(`{{${v.name}}}`);
                                message.success('已复制');
                              }}
                            >
                              {`{{${v.name}}}`}
                            </Tag>
                          </Tooltip>
                          <Tag color={v.required === false ? 'default' : 'blue'} className="!m-0">
                            {v.required === false ? '选填' : '必填'}
                          </Tag>
                        </div>
                        <div className="text-sm text-zinc-100 mb-1">{v.label}</div>
                        <div className="text-xs text-zinc-400 mb-2">{v.description}</div>
                        <div className="text-[11px] text-zinc-500">格式：{v.format}</div>
                        {v.example && (
                          <div className="text-[11px] text-zinc-500 mt-1 break-all">
                            示例：{v.example}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="prompt-studio-empty">
            <Empty description="请从左侧选择一个模板" />
          </div>
        )}
      </div>
    </div>
  );
};

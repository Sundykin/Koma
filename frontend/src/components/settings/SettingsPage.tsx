import React, { useState, useEffect } from 'react';
import {
  Tabs,
  Form,
  Input,
  Select,
  Button,
  Space,
  App,
  Divider,
  Statistic,
  Row,
  Col,
  Modal,
  Progress,
  Tooltip,
  Card,
  Popconfirm,
  Empty,
} from 'antd';
import {
  SaveOutlined,
  KeyOutlined,
  ApiOutlined,
  SoundOutlined,
  VideoCameraOutlined,
  PictureOutlined,
  FolderOutlined,
  DeleteOutlined,
  ExperimentOutlined,
  CheckCircleOutlined,
  LoadingOutlined,
  ImportOutlined,
  ExportOutlined,
  PlusOutlined,
  EditOutlined,
  FileTextOutlined,
  ReloadOutlined,
  BgColorsOutlined,
} from '@ant-design/icons';
import type { AppSettings, TTSProviderType, ITVProviderType } from '../../types';
import { loadSettings, saveSettings } from '../../store/globalStore';
import {
  getStorageConfig,
  validateStoragePath,
  updateStoragePath,
} from '../../store/storageConfig';
import { clearCache as clearProjectCache } from '../../store/projectStore';
import { electronService } from '../../services/electronService';
import {
  loadPromptTemplates,
  saveCustomTemplate,
  resetTemplate,
  getDefaultTemplate,
  type PromptTemplate,
  type PromptTemplateType,
} from '../../store/promptTemplates';
import { LLMConfigManager } from './LLMConfigManager';
import { TTIConfigManager } from './TTIConfigManager';
import { ITVConfigManager } from './ITVConfigManager';
import { TTSConfigManager } from './TTSConfigManager';
import { VisualStyleManager } from './VisualStyleManager';

interface SettingsPageProps {
  settings: AppSettings;
  onSave: (newSettings: AppSettings) => void;
}

export const SettingsPage: React.FC<SettingsPageProps> = ({
  settings,
  onSave,
}) => {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [activeTab, setActiveTab] = useState('llm');
  const [saving, setSaving] = useState(false);
  const [storagePath, setStoragePath] = useState('');
  const [storageSize, setStorageSize] = useState('计算中...');
  const [clearingCache, setClearingCache] = useState(false);

  // Prompt 模板状态
  const [promptTemplates, setPromptTemplates] = useState<Record<PromptTemplateType, PromptTemplate>>({} as any);
  const [editingTemplate, setEditingTemplate] = useState<PromptTemplate | null>(null);
  const [templateModalVisible, setTemplateModalVisible] = useState(false);
  const [templateContent, setTemplateContent] = useState('');

  useEffect(() => {
    form.setFieldsValue(flattenSettings(settings));
  }, [settings, form]);

  // 初始化存储路径
  useEffect(() => {
    const config = getStorageConfig();
    if (config) {
      setStoragePath(config.rootPath || '~/.koma');
    }
  }, []);

  // 加载 Prompt 模板
  useEffect(() => {
    loadPromptTemplates().then(setPromptTemplates);
  }, []);

  // ========== Prompt 模板管理 ==========

  const handleEditTemplate = (template: PromptTemplate) => {
    setEditingTemplate(template);
    setTemplateContent(template.template);
    setTemplateModalVisible(true);
  };

  const handleSaveTemplate = async () => {
    if (!editingTemplate) return;
    try {
      const updatedTemplate = { ...editingTemplate, template: templateContent };
      await saveCustomTemplate(updatedTemplate);
      const newTemplates = await loadPromptTemplates();
      setPromptTemplates(newTemplates);
      setTemplateModalVisible(false);
      message.success('模板已保存');
    } catch (err: any) {
      message.error(`保存失败: ${err.message}`);
    }
  };

  const handleResetTemplate = async (type: PromptTemplateType) => {
    try {
      await resetTemplate(type);
      const newTemplates = await loadPromptTemplates();
      setPromptTemplates(newTemplates);
      message.success('模板已重置为默认');
    } catch (err: any) {
      message.error(`重置失败: ${err.message}`);
    }
  };

  // 修改存储位置
  const handleChangeStoragePath = async () => {
    if (!electronService.isElectron()) {
      message.warning('仅支持桌面版');
      return;
    }

    const result = await electronService.dialog.openDirectory();
    if (result.filePaths && result.filePaths.length > 0) {
      const newPath = result.filePaths[0];

      Modal.confirm({
        title: '修改存储位置',
        content: (
          <div>
            <p>新位置: {newPath}</p>
            <p>是否同时迁移现有数据？</p>
          </div>
        ),
        okText: '迁移并修改',
        cancelText: '仅修改',
        onOk: async () => {
          try {
            await updateStoragePath(newPath, true);
            setStoragePath(newPath);
            message.success('存储位置已修改并迁移数据');
          } catch (err: any) {
            message.error(`迁移失败: ${err.message}`);
          }
        },
        onCancel: async () => {
          try {
            await updateStoragePath(newPath, false);
            setStoragePath(newPath);
            message.success('存储位置已修改');
          } catch (err: any) {
            message.error(`修改失败: ${err.message}`);
          }
        },
      });
    }
  };

  // 清理缓存
  const handleClearCache = async () => {
    Modal.confirm({
      title: '确认清理缓存',
      content: '这将清理所有项目的缓存文件（缩略图、波形、预览帧），不会影响素材和项目数据。',
      okText: '清理',
      okType: 'danger',
      onOk: async () => {
        setClearingCache(true);
        try {
          // 清理所有项目缓存逻辑（需要实现）
          message.success('缓存已清理');
        } catch (err: any) {
          message.error(`清理失败: ${err.message}`);
        } finally {
          setClearingCache(false);
        }
      },
    });
  };

  // 导出配置
  const handleExportConfig = async () => {
    try {
      const config = JSON.stringify(settings, null, 2);
      if (electronService.isElectron()) {
        const result = await electronService.dialog.saveFile({
          title: '导出配置',
          defaultPath: 'koma-settings.json',
          filters: [{ name: 'JSON', extensions: ['json'] }],
        });
        if (result.filePath) {
          await electronService.fs.writeFile(result.filePath, config);
          message.success('配置已导出');
        }
      } else {
        // 浏览器环境：下载文件
        const blob = new Blob([config], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'koma-settings.json';
        a.click();
        URL.revokeObjectURL(url);
        message.success('配置已导出');
      }
    } catch (err: any) {
      message.error(`导出失败: ${err.message}`);
    }
  };

  // 导入配置
  const handleImportConfig = async () => {
    try {
      if (electronService.isElectron()) {
        const result = await electronService.dialog.openFile({
          title: '导入配置',
          filters: [{ name: 'JSON', extensions: ['json'] }],
        });
        if (result.filePaths && result.filePaths.length > 0) {
          const content = await electronService.fs.readFile(result.filePaths[0]);
          const imported = JSON.parse(content) as AppSettings;
          form.setFieldsValue(flattenSettings(imported));
          message.success('配置已导入，点击保存生效');
        }
      } else {
        // 浏览器环境：文件选择
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = async (e: any) => {
          const file = e.target.files[0];
          if (file) {
            const content = await file.text();
            const imported = JSON.parse(content) as AppSettings;
            form.setFieldsValue(flattenSettings(imported));
            message.success('配置已导入，点击保存生效');
          }
        };
        input.click();
      }
    } catch (err: any) {
      message.error(`导入失败: ${err.message}`);
    }
  };

  // 将嵌套设置展平为表单字段（兼容旧版配置）
  const flattenSettings = (s: AppSettings) => {
    return {
      // 旧版配置字段已废弃，新版使用配置管理器
    };
  };

  // 将表单值还原为嵌套结构（兼容旧版配置）
  const unflattenSettings = (values: any): Partial<AppSettings> => {
    return {};
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const values = await form.validateFields();
      const partialSettings = unflattenSettings(values);
      // 加载当前设置并合并
      const currentSettings = await loadSettings();
      const newSettings: AppSettings = {
        ...currentSettings,
        ...partialSettings,
      } as AppSettings;
      await saveSettings(newSettings);
      onSave(newSettings);
      message.success('设置已保存');
    } catch (err) {
      message.error('保存失败');
    } finally {
      setSaving(false);
    }
  };

  // LLM 配置变更后刷新设置
  const handleLLMConfigChange = async () => {
    const newSettings = await loadSettings();
    onSave(newSettings);
  };

  // 媒体配置变更后刷新设置
  const handleConfigChange = async () => {
    const newSettings = await loadSettings();
    onSave(newSettings);
  };

  const tabItems = [
    {
      key: 'llm',
      label: (
        <span>
          <ExperimentOutlined /> LLM 大模型
        </span>
      ),
      children: (
        <div style={{ padding: 16 }}>
          <LLMConfigManager onConfigChange={handleLLMConfigChange} />
        </div>
      ),
    },
    {
      key: 'tti',
      label: (
        <span>
          <PictureOutlined /> 文生图 (TTI)
        </span>
      ),
      children: (
        <div style={{ padding: 16 }}>
          <TTIConfigManager onConfigChange={handleConfigChange} />
        </div>
      ),
    },
    {
      key: 'itv',
      label: (
        <span>
          <VideoCameraOutlined /> 图生视频 (ITV)
        </span>
      ),
      children: (
        <div style={{ padding: 16 }}>
          <ITVConfigManager onConfigChange={handleConfigChange} />
        </div>
      ),
    },
    {
      key: 'tts',
      label: (
        <span>
          <SoundOutlined /> 语音合成 (TTS)
        </span>
      ),
      children: (
        <div style={{ padding: 16 }}>
          <TTSConfigManager onConfigChange={handleConfigChange} />
        </div>
      ),
    },
    {
      key: 'visual-style',
      label: (
        <span>
          <BgColorsOutlined /> 视觉风格
        </span>
      ),
      children: (
        <div style={{ padding: 16 }}>
          <VisualStyleManager onStyleChange={handleConfigChange} />
        </div>
      ),
    },
    {
      key: 'storage',
      label: (
        <span>
          <FolderOutlined /> 存储设置
        </span>
      ),
      children: (
        <div style={{ padding: 16 }}>
          <Row gutter={16}>
            <Col span={12}>
              <Statistic
                title="存储位置"
                value={storagePath || '~/.koma'}
                valueStyle={{ fontSize: 14, fontFamily: 'monospace' }}
              />
            </Col>
            <Col span={12}>
              <Statistic title="已用空间" value={storageSize} />
            </Col>
          </Row>
          <Divider />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Space>
              <Button
                icon={<FolderOutlined />}
                onClick={handleChangeStoragePath}
              >
                修改存储位置
              </Button>
              <Button
                icon={<DeleteOutlined />}
                danger
                loading={clearingCache}
                onClick={handleClearCache}
              >
                清理缓存
              </Button>
            </Space>
            <Space>
              <Button icon={<ExportOutlined />} onClick={handleExportConfig}>
                导出配置
              </Button>
              <Button icon={<ImportOutlined />} onClick={handleImportConfig}>
                导入配置
              </Button>
            </Space>
          </div>
        </div>
      ),
    },
    {
      key: 'prompts',
      label: (
        <span>
          <FileTextOutlined /> Prompt 模板
        </span>
      ),
      children: (
        <div style={{ padding: 16, maxHeight: 'calc(100vh - 280px)', overflowY: 'auto' }}>
          <p style={{ marginBottom: 16, color: '#888' }}>
            自定义 AI 功能使用的 Prompt 模板，支持变量替换。
          </p>

          {/* 系统提示模板 */}
          <Divider orientation="left" style={{ margin: '16px 0 8px' }}>系统提示 (System Prompts)</Divider>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {(Object.values(promptTemplates) as PromptTemplate[])
              .filter(t => t.id.endsWith('_system'))
              .map((template) => (
              <Card key={template.id} size="small">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 500, marginBottom: 4 }}>
                      {template.name}
                      {template.isCustom && (
                        <span style={{ marginLeft: 8, color: '#1890ff', fontSize: 12 }}>
                          (已自定义)
                        </span>
                      )}
                    </div>
                    <div style={{ color: '#888', fontSize: 13 }}>
                      {template.description}
                    </div>
                  </div>
                  <Space>
                    <Button
                      type="link"
                      size="small"
                      icon={<EditOutlined />}
                      onClick={() => handleEditTemplate(template)}
                    >
                      编辑
                    </Button>
                    {template.isCustom && (
                      <Popconfirm
                        title="确定重置为默认模板？"
                        onConfirm={() => handleResetTemplate(template.id)}
                        okText="重置"
                        cancelText="取消"
                      >
                        <Button type="link" size="small" icon={<ReloadOutlined />} danger>
                          重置
                        </Button>
                      </Popconfirm>
                    )}
                  </Space>
                </div>
              </Card>
            ))}
          </div>

          {/* LLM 模板（剧本解析等） */}
          <Divider orientation="left" style={{ margin: '24px 0 8px' }}>LLM 任务模板</Divider>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {(Object.values(promptTemplates) as PromptTemplate[])
              .filter(t => !t.id.startsWith('tti_') && !t.id.startsWith('itv_') && !t.id.endsWith('_system'))
              .map((template) => (
              <Card key={template.id} size="small">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 500, marginBottom: 4 }}>
                      {template.name}
                      {template.isCustom && (
                        <span style={{ marginLeft: 8, color: '#1890ff', fontSize: 12 }}>
                          (已自定义)
                        </span>
                      )}
                    </div>
                    <div style={{ color: '#888', fontSize: 13 }}>
                      {template.description}
                      <br />
                      <span style={{ fontSize: 12 }}>
                        变量: {template.variables.map(v => `{{${v}}}`).join(', ') || '无'}
                      </span>
                    </div>
                  </div>
                  <Space>
                    <Button
                      type="link"
                      size="small"
                      icon={<EditOutlined />}
                      onClick={() => handleEditTemplate(template)}
                    >
                      编辑
                    </Button>
                    {template.isCustom && (
                      <Popconfirm
                        title="确定重置为默认模板？"
                        onConfirm={() => handleResetTemplate(template.id)}
                        okText="重置"
                        cancelText="取消"
                      >
                        <Button type="link" size="small" icon={<ReloadOutlined />} danger>
                          重置
                        </Button>
                      </Popconfirm>
                    )}
                  </Space>
                </div>
              </Card>
            ))}
          </div>

          {/* TTI 模板（图片生成） */}
          <Divider orientation="left" style={{ margin: '24px 0 8px' }}>TTI 模板（图片生成）</Divider>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {(Object.values(promptTemplates) as PromptTemplate[])
              .filter(t => t.id.startsWith('tti_'))
              .map((template) => (
              <Card key={template.id} size="small">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 500, marginBottom: 4 }}>
                      {template.name}
                      {template.isCustom && (
                        <span style={{ marginLeft: 8, color: '#1890ff', fontSize: 12 }}>
                          (已自定义)
                        </span>
                      )}
                    </div>
                    <div style={{ color: '#888', fontSize: 13 }}>
                      {template.description}
                      <br />
                      <span style={{ fontSize: 12 }}>
                        变量: {template.variables.map(v => `{{${v}}}`).join(', ')}
                      </span>
                    </div>
                  </div>
                  <Space>
                    <Button
                      type="link"
                      size="small"
                      icon={<EditOutlined />}
                      onClick={() => handleEditTemplate(template)}
                    >
                      编辑
                    </Button>
                    {template.isCustom && (
                      <Popconfirm
                        title="确定重置为默认模板？"
                        onConfirm={() => handleResetTemplate(template.id)}
                        okText="重置"
                        cancelText="取消"
                      >
                        <Button type="link" size="small" icon={<ReloadOutlined />} danger>
                          重置
                        </Button>
                      </Popconfirm>
                    )}
                  </Space>
                </div>
              </Card>
            ))}
          </div>

          {/* ITV 模板（视频生成） */}
          <Divider orientation="left" style={{ margin: '24px 0 8px' }}>ITV 模板（视频生成）</Divider>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {(Object.values(promptTemplates) as PromptTemplate[])
              .filter(t => t.id.startsWith('itv_'))
              .map((template) => (
              <Card key={template.id} size="small">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 500, marginBottom: 4 }}>
                      {template.name}
                      {template.isCustom && (
                        <span style={{ marginLeft: 8, color: '#1890ff', fontSize: 12 }}>
                          (已自定义)
                        </span>
                      )}
                    </div>
                    <div style={{ color: '#888', fontSize: 13 }}>
                      {template.description}
                      <br />
                      <span style={{ fontSize: 12 }}>
                        变量: {template.variables.map(v => `{{${v}}}`).join(', ')}
                      </span>
                    </div>
                  </div>
                  <Space>
                    <Button
                      type="link"
                      size="small"
                      icon={<EditOutlined />}
                      onClick={() => handleEditTemplate(template)}
                    >
                      编辑
                    </Button>
                    {template.isCustom && (
                      <Popconfirm
                        title="确定重置为默认模板？"
                        onConfirm={() => handleResetTemplate(template.id)}
                        okText="重置"
                        cancelText="取消"
                      >
                        <Button type="link" size="small" icon={<ReloadOutlined />} danger>
                          重置
                        </Button>
                      </Popconfirm>
                    )}
                  </Space>
                </div>
              </Card>
            ))}
          </div>
        </div>
      ),
    },
  ];

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: 24 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 24,
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 600 }}>
            全局设置
          </h1>
          <p style={{ margin: '8px 0 0', color: '#888' }}>
            配置 AI 模型、语音合成、视频生成等服务
          </p>
        </div>
        <Button
          type="primary"
          icon={<SaveOutlined />}
          size="large"
          loading={saving}
          onClick={handleSave}
        >
          保存配置
        </Button>
      </div>

      <Form
        form={form}
        layout="vertical"
        initialValues={flattenSettings(settings)}
      >
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          items={tabItems}
          type="card"
        />
      </Form>

      {/* Prompt 模板编辑 Modal */}
      <Modal
        title={editingTemplate ? `编辑模板: ${editingTemplate.name}` : '编辑模板'}
        open={templateModalVisible}
        onOk={handleSaveTemplate}
        onCancel={() => setTemplateModalVisible(false)}
        okText="保存"
        cancelText="取消"
        width={800}
        maskClosable={false}
        destroyOnHidden
      >
        {editingTemplate && (
          <div>
            <p style={{ marginBottom: 8, color: '#888' }}>
              {editingTemplate.description}
            </p>
            <p style={{ marginBottom: 16, fontSize: 12, color: '#666' }}>
              可用变量: {editingTemplate.variables.map(v => `{{${v}}}`).join(', ')}
            </p>
            <Input.TextArea
              value={templateContent}
              onChange={(e) => setTemplateContent(e.target.value)}
              rows={20}
              style={{ fontFamily: 'monospace', fontSize: 13 }}
            />
          </div>
        )}
      </Modal>
    </div>
  );
};


import React, { useState, useEffect } from 'react';
import {
  Layout,
  Menu,
  Form,
  Button,
  Space,
  App,
  Divider,
  Statistic,
  Typography,
  Card,
} from 'antd';
import {
  SaveOutlined,
  UploadOutlined,
  DownloadOutlined,
  ExperimentOutlined,
  FolderOutlined,
  DeleteOutlined,
  BgColorsOutlined,
  PictureOutlined,
  VideoCameraOutlined,
  SoundOutlined,
  CodeOutlined,
  BlockOutlined,
  ApiOutlined,
} from '@ant-design/icons';
import type { AppSettings } from '../../types';
import {
  loadSettings,
  saveSettings,
  importSettingsFromFile,
  exportSettingsToFile,
} from '../../store/globalStore';
import {
  getStorageConfig,
  updateStoragePath,
} from '../../store/storageConfig';
import { electronService, normalizePath } from '../../services/electronService';
import { LLMConfigManager } from './LLMConfigManager';
import { TTIConfigManager } from './TTIConfigManager';
import { ITVConfigManager } from './ITVConfigManager';
import { TTSConfigManager } from './TTSConfigManager';
import { VisualStyleManager } from './VisualStyleManager';
import { PromptStudio } from './PromptStudio';
import { PluginManager } from '../plugins';
import { MCPConfigManager } from './MCPConfigManager';
import { resetOnboarding } from '../common/OnboardingTour';

const { Sider, Content } = Layout;
const { Title, Text } = Typography;

interface SettingsPageProps {
  settings: AppSettings;
  onSave: (newSettings: AppSettings) => void;
}

export const SettingsPage: React.FC<SettingsPageProps> = ({
  settings,
  onSave,
}) => {
  const { message, modal } = App.useApp();
  const [form] = Form.useForm();
  const [activeSection, setActiveSection] = useState('models-llm');
  const [saving, setSaving] = useState(false);
  const [storagePath, setStoragePath] = useState('');
  const [storageSize, setStorageSize] = useState('计算中...');
  const [clearingCache, setClearingCache] = useState(false);

  useEffect(() => {
    form.setFieldsValue(flattenSettings(settings));
  }, [settings, form]);

  // 计算存储空间大小
  const calcStorageSize = async (path?: string) => {
    const targetPath = path || getStorageConfig()?.rootPath;
    if (!targetPath || !electronService.isElectron()) {
      setStorageSize('N/A');
      return;
    }
    setStorageSize('计算中...');
    try {
      const size = await electronService.fs.dirSize(targetPath);
      setStorageSize(formatBytes(size));
    } catch {
      setStorageSize('计算失败');
    }
  };

  useEffect(() => {
    const config = getStorageConfig();
    if (config) {
      setStoragePath(normalizePath(config.rootPath) || '~/.koma');
    }
    calcStorageSize();
  }, []);

  // 格式化字节大小
  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const handleChangeStoragePath = async () => {
    if (!electronService.isElectron()) {
      message.warning('仅支持桌面版');
      return;
    }

    const result = await electronService.dialog.openDirectory();
    if (result.filePaths && result.filePaths.length > 0) {
      const newPath = result.filePaths[0]; // 已经被 normalizePath 处理过

      modal.confirm({
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
            calcStorageSize(newPath);
            message.success('存储位置已修改并迁移数据');
          } catch (err: any) {
            message.error(`迁移失败: ${err.message}`);
          }
        },
        onCancel: async () => {
          try {
            await updateStoragePath(newPath, false);
            setStoragePath(newPath);
            calcStorageSize(newPath);
            message.success('存储位置已修改');
          } catch (err: any) {
            message.error(`修改失败: ${err.message}`);
          }
        },
      });
    }
  };

  const handleClearCache = async () => {
    modal.confirm({
      title: '确认清理缓存',
      content: '这将清理所有项目的缓存文件（缩略图、波形、预览帧），不会影响素材和项目数据。',
      okText: '清理',
      okType: 'danger',
      onOk: async () => {
        setClearingCache(true);
        try {
          message.success('缓存已清理');
        } catch (err: any) {
          message.error(`清理失败: ${err.message}`);
        } finally {
          setClearingCache(false);
        }
      },
    });
  };

  const handleResetOnboarding = () => {
    resetOnboarding();
    message.success('引导已重置，下次进入项目列表页时将重新显示');
  };

  const flattenSettings = (s: AppSettings) => {
    return {};
  };

  const unflattenSettings = (values: any): Partial<AppSettings> => {
    return {};
  };

  const handleImportSettings = async () => {
    if (!electronService.isElectron()) {
      message.warning('仅支持桌面版');
      return;
    }

    try {
      const result = await electronService.dialog.openFile({
        filters: [{ name: 'JSON', extensions: ['json'] }],
      });

      const filePath = result.filePaths?.[0];
      if (!filePath) return;

      const imported = await importSettingsFromFile(filePath);
      if (!imported) {
        message.error('导入失败：配置格式无效');
        return;
      }

      form.setFieldsValue(flattenSettings(imported));
      onSave(imported);
      message.success('设置已导入');
    } catch (err) {
      message.error('导入失败');
    }
  };

  const handleExportSettings = async () => {
    if (!electronService.isElectron()) {
      message.warning('仅支持桌面版');
      return;
    }

    try {
      const result = await electronService.dialog.saveFile({
        defaultPath: 'koma-app-settings.json',
        filters: [{ name: 'JSON', extensions: ['json'] }],
      });

      if (!result.filePath) return;

      const ok = await exportSettingsToFile(result.filePath);
      if (!ok) {
        message.error('导出失败');
        return;
      }

      message.success('设置已导出');
    } catch {
      message.error('导出失败');
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const values = await form.validateFields();
      const partialSettings = unflattenSettings(values);
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

  const handleLLMConfigChange = async () => {
    const newSettings = await loadSettings();
    onSave(newSettings);
  };

  const handleConfigChange = async () => {
    const newSettings = await loadSettings();
    onSave(newSettings);
  };

  const menuItems = [
    {
      key: 'models',
      type: 'group' as const,
      label: '模型配置',
      children: [
        { key: 'models-llm', icon: <ExperimentOutlined />, label: 'LLM 大语言模型' },
        { key: 'models-tti', icon: <PictureOutlined />, label: '文生图 (TTI)' },
        { key: 'models-itv', icon: <VideoCameraOutlined />, label: '图生视频 (ITV)' },
        { key: 'models-tts', icon: <SoundOutlined />, label: '语音合成 (TTS)' },
      ]
    },
    {
      key: 'workflow',
      type: 'group' as const,
      label: '工作流',
      children: [
        { key: 'workflow-visual', icon: <BgColorsOutlined />, label: '视觉风格' },
        { key: 'workflow-prompts', icon: <CodeOutlined />, label: 'Prompt 模板' },
      ]
    },
    {
      key: 'system',
      type: 'group' as const,
      label: '系统',
      children: [
        { key: 'system-storage', icon: <FolderOutlined />, label: '存储与缓存' },
        { key: 'system-plugins', icon: <BlockOutlined />, label: '插件管理' },
        { key: 'system-mcp', icon: <ApiOutlined />, label: '扩展工具 (MCP)' },
      ]
    }
  ];

  const renderContent = () => {
    switch (activeSection) {
      case 'models-llm':
        return <LLMConfigManager onConfigChange={handleLLMConfigChange} />;
      case 'models-tti':
        return <TTIConfigManager onConfigChange={handleConfigChange} />;
      case 'models-itv':
        return <ITVConfigManager onConfigChange={handleConfigChange} />;
      case 'models-tts':
        return <TTSConfigManager onConfigChange={handleConfigChange} />;
      case 'workflow-visual':
        return <VisualStyleManager onStyleChange={handleConfigChange} />;
      case 'workflow-prompts':
        return <PromptStudio />;
      case 'system-storage':
        return (
          <div style={{ maxWidth: 800 }}>
            <Card title="存储概览" style={{ marginBottom: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 48 }}>
                <Statistic
                  title="存储位置"
                  value={storagePath || '~/.koma'}
                  valueStyle={{ fontSize: 16, fontFamily: 'monospace' }}
                />
                <Statistic title="已用空间" value={storageSize} />
              </div>
            </Card>

            <Card size="small" title="存储操作">
              <Space direction="vertical" style={{ width: '100%' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>更改项目和素材的默认存储路径</span>
                  <Button icon={<FolderOutlined />} onClick={handleChangeStoragePath}>
                    修改位置
                  </Button>
                </div>
                <Divider style={{ margin: '12px 0' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: '#ff4d4f' }}>清理缓存文件（不会删除项目素材）</span>
                  <Button
                    danger
                    icon={<DeleteOutlined />}
                    loading={clearingCache}
                    onClick={handleClearCache}
                  >
                    清理缓存
                  </Button>
                </div>
                <Divider style={{ margin: '12px 0' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>重新显示新手引导</span>
                  <Button onClick={handleResetOnboarding}>
                    重置引导
                  </Button>
                </div>
              </Space>
            </Card>
          </div>
        );
      case 'system-plugins':
        return <PluginManager />;
      case 'system-mcp':
        return <MCPConfigManager onConfigChange={handleConfigChange} />;
      default:
        return null;
    }
  };

  const getCurrentLabel = () => {
    for (const group of menuItems) {
      const found = group.children?.find(item => item.key === activeSection);
      if (found) return found.label;
    }
    return '';
  };

  return (
    <Layout className="h-full bg-zinc-950">
      <Sider width={240} theme="dark" className="!bg-zinc-900 border-r border-zinc-800">
        <div className="px-6 pt-6 pb-2">
          <Title level={4} className="!m-0 !text-white">全局设置</Title>
          <Text className="text-xs !text-zinc-500">System Settings</Text>
        </div>
        <Menu
          mode="inline"
          theme="dark"
          selectedKeys={[activeSection]}
          className="!bg-zinc-900 !border-r-0"
          items={menuItems}
          onClick={({ key }) => setActiveSection(key)}
        />
      </Sider>

      <Content className="h-full overflow-hidden flex flex-col bg-zinc-950">
        <div className="h-14 bg-zinc-900 border-b border-zinc-800 px-6 flex items-center justify-between shrink-0">
          <span className="font-medium text-base text-zinc-100">
            {getCurrentLabel()}
          </span>

          {activeSection.startsWith('models') && (
            <Space>
              <Button icon={<UploadOutlined />} onClick={handleImportSettings}>
                导入配置
              </Button>
              <Button icon={<DownloadOutlined />} onClick={handleExportSettings}>
                导出配置
              </Button>
              <Button
                type="primary"
                icon={<SaveOutlined />}
                loading={saving}
                onClick={handleSave}
              >
                应用配置
              </Button>
            </Space>
          )}
        </div>

        <div className="flex-1 overflow-auto p-6">
          <Form
            form={form}
            layout="vertical"
            initialValues={flattenSettings(settings)}
            className="h-full"
          >
            {renderContent()}
          </Form>
        </div>
      </Content>
    </Layout>
  );
};

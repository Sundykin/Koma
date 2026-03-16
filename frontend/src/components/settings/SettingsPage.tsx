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
import { useTranslation } from 'react-i18next';
import type { AppSettings } from '../../types';
import { loadSettings, saveSettings } from '../../store/globalStore';
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
  const { t } = useTranslation();
  const { message, modal } = App.useApp();
  const [form] = Form.useForm();
  const [activeSection, setActiveSection] = useState('models-llm');
  const [saving, setSaving] = useState(false);
  const [storagePath, setStoragePath] = useState('');
  const [storageSize, setStorageSize] = useState(t('common.calculating'));
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
    setStorageSize(t('common.calculating'));
    try {
      const size = await electronService.fs.dirSize(targetPath);
      setStorageSize(formatBytes(size));
    } catch {
      setStorageSize(t('common.calcFailed'));
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
      message.warning(t('common.desktopOnly'));
      return;
    }

    const result = await electronService.dialog.openDirectory();
    if (result.filePaths && result.filePaths.length > 0) {
      const newPath = result.filePaths[0]; // 已经被 normalizePath 处理过

      modal.confirm({
        title: t('settings.changeStorageTitle'),
        content: (
          <div>
            <p>{t('settings.newLocation')}: {newPath}</p>
            <p>{t('settings.migrateDataQuestion')}</p>
          </div>
        ),
        okText: t('settings.migrateAndChange'),
        cancelText: t('settings.onlyChange'),
        onOk: async () => {
          try {
            await updateStoragePath(newPath, true);
            setStoragePath(newPath);
            calcStorageSize(newPath);
            message.success(t('settings.storageChangedMigrated'));
          } catch {
            message.error(t('settings.migrateFailed'));
          }
        },
        onCancel: async () => {
          try {
            await updateStoragePath(newPath, false);
            setStoragePath(newPath);
            calcStorageSize(newPath);
            message.success(t('settings.storageChanged'));
          } catch {
            message.error(t('settings.changeFailed'));
          }
        },
      });
    }
  };

  const handleClearCache = async () => {
    modal.confirm({
      title: t('settings.confirmClearCache'),
      content: t('settings.clearCacheContent'),
      okText: t('common.clearCache'),
      okType: 'danger',
      onOk: async () => {
        setClearingCache(true);
        try {
          message.success(t('settings.cacheCleared'));
        } catch {
          message.error(t('settings.clearFailed'));
        } finally {
          setClearingCache(false);
        }
      },
    });
  };

  const flattenSettings = (_s: AppSettings) => {
    return {};
  };

  const unflattenSettings = (_values: any): Partial<AppSettings> => {
    return {};
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
      message.success(t('settings.settingsSaved'));
    } catch {
      message.error(t('settings.saveFailed'));
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
      label: t('settings.modelConfig'),
      children: [
        { key: 'models-llm', icon: <ExperimentOutlined />, label: t('settings.llm') },
        { key: 'models-tti', icon: <PictureOutlined />, label: t('settings.tti') },
        { key: 'models-itv', icon: <VideoCameraOutlined />, label: t('settings.itv') },
        { key: 'models-tts', icon: <SoundOutlined />, label: t('settings.tts') },
      ]
    },
    {
      key: 'workflow',
      type: 'group' as const,
      label: t('settings.workflow'),
      children: [
        { key: 'workflow-visual', icon: <BgColorsOutlined />, label: t('settings.visualStyle') },
        { key: 'workflow-prompts', icon: <CodeOutlined />, label: t('settings.promptTemplate') },
      ]
    },
    {
      key: 'system',
      type: 'group' as const,
      label: t('settings.system'),
      children: [
        { key: 'system-storage', icon: <FolderOutlined />, label: t('settings.storageAndCache') },
        { key: 'system-plugins', icon: <BlockOutlined />, label: t('settings.pluginManage') },
        { key: 'system-mcp', icon: <ApiOutlined />, label: t('settings.mcpTools') },
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
            <Card title={t('settings.storageOverview')} style={{ marginBottom: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 48 }}>
                <Statistic
                  title={t('settings.storageLocation')}
                  value={storagePath || '~/.koma'}
                  valueStyle={{ fontSize: 16, fontFamily: 'monospace' }}
                />
                <Statistic title={t('settings.usedSpace')} value={storageSize} />
              </div>
            </Card>

            <Card size="small" title={t('settings.storageOps')}>
              <Space direction="vertical" style={{ width: '100%' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>{t('settings.changeStoragePath')}</span>
                  <Button icon={<FolderOutlined />} onClick={handleChangeStoragePath}>
                    {t('common.changeLocation')}
                  </Button>
                </div>
                <Divider style={{ margin: '12px 0' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: '#ff4d4f' }}>{t('settings.clearCacheDesc')}</span>
                  <Button
                    danger
                    icon={<DeleteOutlined />}
                    loading={clearingCache}
                    onClick={handleClearCache}
                  >
                    {t('common.clearCache')}
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
          <Title level={4} className="!m-0 !text-white">{t('settings.globalSettings')}</Title>
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
            <Button
              type="primary"
              icon={<SaveOutlined />}
              loading={saving}
              onClick={handleSave}
            >
              {t('common.applyConfig')}
            </Button>
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

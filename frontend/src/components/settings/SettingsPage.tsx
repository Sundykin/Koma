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
import type { AppSettings } from '../../types';
import { loadSettings, saveSettings } from '../../store/globalStore';
import {
  getStorageConfig,
  updateStoragePath,
} from '../../store/storageConfig';
import { electronService } from '../../services/electronService';
import { LLMConfigManager } from './LLMConfigManager';
import { TTIConfigManager } from './TTIConfigManager';
import { ITVConfigManager } from './ITVConfigManager';
import { TTSConfigManager } from './TTSConfigManager';
import { VisualStyleManager } from './VisualStyleManager';
import { PromptStudio } from './PromptStudio';

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

  useEffect(() => {
    const config = getStorageConfig();
    if (config) {
      setStoragePath(config.rootPath || '~/.koma');
    }
  }, []);

  const handleChangeStoragePath = async () => {
    if (!electronService.isElectron()) {
      message.warning('仅支持桌面版');
      return;
    }

    const result = await electronService.dialog.openDirectory();
    if (result.filePaths && result.filePaths.length > 0) {
      const newPath = result.filePaths[0];

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

  const flattenSettings = (s: AppSettings) => {
    return {};
  };

  const unflattenSettings = (values: any): Partial<AppSettings> => {
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
              </Space>
            </Card>
          </div>
        );
      case 'system-plugins':
        return (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#999', padding: 48 }}>
            <ApiOutlined style={{ fontSize: 48, marginBottom: 16, opacity: 0.5 }} />
            <Title level={4} style={{ color: '#999' }}>插件系统开发中</Title>
            <Text type="secondary">支持导入自定义插件以扩展系统功能</Text>
          </div>
        );
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
    <Layout style={{ height: '100%', background: '#fff' }}>
      <Sider width={240} theme="light" style={{ borderRight: '1px solid #f0f0f0' }}>
        <div style={{ padding: '24px 24px 8px' }}>
          <Title level={4} style={{ margin: 0 }}>全局设置</Title>
          <Text type="secondary" style={{ fontSize: 12 }}>System Settings</Text>
        </div>
        <Menu
          mode="inline"
          selectedKeys={[activeSection]}
          style={{ borderRight: 0 }}
          items={menuItems}
          onClick={({ key }) => setActiveSection(key)}
        />
      </Sider>

      <Content style={{ height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column', background: '#fafafa' }}>
        <div style={{ height: 56, background: '#fff', borderBottom: '1px solid #f0f0f0', padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <span style={{ fontWeight: 500, fontSize: 16, color: '#333' }}>
            {getCurrentLabel()}
          </span>

          {activeSection.startsWith('models') && (
            <Button
              type="primary"
              icon={<SaveOutlined />}
              loading={saving}
              onClick={handleSave}
            >
              应用配置
            </Button>
          )}
        </div>

        <div style={{ flex: 1, overflow: 'auto', padding: 24 }}>
          <Form
            form={form}
            layout="vertical"
            initialValues={flattenSettings(settings)}
            style={{ height: '100%' }}
          >
            {renderContent()}
          </Form>
        </div>
      </Content>
    </Layout>
  );
};

import React, { useEffect, useState } from 'react';
import { Modal, Form, Input, Radio, Space, Spin, Tooltip } from 'antd';
import {
  SoundOutlined,
  AppstoreOutlined,
  QuestionCircleOutlined,
} from '@ant-design/icons';
import { Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  DEFAULT_THEME_PRESET_ID,
  getAllThemePresets,
  type ThemePresetCatalogItem,
} from '../../config/themePresets';

interface CreateProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (data: {
    title: string;
    mode: 'drama' | 'narration';
    stylePresetId: string;
  }) => void;
}

export const CreateProjectModal: React.FC<CreateProjectModalProps> = ({ isOpen, onClose, onCreate }) => {
  const { t } = useTranslation();
  const [form] = Form.useForm();
  const [themePresets, setThemePresets] = useState<ThemePresetCatalogItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedTheme, setSelectedTheme] = useState<string>(DEFAULT_THEME_PRESET_ID);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    let cancelled = false;
    const loadPresets = async () => {
      setLoading(true);
      try {
        const presets = await getAllThemePresets();
        if (cancelled) {
          return;
        }

        setThemePresets(presets);
        if (!presets.some((preset) => preset.id === selectedTheme)) {
          setSelectedTheme(presets[0]?.id || DEFAULT_THEME_PRESET_ID);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadPresets();

    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  const handleCreate = async () => {
    try {
      const values = await form.validateFields();
      const fallbackThemeId = themePresets[0]?.id || DEFAULT_THEME_PRESET_ID;
      onCreate({
        title: values.title,
        mode: values.mode || 'drama',
        stylePresetId: selectedTheme || fallbackThemeId,
      });
      form.resetFields();
      setSelectedTheme(fallbackThemeId);
    } catch {
      // 验证失败
    }
  };

  return (
    <Modal
      title={t('project.create')}
      open={isOpen}
      onCancel={onClose}
      onOk={handleCreate}
      okText={t('project.createNow')}
      cancelText={t('common.cancel')}
      width={680}
      centered
      mask={{ closable: false }}
      destroyOnHidden
    >
      <Form
        form={form}
        layout="vertical"
        initialValues={{ mode: 'drama' }}
        style={{ marginTop: 16 }}
      >
        <Form.Item
          name="title"
          label={t('project.projectName')}
          required
          rules={[{ required: true, message: t('project.projectNameRequired') }]}
        >
          <Input placeholder={t('project.projectNamePlaceholder')} autoFocus />
        </Form.Item>

        <Form.Item name="mode" label={t('project.narrativeMode')}>
          <Radio.Group buttonStyle="solid" style={{ width: '100%' }}>
            <Space orientation="vertical" style={{ width: '100%' }} size="middle">
              <Radio.Button
                value="drama"
                style={{ width: '100%', height: 48, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <Space>
                  <AppstoreOutlined />
                  <span style={{ fontWeight: 'bold' }}>{t('project.dramaMode')}</span>
                  <Tooltip title={t('project.dramaModeDesc')}>
                    <QuestionCircleOutlined style={{ opacity: 0.6, fontSize: 12 }} />
                  </Tooltip>
                </Space>
              </Radio.Button>
              <Radio.Button
                value="narration"
                style={{ width: '100%', height: 48, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <Space>
                  <SoundOutlined />
                  <span style={{ fontWeight: 'bold' }}>{t('project.narrationMode')}</span>
                  <Tooltip title={t('project.narrationModeDesc')}>
                    <QuestionCircleOutlined style={{ opacity: 0.6, fontSize: 12 }} />
                  </Tooltip>
                </Space>
              </Radio.Button>
            </Space>
          </Radio.Group>
        </Form.Item>

        {/* 视觉风格选择 */}
        <Form.Item label={t('project.visualStyle')}>
          {loading ? (
            <div className="py-6 text-center">
              <Spin size="small" />
            </div>
          ) : (
            <div className="grid grid-cols-4 gap-2">
              {themePresets.map(theme => {
                const isSelected = selectedTheme === theme.id;
                return (
                  <div
                    key={theme.id}
                    className={`
                      relative p-2 rounded-lg cursor-pointer transition-all text-center
                      ${isSelected
                        ? 'bg-emerald-900/30 border-2 border-emerald-500'
                        : 'bg-zinc-800 border-2 border-zinc-700 hover:border-zinc-500'
                      }
                    `}
                    onClick={() => setSelectedTheme(theme.id)}
                  >
                    {isSelected && (
                      <div className="absolute top-1 right-1 w-4 h-4 bg-emerald-500 rounded-full flex items-center justify-center">
                        <Check className="w-2.5 h-2.5 text-white" />
                      </div>
                    )}
                    <div className="text-xs font-medium text-zinc-200">{theme.name}</div>
                  </div>
                );
              })}
            </div>
          )}

          {selectedTheme && (
            <div className="mt-2 text-xs text-zinc-500">
              {themePresets.find(t => t.id === selectedTheme)?.description}
            </div>
          )}
        </Form.Item>
      </Form>
    </Modal>
  );
};

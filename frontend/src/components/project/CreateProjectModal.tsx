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
import styles from './CreateProjectModal.module.scss';

interface CreateProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (data: {
    title: string;
    mode: 'drama' | 'narration';
    aspectRatio: '16:9' | '9:16';
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
        aspectRatio: values.aspectRatio || '16:9',
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
        initialValues={{ mode: 'drama', aspectRatio: '16:9' }}
        className={styles.form}
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
          <Radio.Group buttonStyle="solid" className={styles.fullWidth}>
            <Space orientation="vertical" className={styles.fullWidth} size="middle">
              <Radio.Button
                value="drama"
                className={styles.modeButton}
              >
                <Space>
                  <AppstoreOutlined />
                  <span className={styles.optionLabel}>{t('project.dramaMode')}</span>
                  <Tooltip title={t('project.dramaModeDesc')}>
                    <QuestionCircleOutlined className={styles.helpIcon} />
                  </Tooltip>
                </Space>
              </Radio.Button>
              <Radio.Button
                value="narration"
                className={styles.modeButton}
              >
                <Space>
                  <SoundOutlined />
                  <span className={styles.optionLabel}>{t('project.narrationMode')}</span>
                  <Tooltip title={t('project.narrationModeDesc')}>
                    <QuestionCircleOutlined className={styles.helpIcon} />
                  </Tooltip>
                </Space>
              </Radio.Button>
            </Space>
          </Radio.Group>
        </Form.Item>

        <Form.Item name="aspectRatio" label="画面比例">
          <Radio.Group buttonStyle="solid" className={styles.fullWidth}>
            <Space className={styles.fullWidth} size="middle">
              <Radio.Button
                value="16:9"
                className={styles.aspectButton}
              >
                <Space>
                  <span className={`${styles.aspectIcon} ${styles.aspectIconLandscape}`} />
                  <span className={styles.optionLabel}>16:9 横屏</span>
                </Space>
              </Radio.Button>
              <Radio.Button
                value="9:16"
                className={styles.aspectButton}
              >
                <Space>
                  <span className={`${styles.aspectIcon} ${styles.aspectIconPortrait}`} />
                  <span className={styles.optionLabel}>9:16 竖屏</span>
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
            <div className={styles.themeGrid}>
              {themePresets.map(theme => {
                const isSelected = selectedTheme === theme.id;
                return (
                  <div
                    key={theme.id}
                    className={`${styles.themeCard} ${isSelected ? styles.themeCardSelected : ''}`}
                    onClick={() => setSelectedTheme(theme.id)}
                  >
                    {isSelected && (
                      <div className={styles.themeCheck}>
                        <Check className={styles.themeCheckIcon} />
                      </div>
                    )}
                    <div className={styles.themeName}>{theme.name}</div>
                  </div>
                );
              })}
            </div>
          )}

          {selectedTheme && (
            <div className={styles.themeDescription}>
              {themePresets.find(t => t.id === selectedTheme)?.description}
            </div>
          )}
        </Form.Item>
      </Form>
    </Modal>
  );
};

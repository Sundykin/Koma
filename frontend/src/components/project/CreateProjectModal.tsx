import React, { useEffect, useState } from 'react';
import { Modal, Form, Input, Spin, Segmented, Row, Col, Tooltip } from 'antd';
import {
  SoundOutlined,
  AppstoreOutlined,
} from '@ant-design/icons';
import { Check, FileText, Image as ImageIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  DEFAULT_THEME_PRESET_ID,
  getAllThemePresets,
  type ThemePresetCatalogItem,
} from '../../config/themePresets';
import { ipc, ipcApiRoute } from '../../utils/ipcRenderer';
import { toKomaLocalUrl } from '../../utils/urlUtils';
import styles from './CreateProjectModal.module.scss';

interface CreateProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (data: {
    title: string;
    mode: 'drama' | 'narration';
    aspectRatio: '16:9' | '9:16';
    stylePresetId: string;
    /** 可选：粘贴的剧本，提供则自动创建第 1 集并把这段文本写入 scriptText */
    scriptText?: string;
  }) => void;
}

export const CreateProjectModal: React.FC<CreateProjectModalProps> = ({ isOpen, onClose, onCreate }) => {
  const { t } = useTranslation();
  const [form] = Form.useForm();
  const [themePresets, setThemePresets] = useState<ThemePresetCatalogItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedTheme, setSelectedTheme] = useState<string>(DEFAULT_THEME_PRESET_ID);
  /** 每个 preset 的本地预览图 URL（来自 koma-local:// scheme） */
  const [themeImages, setThemeImages] = useState<Record<string, string | null>>({});
  const [scriptText, setScriptText] = useState('');

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    let cancelled = false;
    const loadPresets = async () => {
      setLoading(true);
      try {
        const presets = await getAllThemePresets();
        if (cancelled) return;

        setThemePresets(presets);
        if (!presets.some((preset) => preset.id === selectedTheme)) {
          setSelectedTheme(presets[0]?.id || DEFAULT_THEME_PRESET_ID);
        }

        // 拉取每个 preset 的当前生效风格图（与设置面板逻辑一致）
        const imageEntries = await Promise.all(presets.map(async (preset) => {
          try {
            const resp = await ipc.invoke(
              ipcApiRoute.app.getActiveStyleReferenceImagePath,
              { presetId: preset.id, fallbackFilename: preset.defaultStyleReferenceFile },
            ) as { localPath: string | null } | null;
            return [preset.id, resp?.localPath ? toKomaLocalUrl(resp.localPath) : null] as const;
          } catch {
            return [preset.id, null] as const;
          }
        }));
        if (cancelled) return;
        setThemeImages(Object.fromEntries(imageEntries));
      } finally {
        if (!cancelled) setLoading(false);
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
      const trimmedScript = scriptText.trim();
      onCreate({
        title: values.title,
        mode: values.mode || 'drama',
        aspectRatio: values.aspectRatio || '16:9',
        stylePresetId: selectedTheme || fallbackThemeId,
        scriptText: trimmedScript || undefined,
      });
      form.resetFields();
      setScriptText('');
      setSelectedTheme(fallbackThemeId);
    } catch {
      // 验证失败
    }
  };

  const selectedPreset = themePresets.find(t => t.id === selectedTheme);

  return (
    <Modal
      title={t('project.create')}
      open={isOpen}
      onCancel={onClose}
      onOk={handleCreate}
      okText={t('project.createNow')}
      cancelText={t('common.cancel')}
      width={760}
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

        {/* 叙事模式 + 画面比例：紧凑同行（Segmented，节省纵向篇幅） */}
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item name="mode" label={t('project.narrativeMode')}>
              <Segmented
                block
                size="middle"
                options={[
                  {
                    value: 'drama',
                    label: (
                      <Tooltip title={t('project.dramaModeDesc')} placement="bottom">
                        <span className={styles.segLabel}>
                          <AppstoreOutlined /> {t('project.dramaMode')}
                        </span>
                      </Tooltip>
                    ),
                  },
                  {
                    value: 'narration',
                    label: (
                      <Tooltip title={t('project.narrationModeDesc')} placement="bottom">
                        <span className={styles.segLabel}>
                          <SoundOutlined /> {t('project.narrationMode')}
                        </span>
                      </Tooltip>
                    ),
                  },
                ]}
              />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="aspectRatio" label="画面比例">
              <Segmented
                block
                size="middle"
                options={[
                  {
                    value: '16:9',
                    label: (
                      <span className={styles.segLabel}>
                        <span className={`${styles.aspectIcon} ${styles.aspectIconLandscape}`} />
                        16:9 横屏
                      </span>
                    ),
                  },
                  {
                    value: '9:16',
                    label: (
                      <span className={styles.segLabel}>
                        <span className={`${styles.aspectIcon} ${styles.aspectIconPortrait}`} />
                        9:16 竖屏
                      </span>
                    ),
                  },
                ]}
              />
            </Form.Item>
          </Col>
        </Row>

        {/* 视觉风格：图卡 grid（与设置面板风格管理一致） */}
        <Form.Item
          label={(
            <span className={styles.themeLabelRow}>
              <span>{t('project.visualStyle')}</span>
              {selectedPreset && (
                <span className={styles.themeLabelDesc}>{selectedPreset.description}</span>
              )}
            </span>
          )}
          className={styles.themeFormItem}
        >
          {loading ? (
            <div className="py-6 text-center">
              <Spin size="small" />
            </div>
          ) : (
            <div className={styles.themeGrid}>
              {themePresets.map(theme => {
                const isSelected = selectedTheme === theme.id;
                const imageUrl = themeImages[theme.id];
                return (
                  <div
                    key={theme.id}
                    className={`${styles.themeCard} ${isSelected ? styles.themeCardSelected : ''}`}
                    onClick={() => setSelectedTheme(theme.id)}
                  >
                    <div className={styles.themeImage}>
                      {imageUrl ? (
                        <img src={imageUrl} alt={theme.name} loading="lazy" />
                      ) : (
                        <div className={styles.themeImageEmpty}>
                          <ImageIcon className="w-5 h-5 opacity-40" />
                        </div>
                      )}
                      {isSelected && (
                        <div className={styles.themeCheck}>
                          <Check className={styles.themeCheckIcon} />
                        </div>
                      )}
                    </div>
                    <div className={styles.themeName} title={theme.name}>{theme.name}</div>
                  </div>
                );
              })}
            </div>
          )}
        </Form.Item>

        {/* 剧本导入（可选） */}
        <Form.Item
          label={(
            <span className={styles.importLabelRow}>
              <FileText className="w-3.5 h-3.5" />
              <span>导入剧本</span>
              <span className={styles.importLabelHint}>可选 · 提供后自动创建第 1 集</span>
            </span>
          )}
          className={styles.importFormItem}
        >
          <Input.TextArea
            value={scriptText}
            onChange={(e) => setScriptText(e.target.value)}
            placeholder="将完整剧本（或字幕格式文本）粘贴在这里，留空则进入空白项目"
            autoSize={{ minRows: 4, maxRows: 10 }}
          />
        </Form.Item>
      </Form>
    </Modal>
  );
};

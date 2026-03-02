/**
 * 视觉风格管理组件
 * 管理用户自定义视觉风格预设
 */
import React, { useState, useEffect } from 'react';
import {
  Card,
  Row,
  Col,
  Button,
  Modal,
  Form,
  Input,
  Space,
  Tag,
  Tooltip,
  Empty,
  Popconfirm,
  Spin,
  App,
  Typography,
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  BgColorsOutlined,
  EyeOutlined,
} from '@ant-design/icons';
import type { ThemePreset } from '../../types';
import {
  getCustomThemePresets,
  addCustomThemePreset,
  updateCustomThemePreset,
  deleteCustomThemePreset,
} from '../../store/globalStore';
import { THEME_PRESETS } from '../../config/themePresets';
import { toUserMessage } from '../../utils/errorMessages';
import { useTranslation } from 'react-i18next';

const { TextArea } = Input;
const { Text, Paragraph } = Typography;

interface VisualStyleManagerProps {
  onStyleChange?: () => void;
}

export const VisualStyleManager: React.FC<VisualStyleManagerProps> = ({ onStyleChange }) => {
  const { message, modal } = App.useApp();
  const { t } = useTranslation('settings');
  const [customPresets, setCustomPresets] = useState<ThemePreset[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingPreset, setEditingPreset] = useState<ThemePreset | null>(null);
  const [previewVisible, setPreviewVisible] = useState(false);
  const [previewPreset, setPreviewPreset] = useState<ThemePreset | null>(null);
  const [form] = Form.useForm();

  const loadPresets = async () => {
    setLoading(true);
    try {
      const presets = await getCustomThemePresets();
      setCustomPresets(presets);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPresets();
  }, []);

  const openModal = (preset?: ThemePreset) => {
    if (preset) {
      setEditingPreset(preset);
      form.setFieldsValue({
        name: preset.name,
        description: preset.description,
        ttiStylePrefix: preset.ttiStylePrefix,
        llmPromptSuffix: preset.llmPromptSuffix,
      });
    } else {
      setEditingPreset(null);
      form.resetFields();
    }
    setModalVisible(true);
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      const presetData = {
        name: values.name,
        description: values.description || '',
        ttiStylePrefix: values.ttiStylePrefix || '',
        llmPromptSuffix: values.llmPromptSuffix || '',
      };

      if (editingPreset) {
        await updateCustomThemePreset(editingPreset.id, presetData);
        message.success(t('visualStyle.updateSuccess'));
      } else {
        await addCustomThemePreset(presetData);
        message.success(t('visualStyle.addSuccess'));
      }

      setModalVisible(false);
      await loadPresets();
      onStyleChange?.();
    } catch (err: any) {
      if (err.errorFields) return;
      message.error(t('common.saveFailed', { error: toUserMessage(err) }));
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteCustomThemePreset(id);
      message.success(t('visualStyle.deleteSuccess'));
      await loadPresets();
      onStyleChange?.();
    } catch (err: any) {
      message.error(t('common.deleteFailed', { error: toUserMessage(err) }));
    }
  };

  const handlePreview = (preset: ThemePreset) => {
    setPreviewPreset(preset);
    setPreviewVisible(true);
  };

  // 系统预设（只读展示）
  const systemPresets = THEME_PRESETS.filter(t => t.id !== 'custom');

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 40 }}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div>
      {/* 自定义预设区 */}
      <Card
        title={t('visualStyle.customPresetsTitle')}
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => openModal()}>
            {t('visualStyle.addStyleBtn')}
          </Button>
        }
        style={{ marginBottom: 16 }}
      >
        {customPresets.length === 0 ? (
          <Empty
            description={t('visualStyle.emptyDesc')}
            image={Empty.PRESENTED_IMAGE_SIMPLE}
          >
            <Button type="primary" onClick={() => openModal()}>
              {t('visualStyle.createFirstBtn')}
            </Button>
          </Empty>
        ) : (
          <Row gutter={[16, 16]}>
            {customPresets.map((preset) => (
              <Col key={preset.id} xs={24} sm={12} lg={8}>
                <Card
                  size="small"
                  hoverable
                  actions={[
                    <Tooltip key="preview" title={t('visualStyle.previewTooltip')}>
                      <EyeOutlined onClick={() => handlePreview(preset)} />
                    </Tooltip>,
                    <Tooltip key="edit" title={t('common.edit')}>
                      <EditOutlined onClick={() => openModal(preset)} />
                    </Tooltip>,
                    <Popconfirm
                      key="delete"
                      title={t('visualStyle.confirmDelete')}
                      onConfirm={() => handleDelete(preset.id)}
                      okText={t('common.delete')}
                      cancelText={t('common.cancel')}
                    >
                      <DeleteOutlined style={{ color: '#ff4d4f' }} />
                    </Popconfirm>,
                  ]}
                >
                  <Card.Meta
                    avatar={<BgColorsOutlined style={{ fontSize: 24, color: '#1890ff' }} />}
                    title={preset.name}
                    description={
                      <Text type="secondary" ellipsis>
                        {preset.description || t('visualStyle.noDescription')}
                      </Text>
                    }
                  />
                </Card>
              </Col>
            ))}
          </Row>
        )}
      </Card>

      {/* 系统预设区（只读） */}
      <Card title={t('visualStyle.systemPresetsTitle')} size="small">
        <Row gutter={[16, 16]}>
          {systemPresets.map((preset) => (
            <Col key={preset.id} xs={24} sm={12} lg={8}>
              <Card
                size="small"
                hoverable
                onClick={() => handlePreview(preset)}
              >
                <Card.Meta
                  avatar={<BgColorsOutlined style={{ fontSize: 20, color: '#52c41a' }} />}
                  title={
                    <Space>
                      {preset.name}
                      <Tag color="green">{t('visualStyle.builtinTag')}</Tag>
                    </Space>
                  }
                  description={
                    <Text type="secondary" ellipsis>
                      {preset.description}
                    </Text>
                  }
                />
              </Card>
            </Col>
          ))}
        </Row>
      </Card>

      {/* 编辑弹窗 */}
      <Modal
        title={editingPreset ? t('visualStyle.editTitle') : t('visualStyle.addTitle')}
        open={modalVisible}
        onOk={handleSave}
        onCancel={() => setModalVisible(false)}
        okText={t('common.save')}
        cancelText={t('common.cancel')}
        width={600}
        maskClosable={false}
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="name"
            label={t('visualStyle.form.nameLabel')}
            rules={[{ required: true, message: t('visualStyle.form.nameRequired') }]}
          >
            <Input placeholder={t('visualStyle.form.namePlaceholder')} />
          </Form.Item>

          <Form.Item
            name="description"
            label={t('visualStyle.form.descLabel')}
          >
            <Input placeholder={t('visualStyle.form.descPlaceholder')} />
          </Form.Item>

          <Form.Item
            name="ttiStylePrefix"
            label={t('visualStyle.form.ttiPrefixLabel')}
            tooltip={t('visualStyle.form.ttiPrefixTooltip')}
          >
            <TextArea
              rows={3}
              placeholder="如：watercolor painting style, soft colors, artistic brushstrokes, "
            />
          </Form.Item>

          <Form.Item
            name="llmPromptSuffix"
            label={t('visualStyle.form.llmSuffixLabel')}
            tooltip={t('visualStyle.form.llmSuffixTooltip')}
          >
            <TextArea
              rows={2}
              placeholder={t('visualStyle.form.llmSuffixPlaceholder')}
            />
          </Form.Item>
        </Form>
      </Modal>

      {/* 预览弹窗 */}
      <Modal
        title={t('visualStyle.previewTitle', { name: previewPreset?.name })}
        open={previewVisible}
        onCancel={() => setPreviewVisible(false)}
        footer={null}
        width={600}
      >
        {previewPreset && (
          <div>
            <Paragraph>
              <Text strong>{t('visualStyle.preview.descLabel')}</Text>
              <Text>{previewPreset.description || t('visualStyle.noDescription')}</Text>
            </Paragraph>
            <Paragraph>
              <Text strong>{t('visualStyle.preview.ttiPrefixLabel')}</Text>
              <br />
              <Text code style={{ wordBreak: 'break-all' }}>
                {previewPreset.ttiStylePrefix || t('visualStyle.preview.empty')}
              </Text>
            </Paragraph>
            <Paragraph>
              <Text strong>{t('visualStyle.preview.llmSuffixLabel')}</Text>
              <br />
              <Text code style={{ wordBreak: 'break-all' }}>
                {previewPreset.llmPromptSuffix || t('visualStyle.preview.empty')}
              </Text>
            </Paragraph>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default VisualStyleManager;

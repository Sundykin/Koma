/**
 * 视觉风格管理组件
 * 管理用户自定义视觉风格预设
 *
 * 注：整体「风格参考图」机制已移除（模型有一定概率直接在锚图上改图，
 * 而非迁移画风）。风格仅通过提示词前缀/后缀表达；单个资产仍可手动上传参考图。
 */
import React, { useState, useEffect } from 'react';
import { createLogger } from '../../store/logger';

const logger = createLogger('VisualStyleManager');
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
import styles from './VisualStyleManager.module.scss';

const { TextArea } = Input;
const { Text, Paragraph } = Typography;

interface VisualStyleManagerProps {
  onStyleChange?: () => void;
}

export const VisualStyleManager: React.FC<VisualStyleManagerProps> = ({ onStyleChange }) => {
  const { message } = App.useApp();
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
    } catch (err: any) {
      logger.warn('loadPresets failed', { error: err?.message });
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
        message.success('风格预设已更新');
      } else {
        await addCustomThemePreset(presetData);
        message.success('风格预设已添加');
      }

      setModalVisible(false);
      await loadPresets();
      onStyleChange?.();
    } catch (err: any) {
      if (err.errorFields) return;
      message.error(`保存失败: ${err.message}`);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteCustomThemePreset(id);
      message.success('风格预设已删除');
      await loadPresets();
      onStyleChange?.();
    } catch (err: any) {
      message.error(`删除失败: ${err.message}`);
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
      <div className={styles.loadingState}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div className="settings-manager">
      {/* 自定义预设区 */}
      <Card
        title="自定义风格预设"
        size="small"
        className={`settings-config-card ${styles.cardSpacing}`}
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => openModal()}>
            添加风格
          </Button>
        }
      >
        {customPresets.length === 0 ? (
          <Empty
            description="暂无自定义风格预设"
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            className="settings-empty-state"
          >
            <Button type="primary" onClick={() => openModal()}>
              创建第一个风格预设
            </Button>
          </Empty>
        ) : (
          <Row gutter={[12, 12]}>
            {customPresets.map((preset) => (
              <Col key={preset.id} xs={24} sm={12} lg={8}>
                <Card
                  size="small"
                  className="settings-config-card"
                  hoverable
                  actions={[
                    <Tooltip key="preview" title="预览">
                      <EyeOutlined onClick={() => handlePreview(preset)} />
                    </Tooltip>,
                    <Tooltip key="edit" title="编辑">
                      <EditOutlined onClick={() => openModal(preset)} />
                    </Tooltip>,
                    <Popconfirm
                      key="delete"
                      title="确定删除此风格预设吗？"
                      onConfirm={() => handleDelete(preset.id)}
                      okText="删除"
                      cancelText="取消"
                    >
                      <DeleteOutlined className={styles.dangerIcon} />
                    </Popconfirm>,
                  ]}
                >
                  <Card.Meta
                    avatar={<BgColorsOutlined className={styles.systemIcon} />}
                    title={preset.name}
                    description={
                      <Text type="secondary" ellipsis>
                        {preset.description || '无描述'}
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
      <Card title="系统内置风格" size="small" className="settings-config-card">
        <Row gutter={[12, 12]}>
          {systemPresets.map((preset) => (
            <Col key={preset.id} xs={24} sm={12} lg={8}>
              <Card
                size="small"
                className="settings-config-card"
                hoverable
              >
                <div onClick={() => handlePreview(preset)} className={styles.clickablePreset}>
                  <Card.Meta
                    avatar={<BgColorsOutlined className={styles.builtinIcon} />}
                    title={
                      <Space>
                        {preset.name}
                        <Tag color="green">内置</Tag>
                      </Space>
                    }
                    description={
                      <Text type="secondary" ellipsis>
                        {preset.description}
                      </Text>
                    }
                  />
                </div>
              </Card>
            </Col>
          ))}
        </Row>
      </Card>

      {/* 编辑弹窗 */}
      <Modal
        title={editingPreset ? '编辑风格预设' : '添加风格预设'}
        open={modalVisible}
        onOk={handleSave}
        onCancel={() => setModalVisible(false)}
        okText="保存"
        cancelText="取消"
        width={780}
        mask={{ closable: false }}
        className="dark-modal settings-compact-modal"
      >
        <Form form={form} layout="vertical" className="settings-modal-form">
          <div className="settings-form-section">
            <div className="settings-form-section-title">基础信息</div>
            <div className="settings-modal-grid">
              <Form.Item
                name="name"
                label="风格名称"
                rules={[{ required: true, message: '请输入风格名称' }]}
              >
                <Input placeholder="如：水彩画风、3D 渲染、复古胶片等" />
              </Form.Item>

              <Form.Item
                name="description"
                label="风格描述"
                className={styles.compactItem}
              >
                <Input placeholder="简要描述这个风格的特点" />
              </Form.Item>
            </div>
          </div>

          <div className="settings-form-section">
            <div className="settings-form-section-title">生成提示词</div>
            <div className="settings-modal-grid">
              <Form.Item
                name="ttiStylePrefix"
                label="图片生成提示词前缀"
                tooltip="生成图片时会自动添加到提示词开头"
                className={styles.compactItem}
              >
                <TextArea
                  rows={3}
                  placeholder="如：watercolor painting style, soft colors, artistic brushstrokes"
                />
              </Form.Item>

              <Form.Item
                name="llmPromptSuffix"
                label="LLM 风格后缀"
                tooltip="生成剧本/描述时会添加到提示词中，引导 AI 使用这种风格"
                className={styles.compactItem}
              >
                <TextArea
                  rows={3}
                  placeholder="如：以水彩画的视觉风格呈现，色彩柔和，富有艺术感。"
                />
              </Form.Item>
            </div>
          </div>
        </Form>
      </Modal>

      {/* 预览弹窗 */}
      <Modal
        title={`风格预览：${previewPreset?.name}`}
        open={previewVisible}
        onCancel={() => setPreviewVisible(false)}
        footer={null}
        width={760}
        className="dark-modal settings-compact-modal settings-slim-preview"
      >
        {previewPreset && (
          <div className="settings-card-content">
            <Paragraph className={styles.previewParagraph}>
              <Text strong>描述：</Text>
              <Text>{previewPreset.description || '无描述'}</Text>
            </Paragraph>
            <Paragraph className={styles.previewParagraph}>
              <Text strong>图片生成提示词前缀：</Text>
              <br />
              <Text code className={styles.breakCode}>
                {previewPreset.ttiStylePrefix || '（无）'}
              </Text>
            </Paragraph>
            <Paragraph className={styles.previewParagraphLast}>
              <Text strong>LLM 风格后缀：</Text>
              <br />
              <Text code className={styles.breakCode}>
                {previewPreset.llmPromptSuffix || '（无）'}
              </Text>
            </Paragraph>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default VisualStyleManager;

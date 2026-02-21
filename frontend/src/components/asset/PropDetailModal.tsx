/**
 * 道具详情弹窗
 * 支持编辑道具信息、生成/上传资产、道具提取
 */
import React, { useState, useCallback, useEffect } from 'react';
import {
  Modal,
  Form,
  Input,
  Select,
  Button,
  Space,
  Progress,
  Spin,
  App,
  Row,
  Col,
  Divider,
  Typography,
  Popconfirm,
} from 'antd';
import {
  InboxOutlined,
  SaveOutlined,
  DeleteOutlined,
  UploadOutlined,
  ThunderboltOutlined,
  PlayCircleOutlined,
  CheckCircleOutlined,
  LoadingOutlined,
  LinkOutlined,
  EditOutlined,
} from '@ant-design/icons';
import type { Prop } from '../../types';
import {
  generatePropImage,
  generatePropPreviewVideo,
  extractAndBindProp,
} from '../../workflow/scenePropAssetWorkflow';
import { electronService, openFileDialog, fsCopy, fsMkdir, fsExists } from '../../services/electronService';
import { getStorageConfig, initStorageConfig } from '../../store/storageConfig';
import { saveProps, loadProps } from '../../store/projectStore';

const { TextArea } = Input;
const { Text } = Typography;

interface PropDetailModalProps {
  open: boolean;
  prop: Prop | null;
  projectId: string;
  theme?: string;
  stylePrompt?: string;
  ttiConfigId?: string;
  itvConfigId?: string;
  onClose: () => void;
  onUpdate: (prop: Prop) => void;
  onDelete: (propId: string) => void;
}

type GeneratingType = 'image' | 'video' | 'extract' | null;

export const PropDetailModal: React.FC<PropDetailModalProps> = ({
  open,
  prop,
  projectId,
  theme,
  stylePrompt,
  ttiConfigId,
  itvConfigId,
  onClose,
  onUpdate,
  onDelete,
}) => {
  const { message } = App.useApp();
  const [form] = Form.useForm();

  // 编辑状态
  const [editedProp, setEditedProp] = useState<Prop | null>(null);
  const [isPromptEditing, setIsPromptEditing] = useState(false);
  const [customPrompt, setCustomPrompt] = useState('');

  // 生成状态
  const [generating, setGenerating] = useState<GeneratingType>(null);
  const [progress, setProgress] = useState(0);
  const [progressStep, setProgressStep] = useState('');

  // 预览弹窗
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  // 初始化表单
  useEffect(() => {
    if (prop && open) {
      setEditedProp({ ...prop });
      form.setFieldsValue({
        name: prop.name,
        type: prop.type,
        description: prop.description,
      });
      setCustomPrompt(prop.customPrompt || '');
      setIsPromptEditing(false);
    }
  }, [prop, open, form]);

  // 获取资产路径
  const getAssetPath = useCallback(async (subPath: string) => {
    if (!editedProp) return '';
    const config = getStorageConfig() || (await initStorageConfig());
    const basePath = `${config.rootPath}/projects/${projectId}/assets/props/${editedProp.id}`;
    const fullPath = `${basePath}/${subPath}`;
    const dir = fullPath.substring(0, fullPath.lastIndexOf('/'));
    if (!(await fsExists(dir))) {
      await fsMkdir(dir);
    }
    return fullPath;
  }, [projectId, editedProp?.id]);

  // 保存道具信息
  const handleSave = useCallback(async () => {
    if (!editedProp) return;

    try {
      const values = await form.validateFields();
      const updatedProp: Prop = {
        ...editedProp,
        ...values,
        customPrompt: customPrompt || undefined,
      };

      const props = await loadProps(projectId);
      const index = props.findIndex(p => p.id === editedProp.id);
      if (index !== -1) {
        props[index] = updatedProp;
        await saveProps(projectId, props);
      }

      setEditedProp(updatedProp);
      onUpdate(updatedProp);
      message.success('保存成功');
    } catch (err: any) {
      message.error(err.message || '保存失败');
    }
  }, [editedProp, form, customPrompt, projectId, onUpdate, message]);

  // 生成道具图片
  const handleGenerateImage = useCallback(async () => {
    if (!editedProp) return;

    setGenerating('image');
    setProgress(0);

    try {
      const result = await generatePropImage({
        projectId,
        prop: { ...editedProp, customPrompt: customPrompt || undefined },
        theme,
        stylePrompt,
        ttiConfigId,
        onProgress: (p, step) => {
          setProgress(p);
          setProgressStep(step);
        },
      });

      if (result.success && result.path) {
        const updated = {
          ...editedProp,
          imagePath: result.path,
          imageUrl: (result as any).url,
        };
        setEditedProp(updated);
        onUpdate(updated);
        message.success('道具图片生成完成');
      } else {
        message.error(result.error || '生成失败');
      }
    } catch (err: any) {
      message.error(err.message || '生成失败');
    } finally {
      setGenerating(null);
    }
  }, [editedProp, projectId, theme, stylePrompt, ttiConfigId, customPrompt, onUpdate, message]);

  // 上传道具图片
  const handleUploadImage = useCallback(async () => {
    if (!editedProp) return;

    try {
      const result = await openFileDialog({
        filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
        title: '选择道具图片',
      });
      if (result.canceled || !result.filePaths[0]) return;

      const destPath = await getAssetPath('reference.png');
      await fsCopy(result.filePaths[0], destPath);

      const updated = { ...editedProp, imagePath: destPath };
      setEditedProp(updated);
      onUpdate(updated);

      const props = await loadProps(projectId);
      const index = props.findIndex(p => p.id === editedProp.id);
      if (index !== -1) {
        props[index] = updated;
        await saveProps(projectId, props);
      }

      message.success('上传成功');
    } catch (err: any) {
      message.error(`上传失败: ${err.message}`);
    }
  }, [editedProp, getAssetPath, projectId, onUpdate, message]);

  // 生成预览视频
  const handleGenerateVideo = useCallback(async () => {
    if (!editedProp) return;

    if (!editedProp.imagePath) {
      message.warning('请先生成或上传道具图片');
      return;
    }

    setGenerating('video');
    setProgress(0);

    try {
      const result = await generatePropPreviewVideo({
        projectId,
        prop: editedProp,
        itvConfigId,
        onProgress: (p, step) => {
          setProgress(p);
          setProgressStep(step);
        },
      });

      if (result.success && result.path) {
        const updated = {
          ...editedProp,
          previewVideoPath: result.path,
          previewVideoTaskId: result.taskId,
        };
        setEditedProp(updated);
        onUpdate(updated);
        message.success('预览视频生成完成');
      } else {
        message.error(result.error || '生成失败');
      }
    } catch (err: any) {
      message.error(err.message || '生成失败');
    } finally {
      setGenerating(null);
    }
  }, [editedProp, projectId, itvConfigId, onUpdate, message]);

  // 上传预览视频
  const handleUploadVideo = useCallback(async () => {
    if (!editedProp) return;

    try {
      const result = await openFileDialog({
        filters: [{ name: '视频', extensions: ['mp4', 'webm', 'mov'] }],
        title: '选择预览视频',
      });
      if (result.canceled || !result.filePaths[0]) return;

      const destPath = await getAssetPath('preview.mp4');
      await fsCopy(result.filePaths[0], destPath);

      const updated = { ...editedProp, previewVideoPath: destPath };
      setEditedProp(updated);
      onUpdate(updated);

      const props = await loadProps(projectId);
      const index = props.findIndex(p => p.id === editedProp.id);
      if (index !== -1) {
        props[index] = updated;
        await saveProps(projectId, props);
      }

      message.success('上传成功');
    } catch (err: any) {
      message.error(`上传失败: ${err.message}`);
    }
  }, [editedProp, getAssetPath, projectId, onUpdate, message]);

  // 提取道具
  const handleExtractProp = useCallback(async () => {
    if (!editedProp) return;

    if (!editedProp.previewVideoPath) {
      message.warning('请先生成或上传预览视频');
      return;
    }

    setGenerating('extract');
    setProgress(0);
    setProgressStep('提取道具中...');

    try {
      const result = await extractAndBindProp(projectId, editedProp, itvConfigId);

      if (result.success && result.propId) {
        const updated = { ...editedProp, sora2PropId: result.propId };
        setEditedProp(updated);
        onUpdate(updated);

        const props = await loadProps(projectId);
        const index = props.findIndex(p => p.id === editedProp.id);
        if (index !== -1) {
          props[index] = updated;
          await saveProps(projectId, props);
        }

        message.success('道具提取成功');
      } else {
        message.error(result.error || '提取失败');
      }
    } catch (err: any) {
      message.error(err.message || '提取失败');
    } finally {
      setGenerating(null);
    }
  }, [editedProp, projectId, itvConfigId, onUpdate, message]);

  // 删除道具
  const handleDelete = useCallback(async () => {
    if (!editedProp) return;
    onDelete(editedProp.id);
    onClose();
  }, [editedProp, onDelete, onClose]);

  // 转换本地路径为可显示URL
  const toLocalUrl = (path?: string) => path ? electronService.fs.toLocalUrl(path) : '';

  if (!editedProp) return null;

  const typeOptions = [
    { value: '武器', label: '武器' },
    { value: '日常', label: '日常' },
    { value: '关键线索', label: '关键线索' },
    { value: '其他', label: '其他' },
  ];

  return (
    <>
      <Modal
        title={
          <Space>
            <InboxOutlined />
            <span>道具详情: {editedProp.name}</span>
          </Space>
        }
        open={open}
        onCancel={onClose}
        width={900}
        footer={
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <Popconfirm
              title="确定删除此道具？"
              description="删除后无法恢复"
              onConfirm={handleDelete}
              okText="删除"
              cancelText="取消"
              okButtonProps={{ danger: true }}
            >
              <Button danger icon={<DeleteOutlined />}>
                删除道具
              </Button>
            </Popconfirm>
            <Space>
              <Button onClick={onClose}>取消</Button>
              <Button type="primary" icon={<SaveOutlined />} onClick={handleSave}>
                保存修改
              </Button>
            </Space>
          </div>
        }
      >
        {/* 生成进度 */}
        {generating && (
          <div style={{ marginBottom: 16 }}>
            <Space style={{ marginBottom: 8 }}>
              <Spin indicator={<LoadingOutlined spin />} size="small" />
              <Text>{progressStep}</Text>
            </Space>
            <Progress percent={Math.round(progress)} strokeColor="#52c41a" />
          </div>
        )}

        <Row gutter={24}>
          {/* 左侧：道具图片 */}
          <Col span={10}>
            <div style={{ marginBottom: 16 }}>
              <Text strong style={{ display: 'block', marginBottom: 8 }}>道具图片</Text>
              <div
                style={{
                  aspectRatio: '1/1',
                  background: '#1a1a1a',
                  borderRadius: 8,
                  overflow: 'hidden',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: editedProp.imagePath ? 'pointer' : 'default',
                }}
                onClick={() => editedProp.imagePath && setPreviewImage(toLocalUrl(editedProp.imagePath))}
              >
                {editedProp.imagePath ? (
                  <img
                    src={toLocalUrl(editedProp.imagePath)}
                    alt="道具图"
                    style={{ width: '100%', height: '100%', objectFit: 'contain', padding: 8 }}
                  />
                ) : (
                  <Text type="secondary">未生成</Text>
                )}
              </div>
              <Space style={{ marginTop: 8, width: '100%' }} wrap>
                <Button
                  icon={generating === 'image' ? <LoadingOutlined /> : <ThunderboltOutlined />}
                  onClick={handleGenerateImage}
                  disabled={generating !== null}
                >
                  {editedProp.imagePath ? '重新生成' : '生成'}
                </Button>
                <Button icon={<UploadOutlined />} onClick={handleUploadImage} disabled={generating !== null}>
                  上传
                </Button>
              </Space>
            </div>
          </Col>

          {/* 右侧：基础信息 */}
          <Col span={14}>
            <Form form={form} layout="vertical" size="small">
              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item name="name" label="名称" rules={[{ required: true, message: '请输入名称' }]}>
                    <Input />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="type" label="道具类型">
                    <Select options={typeOptions} />
                  </Form.Item>
                </Col>
              </Row>
              <Form.Item name="description" label="道具描述（用于AI生成）">
                <TextArea rows={3} placeholder="如：古老的怀表，金色外壳，雕刻精美..." />
              </Form.Item>
            </Form>
          </Col>
        </Row>

        <Divider />

        {/* 提示词预览/编辑 */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <Text strong>生成提示词</Text>
            <Button
              type="text"
              size="small"
              icon={isPromptEditing ? <CheckCircleOutlined /> : <EditOutlined />}
              onClick={() => {
                if (isPromptEditing && !customPrompt) {
                  setCustomPrompt('');
                }
                setIsPromptEditing(!isPromptEditing);
              }}
            >
              {isPromptEditing ? '完成' : '编辑'}
            </Button>
          </div>
          {isPromptEditing ? (
            <TextArea
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
              rows={3}
              placeholder="输入自定义提示词，留空使用自动生成"
            />
          ) : (
            <div
              style={{
                padding: 12,
                background: '#1a1a1a',
                borderRadius: 8,
                fontSize: 12,
                color: '#a1a1aa',
                lineHeight: 1.6,
              }}
            >
              {customPrompt || editedProp.description || '(无提示词)'}
            </div>
          )}
          {customPrompt && (
            <Text type="secondary" style={{ fontSize: 11, marginTop: 4, display: 'block' }}>
              使用自定义提示词 · <a onClick={() => setCustomPrompt('')}>恢复自动</a>
            </Text>
          )}
        </div>

        <Divider />

        {/* 预览视频 & 道具提取 */}
        <Row gutter={24}>
          <Col span={12}>
            <Text strong style={{ display: 'block', marginBottom: 8 }}>预览视频</Text>
            <div
              style={{
                aspectRatio: '1/1',
                maxHeight: 200,
                background: '#1a1a1a',
                borderRadius: 8,
                overflow: 'hidden',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {editedProp.previewVideoPath ? (
                <video
                  src={toLocalUrl(editedProp.previewVideoPath)}
                  controls
                  style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                />
              ) : (
                <Text type="secondary">未生成</Text>
              )}
            </div>
            <Space style={{ marginTop: 8 }}>
              <Button
                icon={generating === 'video' ? <LoadingOutlined /> : <PlayCircleOutlined />}
                onClick={handleGenerateVideo}
                disabled={generating !== null || !editedProp.imagePath}
              >
                {editedProp.previewVideoPath ? '重新生成' : '生成'}
              </Button>
              <Button icon={<UploadOutlined />} onClick={handleUploadVideo} disabled={generating !== null}>
                上传
              </Button>
            </Space>
          </Col>

          <Col span={12}>
            <Text strong style={{ display: 'block', marginBottom: 8 }}>Sora2 道具绑定</Text>
            <div
              style={{
                padding: 16,
                background: '#1a1a1a',
                borderRadius: 8,
                minHeight: 120,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {editedProp.sora2PropId ? (
                <>
                  <CheckCircleOutlined style={{ fontSize: 24, color: '#52c41a', marginBottom: 8 }} />
                  <Text type="success">已绑定</Text>
                  <Text type="secondary" style={{ fontSize: 10, wordBreak: 'break-all', marginTop: 4 }}>
                    {editedProp.sora2PropId}
                  </Text>
                </>
              ) : (
                <>
                  <LinkOutlined style={{ fontSize: 24, color: '#52525b', marginBottom: 8 }} />
                  <Text type="secondary">未绑定</Text>
                </>
              )}
            </div>
            <Button
              block
              style={{ marginTop: 8 }}
              icon={generating === 'extract' ? <LoadingOutlined /> : <LinkOutlined />}
              onClick={handleExtractProp}
              disabled={generating !== null || !editedProp.previewVideoPath}
            >
              {editedProp.sora2PropId ? '重新提取' : '提取道具'}
            </Button>
            <Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 4 }}>
              需要先生成预览视频才能提取
            </Text>
          </Col>
        </Row>
      </Modal>

      {/* 图片预览弹窗 */}
      <Modal
        open={!!previewImage}
        onCancel={() => setPreviewImage(null)}
        footer={null}
        centered
        width="auto"
        styles={{ body: { padding: 0 } }}
      >
        {previewImage && (
          <img src={previewImage} alt="Preview" style={{ maxWidth: '90vw', maxHeight: '85vh' }} />
        )}
      </Modal>
    </>
  );
};

export default PropDetailModal;

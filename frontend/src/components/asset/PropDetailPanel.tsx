/**
 * 道具详情面板
 * 内嵌式面板，无弹窗
 */
import React, { useState, useCallback, useEffect } from 'react';
import {
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
  Modal,
} from 'antd';
import {
  InboxOutlined,
  EditOutlined,
  SaveOutlined,
  DeleteOutlined,
  UploadOutlined,
  ThunderboltOutlined,
  PlayCircleOutlined,
  CheckCircleOutlined,
  LoadingOutlined,
  LinkOutlined,
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

interface PropDetailPanelProps {
  prop: Prop;
  projectId: string;
  theme?: string;
  stylePrompt?: string;
  ttiConfigId?: string;
  itvConfigId?: string;
  onUpdate: (prop: Prop) => void;
  onDelete: (propId: string) => void;
}

type GeneratingType = 'image' | 'video' | 'extract' | null;

export const PropDetailPanel: React.FC<PropDetailPanelProps> = ({
  prop,
  projectId,
  theme,
  stylePrompt,
  ttiConfigId,
  itvConfigId,
  onUpdate,
  onDelete,
}) => {
  const { message } = App.useApp();
  const [form] = Form.useForm();

  const [editedProp, setEditedProp] = useState<Prop>(prop);
  const [isPromptEditing, setIsPromptEditing] = useState(false);
  const [customPrompt, setCustomPrompt] = useState('');

  const [generating, setGenerating] = useState<GeneratingType>(null);
  const [progress, setProgress] = useState(0);
  const [progressStep, setProgressStep] = useState('');

  const [previewImage, setPreviewImage] = useState<string | null>(null);

  useEffect(() => {
    setEditedProp(prop);
    form.setFieldsValue({
      name: prop.name,
      type: prop.type,
      description: prop.description,
    });
    setCustomPrompt(prop.customPrompt || '');
    setIsPromptEditing(false);
  }, [prop, form]);

  const getAssetPath = useCallback(async (subPath: string) => {
    const config = getStorageConfig() || (await initStorageConfig());
    const basePath = `${config.rootPath}/projects/${projectId}/assets/props/${editedProp.id}`;
    const fullPath = `${basePath}/${subPath}`;
    const dir = fullPath.substring(0, fullPath.lastIndexOf('/'));
    if (!(await fsExists(dir))) {
      await fsMkdir(dir);
    }
    return fullPath;
  }, [projectId, editedProp.id]);

  const handleSave = useCallback(async () => {
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

  const handleGenerateImage = useCallback(async () => {
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

  const handleUploadImage = useCallback(async () => {
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

  const handleGenerateVideo = useCallback(async () => {
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

  const handleUploadVideo = useCallback(async () => {
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

  const handleExtractProp = useCallback(async () => {
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

  const handleDelete = useCallback(async () => {
    onDelete(editedProp.id);
  }, [editedProp.id, onDelete]);

  const toLocalUrl = (path?: string) => path ? electronService.fs.toLocalUrl(path) : '';

  const typeOptions = [
    { value: '武器', label: '武器' },
    { value: '日常', label: '日常' },
    { value: '关键线索', label: '关键线索' },
    { value: '其他', label: '其他' },
  ];

  const currentPrompt = customPrompt || editedProp.description || '';

  return (
    <div className="assetDetailPanel">
      <div className="assetDetailHeader">
        <Space>
          <InboxOutlined />
          <Text strong>{editedProp.name}</Text>
        </Space>
        <Space>
          <Popconfirm
            title="确定删除此道具？"
            description="删除后无法恢复"
            onConfirm={handleDelete}
            okText="删除"
            cancelText="取消"
            okButtonProps={{ danger: true }}
          >
            <Button danger size="small" icon={<DeleteOutlined />}>删除</Button>
          </Popconfirm>
          <Button type="primary" size="small" icon={<SaveOutlined />} onClick={handleSave}>
            保存
          </Button>
        </Space>
      </div>

      <div className="assetDetailBody">
        {generating && (
          <div className="assetDetailProgress">
            <Space>
              <Spin indicator={<LoadingOutlined spin />} size="small" />
              <Text>{progressStep}</Text>
            </Space>
            <Progress percent={Math.round(progress)} strokeColor="#52c41a" size="small" />
          </div>
        )}

        <Row gutter={24}>
          <Col span={10}>
            <Text strong className="assetDetailLabel">道具图片</Text>
            <div
              className="assetDetailImage"
              style={{ aspectRatio: '1/1' }}
              onClick={() => editedProp.imagePath && setPreviewImage(toLocalUrl(editedProp.imagePath))}
            >
              {editedProp.imagePath ? (
                <img src={toLocalUrl(editedProp.imagePath)} alt="道具图" style={{ objectFit: 'contain', padding: 8 }} />
              ) : (
                <Text type="secondary">未生成</Text>
              )}
            </div>
            <Space className="assetDetailActions">
              <Button
                size="small"
                icon={generating === 'image' ? <LoadingOutlined /> : <ThunderboltOutlined />}
                onClick={handleGenerateImage}
                disabled={generating !== null}
              >
                {editedProp.imagePath ? '重新生成' : '生成'}
              </Button>
              <Button size="small" icon={<UploadOutlined />} onClick={handleUploadImage} disabled={generating !== null}>
                上传
              </Button>
            </Space>
          </Col>

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

        <div className="assetDetailSection">
          <div className="assetDetailSectionHeader">
            <Text strong>生成提示词</Text>
            <Button
              type="text"
              size="small"
              icon={isPromptEditing ? <CheckCircleOutlined /> : <EditOutlined />}
              onClick={() => setIsPromptEditing(!isPromptEditing)}
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
            <div className="assetDetailPrompt">
              {currentPrompt || '(无提示词)'}
            </div>
          )}
          {customPrompt && (
            <Text type="secondary" className="assetDetailPromptHint">
              使用自定义提示词 · <a onClick={() => setCustomPrompt('')}>恢复自动</a>
            </Text>
          )}
        </div>

        <Divider />

        <Row gutter={24}>
          <Col span={12}>
            <Text strong className="assetDetailLabel">预览视频</Text>
            <div className="assetDetailVideo">
              {editedProp.previewVideoPath ? (
                <video src={toLocalUrl(editedProp.previewVideoPath)} controls />
              ) : (
                <Text type="secondary">未生成</Text>
              )}
            </div>
            <Space className="assetDetailActions">
              <Button
                size="small"
                icon={generating === 'video' ? <LoadingOutlined /> : <PlayCircleOutlined />}
                onClick={handleGenerateVideo}
                disabled={generating !== null || !editedProp.imagePath}
              >
                {editedProp.previewVideoPath ? '重新生成' : '生成'}
              </Button>
              <Button size="small" icon={<UploadOutlined />} onClick={handleUploadVideo} disabled={generating !== null}>
                上传
              </Button>
            </Space>
          </Col>

          <Col span={12}>
            <Text strong className="assetDetailLabel">Sora2 道具绑定</Text>
            <div className="assetDetailBinding">
              {editedProp.sora2PropId ? (
                <>
                  <CheckCircleOutlined className="bindingIconSuccess" />
                  <Text type="success">已绑定</Text>
                  <Text type="secondary" className="bindingId">{editedProp.sora2PropId}</Text>
                </>
              ) : (
                <>
                  <LinkOutlined className="bindingIconPending" />
                  <Text type="secondary">未绑定</Text>
                </>
              )}
            </div>
            <Button
              block
              size="small"
              icon={generating === 'extract' ? <LoadingOutlined /> : <LinkOutlined />}
              onClick={handleExtractProp}
              disabled={generating !== null || !editedProp.previewVideoPath}
            >
              {editedProp.sora2PropId ? '重新提取' : '提取道具'}
            </Button>
            <Text type="secondary" className="assetDetailHint">
              需要先生成预览视频才能提取
            </Text>
          </Col>
        </Row>
      </div>

      <Modal
        open={!!previewImage}
        onCancel={() => setPreviewImage(null)}
        footer={null}
        centered
        width="auto"
        styles={{ body: { padding: 0 } }}
      >
        {previewImage && <img src={previewImage} alt="Preview" style={{ maxWidth: '90vw', maxHeight: '85vh' }} />}
      </Modal>
    </div>
  );
};

export default PropDetailPanel;

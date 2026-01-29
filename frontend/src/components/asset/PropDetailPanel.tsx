/**
 * 道具详情面板 - Creator Layout
 * 左侧输入控制区 + 右侧画布预览区
 */
import React, { useState, useCallback, useEffect } from 'react';
import {
  Form,
  Input,
  Button,
  Space,
  Progress,
  App,
  Typography,
  Popconfirm,
  Modal,
  Segmented,
  Tooltip,
  Tag,
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
  ExpandOutlined,
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
import { useActiveConfig } from '../../hooks/useActiveConfig';

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
type ViewMode = 'image' | 'video';

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
  
  const { config: activeTTI } = useActiveConfig('tti', ttiConfigId);
  const { config: activeITV } = useActiveConfig('itv', itvConfigId);

  const [editedProp, setEditedProp] = useState<Prop>(prop);
  const [viewMode, setViewMode] = useState<ViewMode>('image');
  const [generating, setGenerating] = useState<GeneratingType>(null);
  const [progress, setProgress] = useState(0);
  const [progressStep, setProgressStep] = useState('');
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  // 初始化
  useEffect(() => {
    let initialPrompt = prop.prompt || prop.customPrompt || '';
    if (!initialPrompt) {
      const parts = [];
      if (prop.type) parts.push(`Type: ${prop.type}`);
      if (prop.description) parts.push(prop.description);
      initialPrompt = parts.join('\n');
    }

    setEditedProp({ ...prop, prompt: initialPrompt });
    form.setFieldsValue({
      name: prop.name,
      prompt: initialPrompt,
    });
  }, [prop, form]);

  // 自动切换视图模式
  useEffect(() => {
    if (generating === 'image') setViewMode('image');
    else if (generating === 'video') setViewMode('video');
  }, [generating]);

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
        prompt: values.prompt,
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
  }, [editedProp, form, projectId, onUpdate, message]);

  const handleGenerateImage = useCallback(async () => {
    setGenerating('image');
    setProgress(0);

    try {
      const currentValues = await form.getFieldsValue();
      const propWithPrompt = { ...editedProp, ...currentValues };

      const result = await generatePropImage({
        projectId,
        prop: propWithPrompt,
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
          ...currentValues,
          imagePath: result.path,
        };
        setEditedProp(updated);
        onUpdate(updated);

        const props = await loadProps(projectId);
        const index = props.findIndex(p => p.id === updated.id);
        if (index !== -1) {
          props[index] = updated;
          await saveProps(projectId, props);
        }

        message.success('道具图片生成完成');
      } else {
        message.error(result.error || '生成失败');
      }
    } catch (err: any) {
      message.error(err.message || '生成失败');
    } finally {
      setGenerating(null);
    }
  }, [editedProp, projectId, theme, stylePrompt, ttiConfigId, form, onUpdate, message]);

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

        const props = await loadProps(projectId);
        const index = props.findIndex(p => p.id === updated.id);
        if (index !== -1) {
          props[index] = updated;
          await saveProps(projectId, props);
        }

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

  return (
    <div className="assetDetailPanel">
      {/* 左侧 Sidebar */}
      <div className="creatorSidebar">
        <div className="creatorSidebarHeader">
          <Space>
            <InboxOutlined />
            <Text strong style={{ fontSize: 16 }}>{editedProp.name}</Text>
          </Space>
          <Space>
            <Tooltip title="保存">
              <Button type="text" size="small" icon={<SaveOutlined />} onClick={handleSave} />
            </Tooltip>
            <Popconfirm
              title="确定删除此道具？"
              description="删除后无法恢复"
              onConfirm={handleDelete}
              okButtonProps={{ danger: true }}
            >
              <Tooltip title="删除">
                <Button type="text" danger size="small" icon={<DeleteOutlined />} />
              </Tooltip>
            </Popconfirm>
          </Space>
        </div>

        <div className="creatorSidebarContent">
          <Form form={form} layout="vertical" size="small">
            <Form.Item name="name" label="名称" rules={[{ required: true, message: '请输入名称' }]}>
              <Input />
            </Form.Item>

            <Form.Item name="prompt" label="视觉描述 Prompt">
              <TextArea
                autoSize={{ minRows: 10, maxRows: 18 }}
                placeholder="在此输入详细的道具视觉描述..."
              />
            </Form.Item>
          </Form>

          {/* 生成操作区 */}
          <div className="creatorSidebarActions">
            {generating && (
              <div className="creatorProgress">
                <div className="creatorProgressHeader">
                  <Space>
                    <LoadingOutlined />
                    <Text style={{ fontSize: 12 }}>{progressStep}</Text>
                  </Space>
                  <Text type="secondary" style={{ fontSize: 12 }}>{Math.round(progress)}%</Text>
                </div>
                <Progress percent={Math.round(progress)} strokeColor="#52c41a" size="small" showInfo={false} />
              </div>
            )}

            <Tooltip title={activeTTI ? `使用服务: ${activeTTI.name}` : '未配置生成服务'}>
              <Button
                type={!editedProp.imagePath ? 'primary' : 'default'}
                block
                icon={<ThunderboltOutlined />}
                onClick={handleGenerateImage}
                loading={generating === 'image'}
                disabled={generating !== null}
              >
                {editedProp.imagePath ? '重新生成参考图' : '生成参考图'}
              </Button>
            </Tooltip>

            <Tooltip title={activeITV ? `使用服务: ${activeITV.name}` : '未配置视频服务'}>
              <Button
                type={editedProp.imagePath && !editedProp.previewVideoPath ? 'primary' : 'default'}
                block
                icon={<PlayCircleOutlined />}
                onClick={handleGenerateVideo}
                loading={generating === 'video'}
                disabled={generating !== null || !editedProp.imagePath}
              >
                生成预览视频
              </Button>
            </Tooltip>
          </div>
        </div>
      </div>

      {/* 右侧 Canvas */}
      <div className="creatorCanvas">
        <div className="creatorCanvasToolbar">
          <Segmented
            value={viewMode}
            onChange={(val) => setViewMode(val as ViewMode)}
            options={[
              { label: '道具图片', value: 'image', icon: <InboxOutlined /> },
              { label: '预览视频', value: 'video', icon: <PlayCircleOutlined /> },
            ]}
          />

          <Space>
            {editedProp.sora2PropId ? (
              <Tag color="success" icon={<CheckCircleOutlined />}>
                已绑定: {editedProp.sora2PropId.substring(0, 8)}...
              </Tag>
            ) : (
              <Button
                size="small"
                type="primary"
                ghost
                icon={<LinkOutlined />}
                loading={generating === 'extract'}
                onClick={handleExtractProp}
                disabled={!editedProp.previewVideoPath || generating !== null}
              >
                提取并绑定道具
              </Button>
            )}

            <div className="toolbarDivider" />

            <Tooltip title={viewMode === 'image' ? '上传道具图片' : '上传视频'}>
              <Button
                type="text"
                icon={<UploadOutlined />}
                onClick={viewMode === 'image' ? handleUploadImage : handleUploadVideo}
                aria-label={viewMode === 'image' ? '上传道具图片' : '上传视频'}
              />
            </Tooltip>
            <Tooltip title="放大预览">
              <Button
                type="text"
                icon={<ExpandOutlined />}
                onClick={() => {
                  if (viewMode === 'image' && editedProp.imagePath) {
                    setPreviewImage(toLocalUrl(editedProp.imagePath));
                  }
                }}
                disabled={viewMode === 'video' || !editedProp.imagePath}
                aria-label="放大预览"
              />
            </Tooltip>
          </Space>
        </div>

        <div className="creatorCanvasBody">
          {viewMode === 'image' ? (
            <div className="creatorMediaViewer">
              {editedProp.imagePath ? (
                <img
                  src={toLocalUrl(editedProp.imagePath)}
                  alt="道具图"
                  style={{ cursor: 'pointer' }}
                  onDoubleClick={() => setPreviewImage(toLocalUrl(editedProp.imagePath))}
                />
              ) : (
                <div className="creatorMediaPlaceholder">
                  <InboxOutlined />
                  <div>暂无道具图片</div>
                </div>
              )}
            </div>
          ) : (
            <div className="creatorMediaViewer">
              {editedProp.previewVideoPath ? (
                <video src={toLocalUrl(editedProp.previewVideoPath)} controls autoPlay loop />
              ) : (
                <div className="creatorMediaPlaceholder">
                  <PlayCircleOutlined />
                  <div>暂无预览视频</div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 大图预览 Modal */}
      <Modal
        open={!!previewImage}
        onCancel={() => setPreviewImage(null)}
        footer={null}
        centered
        width="auto"
        styles={{ body: { padding: 0 }, content: { background: 'transparent', boxShadow: 'none' } }}
        closeIcon={null}
      >
        {previewImage && (
          <img
            src={previewImage}
            alt="Preview"
            style={{ maxWidth: '95vw', maxHeight: '95vh', cursor: 'pointer' }}
            onClick={() => setPreviewImage(null)}
          />
        )}
      </Modal>
    </div>
  );
};

export default PropDetailPanel;

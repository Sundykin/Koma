/**
 * 道具详情面板 - Creator Layout
 * 左侧输入控制区 + 右侧画布预览区
 */
import React, { useState, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
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
} from '../../workflow/scenePropAssetWorkflow';
import { electronService, openFileDialog, fsCopy, fsMkdir, fsExists } from '../../services/electronService';
import { getStorageConfig, initStorageConfig } from '../../store/storageConfig';
import { saveProps, loadProps } from '../../store/projectStore';
import { useActiveConfig } from '../../hooks/useActiveConfig';
import { uploadLocalFileToImageHosting, getImageHostingConfig } from '../../services/imageHostingService';
import { toUserMessage } from '../../utils/errorMessages';

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
  const { t } = useTranslation('asset');
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
      message.success(t('prop.saveSuccess'));
    } catch (err: any) {
      message.error(toUserMessage(err) || t('prop.saveFailed'));
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

        message.success(t('prop.generateDone'));
      } else {
        message.error(result.error || t('prop.generateFailed'));
      }
    } catch (err: any) {
      message.error(toUserMessage(err) || t('prop.generateFailed'));
    } finally {
      setGenerating(null);
    }
  }, [editedProp, projectId, theme, stylePrompt, ttiConfigId, form, onUpdate, message]);

  const handleUploadImage = useCallback(async () => {
    try {
      const result = await openFileDialog({
        filters: [{ name: t('prop.filterImage'), extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
        title: t('prop.dialogSelectImage'),
      });
      if (result.canceled || !result.filePaths[0]) return;

      const destPath = await getAssetPath('reference.png');
      await fsCopy(result.filePaths[0], destPath);

      let updated: Prop = { ...editedProp, imagePath: destPath };

      // 检测图床配置，自动上传
      const imageHostingConfig = await getImageHostingConfig();
      console.log('[PropDetailPanel] 图床配置:', imageHostingConfig);
      if (imageHostingConfig?.enabled) {
        console.log('[PropDetailPanel] 图床已启用，开始上传:', destPath);
        message.loading({ content: t('prop.uploadingToHosting'), key: 'imageHosting' });
        const uploadResult = await uploadLocalFileToImageHosting(destPath);
        console.log('[PropDetailPanel] 图床上传结果:', uploadResult);
        if (uploadResult.success && uploadResult.url) {
          updated.imageUrl = uploadResult.url;
          console.log('[PropDetailPanel] 图床URL已保存:', uploadResult.url);
          message.success({ content: t('prop.hostingSuccess'), key: 'imageHosting' });
        } else {
          console.warn('[PropDetailPanel] 图床上传失败:', uploadResult.error);
          message.warning({ content: t('prop.hostingFailed', { error: uploadResult.error }), key: 'imageHosting' });
        }
      } else {
        console.log('[PropDetailPanel] 图床未启用，跳过上传');
      }

      setEditedProp(updated);
      onUpdate(updated);

      const props = await loadProps(projectId);
      const index = props.findIndex(p => p.id === editedProp.id);
      if (index !== -1) {
        props[index] = updated;
        await saveProps(projectId, props);
      }

      message.success(t('prop.uploadSuccess'));
    } catch (err: any) {
      message.error(t('prop.uploadFailed', { error: toUserMessage(err) }));
    }
  }, [editedProp, getAssetPath, projectId, onUpdate, message]);

  const handleGenerateVideo = useCallback(async () => {
    if (!editedProp.imagePath) {
      message.warning(t('prop.warnNoImage'));
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

        message.success(t('prop.videoGenerateDone'));
      } else {
        message.error(result.error || t('prop.generateFailed'));
      }
    } catch (err: any) {
      message.error(toUserMessage(err) || t('prop.generateFailed'));
    } finally {
      setGenerating(null);
    }
  }, [editedProp, projectId, itvConfigId, onUpdate, message]);

  const handleUploadVideo = useCallback(async () => {
    try {
      const result = await openFileDialog({
        filters: [{ name: t('prop.filterVideo'), extensions: ['mp4', 'webm', 'mov'] }],
        title: t('prop.dialogSelectVideo'),
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

      message.success(t('prop.uploadSuccess'));
    } catch (err: any) {
      message.error(t('prop.uploadFailed', { error: toUserMessage(err) }));
    }
  }, [editedProp, getAssetPath, projectId, onUpdate, message]);

  const handleExtractProp = useCallback(async () => {
    message.info(t('prop.infoExtractRemoved'));
  }, [message]);

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
            <Tooltip title={t('prop.save')}>
              <Button type="text" size="small" icon={<SaveOutlined />} onClick={handleSave} aria-label={t('prop.save')} />
            </Tooltip>
            <Popconfirm
              title={t('prop.confirmDelete')}
              description={t('prop.deleteWarning')}
              onConfirm={handleDelete}
              okButtonProps={{ danger: true }}
            >
              <Tooltip title={t('prop.delete')}>
                <Button type="text" danger size="small" icon={<DeleteOutlined />} aria-label={t('prop.delete')} />
              </Tooltip>
            </Popconfirm>
          </Space>
        </div>

        <div className="creatorSidebarContent">
          <Form form={form} layout="vertical" size="small">
            <Form.Item name="name" label={t('prop.form.name')} rules={[{ required: true, message: t('prop.form.nameRequired') }]}>
              <Input />
            </Form.Item>

            <Form.Item name="prompt" label={t('prop.form.prompt')}>
              <TextArea
                autoSize={{ minRows: 10, maxRows: 18 }}
                placeholder={t('prop.form.promptPlaceholder')}
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

            <Tooltip title={activeTTI ? t('prop.tooltipService', { name: activeTTI.name }) : t('prop.tooltipNoService')}>
              <Button
                type={!editedProp.imagePath ? 'primary' : 'default'}
                block
                icon={<ThunderboltOutlined />}
                onClick={handleGenerateImage}
                loading={generating === 'image'}
                disabled={generating !== null}
              >
                {editedProp.imagePath ? t('prop.regenerateImage') : t('prop.generateImage')}
              </Button>
            </Tooltip>

            <Tooltip title={activeITV ? t('prop.tooltipService', { name: activeITV.name }) : t('prop.tooltipNoVideoService')}>
              <Button
                type={editedProp.imagePath && !editedProp.previewVideoPath ? 'primary' : 'default'}
                block
                icon={<PlayCircleOutlined />}
                onClick={handleGenerateVideo}
                loading={generating === 'video'}
                disabled={generating !== null || !editedProp.imagePath}
              >
                {t('prop.generateVideo')}
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
              { label: t('prop.tabImage'), value: 'image', icon: <InboxOutlined /> },
              { label: t('prop.tabVideo'), value: 'video', icon: <PlayCircleOutlined /> },
            ]}
          />

          <Space>
            <div className="toolbarDivider" />

            <Tooltip title={viewMode === 'image' ? t('prop.uploadImage') : t('prop.uploadVideo')}>
              <Button
                type="text"
                icon={<UploadOutlined />}
                onClick={viewMode === 'image' ? handleUploadImage : handleUploadVideo}
                aria-label={viewMode === 'image' ? t('prop.uploadImage') : t('prop.uploadVideo')}
              />
            </Tooltip>
            <Tooltip title={t('prop.expandPreview')}>
              <Button
                type="text"
                icon={<ExpandOutlined />}
                onClick={() => {
                  if (viewMode === 'image' && editedProp.imagePath) {
                    setPreviewImage(toLocalUrl(editedProp.imagePath));
                  }
                }}
                disabled={viewMode === 'video' || !editedProp.imagePath}
                aria-label={t('prop.expandPreview')}
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
                  alt={t('prop.tabImage')}
                  style={{ cursor: 'pointer' }}
                  onDoubleClick={() => setPreviewImage(toLocalUrl(editedProp.imagePath))}
                />
              ) : (
                <div className="creatorMediaPlaceholder">
                  <InboxOutlined />
                  <div>{t('prop.noImage')}</div>
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
                  <div>{t('prop.noVideo')}</div>
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

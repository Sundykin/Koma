/**
 * 道具详情面板 - Creator Layout
 * 左侧输入控制区 + 右侧画布预览区
 */
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { createLogger } from '../../store/logger';

const logger = createLogger('PropDetailPanel');
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
import { useTranslation } from 'react-i18next';
import type { ProjectStyleSnapshot, Prop } from '../../types';
import { isRemoteMediaUri } from '../../types';
import {
  generatePropImage,
  generatePropPreviewVideo,
  extractAndBindProp,
} from '../../workflow/scenePropAssetWorkflow';
import { electronService, openFileDialog, fsCopy, fsMkdir, fsExists, fsRemove } from '../../services/electronService';
import { getStorageConfig, initStorageConfig } from '../../store/storageConfig';
import { saveProps, loadProps } from '../../store/projectStore';
import { useActiveConfig } from '../../hooks/useActiveConfig';
import { uploadLocalFileToImageHosting, isImageHostingEnabled } from '../../services/imageHostingService';
import { createStoredMediaAsset, updatePropMedia } from '../../utils/mediaAssets';
import { mergeEpisodeRefs } from './assetEpisodeRefs';
import {
  getPropPreviewImageSource,
  getPropPreviewVideoSource,
} from '../../utils/mediaSelectors';
import type { ModelCapability } from '../../providers/channel/types';

const { TextArea } = Input;
const { Text } = Typography;

interface PropDetailPanelProps {
  prop: Prop;
  projectId: string;
  /** 项目全局比例 — 透传给 generatePropImage，让道具参考图与项目比例一致 */
  aspectRatio?: '16:9' | '9:16';
  theme?: string;
  stylePrompt?: string;
  styleSnapshot?: ProjectStyleSnapshot;
  ttiSelection?: string;
  itvSelection?: string;
  onUpdate: (prop: Prop) => void;
  onDelete: (propId: string) => void;
}

type GeneratingType = 'image' | 'video' | 'extract' | null;
type ViewMode = 'image' | 'video';

export const PropDetailPanel: React.FC<PropDetailPanelProps> = ({
  prop,
  projectId,
  aspectRatio,
  theme,
  stylePrompt,
  styleSnapshot,
  ttiSelection,
  itvSelection,
  onUpdate,
  onDelete,
}) => {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const [form] = Form.useForm();
  
  const { config: activeTTI, activeModel: activeTTIModel } = useActiveConfig('tti', ttiSelection);
  const { config: activeITV, activeModel: activeITVModel } = useActiveConfig('itv', itvSelection);

  const [editedProp, setEditedProp] = useState<Prop>(prop);
  const [viewMode, setViewMode] = useState<ViewMode>('image');
  const [generating, setGenerating] = useState<GeneratingType>(null);
  const [progress, setProgress] = useState(0);
  const [progressStep, setProgressStep] = useState('');
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const currentPropIdRef = useRef(prop.id);
  currentPropIdRef.current = prop.id;

  const supportsCapability = useCallback((capabilities: ModelCapability[] | undefined, capability: ModelCapability) => (
    capabilities?.includes(capability) ?? false
  ), []);
  const supportsTextToImage = supportsCapability(activeTTIModel?.capabilities, 'image.text-to-image');
  const supportsImageToVideo = supportsCapability(activeITVModel?.capabilities, 'video.image-to-video');

  // 初始化
  useEffect(() => {
    const initialPrompt = prop.prompt || '';
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
      const props = await loadProps(projectId);
      const index = props.findIndex(p => p.id === editedProp.id);
      if (index === -1) {
        throw new Error(t('asset.saveFailed'));
      }

      const storedProp = props[index];
      const updatedProp: Prop = {
        ...storedProp,
        ...editedProp,
        ...values,
        prompt: values.prompt,
        media: storedProp.media ?? editedProp.media,
        episodeRefs: mergeEpisodeRefs(storedProp.episodeRefs, editedProp.episodeRefs),
      };

      props[index] = updatedProp;
      await saveProps(projectId, props);

      setEditedProp(updatedProp);
      onUpdate(updatedProp);
      message.success(t('asset.saveSuccess'));
    } catch (err: any) {
      message.error(err.message || t('asset.saveFailed'));
    }
  }, [editedProp, form, projectId, onUpdate, message, t]);

  // 单张生成（已移除批量抽卡）：直接出正式道具参考图并覆盖保存；
  // 生成按道具 id 落盘，用户中途切换道具也会在后台完成写入。
  const handleGenerateImage = useCallback(async () => {
    const ownerId = editedProp.id;
    const isCurrent = () => currentPropIdRef.current === ownerId;

    setGenerating('image');
    setProgress(0);
    setProgressStep('');

    try {
      const currentValues = await form.getFieldsValue();
      const propWithPrompt = { ...editedProp, ...currentValues };

      const result = await generatePropImage({
        projectId,
        prop: propWithPrompt,
        aspectRatio,
        theme,
        stylePrompt,
        styleSnapshot,
        ttiSelection,
        destPath: await getAssetPath('reference.png'),
        bindOwner: false,
        normalizeRemoteUrl: true,
        onProgress: (p, step) => {
          if (!isCurrent()) return;
          setProgress(p);
          setProgressStep(step || '');
        },
      });

      if (!result.success || (!result.path && !result.url)) {
        if (isCurrent()) message.error(result.error || t('asset.generateFailed'));
        return;
      }

      const updated = updatePropMedia(propWithPrompt, {
        previewImage: createStoredMediaAsset('image', {
          localPath: result.path,
          remoteUrl: result.url,
        }),
      });
      const props = await loadProps(projectId);
      const index = props.findIndex(p => p.id === updated.id);
      if (index !== -1) {
        props[index] = updated;
        await saveProps(projectId, props);
      }

      if (isCurrent()) {
        setEditedProp(updated);
        onUpdate(updated);
        message.success(t('asset.propImageGenerated'));
      }
    } catch (err: any) {
      if (isCurrent()) message.error(err.message || t('asset.generateFailed'));
    } finally {
      if (isCurrent()) setGenerating(null);
    }
  }, [editedProp, form, getAssetPath, message, onUpdate, projectId, stylePrompt, styleSnapshot, theme, t, ttiSelection, aspectRatio]);

  const handleUploadImage = useCallback(async () => {
    try {
      const result = await openFileDialog({
        filters: [{ name: t('storyboard.image'), extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
        title: t('asset.selectPropImage'),
      });
      if (result.canceled || !result.filePaths[0]) return;

      const destPath = await getAssetPath('reference.png');
      await fsCopy(result.filePaths[0], destPath);

      let updated: Prop = updatePropMedia(editedProp, {
        previewImage: createStoredMediaAsset('image', { localPath: destPath }),
      });

      // 检测图床配置，自动上传
      const hostingEnabled = await isImageHostingEnabled();
      if (hostingEnabled) {
        message.loading({ content: t('asset.uploadToHosting'), key: 'imageHosting' });
        const uploadResult = await uploadLocalFileToImageHosting(destPath);
        if (uploadResult.success && uploadResult.url) {
          updated = updatePropMedia(updated, {
            previewImage: createStoredMediaAsset('image', {
              localPath: destPath,
              remoteUrl: uploadResult.url,
              createdAt: updated.media?.previewImage?.createdAt,
            }),
          });
          message.success({ content: t('asset.uploadHostingSuccess'), key: 'imageHosting' });
        } else {
          logger.warn('图床上传失败:', uploadResult.error);
          message.warning({ content: `${t('asset.uploadHostingFailed')}: ${uploadResult.error}`, key: 'imageHosting' });
        }
      }

      setEditedProp(updated);
      onUpdate(updated);

      const props = await loadProps(projectId);
      const index = props.findIndex(p => p.id === editedProp.id);
      if (index !== -1) {
        props[index] = updated;
        await saveProps(projectId, props);
      }

      message.success(t('asset.uploadSuccess'));
    } catch (err: any) {
      message.error(`${t('asset.uploadFailed')}: ${err.message}`);
    }
  }, [editedProp, getAssetPath, projectId, onUpdate, message, t]);

  const handleRemovePropImage = useCallback(async () => {
    try {
      const previewImage = editedProp.media?.previewImage;
      const localPath = previewImage?.localPath;
      const shouldDeleteLocalFile = Boolean(localPath && !isRemoteMediaUri(localPath));

      const props = await loadProps(projectId);
      const index = props.findIndex(p => p.id === editedProp.id);
      if (index === -1) {
        throw new Error(t('asset.saveFailed'));
      }

      if (shouldDeleteLocalFile && localPath) {
        await fsRemove(localPath);
      }

      const updated = updatePropMedia(editedProp, { previewImage: undefined });
      props[index] = updated;
      await saveProps(projectId, props);

      setEditedProp(updated);
      onUpdate(updated);
      setPreviewImage(null);

      if (shouldDeleteLocalFile) {
        message.success(t('asset.imageDeleted'));
      } else {
        message.warning(t('asset.remoteImageReferenceRemoved'));
      }
    } catch (err: any) {
      message.error(err.message || t('asset.saveFailed'));
    }
  }, [editedProp, projectId, onUpdate, message, t]);

  const handleGenerateVideo = useCallback(async () => {
    if (!getPropPreviewImageSource(editedProp)) {
      message.warning(t('asset.pleaseGenerateImageFirst'));
      return;
    }

    setGenerating('video');
    setProgress(0);

    try {
      const currentValues = await form.getFieldsValue();
      const propForVideo = {
        ...editedProp,
        ...currentValues,
        prompt: currentValues.prompt || '',
      };
      const result = await generatePropPreviewVideo({
        projectId,
        prop: propForVideo,
        theme,
        stylePrompt,
        styleSnapshot,
        itvSelection,
        onProgress: (p, step) => {
          setProgress(p);
          setProgressStep(step);
        },
      });

      if (result.success && result.path) {
        const updated = updatePropMedia(propForVideo, {
          previewVideo: createStoredMediaAsset('video', {
            localPath: result.path,
            providerTaskId: result.taskId,
          }),
        });
        setEditedProp(updated);
        onUpdate(updated);

        const props = await loadProps(projectId);
        const index = props.findIndex(p => p.id === updated.id);
        if (index !== -1) {
          props[index] = updated;
          await saveProps(projectId, props);
        }

        message.success(t('asset.videoGenerated'));
      } else {
        message.error(result.error || t('asset.generateFailed'));
      }
    } catch (err: any) {
      message.error(err.message || t('asset.generateFailed'));
    } finally {
      setGenerating(null);
    }
  }, [editedProp, form, projectId, theme, stylePrompt, styleSnapshot, itvSelection, onUpdate, message, t]);

  const handleUploadVideo = useCallback(async () => {
    try {
      const result = await openFileDialog({
        filters: [{ name: t('video.title'), extensions: ['mp4', 'webm', 'mov'] }],
        title: t('asset.selectPreviewVideo'),
      });
      if (result.canceled || !result.filePaths[0]) return;

      const destPath = await getAssetPath('preview.mp4');
      await fsCopy(result.filePaths[0], destPath);

      const updated = updatePropMedia(editedProp, {
        previewVideo: createStoredMediaAsset('video', { localPath: destPath }),
      });
      setEditedProp(updated);
      onUpdate(updated);

      const props = await loadProps(projectId);
      const index = props.findIndex(p => p.id === editedProp.id);
      if (index !== -1) {
        props[index] = updated;
        await saveProps(projectId, props);
      }

      message.success(t('asset.uploadSuccess'));
    } catch (err: any) {
      message.error(`${t('asset.uploadFailed')}: ${err.message}`);
    }
  }, [editedProp, getAssetPath, projectId, onUpdate, message, t]);

  const handleExtractProp = useCallback(async () => {
    if (!getPropPreviewVideoSource(editedProp)) {
      message.warning(t('asset.pleaseGenerateVideoFirst'));
      return;
    }

    setGenerating('extract');
    setProgress(0);
    setProgressStep(t('asset.extractingProp'));

    try {
      const result = await extractAndBindProp(projectId, editedProp, itvSelection);

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

        message.success(t('asset.propExtracted'));
      } else {
        message.error(result.error || t('asset.extractFailed'));
      }
    } catch (err: any) {
      message.error(err.message || t('asset.extractFailed'));
    } finally {
      setGenerating(null);
    }
  }, [editedProp, projectId, itvSelection, onUpdate, message, t]);

  const handleDelete = useCallback(async () => {
    onDelete(editedProp.id);
  }, [editedProp.id, onDelete]);

  const toLocalUrl = (path?: string) => path ? electronService.fs.toLocalUrl(path) : '';
  // 重新生成会覆盖同路径文件，拼 createdAt 做缓存绕过，确保预览拉取新内容
  const appendImageVersion = (url: string, version?: number) => {
    if (!url || !version) return url;
    return `${url}${url.includes('?') ? '&' : '?'}v=${version}`;
  };
  const propImageAsset = editedProp.media?.previewImage;
  const propImageSource = getPropPreviewImageSource(editedProp);
  const propImageDisplayUrl = appendImageVersion(toLocalUrl(propImageSource), propImageAsset?.createdAt);

  return (
    <div className="assetDetailPanel">
      {/* 左侧 Sidebar */}
      <div className="creatorSidebar">
        <div className="creatorSidebarHeader">
          <Space>
            <InboxOutlined />
            <Text strong className="creatorSidebarTitle">{editedProp.name}</Text>
          </Space>
          <Space>
            <Tooltip title={t('common.save')}>
              <Button type="text" size="small" icon={<SaveOutlined />} onClick={handleSave} />
            </Tooltip>
            <Popconfirm
              title={t('asset.confirmRemovePropFromEpisode')}
              description={t('asset.removeFromEpisodeDescription')}
              onConfirm={handleDelete}
              okButtonProps={{ danger: true }}
            >
              <Tooltip title={t('asset.removeFromEpisode')}>
                <Button type="text" danger size="small" icon={<DeleteOutlined />} />
              </Tooltip>
            </Popconfirm>
          </Space>
        </div>

        <div className="creatorSidebarContent">
          <Form form={form} layout="vertical" size="small">
            <Form.Item name="name" label={t('asset.name')} rules={[{ required: true, message: t('asset.pleaseEnterName') }]}>
              <Input />
            </Form.Item>

            <Form.Item name="prompt" label={t('asset.visualPrompt')}>
              <TextArea
                autoSize={{ minRows: 10, maxRows: 18 }}
                placeholder={t('asset.propPromptPlaceholder')}
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
                    <Text className="creatorProgressText">{progressStep}</Text>
                  </Space>
                  <Text type="secondary" className="creatorProgressText">{Math.round(progress)}%</Text>
                </div>
                <Progress percent={Math.round(progress)} strokeColor="var(--token-status-success)" size="small" showInfo={false} />
              </div>
            )}

            <Tooltip title={
              !activeTTI ? t('asset.noGenerateService') :
              !supportsTextToImage ? '当前模型不支持文生图能力' :
              `${t('asset.useService')}: ${activeTTIModel?.channelLabel || activeTTI.name} / ${activeTTIModel?.modelLabel || activeTTI.modelName || ''}`
            }>
              <Button
                type={!getPropPreviewImageSource(editedProp) ? 'primary' : 'default'}
                block
                icon={<ThunderboltOutlined />}
                onClick={handleGenerateImage}
                loading={generating === 'image'}
                disabled={generating !== null || !supportsTextToImage}
              >
                {getPropPreviewImageSource(editedProp) ? t('asset.regenerateReferenceImage') : t('asset.generateReferenceImage')}
              </Button>
            </Tooltip>

            <Tooltip title={
              !activeITV ? t('asset.noVideoService') :
              !supportsImageToVideo ? '当前视频模型不支持图生视频能力' :
              `${t('asset.useService')}: ${activeITVModel?.channelLabel || activeITV.name} / ${activeITVModel?.modelLabel || activeITV.modelName || ''}`
            }>
              <Button
                type={getPropPreviewImageSource(editedProp) && !getPropPreviewVideoSource(editedProp) ? 'primary' : 'default'}
                block
                icon={<PlayCircleOutlined />}
                onClick={handleGenerateVideo}
                loading={generating === 'video'}
                disabled={generating !== null || !getPropPreviewImageSource(editedProp) || !supportsImageToVideo}
              >
                {t('asset.generatePreviewVideo')}
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
              { label: t('asset.propImage'), value: 'image', icon: <InboxOutlined /> },
              // 预览视频 Tab 暂时隐藏
              // { label: t('asset.previewVideo'), value: 'video', icon: <PlayCircleOutlined /> },
            ]}
          />

          <Space>
            {/* 道具绑定按钮暂时隐藏（依赖预览视频） */}
            {false && (editedProp.sora2PropId ? (
              <Tag color="success" icon={<CheckCircleOutlined />}>
                {t('asset.boundTo')}: {editedProp.sora2PropId.substring(0, 8)}...
              </Tag>
            ) : (
              <Button
                size="small"
                type="primary"
                ghost
                icon={<LinkOutlined />}
                loading={generating === 'extract'}
                onClick={handleExtractProp}
                disabled={!getPropPreviewVideoSource(editedProp) || generating !== null}
              >
                {t('asset.extractAndBindProp')}
              </Button>
            ))}

            <div className="toolbarDivider" />

            <Tooltip title={viewMode === 'image' ? t('asset.uploadPropImage') : t('asset.uploadVideo')}>
              <Button
                type="text"
                icon={<UploadOutlined />}
                onClick={viewMode === 'image' ? handleUploadImage : handleUploadVideo}
                aria-label={viewMode === 'image' ? t('asset.uploadPropImage') : t('asset.uploadVideo')}
              />
            </Tooltip>
            {viewMode === 'image' && getPropPreviewImageSource(editedProp) && (
              <Popconfirm
                title={t('asset.removePropImage')}
                description={t('asset.removeImageOnlyDescription')}
                onConfirm={handleRemovePropImage}
                okButtonProps={{ danger: true }}
              >
                <Tooltip title={t('asset.removePropImage')}>
                  <Button
                    type="text"
                    danger
                    icon={<DeleteOutlined />}
                    aria-label={t('asset.removePropImage')}
                  />
                </Tooltip>
              </Popconfirm>
            )}
            <Tooltip title={t('asset.enlargePreview')}>
              <Button
                type="text"
                icon={<ExpandOutlined />}
                onClick={() => {
                  if (viewMode === 'image' && propImageDisplayUrl) {
                    setPreviewImage(propImageDisplayUrl);
                  }
                }}
                disabled={viewMode === 'video' || !propImageSource}
                aria-label={t('asset.enlargePreview')}
              />
            </Tooltip>
          </Space>
        </div>

        <div className="creatorCanvasBody">
          {viewMode === 'image' ? (
            <div className="creatorMediaViewer">
              {propImageDisplayUrl ? (
                <img
                  src={propImageDisplayUrl}
                  alt={t('asset.propImage')}
                  className="creatorMediaPreview"
                  onDoubleClick={() => setPreviewImage(propImageDisplayUrl)}
                />
              ) : (
                <div className="creatorMediaPlaceholder">
                  <InboxOutlined />
                  <div>{t('asset.noPropImage')}</div>
                </div>
              )}
            </div>
          ) : (
            <div className="creatorMediaViewer">
              {getPropPreviewVideoSource(editedProp) ? (
                <video src={toLocalUrl(getPropPreviewVideoSource(editedProp))} controls autoPlay loop />
              ) : (
                <div className="creatorMediaPlaceholder">
                  <PlayCircleOutlined />
                  <div>{t('asset.noPreviewVideo')}</div>
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
        className="transparent-modal"
        closeIcon={null}
      >
        {previewImage && (
          <img
            src={previewImage}
            alt="Preview"
            className="transparentPreviewImage"
            onClick={() => setPreviewImage(null)}
          />
        )}
      </Modal>
    </div>
  );
};

export default PropDetailPanel;

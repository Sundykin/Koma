/**
 * 场景详情面板 - Creator Layout
 * 左侧输入控制区 + 右侧画布预览区
 */
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { createLogger } from '../../store/logger';

const logger = createLogger('SceneDetailPanel');
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
  Tooltip,
  Image,
} from 'antd';
import {
  EnvironmentOutlined,
  SaveOutlined,
  DeleteOutlined,
  UploadOutlined,
  ThunderboltOutlined,
  LoadingOutlined,
  ExpandOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import type { ProjectStyleSnapshot, Scene } from '../../types';
import { isRemoteMediaUri } from '../../types';
import { generateSceneImage } from '../../workflow/scenePropAssetWorkflow';
import { electronService, openFileDialog, fsCopy, fsMkdir, fsExists, fsRemove } from '../../services/electronService';
import { getStorageConfig, initStorageConfig } from '../../store/storageConfig';
import { saveScenes, loadScenes } from '../../store/projectStore';
import { useActiveConfig } from '../../hooks/useActiveConfig';
import { uploadLocalFileToImageHosting, isImageHostingEnabled } from '../../services/imageHostingService';
import { ensureRemoteUrlForImageAsset } from '../../services/mediaRemoteUrlService';
import { createStoredMediaAsset, updateSceneMedia } from '../../utils/mediaAssets';
import { mergeEpisodeRefs } from './assetEpisodeRefs';
import { getScenePreviewImageSource } from '../../utils/mediaSelectors';

const { TextArea } = Input;
const { Text } = Typography;

interface SceneDetailPanelProps {
  scene: Scene;
  projectId: string;
  /** 项目全局比例 — 透传给 generateSceneImage，让场景预览图与项目比例一致 */
  aspectRatio?: '16:9' | '9:16';
  theme?: string;
  stylePrompt?: string;
  styleSnapshot?: ProjectStyleSnapshot;
  ttiSelection?: string;
  onUpdate: (scene: Scene) => void;
  onDelete: (sceneId: string) => void;
}

export const SceneDetailPanel: React.FC<SceneDetailPanelProps> = ({
  scene,
  projectId,
  aspectRatio,
  theme,
  stylePrompt,
  styleSnapshot,
  ttiSelection,
  onUpdate,
  onDelete,
}) => {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const [form] = Form.useForm();

  const { config: activeTTI, activeModel: activeTTIModel } = useActiveConfig('tti', ttiSelection);
  const supportsTextToImage = activeTTIModel?.capabilities.includes('image.text-to-image') ?? false;

  const [editedScene, setEditedScene] = useState<Scene>(scene);
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressStep, setProgressStep] = useState('');
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const currentSceneIdRef = useRef(scene.id);
  currentSceneIdRef.current = scene.id;

  // 初始化
  useEffect(() => {
    const initialPrompt = scene.prompt || '';
    setEditedScene({ ...scene, prompt: initialPrompt });
    form.setFieldsValue({
      name: scene.name,
      prompt: initialPrompt,
    });
  }, [scene, form]);

  const getAssetPath = useCallback(async (subPath: string) => {
    const config = getStorageConfig() || (await initStorageConfig());
    const basePath = `${config.rootPath}/projects/${projectId}/assets/scenes/${editedScene.id}`;
    const fullPath = `${basePath}/${subPath}`;
    const dir = fullPath.substring(0, fullPath.lastIndexOf('/'));
    if (!(await fsExists(dir))) {
      await fsMkdir(dir);
    }
    return fullPath;
  }, [projectId, editedScene.id]);

  const handleSave = useCallback(async () => {
    try {
      const values = await form.validateFields();
      const scenes = await loadScenes(projectId);
      const index = scenes.findIndex(s => s.id === editedScene.id);
      if (index === -1) {
        throw new Error(t('asset.saveFailed'));
      }

      const storedScene = scenes[index];
      const updatedScene: Scene = {
        ...storedScene,
        ...editedScene,
        ...values,
        prompt: values.prompt,
        media: storedScene.media ?? editedScene.media,
        episodeRefs: mergeEpisodeRefs(storedScene.episodeRefs, editedScene.episodeRefs),
      };

      scenes[index] = updatedScene;
      await saveScenes(projectId, scenes);

      setEditedScene(updatedScene);
      onUpdate(updatedScene);
      message.success(t('asset.saveSuccess'));
    } catch (err: any) {
      message.error(err.message || t('asset.saveFailed'));
    }
  }, [editedScene, form, projectId, onUpdate, message, t]);

  /** 上传场景参考图：生成场景图时作为空间/构图参考（与项目风格参考图相互独立） */
  const handleUploadReference = useCallback(async () => {
    try {
      const result = await openFileDialog({
        filters: [{ name: t('storyboard.image'), extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
        title: '选择场景参考图',
      });
      if (result.canceled || !result.filePaths[0]) return;

      const destPath = await getAssetPath('reference.png');
      await fsCopy(result.filePaths[0], destPath);

      const updated = updateSceneMedia(editedScene, {
        referenceImage: createStoredMediaAsset('image', { localPath: destPath }),
      });
      setEditedScene(updated);
      onUpdate(updated);
      const scenes = await loadScenes(projectId);
      const index = scenes.findIndex(s => s.id === editedScene.id);
      if (index !== -1) {
        scenes[index] = updated;
        await saveScenes(projectId, scenes);
      }
      message.success('参考图已上传，生成场景图时将作为空间参考');
    } catch (err: any) {
      message.error(err.message || '参考图上传失败');
    }
  }, [editedScene, getAssetPath, projectId, onUpdate, message, t]);

  const handleRemoveReference = useCallback(async () => {
    try {
      const localPath = editedScene.media?.referenceImage?.localPath;
      const updated = updateSceneMedia(editedScene, { referenceImage: undefined });
      const scenes = await loadScenes(projectId);
      const index = scenes.findIndex(s => s.id === editedScene.id);
      if (index !== -1) {
        scenes[index] = updated;
        await saveScenes(projectId, scenes);
      }
      if (localPath && !isRemoteMediaUri(localPath) && (await fsExists(localPath))) {
        await fsRemove(localPath);
      }
      setEditedScene(updated);
      onUpdate(updated);
      message.success('已移除参考图');
    } catch (err: any) {
      message.error(err.message || '移除失败');
    }
  }, [editedScene, projectId, onUpdate, message]);

  // 单张生成（已移除批量抽卡）：直接出正式场景图并覆盖保存；
  // 生成按场景 id 落盘，用户中途切换场景也会在后台完成写入。
  const handleGenerateImage = useCallback(async () => {
    const ownerId = editedScene.id;
    const isCurrent = () => currentSceneIdRef.current === ownerId;

    setGenerating(true);
    setProgress(0);
    setProgressStep('');

    try {
      const currentValues = await form.getFieldsValue();
      const sceneWithPrompt = { ...editedScene, ...currentValues };

      // 用户手动上传的场景参考图：归一化远端 URL 后作为空间参考传入
      let userReference = sceneWithPrompt.media?.referenceImage;
      if (userReference) {
        try {
          userReference = await ensureRemoteUrlForImageAsset({
            projectId,
            asset: userReference,
            policy: 'best-effort',
            filenameHint: `${ownerId}-reference.png`,
          });
        } catch (error) {
          logger.warn('场景参考图 remoteUrl 归一化失败，将尝试使用本地引用', { error: error instanceof Error ? error.message : String(error) });
        }
      }

      const result = await generateSceneImage({
        projectId,
        scene: sceneWithPrompt,
        aspectRatio,
        theme,
        stylePrompt,
        styleSnapshot,
        ttiSelection,
        destPath: await getAssetPath('scene.png'),
        bindOwner: false,
        normalizeRemoteUrl: true,
        userReference,
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

      const updated = updateSceneMedia(sceneWithPrompt, {
        previewImage: createStoredMediaAsset('image', {
          localPath: result.path,
          remoteUrl: result.url,
        }),
      });
      const scenes = await loadScenes(projectId);
      const index = scenes.findIndex(s => s.id === updated.id);
      if (index !== -1) {
        scenes[index] = updated;
        await saveScenes(projectId, scenes);
      }

      if (isCurrent()) {
        setEditedScene(updated);
        onUpdate(updated);
        message.success(t('asset.sceneImageGenerated'));
      }
    } catch (err: any) {
      if (isCurrent()) message.error(err.message || t('asset.generateFailed'));
    } finally {
      if (isCurrent()) setGenerating(false);
    }
  }, [editedScene, form, getAssetPath, message, onUpdate, projectId, stylePrompt, styleSnapshot, theme, t, ttiSelection, aspectRatio]);

  const handleUploadImage = useCallback(async () => {
    try {
      const result = await openFileDialog({
        filters: [{ name: t('storyboard.image'), extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
        title: t('asset.selectSceneImage'),
      });
      if (result.canceled || !result.filePaths[0]) return;

      const destPath = await getAssetPath('scene.png');
      await fsCopy(result.filePaths[0], destPath);

      let updated: Scene = updateSceneMedia(editedScene, {
        previewImage: createStoredMediaAsset('image', { localPath: destPath }),
      });

      // 检测图床配置，自动上传
      const hostingEnabled = await isImageHostingEnabled();
      if (hostingEnabled) {
        message.loading({ content: t('asset.uploadToHosting'), key: 'imageHosting' });
        const uploadResult = await uploadLocalFileToImageHosting(destPath);
        if (uploadResult.success && uploadResult.url) {
          updated = updateSceneMedia(updated, {
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

      setEditedScene(updated);
      onUpdate(updated);

      const scenes = await loadScenes(projectId);
      const index = scenes.findIndex(s => s.id === editedScene.id);
      if (index !== -1) {
        scenes[index] = updated;
        await saveScenes(projectId, scenes);
      }

      message.success(t('asset.uploadSuccess'));
    } catch (err: any) {
      message.error(`${t('asset.uploadFailed')}: ${err.message}`);
    }
  }, [editedScene, getAssetPath, projectId, onUpdate, message, t]);

  const handleRemoveSceneImage = useCallback(async () => {
    try {
      const previewImage = editedScene.media?.previewImage;
      const localPath = previewImage?.localPath;
      const shouldDeleteLocalFile = Boolean(localPath && !isRemoteMediaUri(localPath));

      const scenes = await loadScenes(projectId);
      const index = scenes.findIndex(s => s.id === editedScene.id);
      if (index === -1) {
        throw new Error(t('asset.saveFailed'));
      }

      if (shouldDeleteLocalFile && localPath) {
        await fsRemove(localPath);
      }

      const updated = updateSceneMedia(editedScene, { previewImage: undefined });
      scenes[index] = updated;
      await saveScenes(projectId, scenes);

      setEditedScene(updated);
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
  }, [editedScene, projectId, onUpdate, message, t]);

  const handleDelete = useCallback(async () => {
    onDelete(editedScene.id);
  }, [editedScene.id, onDelete]);

  const toLocalUrl = (path?: string) => path ? electronService.fs.toLocalUrl(path) : '';
  // 重新生成会覆盖同路径文件，拼 createdAt 做缓存绕过，确保预览拉取新内容
  const appendImageVersion = (url: string, version?: number) => {
    if (!url || !version) return url;
    return `${url}${url.includes('?') ? '&' : '?'}v=${version}`;
  };
  const sceneImageAsset = editedScene.media?.previewImage;
  const sceneImageSource = getScenePreviewImageSource(editedScene);
  const sceneImageDisplayUrl = appendImageVersion(toLocalUrl(sceneImageSource), sceneImageAsset?.createdAt);
  const referenceImageAsset = editedScene.media?.referenceImage;
  const referenceImageDisplayUrl = referenceImageAsset
    ? (referenceImageAsset.localPath
        ? appendImageVersion(toLocalUrl(referenceImageAsset.localPath), referenceImageAsset.createdAt)
        : referenceImageAsset.remoteUrl || '')
    : '';

  return (
    <div className="assetDetailPanel">
      {/* 左侧 Sidebar */}
      <div className="creatorSidebar">
        <div className="creatorSidebarHeader">
          <Space>
            <EnvironmentOutlined />
            <Text strong className="creatorSidebarTitle">{editedScene.name}</Text>
          </Space>
          <Space>
            <Tooltip title={t('common.save')}>
              <Button type="text" size="small" icon={<SaveOutlined />} onClick={handleSave} />
            </Tooltip>
            <Popconfirm
              title={t('asset.confirmRemoveSceneFromEpisode')}
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
                autoSize={{ minRows: 12, maxRows: 20 }}
                placeholder={t('asset.scenePromptPlaceholder')}
              />
            </Form.Item>

            <Form.Item
              label="场景参考图（可选）"
              tooltip="上传后生成场景图会以它为空间/构图参考；不上传则只按文字设定与项目风格生成。"
            >
              {referenceImageAsset ? (
                <Space>
                  <Image
                    src={referenceImageDisplayUrl}
                    width={56}
                    height={56}
                    style={{ objectFit: 'cover', borderRadius: 6 }}
                    preview={{ mask: null }}
                  />
                  <Button size="small" icon={<UploadOutlined />} onClick={handleUploadReference}>
                    更换
                  </Button>
                  <Popconfirm title="移除场景参考图？" onConfirm={handleRemoveReference} okButtonProps={{ danger: true }}>
                    <Button size="small" danger icon={<DeleteOutlined />}>
                      移除
                    </Button>
                  </Popconfirm>
                </Space>
              ) : (
                <Button icon={<UploadOutlined />} onClick={handleUploadReference} block>
                  上传参考图
                </Button>
              )}
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
                type={!getScenePreviewImageSource(editedScene) ? 'primary' : 'default'}
                block
                icon={<ThunderboltOutlined />}
                onClick={handleGenerateImage}
                loading={generating}
                disabled={generating || !supportsTextToImage}
              >
                {getScenePreviewImageSource(editedScene) ? t('asset.regenerateSceneImage') : t('asset.generateSceneImage')}
              </Button>
            </Tooltip>
          </div>
        </div>
      </div>

      {/* 右侧 Canvas */}
      <div className="creatorCanvas">
        <div className="creatorCanvasToolbar">
          <Space>
            <EnvironmentOutlined />
            <Text>{t('asset.scenePreview')}</Text>
          </Space>

          <Space>
            <Tooltip title={t('asset.uploadSceneImage')}>
              <Button type="text" icon={<UploadOutlined />} onClick={handleUploadImage} aria-label={t('asset.uploadSceneImage')} />
            </Tooltip>
            {getScenePreviewImageSource(editedScene) && (
              <Popconfirm
                title={t('asset.removeSceneImage')}
                description={t('asset.removeImageOnlyDescription')}
                onConfirm={handleRemoveSceneImage}
                okButtonProps={{ danger: true }}
              >
                <Tooltip title={t('asset.removeSceneImage')}>
                  <Button
                    type="text"
                    danger
                    icon={<DeleteOutlined />}
                    aria-label={t('asset.removeSceneImage')}
                  />
                </Tooltip>
              </Popconfirm>
            )}
            <Tooltip title={t('asset.enlargePreview')}>
              <Button
                type="text"
                icon={<ExpandOutlined />}
                onClick={() => {
                  if (sceneImageDisplayUrl) setPreviewImage(sceneImageDisplayUrl);
                }}
                disabled={!sceneImageSource}
                aria-label={t('asset.enlargePreview')}
              />
            </Tooltip>
          </Space>
        </div>

        <div className="creatorCanvasBody">
          <div className="creatorMediaViewer">
            {sceneImageDisplayUrl ? (
              <img
                  src={sceneImageDisplayUrl}
                  alt={t('asset.sceneImage')}
                  className="creatorMediaPreview"
                  onDoubleClick={() => setPreviewImage(sceneImageDisplayUrl)}
                />
            ) : (
              <div className="creatorMediaPlaceholder">
                <EnvironmentOutlined />
                <div>{t('asset.noSceneImage')}</div>
              </div>
            )}
          </div>
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

export default SceneDetailPanel;

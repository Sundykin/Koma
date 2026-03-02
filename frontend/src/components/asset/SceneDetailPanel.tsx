/**
 * 场景详情面板 - Creator Layout
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
  Tooltip,
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
import type { Scene } from '../../types';
import { generateSceneImage } from '../../workflow/scenePropAssetWorkflow';
import { electronService, openFileDialog, fsCopy, fsMkdir, fsExists } from '../../services/electronService';
import { getStorageConfig, initStorageConfig } from '../../store/storageConfig';
import { saveScenes, loadScenes } from '../../store/projectStore';
import { useActiveConfig } from '../../hooks/useActiveConfig';
import { uploadLocalFileToImageHosting, getImageHostingConfig } from '../../services/imageHostingService';
import { toUserMessage } from '../../utils/errorMessages';

interface SceneDetailPanelProps {
  scene: Scene;
  projectId: string;
  theme?: string;
  stylePrompt?: string;
  ttiConfigId?: string;
  onUpdate: (scene: Scene) => void;
  onDelete: (sceneId: string) => void;
}

export const SceneDetailPanel: React.FC<SceneDetailPanelProps> = ({
  scene,
  projectId,
  theme,
  stylePrompt,
  ttiConfigId,
  onUpdate,
  onDelete,
}) => {
  const { t } = useTranslation('asset');
  const { message } = App.useApp();
  const [form] = Form.useForm();

  const { config: activeTTI } = useActiveConfig('tti', ttiConfigId);

  const [editedScene, setEditedScene] = useState<Scene>(scene);
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressStep, setProgressStep] = useState('');
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  // 初始化
  useEffect(() => {
    let initialPrompt = scene.prompt || scene.customPrompt || '';
    if (!initialPrompt) {
      const parts = [];
      if (scene.location) parts.push(`Location: ${scene.location}`);
      if (scene.time) parts.push(`Time: ${scene.time}`);
      if (scene.mood) parts.push(`Mood: ${scene.mood}`);
      if (scene.description) parts.push(scene.description);
      initialPrompt = parts.join('\n');
    }

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
      const updatedScene: Scene = {
        ...editedScene,
        ...values,
        prompt: values.prompt,
      };

      const scenes = await loadScenes(projectId);
      const index = scenes.findIndex(s => s.id === editedScene.id);
      if (index !== -1) {
        scenes[index] = updatedScene;
        await saveScenes(projectId, scenes);
      }

      setEditedScene(updatedScene);
      onUpdate(updatedScene);
      message.success(t('scene.saveSuccess'));
    } catch (err: any) {
      message.error(toUserMessage(err) || t('scene.saveFailed'));
    }
  }, [editedScene, form, projectId, onUpdate, message]);

  const handleGenerateImage = useCallback(async () => {
    setGenerating(true);
    setProgress(0);

    try {
      const currentValues = await form.getFieldsValue();
      const sceneWithPrompt = { ...editedScene, ...currentValues };

      const result = await generateSceneImage({
        projectId,
        scene: sceneWithPrompt,
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
          ...editedScene,
          ...currentValues,
          imagePath: result.path,
        };
        setEditedScene(updated);
        onUpdate(updated);
        const scenes = await loadScenes(projectId);
        const index = scenes.findIndex(s => s.id === updated.id);
        if (index !== -1) {
          scenes[index] = updated;
          await saveScenes(projectId, scenes);
        }
        message.success(t('scene.generateDone'));
      } else {
        message.error(result.error || t('scene.generateFailed'));
      }
    } catch (err: any) {
      message.error(toUserMessage(err) || t('scene.generateFailed'));
    } finally {
      setGenerating(false);
    }
  }, [editedScene, projectId, theme, stylePrompt, ttiConfigId, form, onUpdate, message]);

  const handleUploadImage = useCallback(async () => {
    try {
      const result = await openFileDialog({
        filters: [{ name: t('scene.filterImage'), extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
        title: t('scene.dialogSelectImage'),
      });
      if (result.canceled || !result.filePaths[0]) return;

      const destPath = await getAssetPath('scene.png');
      await fsCopy(result.filePaths[0], destPath);

      let updated: Scene = { ...editedScene, imagePath: destPath };

      // 检测图床配置，自动上传
      const imageHostingConfig = await getImageHostingConfig();
      console.log('[SceneDetailPanel] 图床配置:', imageHostingConfig);
      if (imageHostingConfig?.enabled) {
        console.log('[SceneDetailPanel] 图床已启用，开始上传:', destPath);
        message.loading({ content: t('scene.uploadingToHosting'), key: 'imageHosting' });
        const uploadResult = await uploadLocalFileToImageHosting(destPath);
        console.log('[SceneDetailPanel] 图床上传结果:', uploadResult);
        if (uploadResult.success && uploadResult.url) {
          updated.imageUrl = uploadResult.url;
          console.log('[SceneDetailPanel] 图床URL已保存:', uploadResult.url);
          message.success({ content: t('scene.hostingSuccess'), key: 'imageHosting' });
        } else {
          console.warn('[SceneDetailPanel] 图床上传失败:', uploadResult.error);
          message.warning({ content: t('scene.hostingFailed', { error: uploadResult.error }), key: 'imageHosting' });
        }
      } else {
        console.log('[SceneDetailPanel] 图床未启用，跳过上传');
      }

      setEditedScene(updated);
      onUpdate(updated);

      const scenes = await loadScenes(projectId);
      const index = scenes.findIndex(s => s.id === editedScene.id);
      if (index !== -1) {
        scenes[index] = updated;
        await saveScenes(projectId, scenes);
      }

      message.success(t('scene.uploadSuccess'));
    } catch (err: any) {
      message.error(t('scene.uploadFailed', { error: toUserMessage(err) }));
    }
  }, [editedScene, getAssetPath, projectId, onUpdate, message]);

  const handleDelete = useCallback(async () => {
    onDelete(editedScene.id);
  }, [editedScene.id, onDelete]);

  const toLocalUrl = (path?: string) => path ? electronService.fs.toLocalUrl(path) : '';

  return (
    <div className="assetDetailPanel">
      {/* 左侧 Sidebar */}
      <div className="creatorSidebar">
        <div className="creatorSidebarHeader">
          <Space>
            <EnvironmentOutlined />
            <Text strong style={{ fontSize: 16 }}>{editedScene.name}</Text>
          </Space>
          <Space>
            <Tooltip title={t('scene.save')}>
              <Button type="text" size="small" icon={<SaveOutlined />} onClick={handleSave} aria-label={t('scene.save')} />
            </Tooltip>
            <Popconfirm
              title={t('scene.confirmDelete')}
              description={t('scene.deleteWarning')}
              onConfirm={handleDelete}
              okButtonProps={{ danger: true }}
            >
              <Tooltip title={t('scene.delete')}>
                <Button type="text" danger size="small" icon={<DeleteOutlined />} aria-label={t('scene.delete')} />
              </Tooltip>
            </Popconfirm>
          </Space>
        </div>

        <div className="creatorSidebarContent">
          <Form form={form} layout="vertical" size="small">
            <Form.Item name="name" label={t('scene.form.name')} rules={[{ required: true, message: t('scene.form.nameRequired') }]}>
              <Input />
            </Form.Item>

            <Form.Item name="prompt" label={t('scene.form.prompt')}>
              <TextArea
                autoSize={{ minRows: 12, maxRows: 20 }}
                placeholder={t('scene.form.promptPlaceholder')}
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

            <Tooltip title={activeTTI ? t('scene.tooltipService', { name: activeTTI.name }) : t('scene.tooltipNoService')}>
              <Button
                type={!editedScene.imagePath ? 'primary' : 'default'}
                block
                icon={<ThunderboltOutlined />}
                onClick={handleGenerateImage}
                loading={generating}
                disabled={generating}
              >
                {editedScene.imagePath ? t('scene.regenerateImage') : t('scene.generateImage')}
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
            <Text>{t('scene.preview')}</Text>
          </Space>

          <Space>
            <Tooltip title={t('scene.uploadImage')}>
              <Button type="text" icon={<UploadOutlined />} onClick={handleUploadImage} aria-label={t('scene.uploadImage')} />
            </Tooltip>
            <Tooltip title={t('scene.expandPreview')}>
              <Button
                type="text"
                icon={<ExpandOutlined />}
                onClick={() => editedScene.imagePath && setPreviewImage(toLocalUrl(editedScene.imagePath))}
                disabled={!editedScene.imagePath}
                aria-label={t('scene.expandPreview')}
              />
            </Tooltip>
          </Space>
        </div>

        <div className="creatorCanvasBody">
          <div className="creatorMediaViewer">
            {editedScene.imagePath ? (
              <img
                  src={toLocalUrl(editedScene.imagePath)}
                  alt={t('scene.preview')}
                  style={{ cursor: 'pointer' }}
                  onDoubleClick={() => setPreviewImage(toLocalUrl(editedScene.imagePath))}
                />
            ) : (
              <div className="creatorMediaPlaceholder">
                <EnvironmentOutlined />
                <div>{t('scene.noImage')}</div>
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

export default SceneDetailPanel;

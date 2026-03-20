/**
 * 角色详情面板 - Creator Layout
 * 左侧输入控制区 + 右侧画布预览区
 */
import React, { useState, useCallback, useEffect } from 'react';
import { createLogger } from '../../store/logger';

const logger = createLogger('CharacterDetailPanel');
import {
  Form,
  Input,
  Select,
  Button,
  Space,
  Progress,
  App,
  Row,
  Col,
  Typography,
  Popconfirm,
  Modal,
  Segmented,
  Tooltip,
  Tag,
} from 'antd';
import {
  UserOutlined,
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
import type { Character, ProjectStyleSnapshot } from '../../types';
import {
  generateCostumePhoto,
  generateCharacterPreviewVideo,
  extractAndBindCharacter,
} from '../../workflow/characterAssetWorkflow';
import { electronService, openFileDialog, fsCopy, fsMkdir, fsExists } from '../../services/electronService';
import { getStorageConfig, initStorageConfig } from '../../store/storageConfig';
import { saveCharacters, loadCharacters } from '../../store/projectStore';
import { useActiveConfig } from '../../hooks/useActiveConfig';
import { uploadLocalFileToImageHosting, getImageHostingConfig } from '../../services/imageHostingService';
import { createStoredMediaAsset, updateCharacterMedia } from '../../utils/mediaAssets';
import {
  getCharacterCostumePhotoSource,
  getCharacterPreviewVideoSource,
} from '../../utils/mediaSelectors';

const { TextArea } = Input;
const { Text } = Typography;

interface CharacterDetailPanelProps {
  character: Character;
  projectId: string;
  theme?: string;
  stylePrompt?: string;
  styleSnapshot?: ProjectStyleSnapshot;
  ttiConfigId?: string;
  itvConfigId?: string;
  onUpdate: (character: Character) => void;
  onDelete: (characterId: string) => void;
}

type GeneratingType = 'costume' | 'video' | 'extract' | null;
type ViewMode = 'costume' | 'video';

export const CharacterDetailPanel: React.FC<CharacterDetailPanelProps> = ({
  character,
  projectId,
  theme,
  stylePrompt,
  styleSnapshot,
  ttiConfigId,
  itvConfigId,
  onUpdate,
  onDelete,
}) => {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const [form] = Form.useForm();
  
  const { config: activeTTI } = useActiveConfig('tti', ttiConfigId);
  const { config: activeITV } = useActiveConfig('itv', itvConfigId);

  const [editedCharacter, setEditedCharacter] = useState<Character>(character);
  const [viewMode, setViewMode] = useState<ViewMode>('costume');
  const [generating, setGenerating] = useState<GeneratingType>(null);
  const [progress, setProgress] = useState(0);
  const [progressStep, setProgressStep] = useState('');
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  // 初始化
  useEffect(() => {
    let initialPrompt = character.prompt || character.customPrompt || '';
    if (!initialPrompt) {
      const parts = [];
      if (character.age) parts.push(`Age: ${character.age}`);
      if (character.appearance) parts.push(character.appearance);
      if (character.description) parts.push(character.description);
      initialPrompt = parts.join('\n');
    }

    setEditedCharacter({ ...character, prompt: initialPrompt });
    form.setFieldsValue({
      name: character.name,
      role: character.role,
      prompt: initialPrompt,
    });
  }, [character, form]);

  // 自动切换视图模式
  useEffect(() => {
    if (generating === 'costume') setViewMode('costume');
    else if (generating === 'video') setViewMode('video');
  }, [generating]);

  const getAssetPath = useCallback(async (subPath: string) => {
    const config = getStorageConfig() || (await initStorageConfig());
    const basePath = `${config.rootPath}/projects/${projectId}/assets/characters/${editedCharacter.id}`;
    const fullPath = `${basePath}/${subPath}`;
    const dir = fullPath.substring(0, fullPath.lastIndexOf('/'));
    if (!(await fsExists(dir))) {
      await fsMkdir(dir);
    }
    return fullPath;
  }, [projectId, editedCharacter.id]);

  const handleSave = useCallback(async () => {
    try {
      const values = await form.validateFields();
      const updatedCharacter: Character = {
        ...editedCharacter,
        ...values,
        prompt: values.prompt,
      };

      const characters = await loadCharacters(projectId);
      const index = characters.findIndex(c => c.id === editedCharacter.id);
      if (index !== -1) {
        characters[index] = updatedCharacter;
        await saveCharacters(projectId, characters);
      }

      setEditedCharacter(updatedCharacter);
      onUpdate(updatedCharacter);
      message.success(t('asset.saveSuccess'));
    } catch (err: any) {
      message.error(err.message || t('asset.saveFailed'));
    }
  }, [editedCharacter, form, projectId, onUpdate, message, t]);

  const handleGenerateCostume = useCallback(async () => {
    setGenerating('costume');
    setProgress(0);

    try {
      const currentValues = await form.getFieldsValue();
      const charWithPrompt = { ...editedCharacter, ...currentValues };

      const result = await generateCostumePhoto({
        projectId,
        character: charWithPrompt,
        theme,
        stylePrompt,
        styleSnapshot,
        ttiConfigId,
        onProgress: (p, step) => {
          setProgress(p);
          setProgressStep(step);
        },
      });

      if (result.success && result.path) {
        const updated = updateCharacterMedia(
          {
            ...editedCharacter,
            ...currentValues,
          },
          {
            costumePhoto: createStoredMediaAsset('image', {
              localPath: result.path,
              remoteUrl: result.url,
            }),
          }
        );
        setEditedCharacter(updated);
        onUpdate(updated);
        const characters = await loadCharacters(projectId);
        const index = characters.findIndex(c => c.id === updated.id);
        if (index !== -1) {
          characters[index] = updated;
          await saveCharacters(projectId, characters);
        }
        message.success(t('asset.costumeGenerated'));
      } else {
        message.error(result.error || t('asset.generateFailed'));
      }
    } catch (err: any) {
      message.error(err.message || t('asset.generateFailed'));
    } finally {
      setGenerating(null);
    }
  }, [editedCharacter, projectId, theme, stylePrompt, styleSnapshot, ttiConfigId, form, onUpdate, message]);

  const handleUploadCostume = useCallback(async () => {
    try {
      const result = await openFileDialog({
        filters: [{ name: t('storyboard.image'), extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
        title: t('asset.selectCostumePhoto'),
      });
      if (result.canceled || !result.filePaths[0]) return;

      const destPath = await getAssetPath('costume.png');
      await fsCopy(result.filePaths[0], destPath);

      let updated: Character = updateCharacterMedia(editedCharacter, {
        costumePhoto: createStoredMediaAsset('image', { localPath: destPath }),
      });

      // 检测图床配置，自动上传
      const imageHostingConfig = await getImageHostingConfig();
      if (imageHostingConfig?.enabled) {
        message.loading({ content: t('asset.uploadToHosting'), key: 'imageHosting' });
        const uploadResult = await uploadLocalFileToImageHosting(destPath);
        if (uploadResult.success && uploadResult.url) {
          updated = updateCharacterMedia(updated, {
            costumePhoto: createStoredMediaAsset('image', {
              localPath: destPath,
              remoteUrl: uploadResult.url,
              createdAt: updated.media?.costumePhoto?.createdAt,
            }),
          });
          message.success({ content: t('asset.uploadHostingSuccess'), key: 'imageHosting' });
        } else {
          logger.warn('图床上传失败:', uploadResult.error);
          message.warning({ content: `${t('asset.uploadHostingFailed')}: ${uploadResult.error}`, key: 'imageHosting' });
        }
      }

      setEditedCharacter(updated);
      onUpdate(updated);

      const characters = await loadCharacters(projectId);
      const index = characters.findIndex(c => c.id === editedCharacter.id);
      if (index !== -1) {
        characters[index] = updated;
        await saveCharacters(projectId, characters);
      }

      message.success(t('asset.uploadSuccess'));
    } catch (err: any) {
      message.error(`${t('asset.uploadFailed')}: ${err.message}`);
    }
  }, [editedCharacter, getAssetPath, projectId, onUpdate, message, t]);

  const handleGenerateVideo = useCallback(async () => {
    if (!getCharacterCostumePhotoSource(editedCharacter)) {
      message.warning(t('asset.pleaseGenerateCostumeFirst'));
      return;
    }

    setGenerating('video');
    setProgress(0);

    try {
      const result = await generateCharacterPreviewVideo({
        projectId,
        character: editedCharacter,
        theme,
        stylePrompt,
        styleSnapshot,
        itvConfigId,
        onProgress: (p, step) => {
          setProgress(p);
          setProgressStep(step);
        },
      });

      if (result.success && result.path) {
        const updated = updateCharacterMedia(editedCharacter, {
          previewVideo: createStoredMediaAsset('video', {
            localPath: result.path,
            providerTaskId: result.taskId,
          }),
        });
        setEditedCharacter(updated);
        onUpdate(updated);
        const characters = await loadCharacters(projectId);
        const index = characters.findIndex(c => c.id === updated.id);
        if (index !== -1) {
          characters[index] = updated;
          await saveCharacters(projectId, characters);
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
  }, [editedCharacter, projectId, theme, stylePrompt, styleSnapshot, itvConfigId, onUpdate, message, t]);

  const handleUploadVideo = useCallback(async () => {
    try {
      const result = await openFileDialog({
        filters: [{ name: t('video.title'), extensions: ['mp4', 'webm', 'mov'] }],
        title: t('asset.selectPreviewVideo'),
      });
      if (result.canceled || !result.filePaths[0]) return;

      const destPath = await getAssetPath('preview.mp4');
      await fsCopy(result.filePaths[0], destPath);

      const updated = updateCharacterMedia(editedCharacter, {
        previewVideo: createStoredMediaAsset('video', { localPath: destPath }),
      });
      setEditedCharacter(updated);
      onUpdate(updated);

      const characters = await loadCharacters(projectId);
      const index = characters.findIndex(c => c.id === editedCharacter.id);
      if (index !== -1) {
        characters[index] = updated;
        await saveCharacters(projectId, characters);
      }

      message.success(t('asset.uploadSuccess'));
    } catch (err: any) {
      message.error(`${t('asset.uploadFailed')}: ${err.message}`);
    }
  }, [editedCharacter, getAssetPath, projectId, onUpdate, message, t]);

  const handleExtractCharacter = useCallback(async () => {
    if (!getCharacterPreviewVideoSource(editedCharacter)) {
      message.warning(t('asset.pleaseGenerateVideoFirst'));
      return;
    }

    setGenerating('extract');
    setProgress(0);
    setProgressStep(t('asset.extractingCharacter'));

    try {
      const result = await extractAndBindCharacter(
        projectId,
        editedCharacter,
        itvConfigId,
        (p, step) => {
          setProgress(p);
          setProgressStep(step);
        }
      );

      if (result.success && result.characterId) {
        const updated = { ...editedCharacter, sora2CharacterId: result.characterId };
        setEditedCharacter(updated);
        onUpdate(updated);

        const characters = await loadCharacters(projectId);
        const index = characters.findIndex(c => c.id === editedCharacter.id);
        if (index !== -1) {
          characters[index] = updated;
          await saveCharacters(projectId, characters);
        }

        message.success(t('asset.characterExtracted'));
      } else {
        message.error(result.error || t('asset.extractFailed'));
      }
    } catch (err: any) {
      message.error(err.message || t('asset.extractFailed'));
    } finally {
      setGenerating(null);
    }
  }, [editedCharacter, projectId, itvConfigId, onUpdate, message, t]);

  const handleDelete = useCallback(async () => {
    onDelete(editedCharacter.id);
  }, [editedCharacter.id, onDelete]);

  const toLocalUrl = (path?: string) => path ? electronService.fs.toLocalUrl(path) : '';

  const roleOptions = [
    { value: 'protagonist', label: t('asset.protagonist') },
    { value: 'antagonist', label: t('asset.antagonist') },
    { value: 'supporting', label: t('asset.supporting') },
  ];

  return (
    <div className="assetDetailPanel">
      {/* 左侧 Sidebar */}
      <div className="creatorSidebar">
        <div className="creatorSidebarHeader">
          <Space>
            <UserOutlined />
            <Text strong style={{ fontSize: 16 }}>{editedCharacter.name}</Text>
          </Space>
          <Space>
            <Tooltip title={t('common.save')}>
              <Button type="text" size="small" icon={<SaveOutlined />} onClick={handleSave} />
            </Tooltip>
            <Popconfirm
              title={t('asset.confirmDeleteCharacter')}
              description={t('asset.cannotUndo')}
              onConfirm={handleDelete}
              okButtonProps={{ danger: true }}
            >
              <Tooltip title={t('common.delete')}>
                <Button type="text" danger size="small" icon={<DeleteOutlined />} />
              </Tooltip>
            </Popconfirm>
          </Space>
        </div>

        <div className="creatorSidebarContent">
          <Form form={form} layout="vertical" size="small">
            <Row gutter={12}>
              <Col span={16}>
                <Form.Item name="name" label={t('asset.name')} rules={[{ required: true, message: t('asset.pleaseEnterName') }]}>
                  <Input />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item name="role" label={t('asset.type')}>
                  <Select options={roleOptions} />
                </Form.Item>
              </Col>
            </Row>

            <Form.Item name="prompt" label={t('asset.visualPrompt')}>
              <TextArea
                autoSize={{ minRows: 10, maxRows: 18 }}
                placeholder={t('asset.characterPromptPlaceholder')}
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

            <Tooltip title={
              generating !== null ? t('asset.generatingPleaseWait') :
              activeTTI ? `${t('asset.useService')}: ${activeTTI.name}` : t('asset.noGenerateService')
            }>
              <Button
                type={!getCharacterCostumePhotoSource(editedCharacter) ? 'primary' : 'default'}
                block
                icon={<ThunderboltOutlined />}
                onClick={handleGenerateCostume}
                loading={generating === 'costume'}
                disabled={generating !== null}
              >
                {t('asset.generateCostumePhoto')}
              </Button>
            </Tooltip>

            <Tooltip title={
              generating !== null ? t('asset.generatingPleaseWait') :
              !getCharacterCostumePhotoSource(editedCharacter) ? t('asset.needCostumePhotoFirst') :
              activeITV ? `${t('asset.useService')}: ${activeITV.name}` : t('asset.noVideoService')
            }>
              <Button
                type={getCharacterCostumePhotoSource(editedCharacter) && !getCharacterPreviewVideoSource(editedCharacter) ? 'primary' : 'default'}
                block
                icon={<PlayCircleOutlined />}
                onClick={handleGenerateVideo}
                loading={generating === 'video'}
                disabled={generating !== null || !getCharacterCostumePhotoSource(editedCharacter)}
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
              { label: t('asset.costumePhoto'), value: 'costume', icon: <UserOutlined /> },
              { label: t('asset.previewVideo'), value: 'video', icon: <PlayCircleOutlined /> },
            ]}
          />

          <Space>
            {editedCharacter.sora2CharacterId ? (
              <Tag color="success" icon={<CheckCircleOutlined />}>
                {t('asset.boundTo')}: {editedCharacter.sora2CharacterId.substring(0, 8)}...
              </Tag>
            ) : (
              <Tooltip title={
                generating !== null ? t('asset.generatingPleaseWait') :
                !getCharacterPreviewVideoSource(editedCharacter) ? t('asset.needPreviewVideoFirst') :
                t('asset.extractAndBindCharacter')
              }>
                <Button
                  size="small"
                  type="primary"
                  ghost
                  icon={<LinkOutlined />}
                  loading={generating === 'extract'}
                  onClick={handleExtractCharacter}
                  disabled={!getCharacterPreviewVideoSource(editedCharacter) || generating !== null}
                >
                  {t('asset.extractAndBindCharacter')}
                </Button>
              </Tooltip>
            )}

            <div className="toolbarDivider" />

            <Tooltip title={viewMode === 'costume' ? t('asset.uploadCostumePhoto') : t('asset.uploadVideo')}>
              <Button
                type="text"
                icon={<UploadOutlined />}
                onClick={viewMode === 'costume' ? handleUploadCostume : handleUploadVideo}
                aria-label={viewMode === 'costume' ? t('asset.uploadCostumePhoto') : t('asset.uploadVideo')}
              />
            </Tooltip>
            <Tooltip title={
              viewMode === 'video' ? t('asset.switchToCostumeMode') :
              !getCharacterCostumePhotoSource(editedCharacter) ? t('asset.noCostumePhoto') :
              t('asset.enlargePreview')
            }>
              <Button
                type="text"
                icon={<ExpandOutlined />}
                onClick={() => {
                  const costumePhotoSource = getCharacterCostumePhotoSource(editedCharacter);
                  if (viewMode === 'costume' && costumePhotoSource) {
                    setPreviewImage(toLocalUrl(costumePhotoSource));
                  }
                }}
                disabled={viewMode === 'video' || !getCharacterCostumePhotoSource(editedCharacter)}
                aria-label={t('asset.enlargePreview')}
              />
            </Tooltip>
          </Space>
        </div>

        <div className="creatorCanvasBody">
          {viewMode === 'costume' ? (
            <div className="creatorMediaViewer">
              {getCharacterCostumePhotoSource(editedCharacter) ? (
                <img
                  src={toLocalUrl(getCharacterCostumePhotoSource(editedCharacter))}
                  alt={t('asset.costumePhoto')}
                  style={{ cursor: 'pointer' }}
                  onDoubleClick={() => setPreviewImage(toLocalUrl(getCharacterCostumePhotoSource(editedCharacter)))}
                />
              ) : (
                <div className="creatorMediaPlaceholder">
                  <UserOutlined />
                  <div>{t('asset.noCostumePhoto')}</div>
                </div>
              )}
            </div>
          ) : (
            <div className="creatorMediaViewer">
              {getCharacterPreviewVideoSource(editedCharacter) ? (
                <video src={toLocalUrl(getCharacterPreviewVideoSource(editedCharacter))} controls autoPlay loop />
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
        styles={{ body: { padding: 0, background: 'transparent' } }}
        className="transparent-modal"
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

export default CharacterDetailPanel;

/**
 * 角色详情面板 - Creator Layout
 * 左侧输入控制区 + 右侧画布预览区
 */
import React, { useState, useCallback, useEffect } from 'react';
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
import type { Character } from '../../types';
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

const { TextArea } = Input;
const { Text } = Typography;

interface CharacterDetailPanelProps {
  character: Character;
  projectId: string;
  theme?: string;
  stylePrompt?: string;
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
  ttiConfigId,
  itvConfigId,
  onUpdate,
  onDelete,
}) => {
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
      message.success('保存成功');
    } catch (err: any) {
      message.error(err.message || '保存失败');
    }
  }, [editedCharacter, form, projectId, onUpdate, message]);

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
        ttiConfigId,
        onProgress: (p, step) => {
          setProgress(p);
          setProgressStep(step);
        },
      });

      if (result.success && result.path) {
        const updated = {
          ...editedCharacter,
          ...currentValues,
          costumePhotoPath: result.path,
          costumePhotoUrl: result.url,
        };
        setEditedCharacter(updated);
        onUpdate(updated);
        const characters = await loadCharacters(projectId);
        const index = characters.findIndex(c => c.id === updated.id);
        if (index !== -1) {
          characters[index] = updated;
          await saveCharacters(projectId, characters);
        }
        message.success('定妆照生成完成');
      } else {
        message.error(result.error || '生成失败');
      }
    } catch (err: any) {
      message.error(err.message || '生成失败');
    } finally {
      setGenerating(null);
    }
  }, [editedCharacter, projectId, theme, stylePrompt, ttiConfigId, form, onUpdate, message]);

  const handleUploadCostume = useCallback(async () => {
    try {
      const result = await openFileDialog({
        filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
        title: '选择定妆照',
      });
      if (result.canceled || !result.filePaths[0]) return;

      const destPath = await getAssetPath('costume.png');
      await fsCopy(result.filePaths[0], destPath);

      let updated: Character = { ...editedCharacter, costumePhotoPath: destPath };

      // 检测图床配置，自动上传
      const imageHostingConfig = await getImageHostingConfig();
      console.log('[CharacterDetailPanel] 图床配置:', imageHostingConfig);
      if (imageHostingConfig?.enabled) {
        console.log('[CharacterDetailPanel] 图床已启用，开始上传:', destPath);
        message.loading({ content: '正在上传到图床...', key: 'imageHosting' });
        const uploadResult = await uploadLocalFileToImageHosting(destPath);
        console.log('[CharacterDetailPanel] 图床上传结果:', uploadResult);
        if (uploadResult.success && uploadResult.url) {
          updated.costumePhotoUrl = uploadResult.url;
          console.log('[CharacterDetailPanel] 图床URL已保存:', uploadResult.url);
          message.success({ content: '图床上传成功', key: 'imageHosting' });
        } else {
          console.warn('[CharacterDetailPanel] 图床上传失败:', uploadResult.error);
          message.warning({ content: `图床上传失败: ${uploadResult.error}`, key: 'imageHosting' });
        }
      } else {
        console.log('[CharacterDetailPanel] 图床未启用，跳过上传');
      }

      setEditedCharacter(updated);
      onUpdate(updated);

      const characters = await loadCharacters(projectId);
      const index = characters.findIndex(c => c.id === editedCharacter.id);
      if (index !== -1) {
        characters[index] = updated;
        await saveCharacters(projectId, characters);
      }

      message.success('上传成功');
    } catch (err: any) {
      message.error(`上传失败: ${err.message}`);
    }
  }, [editedCharacter, getAssetPath, projectId, onUpdate, message]);

  const handleGenerateVideo = useCallback(async () => {
    if (!editedCharacter.costumePhotoPath) {
      message.warning('请先生成或上传定妆照');
      return;
    }

    setGenerating('video');
    setProgress(0);

    try {
      const result = await generateCharacterPreviewVideo({
        projectId,
        character: editedCharacter,
        itvConfigId,
        onProgress: (p, step) => {
          setProgress(p);
          setProgressStep(step);
        },
      });

      if (result.success && result.path) {
        const updated = {
          ...editedCharacter,
          previewVideoPath: result.path,
          previewVideoTaskId: result.taskId,
        };
        setEditedCharacter(updated);
        onUpdate(updated);
        const characters = await loadCharacters(projectId);
        const index = characters.findIndex(c => c.id === updated.id);
        if (index !== -1) {
          characters[index] = updated;
          await saveCharacters(projectId, characters);
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
  }, [editedCharacter, projectId, itvConfigId, onUpdate, message]);

  const handleUploadVideo = useCallback(async () => {
    try {
      const result = await openFileDialog({
        filters: [{ name: '视频', extensions: ['mp4', 'webm', 'mov'] }],
        title: '选择预览视频',
      });
      if (result.canceled || !result.filePaths[0]) return;

      const destPath = await getAssetPath('preview.mp4');
      await fsCopy(result.filePaths[0], destPath);

      const updated = { ...editedCharacter, previewVideoPath: destPath };
      setEditedCharacter(updated);
      onUpdate(updated);

      const characters = await loadCharacters(projectId);
      const index = characters.findIndex(c => c.id === editedCharacter.id);
      if (index !== -1) {
        characters[index] = updated;
        await saveCharacters(projectId, characters);
      }

      message.success('上传成功');
    } catch (err: any) {
      message.error(`上传失败: ${err.message}`);
    }
  }, [editedCharacter, getAssetPath, projectId, onUpdate, message]);

  const handleExtractCharacter = useCallback(async () => {
    if (!editedCharacter.previewVideoPath) {
      message.warning('请先生成或上传预览视频');
      return;
    }

    setGenerating('extract');
    setProgress(0);
    setProgressStep('提取角色中...');

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

        message.success('角色提取成功');
      } else {
        message.error(result.error || '提取失败');
      }
    } catch (err: any) {
      message.error(err.message || '提取失败');
    } finally {
      setGenerating(null);
    }
  }, [editedCharacter, projectId, itvConfigId, onUpdate, message]);

  const handleDelete = useCallback(async () => {
    onDelete(editedCharacter.id);
  }, [editedCharacter.id, onDelete]);

  const toLocalUrl = (path?: string) => path ? electronService.fs.toLocalUrl(path) : '';

  const roleOptions = [
    { value: 'protagonist', label: '主角' },
    { value: 'antagonist', label: '反派' },
    { value: 'supporting', label: '配角' },
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
            <Tooltip title="保存">
              <Button type="text" size="small" icon={<SaveOutlined />} onClick={handleSave} />
            </Tooltip>
            <Popconfirm
              title="确定删除此角色？"
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
            <Row gutter={12}>
              <Col span={16}>
                <Form.Item name="name" label="名称" rules={[{ required: true, message: '请输入名称' }]}>
                  <Input />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item name="role" label="类型">
                  <Select options={roleOptions} />
                </Form.Item>
              </Col>
            </Row>

            <Form.Item name="prompt" label="视觉描述 Prompt">
              <TextArea
                autoSize={{ minRows: 10, maxRows: 18 }}
                placeholder="在此输入详细的角色视觉描述..."
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
                type={!editedCharacter.costumePhotoPath ? 'primary' : 'default'}
                block
                icon={<ThunderboltOutlined />}
                onClick={handleGenerateCostume}
                loading={generating === 'costume'}
                disabled={generating !== null}
              >
                生成定妆照 (三视图)
              </Button>
            </Tooltip>

            <Tooltip title={activeITV ? `使用服务: ${activeITV.name}` : '未配置视频服务'}>
              <Button
                type={editedCharacter.costumePhotoPath && !editedCharacter.previewVideoPath ? 'primary' : 'default'}
                block
                icon={<PlayCircleOutlined />}
                onClick={handleGenerateVideo}
                loading={generating === 'video'}
                disabled={generating !== null || !editedCharacter.costumePhotoPath}
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
              { label: '定妆照', value: 'costume', icon: <UserOutlined /> },
              { label: '预览视频', value: 'video', icon: <PlayCircleOutlined /> },
            ]}
          />

          <Space>
            {editedCharacter.sora2CharacterId ? (
              <Tag color="success" icon={<CheckCircleOutlined />}>
                已绑定: {editedCharacter.sora2CharacterId.substring(0, 8)}...
              </Tag>
            ) : (
              <Button
                size="small"
                type="primary"
                ghost
                icon={<LinkOutlined />}
                loading={generating === 'extract'}
                onClick={handleExtractCharacter}
                disabled={!editedCharacter.previewVideoPath || generating !== null}
              >
                提取并绑定角色
              </Button>
            )}

            <div className="toolbarDivider" />

            <Tooltip title={viewMode === 'costume' ? '上传定妆照' : '上传视频'}>
              <Button
                type="text"
                icon={<UploadOutlined />}
                onClick={viewMode === 'costume' ? handleUploadCostume : handleUploadVideo}
                aria-label={viewMode === 'costume' ? '上传定妆照' : '上传视频'}
              />
            </Tooltip>
            <Tooltip title="放大预览">
              <Button
                type="text"
                icon={<ExpandOutlined />}
                onClick={() => {
                  if (viewMode === 'costume' && editedCharacter.costumePhotoPath) {
                    setPreviewImage(toLocalUrl(editedCharacter.costumePhotoPath));
                  }
                }}
                disabled={viewMode === 'video' || !editedCharacter.costumePhotoPath}
                aria-label="放大预览"
              />
            </Tooltip>
          </Space>
        </div>

        <div className="creatorCanvasBody">
          {viewMode === 'costume' ? (
            <div className="creatorMediaViewer">
              {editedCharacter.costumePhotoPath ? (
                <img
                  src={toLocalUrl(editedCharacter.costumePhotoPath)}
                  alt="定妆照"
                  style={{ cursor: 'pointer' }}
                  onDoubleClick={() => setPreviewImage(toLocalUrl(editedCharacter.costumePhotoPath))}
                />
              ) : (
                <div className="creatorMediaPlaceholder">
                  <UserOutlined />
                  <div>暂无定妆照</div>
                </div>
              )}
            </div>
          ) : (
            <div className="creatorMediaViewer">
              {editedCharacter.previewVideoPath ? (
                <video src={toLocalUrl(editedCharacter.previewVideoPath)} controls autoPlay loop />
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

export default CharacterDetailPanel;

/**
 * 角色详情弹窗
 * 支持编辑角色信息、生成/上传资产、角色提取
 */
import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  Modal,
  Form,
  Input,
  Select,
  Button,
  Space,
  Tabs,
  Image,
  Tooltip,
  Popconfirm,
  Progress,
  Spin,
  App,
  Row,
  Col,
  Divider,
  Typography,
} from 'antd';
import {
  UserOutlined,
  EditOutlined,
  SaveOutlined,
  DeleteOutlined,
  UploadOutlined,
  ThunderboltOutlined,
  PlayCircleOutlined,
  CheckCircleOutlined,
  LoadingOutlined,
  EyeOutlined,
  ReloadOutlined,
  LinkOutlined,
} from '@ant-design/icons';
import type { Character } from '../types';
import {
  generateCostumePhoto,
  generateThreeView,
  generateCharacterPreviewVideo,
  extractAndBindCharacter,
  getCharacterPrompt,
  buildThreeViewPrompt,
} from '../workflow/characterAssetWorkflow';
import { getThemeStylePrefix } from '../config/themePresets';
import { electronService, openFileDialog, fsCopy, fsMkdir, fsExists } from '../services/electronService';
import { getStorageConfig, initStorageConfig } from '../store/storageConfig';
import { saveCharacters, loadCharacters } from '../store/projectStore';

const { TextArea } = Input;
const { Text, Paragraph } = Typography;

interface CharacterDetailModalProps {
  open: boolean;
  character: Character | null;
  projectId: string;
  theme?: string;
  stylePrompt?: string;
  ttiConfigId?: string;
  itvConfigId?: string;
  onClose: () => void;
  onUpdate: (character: Character) => void;
  onDelete: (characterId: string) => void;
}

type GeneratingType = 'costume' | 'threeView' | 'video' | 'extract' | null;

export const CharacterDetailModal: React.FC<CharacterDetailModalProps> = ({
  open,
  character,
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
  const [editedCharacter, setEditedCharacter] = useState<Character | null>(null);
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
    if (character && open) {
      setEditedCharacter({ ...character });
      form.setFieldsValue({
        name: character.name,
        role: character.role,
        age: character.age,
        description: character.description,
        appearance: character.appearance,
      });
      setCustomPrompt(character.customPrompt || '');
      setIsPromptEditing(false);
    }
  }, [character, open, form]);

  // 自动生成的提示词
  const autoPrompt = useMemo(() => {
    if (!editedCharacter) return '';
    return getCharacterPrompt(
      { ...editedCharacter, customPrompt: undefined },
      theme,
      stylePrompt
    );
  }, [editedCharacter, theme, stylePrompt]);

  // 当前使用的提示词
  const currentPrompt = customPrompt || autoPrompt;

  // 获取资产路径
  const getAssetPath = useCallback(async (subPath: string) => {
    if (!editedCharacter) return '';
    const config = getStorageConfig() || (await initStorageConfig());
    const basePath = `${config.rootPath}/projects/${projectId}/assets/characters/${editedCharacter.id}`;
    const fullPath = `${basePath}/${subPath}`;
    const dir = fullPath.substring(0, fullPath.lastIndexOf('/'));
    if (!(await fsExists(dir))) {
      await fsMkdir(dir);
    }
    return fullPath;
  }, [projectId, editedCharacter?.id]);

  // 保存角色信息
  const handleSave = useCallback(async () => {
    if (!editedCharacter) return;

    try {
      const values = await form.validateFields();
      const updatedCharacter: Character = {
        ...editedCharacter,
        ...values,
        customPrompt: customPrompt || undefined,
      };

      // 更新存储
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
  }, [editedCharacter, form, customPrompt, projectId, onUpdate, message]);

  // 生成定妆照
  const handleGenerateCostume = useCallback(async () => {
    if (!editedCharacter) return;

    setGenerating('costume');
    setProgress(0);

    try {
      // 使用自定义提示词（如果有）
      const charWithPrompt = { ...editedCharacter, customPrompt: customPrompt || undefined };
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
        const updated = { ...editedCharacter, costumePhotoPath: result.path };
        setEditedCharacter(updated);
        onUpdate(updated);
        message.success('定妆照生成完成');
      } else {
        message.error(result.error || '生成失败');
      }
    } catch (err: any) {
      message.error(err.message || '生成失败');
    } finally {
      setGenerating(null);
    }
  }, [editedCharacter, projectId, theme, stylePrompt, ttiConfigId, customPrompt, onUpdate, message]);

  // 上传定妆照
  const handleUploadCostume = useCallback(async () => {
    if (!editedCharacter) return;

    try {
      const result = await openFileDialog({
        filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
        title: '选择定妆照',
      });
      if (result.canceled || !result.filePaths[0]) return;

      const destPath = await getAssetPath('costume.png');
      await fsCopy(result.filePaths[0], destPath);

      const updated = { ...editedCharacter, costumePhotoPath: destPath };
      setEditedCharacter(updated);
      onUpdate(updated);

      // 同步保存
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

  // 生成三视图
  const handleGenerateThreeView = useCallback(async () => {
    if (!editedCharacter) return;

    setGenerating('threeView');
    setProgress(0);

    try {
      const result = await generateThreeView({
        projectId,
        character: editedCharacter,
        theme,
        stylePrompt,
        ttiConfigId,
        onProgress: (p, step) => {
          setProgress(p);
          setProgressStep(step);
        },
      });

      if (result.success && result.paths) {
        const updated = { ...editedCharacter, threeViewPaths: result.paths };
        setEditedCharacter(updated);
        onUpdate(updated);
        message.success('三视图生成完成');
      } else {
        message.error(result.error || '生成失败');
      }
    } catch (err: any) {
      message.error(err.message || '生成失败');
    } finally {
      setGenerating(null);
    }
  }, [editedCharacter, projectId, theme, stylePrompt, ttiConfigId, onUpdate, message]);

  // 上传单个视图
  const handleUploadView = useCallback(async (view: 'front' | 'side' | 'back') => {
    if (!editedCharacter) return;

    const viewLabels = { front: '正面', side: '侧面', back: '背面' };

    try {
      const result = await openFileDialog({
        filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
        title: `选择${viewLabels[view]}视图`,
      });
      if (result.canceled || !result.filePaths[0]) return;

      const destPath = await getAssetPath(`three-view/${view}.png`);
      await fsCopy(result.filePaths[0], destPath);

      const updated: Character = {
        ...editedCharacter,
        threeViewPaths: {
          ...editedCharacter.threeViewPaths,
          [view]: destPath,
        },
      };
      setEditedCharacter(updated);
      onUpdate(updated);

      // 同步保存
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

  // 生成预览视频
  const handleGenerateVideo = useCallback(async () => {
    if (!editedCharacter) return;

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
        const updated = { ...editedCharacter, previewVideoPath: result.path };
        setEditedCharacter(updated);
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
  }, [editedCharacter, projectId, itvConfigId, onUpdate, message]);

  // 上传预览视频
  const handleUploadVideo = useCallback(async () => {
    if (!editedCharacter) return;

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

      // 同步保存
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

  // 提取角色
  const handleExtractCharacter = useCallback(async () => {
    if (!editedCharacter) return;

    if (!editedCharacter.previewVideoPath) {
      message.warning('请先生成或上传预览视频');
      return;
    }

    setGenerating('extract');
    setProgress(0);
    setProgressStep('提取角色中...');

    try {
      const result = await extractAndBindCharacter(projectId, editedCharacter, itvConfigId);

      if (result.success && result.characterId) {
        const updated = { ...editedCharacter, sora2CharacterId: result.characterId };
        setEditedCharacter(updated);
        onUpdate(updated);

        // 同步保存
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

  // 删除角色
  const handleDelete = useCallback(async () => {
    if (!editedCharacter) return;
    onDelete(editedCharacter.id);
    onClose();
  }, [editedCharacter, onDelete, onClose]);

  // 转换本地路径为可显示URL
  const toLocalUrl = (path?: string) => path ? electronService.fs.toLocalUrl(path) : '';

  if (!editedCharacter) return null;

  const roleOptions = [
    { value: 'protagonist', label: '主角' },
    { value: 'antagonist', label: '反派' },
    { value: 'supporting', label: '配角' },
  ];

  return (
    <>
      <Modal
        title={
          <Space>
            <UserOutlined />
            <span>角色详情: {editedCharacter.name}</span>
          </Space>
        }
        open={open}
        onCancel={onClose}
        width={900}
        footer={
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <Popconfirm
              title="确定删除此角色？"
              description="删除后无法恢复"
              onConfirm={handleDelete}
              okText="删除"
              cancelText="取消"
              okButtonProps={{ danger: true }}
            >
              <Button danger icon={<DeleteOutlined />}>
                删除角色
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
          {/* 左侧：定妆照 */}
          <Col span={8}>
            <div style={{ marginBottom: 16 }}>
              <Text strong style={{ display: 'block', marginBottom: 8 }}>定妆照</Text>
              <div
                style={{
                  aspectRatio: '2/3',
                  background: '#1a1a1a',
                  borderRadius: 8,
                  overflow: 'hidden',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: editedCharacter.costumePhotoPath ? 'pointer' : 'default',
                }}
                onClick={() => editedCharacter.costumePhotoPath && setPreviewImage(toLocalUrl(editedCharacter.costumePhotoPath))}
              >
                {editedCharacter.costumePhotoPath ? (
                  <img
                    src={toLocalUrl(editedCharacter.costumePhotoPath)}
                    alt="定妆照"
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                ) : (
                  <Text type="secondary">未生成</Text>
                )}
              </div>
              <Space style={{ marginTop: 8, width: '100%' }} wrap>
                <Button
                  icon={generating === 'costume' ? <LoadingOutlined /> : <ThunderboltOutlined />}
                  onClick={handleGenerateCostume}
                  disabled={generating !== null}
                >
                  {editedCharacter.costumePhotoPath ? '重新生成' : '生成'}
                </Button>
                <Button icon={<UploadOutlined />} onClick={handleUploadCostume} disabled={generating !== null}>
                  上传
                </Button>
              </Space>
            </div>
          </Col>

          {/* 右侧：基础信息 */}
          <Col span={16}>
            <Form form={form} layout="vertical" size="small">
              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item name="name" label="名称" rules={[{ required: true, message: '请输入名称' }]}>
                    <Input />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="role" label="角色类型">
                    <Select options={roleOptions} />
                  </Form.Item>
                </Col>
              </Row>
              <Form.Item name="age" label="年龄">
                <Input placeholder="如：28岁" />
              </Form.Item>
              <Form.Item name="description" label="人物描述">
                <TextArea rows={2} placeholder="人物性格、背景..." />
              </Form.Item>
              <Form.Item name="appearance" label="外貌描述（用于AI生成）">
                <TextArea rows={2} placeholder="如：黑发，深邃眼神，身穿西装..." />
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
              {currentPrompt || '(无提示词)'}
            </div>
          )}
          {customPrompt && (
            <Text type="secondary" style={{ fontSize: 11, marginTop: 4, display: 'block' }}>
              使用自定义提示词 · <a onClick={() => setCustomPrompt('')}>恢复自动</a>
            </Text>
          )}
        </div>

        <Divider />

        {/* 三视图 */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <Text strong>三视图</Text>
            <Button
              icon={generating === 'threeView' ? <LoadingOutlined /> : <ThunderboltOutlined />}
              onClick={handleGenerateThreeView}
              disabled={generating !== null}
              size="small"
            >
              一键生成
            </Button>
          </div>
          <Row gutter={12}>
            {(['front', 'side', 'back'] as const).map(view => {
              const viewLabels = { front: '正面', side: '侧面', back: '背面' };
              const path = editedCharacter.threeViewPaths?.[view];
              return (
                <Col span={8} key={view}>
                  <div
                    style={{
                      aspectRatio: '2/3',
                      background: '#1a1a1a',
                      borderRadius: 8,
                      overflow: 'hidden',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: path ? 'pointer' : 'default',
                      marginBottom: 8,
                    }}
                    onClick={() => path && setPreviewImage(toLocalUrl(path))}
                  >
                    {path ? (
                      <img
                        src={toLocalUrl(path)}
                        alt={viewLabels[view]}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                    ) : (
                      <Text type="secondary">{viewLabels[view]}</Text>
                    )}
                  </div>
                  <Button
                    size="small"
                    block
                    icon={<UploadOutlined />}
                    onClick={() => handleUploadView(view)}
                    disabled={generating !== null}
                  >
                    上传{viewLabels[view]}
                  </Button>
                </Col>
              );
            })}
          </Row>
        </div>

        <Divider />

        {/* 预览视频 & 角色提取 */}
        <Row gutter={24}>
          <Col span={12}>
            <Text strong style={{ display: 'block', marginBottom: 8 }}>预览视频</Text>
            <div
              style={{
                aspectRatio: '9/16',
                maxHeight: 200,
                background: '#1a1a1a',
                borderRadius: 8,
                overflow: 'hidden',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {editedCharacter.previewVideoPath ? (
                <video
                  src={toLocalUrl(editedCharacter.previewVideoPath)}
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
                disabled={generating !== null || !editedCharacter.costumePhotoPath}
              >
                {editedCharacter.previewVideoPath ? '重新生成' : '生成'}
              </Button>
              <Button icon={<UploadOutlined />} onClick={handleUploadVideo} disabled={generating !== null}>
                上传
              </Button>
            </Space>
          </Col>

          <Col span={12}>
            <Text strong style={{ display: 'block', marginBottom: 8 }}>Sora2 角色绑定</Text>
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
              {editedCharacter.sora2CharacterId ? (
                <>
                  <CheckCircleOutlined style={{ fontSize: 24, color: '#52c41a', marginBottom: 8 }} />
                  <Text type="success">已绑定</Text>
                  <Text type="secondary" style={{ fontSize: 10, wordBreak: 'break-all', marginTop: 4 }}>
                    {editedCharacter.sora2CharacterId}
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
              onClick={handleExtractCharacter}
              disabled={generating !== null || !editedCharacter.previewVideoPath}
            >
              {editedCharacter.sora2CharacterId ? '重新提取' : '提取角色'}
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

export default CharacterDetailModal;

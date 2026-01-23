/**
 * 角色详情面板
 * 内嵌式面板，无弹窗
 */
import React, { useState, useCallback, useMemo, useEffect } from 'react';
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
  UserOutlined,
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
import type { Character } from '../../types';
import {
  generateCostumePhoto,
  generateCharacterPreviewVideo,
  extractAndBindCharacter,
  getCharacterPrompt,
} from '../../workflow/characterAssetWorkflow';
import { electronService, openFileDialog, fsCopy, fsMkdir, fsExists } from '../../services/electronService';
import { getStorageConfig, initStorageConfig } from '../../store/storageConfig';
import { saveCharacters, loadCharacters } from '../../store/projectStore';

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

  const [editedCharacter, setEditedCharacter] = useState<Character>(character);
  const [isPromptEditing, setIsPromptEditing] = useState(false);
  const [customPrompt, setCustomPrompt] = useState('');

  const [generating, setGenerating] = useState<GeneratingType>(null);
  const [progress, setProgress] = useState(0);
  const [progressStep, setProgressStep] = useState('');

  const [previewImage, setPreviewImage] = useState<string | null>(null);

  // 角色变化时更新
  useEffect(() => {
    setEditedCharacter(character);
    form.setFieldsValue({
      name: character.name,
      role: character.role,
      age: character.age,
      description: character.description,
      appearance: character.appearance,
    });
    setCustomPrompt(character.customPrompt || '');
    setIsPromptEditing(false);
  }, [character, form]);

  const autoPrompt = useMemo(() => {
    return getCharacterPrompt(
      { ...editedCharacter, customPrompt: undefined },
      theme,
      stylePrompt
    );
  }, [editedCharacter, theme, stylePrompt]);

  const currentPrompt = customPrompt || autoPrompt;

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
        customPrompt: customPrompt || undefined,
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
  }, [editedCharacter, form, customPrompt, projectId, onUpdate, message]);

  const handleGenerateCostume = useCallback(async () => {
    setGenerating('costume');
    setProgress(0);

    try {
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
        const updated = {
          ...editedCharacter,
          costumePhotoPath: result.path,
          costumePhotoUrl: result.url,
        };
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

  const handleUploadCostume = useCallback(async () => {
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
      <div className="assetDetailHeader">
        <Space>
          <UserOutlined />
          <Text strong>{editedCharacter.name}</Text>
        </Space>
        <Space>
          <Popconfirm
            title="确定删除此角色？"
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
            <Text strong className="assetDetailLabel">定妆照（三视图）</Text>
            <div
              className="assetDetailImage"
              style={{ aspectRatio: '3/2' }}
              onClick={() => editedCharacter.costumePhotoPath && setPreviewImage(toLocalUrl(editedCharacter.costumePhotoPath))}
            >
              {editedCharacter.costumePhotoPath ? (
                <img src={toLocalUrl(editedCharacter.costumePhotoPath)} alt="定妆照" />
              ) : (
                <Text type="secondary">未生成</Text>
              )}
            </div>
            <Space className="assetDetailActions">
              <Button
                size="small"
                icon={generating === 'costume' ? <LoadingOutlined /> : <ThunderboltOutlined />}
                onClick={handleGenerateCostume}
                disabled={generating !== null}
              >
                {editedCharacter.costumePhotoPath ? '重新生成' : '生成'}
              </Button>
              <Button size="small" icon={<UploadOutlined />} onClick={handleUploadCostume} disabled={generating !== null}>
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
              {editedCharacter.previewVideoPath ? (
                <video src={toLocalUrl(editedCharacter.previewVideoPath)} controls />
              ) : (
                <Text type="secondary">未生成</Text>
              )}
            </div>
            <Space className="assetDetailActions">
              <Button
                size="small"
                icon={generating === 'video' ? <LoadingOutlined /> : <PlayCircleOutlined />}
                onClick={handleGenerateVideo}
                disabled={generating !== null || !editedCharacter.costumePhotoPath}
              >
                {editedCharacter.previewVideoPath ? '重新生成' : '生成'}
              </Button>
              <Button size="small" icon={<UploadOutlined />} onClick={handleUploadVideo} disabled={generating !== null}>
                上传
              </Button>
            </Space>
          </Col>

          <Col span={12}>
            <Text strong className="assetDetailLabel">Sora2 角色绑定</Text>
            <div className="assetDetailBinding">
              {editedCharacter.sora2CharacterId ? (
                <>
                  <CheckCircleOutlined className="bindingIconSuccess" />
                  <Text type="success">已绑定</Text>
                  <Text type="secondary" className="bindingId">{editedCharacter.sora2CharacterId}</Text>
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
              onClick={handleExtractCharacter}
              disabled={generating !== null || !editedCharacter.previewVideoPath}
            >
              {editedCharacter.sora2CharacterId ? '重新提取' : '提取角色'}
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

export default CharacterDetailPanel;

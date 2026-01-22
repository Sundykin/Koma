/**
 * 场景详情面板
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
  EnvironmentOutlined,
  EditOutlined,
  SaveOutlined,
  DeleteOutlined,
  UploadOutlined,
  ThunderboltOutlined,
  CheckCircleOutlined,
  LoadingOutlined,
} from '@ant-design/icons';
import type { Scene } from '../../types';
import { generateSceneImage } from '../../workflow/scenePropAssetWorkflow';
import { electronService, openFileDialog, fsCopy, fsMkdir, fsExists } from '../../services/electronService';
import { getStorageConfig, initStorageConfig } from '../../store/storageConfig';
import { saveScenes, loadScenes } from '../../store/projectStore';

const { TextArea } = Input;
const { Text } = Typography;

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
  const { message } = App.useApp();
  const [form] = Form.useForm();

  const [editedScene, setEditedScene] = useState<Scene>(scene);
  const [isPromptEditing, setIsPromptEditing] = useState(false);
  const [customPrompt, setCustomPrompt] = useState('');

  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressStep, setProgressStep] = useState('');

  const [previewImage, setPreviewImage] = useState<string | null>(null);

  useEffect(() => {
    setEditedScene(scene);
    form.setFieldsValue({
      name: scene.name,
      location: scene.location,
      time: scene.time,
      mood: scene.mood,
      description: scene.description,
    });
    setCustomPrompt(scene.customPrompt || '');
    setIsPromptEditing(false);
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
        customPrompt: customPrompt || undefined,
      };

      const scenes = await loadScenes(projectId);
      const index = scenes.findIndex(s => s.id === editedScene.id);
      if (index !== -1) {
        scenes[index] = updatedScene;
        await saveScenes(projectId, scenes);
      }

      setEditedScene(updatedScene);
      onUpdate(updatedScene);
      message.success('保存成功');
    } catch (err: any) {
      message.error(err.message || '保存失败');
    }
  }, [editedScene, form, customPrompt, projectId, onUpdate, message]);

  const handleGenerateImage = useCallback(async () => {
    setGenerating(true);
    setProgress(0);

    try {
      const sceneWithPrompt = { ...editedScene, customPrompt: customPrompt || undefined };
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
          imagePath: result.path,
        };
        setEditedScene(updated);
        onUpdate(updated);
        message.success('场景图生成完成');
      } else {
        message.error(result.error || '生成失败');
      }
    } catch (err: any) {
      message.error(err.message || '生成失败');
    } finally {
      setGenerating(false);
    }
  }, [editedScene, projectId, theme, stylePrompt, ttiConfigId, customPrompt, onUpdate, message]);

  const handleUploadImage = useCallback(async () => {
    try {
      const result = await openFileDialog({
        filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
        title: '选择场景图',
      });
      if (result.canceled || !result.filePaths[0]) return;

      const destPath = await getAssetPath('scene.png');
      await fsCopy(result.filePaths[0], destPath);

      const updated = { ...editedScene, imagePath: destPath };
      setEditedScene(updated);
      onUpdate(updated);

      const scenes = await loadScenes(projectId);
      const index = scenes.findIndex(s => s.id === editedScene.id);
      if (index !== -1) {
        scenes[index] = updated;
        await saveScenes(projectId, scenes);
      }

      message.success('上传成功');
    } catch (err: any) {
      message.error(`上传失败: ${err.message}`);
    }
  }, [editedScene, getAssetPath, projectId, onUpdate, message]);

  const handleDelete = useCallback(async () => {
    onDelete(editedScene.id);
  }, [editedScene.id, onDelete]);

  const toLocalUrl = (path?: string) => path ? electronService.fs.toLocalUrl(path) : '';

  const timeOptions = [
    { value: 'day', label: '白天' },
    { value: 'night', label: '夜晚' },
    { value: 'dusk', label: '黄昏' },
    { value: 'dawn', label: '黎明' },
  ];

  // 自动生成提示词
  const autoPrompt = `${editedScene.name}, ${editedScene.location || ''}, ${editedScene.time === 'day' ? 'daytime' : editedScene.time === 'night' ? 'nighttime' : editedScene.time}, ${editedScene.mood || ''}, ${editedScene.description || ''}`.replace(/,\s*,/g, ',').trim();
  const currentPrompt = customPrompt || autoPrompt;

  return (
    <div className="assetDetailPanel">
      <div className="assetDetailHeader">
        <Space>
          <EnvironmentOutlined />
          <Text strong>{editedScene.name}</Text>
        </Space>
        <Space>
          <Popconfirm
            title="确定删除此场景？"
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
            <Text strong className="assetDetailLabel">场景图</Text>
            <div
              className="assetDetailImage"
              style={{ aspectRatio: '16/9' }}
              onClick={() => editedScene.imagePath && setPreviewImage(toLocalUrl(editedScene.imagePath))}
            >
              {editedScene.imagePath ? (
                <img src={toLocalUrl(editedScene.imagePath)} alt="场景图" />
              ) : (
                <Text type="secondary">未生成</Text>
              )}
            </div>
            <Space className="assetDetailActions">
              <Button
                size="small"
                icon={generating ? <LoadingOutlined /> : <ThunderboltOutlined />}
                onClick={handleGenerateImage}
                disabled={generating}
              >
                {editedScene.imagePath ? '重新生成' : '生成'}
              </Button>
              <Button size="small" icon={<UploadOutlined />} onClick={handleUploadImage} disabled={generating}>
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
                  <Form.Item name="time" label="时间">
                    <Select options={timeOptions} />
                  </Form.Item>
                </Col>
              </Row>
              <Form.Item name="location" label="地点">
                <Input placeholder="如：咖啡厅、公园、办公室..." />
              </Form.Item>
              <Form.Item name="mood" label="氛围">
                <Input placeholder="如：温馨、紧张、神秘..." />
              </Form.Item>
              <Form.Item name="description" label="场景描述（用于AI生成）">
                <TextArea rows={3} placeholder="详细描述场景的环境、布置、光线等..." />
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

export default SceneDetailPanel;

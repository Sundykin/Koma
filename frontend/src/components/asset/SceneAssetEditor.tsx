/**
 * 场景资产编辑器
 * 简化版：只显示名称、预览图和提示词
 */
import React, { useState, useCallback, useEffect } from 'react';
import { Button, Input, Space, Progress, Typography, App } from 'antd';
import { ThunderboltOutlined, UploadOutlined, EditOutlined, CheckOutlined, LoadingOutlined } from '@ant-design/icons';
import type { Scene } from '../../types';
import { generateSceneImage, getScenePrompt } from '../../workflow/scenePropAssetWorkflow';
import { openFileDialog, fsCopy, fsMkdir, fsExists, electronService } from '../../services/electronService';
import { getStorageConfig, initStorageConfig } from '../../store/storageConfig';
import { createStoredMediaAsset } from '../../utils/mediaAssets';
import { getScenePreviewImageSource } from '../../utils/mediaSelectors';

const { TextArea } = Input;
const { Text } = Typography;

interface SceneAssetEditorProps {
  projectId: string;
  scene: Scene;
  theme?: string;
  stylePrompt?: string;
  ttiSelection?: string;
  onUpdate: (updates: Partial<Scene>) => void;
}

export const SceneAssetEditor: React.FC<SceneAssetEditorProps> = ({
  projectId,
  scene,
  theme,
  stylePrompt,
  ttiSelection,
  onUpdate,
}) => {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState({ value: 0, step: '' });
  const [isEditing, setIsEditing] = useState(false);
  const [promptDraft, setPromptDraft] = useState(scene.prompt || '');

  const autoPrompt = getScenePrompt(scene, theme, stylePrompt);
  const currentPrompt = promptDraft.trim() || autoPrompt;

  useEffect(() => {
    setPromptDraft(scene.prompt || '');
  }, [scene.id, scene.prompt]);

  const handleGenerate = useCallback(async () => {
    setLoading(true);
    setProgress({ value: 0, step: '准备中...' });

    try {
      const sceneWithPrompt = { ...scene, prompt: currentPrompt };
      const result = await generateSceneImage({
        projectId,
        scene: sceneWithPrompt,
        theme,
        stylePrompt,
        ttiSelection,
        onProgress: (value, step) => {
          setProgress({ value, step: step || '' });
        },
      });

      if (result.success && result.path) {
        onUpdate({
          media: {
            ...(scene.media || {}),
            previewImage: createStoredMediaAsset('image', {
              localPath: result.path,
              remoteUrl: result.url,
            }),
          },
          prompt: currentPrompt,
        });
        message.success('场景图生成完成');
      } else {
        message.error(result.error || '生成失败');
      }
    } catch (err: any) {
      message.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [projectId, scene, theme, stylePrompt, ttiSelection, currentPrompt, onUpdate, message]);

  const handleUpload = useCallback(async () => {
    try {
      const result = await openFileDialog({
        filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
        title: '选择场景预览图',
      });
      if (result.canceled || !result.filePaths[0]) return;

      const config = getStorageConfig() || (await initStorageConfig());
      const basePath = `${config.rootPath}/projects/${projectId}/assets/scenes/${scene.id}`;
      if (!(await fsExists(basePath))) {
        await fsMkdir(basePath);
      }
      const destPath = `${basePath}/preview.png`;
      await fsCopy(result.filePaths[0], destPath);
      onUpdate({
        media: {
          ...(scene.media || {}),
          previewImage: createStoredMediaAsset('image', { localPath: destPath }),
        },
      });
      message.success('上传成功');
    } catch (err: any) {
      message.error(`上传失败: ${err.message}`);
    }
  }, [projectId, scene.id, onUpdate, message]);

  const handleSavePrompt = () => {
    onUpdate({ prompt: currentPrompt });
    setIsEditing(false);
    message.success('提示词已保存');
  };

  const toLocalUrl = (path?: string) => path ? electronService.fs.toLocalUrl(path) : '';

  return (
    <div
      style={{
        padding: 12,
        background: '#1a1a1a',
        borderRadius: 8,
        border: '1px solid #27272a',
      }}
    >
      {/* 头部：名称 + 操作按钮 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <Text strong style={{ fontSize: 14 }}>{scene.name}</Text>
        <Space size="small">
          <Button
            size="small"
            icon={loading ? <LoadingOutlined /> : <ThunderboltOutlined />}
            onClick={handleGenerate}
            disabled={loading}
          >
            {getScenePreviewImageSource(scene) ? '重新生成' : '生成'}
          </Button>
          <Button size="small" icon={<UploadOutlined />} onClick={handleUpload} disabled={loading}>
            上传
          </Button>
        </Space>
      </div>

      {/* 进度条 */}
      {loading && (
        <div style={{ marginBottom: 12 }}>
          <Text type="secondary" style={{ fontSize: 12 }}>{progress.step}</Text>
          <Progress percent={Math.round(progress.value)} size="small" strokeColor="#52c41a" />
        </div>
      )}

      {/* 预览图 */}
      <div
        style={{
          aspectRatio: '16/9',
          background: '#09090b',
          borderRadius: 6,
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 12,
        }}
      >
        {getScenePreviewImageSource(scene) ? (
          <img
            src={toLocalUrl(getScenePreviewImageSource(scene))}
            alt={scene.name}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <Text type="secondary">未生成预览图</Text>
        )}
      </div>

      {/* 提示词编辑 */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <Text type="secondary" style={{ fontSize: 11 }}>生成提示词</Text>
          <Button
            type="text"
            size="small"
            icon={isEditing ? <CheckOutlined /> : <EditOutlined />}
            onClick={isEditing ? handleSavePrompt : () => setIsEditing(true)}
          >
            {isEditing ? '保存' : '编辑'}
          </Button>
        </div>
        <TextArea
          value={isEditing ? promptDraft : currentPrompt}
          onChange={(e) => setPromptDraft(e.target.value)}
          rows={2}
          placeholder="描述场景..."
          disabled={!isEditing}
          style={{
            background: isEditing ? '#09090b' : '#141414',
            borderColor: isEditing ? '#3f3f46' : '#27272a',
            fontSize: 12,
          }}
        />
        {scene.prompt && (
          <Text type="secondary" style={{ fontSize: 10, marginTop: 4, display: 'block' }}>
            使用已保存提示词 · <a onClick={() => { setPromptDraft(autoPrompt); onUpdate({ prompt: autoPrompt }); }}>恢复自动模板</a>
          </Text>
        )}
      </div>
    </div>
  );
};

export default SceneAssetEditor;

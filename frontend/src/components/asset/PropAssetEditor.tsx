/**
 * 道具资产编辑器
 * 简化版：只显示名称、参考图和提示词
 */
import React, { useState, useCallback } from 'react';
import { Button, Input, Space, Progress, Typography, App } from 'antd';
import { ThunderboltOutlined, UploadOutlined, EditOutlined, CheckOutlined, LoadingOutlined } from '@ant-design/icons';
import type { Prop } from '../../types';
import { generatePropImage, getPropPrompt } from '../../workflow/scenePropAssetWorkflow';
import { openFileDialog, fsCopy, fsMkdir, fsExists, electronService } from '../../services/electronService';
import { getStorageConfig, initStorageConfig } from '../../store/storageConfig';
import { createStoredMediaAsset } from '../../utils/mediaAssets';
import { getPropPreviewImageSource } from '../../utils/mediaSelectors';

const { TextArea } = Input;
const { Text } = Typography;

interface PropAssetEditorProps {
  projectId: string;
  prop: Prop;
  theme?: string;
  stylePrompt?: string;
  ttiConfigId?: string;
  onUpdate: (updates: Partial<Prop>) => void;
}

export const PropAssetEditor: React.FC<PropAssetEditorProps> = ({
  projectId,
  prop,
  theme,
  stylePrompt,
  ttiConfigId,
  onUpdate,
}) => {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState({ value: 0, step: '' });
  const [isEditing, setIsEditing] = useState(false);
  const [customPrompt, setCustomPrompt] = useState(prop.customPrompt || '');

  // 自动生成的提示词
  const autoPrompt = getPropPrompt(prop, theme, stylePrompt);
  const currentPrompt = prop.customPrompt || autoPrompt;

  const handleGenerate = useCallback(async () => {
    setLoading(true);
    setProgress({ value: 0, step: '准备中...' });

    try {
      const propWithPrompt = { ...prop, customPrompt: customPrompt || undefined };
      const result = await generatePropImage({
        projectId,
        prop: propWithPrompt,
        theme,
        stylePrompt,
        ttiConfigId,
        onProgress: (value, step) => {
          setProgress({ value, step: step || '' });
        },
      });

      if (result.success && result.path) {
        onUpdate({
          media: {
            ...(prop.media || {}),
            previewImage: createStoredMediaAsset('image', {
              localPath: result.path,
              remoteUrl: result.url,
            }),
          },
          customPrompt: customPrompt || undefined,
        });
        message.success('参考图生成完成');
      } else {
        message.error('参考图生成失败，请检查图像生成配置');
      }
    } catch {
      message.error('参考图生成失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  }, [projectId, prop, theme, stylePrompt, ttiConfigId, customPrompt, onUpdate, message]);

  const handleUpload = useCallback(async () => {
    try {
      const result = await openFileDialog({
        filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
        title: '选择道具参考图',
      });
      if (result.canceled || !result.filePaths[0]) return;

      const config = getStorageConfig() || (await initStorageConfig());
      const basePath = `${config.rootPath}/projects/${projectId}/assets/props/${prop.id}`;
      if (!(await fsExists(basePath))) {
        await fsMkdir(basePath);
      }
      const destPath = `${basePath}/reference.png`;
      await fsCopy(result.filePaths[0], destPath);
      onUpdate({
        media: {
          ...(prop.media || {}),
          previewImage: createStoredMediaAsset('image', { localPath: destPath }),
        },
      });
      message.success('上传成功');
    } catch {
      message.error('上传失败，请检查文件格式后重试');
    }
  }, [projectId, prop.id, onUpdate, message]);

  const handleSavePrompt = () => {
    onUpdate({ customPrompt: customPrompt || undefined });
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
        <Text strong style={{ fontSize: 14 }}>{prop.name}</Text>
        <Space size="small">
          <Button
            size="small"
            icon={loading ? <LoadingOutlined /> : <ThunderboltOutlined />}
            onClick={handleGenerate}
            disabled={loading}
          >
            {getPropPreviewImageSource(prop) ? '重新生成' : '生成'}
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

      {/* 参考图 */}
      <div
        style={{
          aspectRatio: '1/1',
          maxHeight: 150,
          background: '#f5f5f5',
          borderRadius: 6,
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 12,
        }}
      >
        {getPropPreviewImageSource(prop) ? (
          <img
            src={toLocalUrl(getPropPreviewImageSource(prop))}
            alt={prop.name}
            style={{ width: '100%', height: '100%', objectFit: 'contain' }}
          />
        ) : (
          <Text type="secondary">未生成参考图</Text>
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
          value={isEditing ? customPrompt : currentPrompt}
          onChange={(e) => setCustomPrompt(e.target.value)}
          rows={2}
          placeholder="描述道具..."
          disabled={!isEditing}
          style={{
            background: isEditing ? '#09090b' : '#141414',
            borderColor: isEditing ? '#3f3f46' : '#27272a',
            fontSize: 12,
          }}
        />
        {prop.customPrompt && (
          <Text type="secondary" style={{ fontSize: 10, marginTop: 4, display: 'block' }}>
            使用自定义提示词 · <a onClick={() => { setCustomPrompt(''); onUpdate({ customPrompt: undefined }); }}>恢复自动</a>
          </Text>
        )}
      </div>
    </div>
  );
};

export default PropAssetEditor;

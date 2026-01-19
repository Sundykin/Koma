/**
 * 道具资产编辑器
 * 显示和管理道具的参考图
 */
import React, { useState, useCallback } from 'react';
import type { Prop } from '../types';
import { generatePropImage } from '../workflow/scenePropAssetWorkflow';
import { openFileDialog, fsCopy, fsMkdir, fsExists } from '../services/electronService';
import { getStorageConfig, initStorageConfig } from '../store/storageConfig';

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
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState({ value: 0, step: '' });
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = useCallback(async () => {
    setLoading(true);
    setError(null);
    setProgress({ value: 0, step: '准备中...' });

    try {
      const result = await generatePropImage({
        projectId,
        prop,
        theme,
        stylePrompt,
        ttiConfigId,
        onProgress: (value, step) => {
          setProgress({ value, step: step || '' });
        },
      });

      if (result.success && result.path) {
        // 同时保存本地路径和远程URL
        onUpdate({ imagePath: result.path, imageUrl: (result as any).url });
      } else {
        setError(result.error || '生成失败');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [projectId, prop, theme, stylePrompt, ttiConfigId, onUpdate]);

  // 上传道具图片
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
      onUpdate({ imagePath: destPath });
    } catch (err: any) {
      setError(`上传失败: ${err.message}`);
    }
  }, [projectId, prop.id, onUpdate]);

  const containerStyle: React.CSSProperties = {
    padding: '12px',
    backgroundColor: 'var(--bg-secondary, #f5f5f5)',
    borderRadius: '8px',
  };

  const headerStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '12px',
  };

  const imageContainerStyle: React.CSSProperties = {
    width: '100%',
    height: '150px',
    backgroundColor: '#ddd',
    borderRadius: '4px',
    overflow: 'hidden',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  };

  const imageStyle: React.CSSProperties = {
    width: '100%',
    height: '100%',
    objectFit: 'contain',
    backgroundColor: 'white',
  };

  const buttonStyle: React.CSSProperties = {
    padding: '6px 12px',
    fontSize: '12px',
    cursor: loading ? 'not-allowed' : 'pointer',
    border: 'none',
    borderRadius: '4px',
    backgroundColor: loading ? '#ccc' : 'var(--color-primary, #1976d2)',
    color: 'white',
  };

  const uploadButtonStyle: React.CSSProperties = {
    ...buttonStyle,
    backgroundColor: 'transparent',
    color: 'var(--color-primary, #1976d2)',
    border: '1px solid var(--color-primary, #1976d2)',
    marginLeft: '4px',
  };

  const infoStyle: React.CSSProperties = {
    marginTop: '8px',
    fontSize: '12px',
    color: '#666',
  };

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>
        <div>
          <strong>{prop.name}</strong>
          {prop.type && <div style={{ fontSize: '12px', color: '#666' }}>{prop.type}</div>}
        </div>
        <div style={{ display: 'flex' }}>
          <button
            style={buttonStyle}
            onClick={handleGenerate}
            disabled={loading}
          >
            {loading ? '生成中...' : prop.imagePath ? '重新生成' : '生成'}
          </button>
          <button
            style={uploadButtonStyle}
            onClick={handleUpload}
            disabled={loading}
          >
            上传
          </button>
        </div>
      </div>

      {loading && (
        <div style={{ marginBottom: '8px' }}>
          <div style={{ fontSize: '12px', marginBottom: '4px' }}>{progress.step}</div>
          <div style={{ height: '4px', backgroundColor: '#ddd', borderRadius: '2px' }}>
            <div
              style={{
                height: '100%',
                width: `${progress.value}%`,
                backgroundColor: 'var(--color-primary, #1976d2)',
                borderRadius: '2px',
                transition: 'width 0.3s',
              }}
            />
          </div>
        </div>
      )}

      {error && (
        <div style={{ color: 'red', fontSize: '12px', marginBottom: '8px' }}>{error}</div>
      )}

      <div style={imageContainerStyle}>
        {prop.imagePath ? (
          <img src={prop.imagePath} alt={prop.name} style={imageStyle} />
        ) : (
          <span style={{ color: '#999' }}>未生成参考图</span>
        )}
      </div>

      {prop.description && (
        <div style={infoStyle}>
          {prop.description}
        </div>
      )}
    </div>
  );
};

export default PropAssetEditor;

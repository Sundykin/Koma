/**
 * 场景资产编辑器
 * 显示和管理场景的预览图
 */
import React, { useState, useCallback } from 'react';
import type { Scene } from '../types';
import { generateSceneImage } from '../workflow/scenePropAssetWorkflow';

interface SceneAssetEditorProps {
  projectId: string;
  scene: Scene;
  theme?: string;
  stylePrompt?: string;
  ttiConfigId?: string;
  onUpdate: (updates: Partial<Scene>) => void;
}

export const SceneAssetEditor: React.FC<SceneAssetEditorProps> = ({
  projectId,
  scene,
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
      const result = await generateSceneImage({
        projectId,
        scene,
        theme,
        stylePrompt,
        ttiConfigId,
        onProgress: (value, step) => {
          setProgress({ value, step: step || '' });
        },
      });

      if (result.success && result.path) {
        onUpdate({ imagePath: result.path });
      } else {
        setError(result.error || '生成失败');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [projectId, scene, theme, stylePrompt, ttiConfigId, onUpdate]);

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
    height: '200px',
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
    objectFit: 'cover',
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

  const infoStyle: React.CSSProperties = {
    marginTop: '8px',
    fontSize: '12px',
    color: '#666',
  };

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>
        <div>
          <strong>{scene.name}</strong>
          <div style={{ fontSize: '12px', color: '#666' }}>{scene.location}</div>
        </div>
        <button
          style={buttonStyle}
          onClick={handleGenerate}
          disabled={loading}
        >
          {loading ? '生成中...' : scene.imagePath ? '重新生成' : '生成预览图'}
        </button>
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
        {scene.imagePath ? (
          <img src={scene.imagePath} alt={scene.name} style={imageStyle} />
        ) : (
          <span style={{ color: '#999' }}>未生成预览图</span>
        )}
      </div>

      <div style={infoStyle}>
        <div>时间: {scene.time === 'day' ? '白天' : scene.time === 'night' ? '夜晚' : '黄昏'}</div>
        {scene.mood && <div>氛围: {scene.mood}</div>}
      </div>
    </div>
  );
};

export default SceneAssetEditor;

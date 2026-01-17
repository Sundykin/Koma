/**
 * 角色资产编辑器
 * 显示和管理角色的定妆照、三视图、预览视频
 */
import React, { useState, useCallback } from 'react';
import type { Character } from '../types';
import {
  generateCostumePhoto,
  generateThreeView,
  generateCharacterPreviewVideo,
  extractAndBindCharacter,
} from '../workflow/characterAssetWorkflow';

interface CharacterAssetEditorProps {
  projectId: string;
  character: Character;
  theme?: string;
  stylePrompt?: string;
  ttiConfigId?: string;
  itvConfigId?: string;
  onUpdate: (updates: Partial<Character>) => void;
}

interface GenerationProgress {
  type: 'costume' | 'threeView' | 'video' | 'extract';
  progress: number;
  step: string;
}

export const CharacterAssetEditor: React.FC<CharacterAssetEditorProps> = ({
  projectId,
  character,
  theme,
  stylePrompt,
  ttiConfigId,
  itvConfigId,
  onUpdate,
}) => {
  const [loading, setLoading] = useState<GenerationProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 生成定妆照
  const handleGenerateCostume = useCallback(async () => {
    setLoading({ type: 'costume', progress: 0, step: '准备中...' });
    setError(null);

    try {
      const result = await generateCostumePhoto({
        projectId,
        character,
        theme,
        stylePrompt,
        ttiConfigId,
        onProgress: (progress, step) => {
          setLoading({ type: 'costume', progress, step: step || '' });
        },
      });

      if (result.success && result.path) {
        onUpdate({ costumePhotoPath: result.path });
      } else {
        setError(result.error || '生成失败');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(null);
    }
  }, [projectId, character, theme, stylePrompt, ttiConfigId, onUpdate]);

  // 生成三视图
  const handleGenerateThreeView = useCallback(async () => {
    setLoading({ type: 'threeView', progress: 0, step: '准备中...' });
    setError(null);

    try {
      const result = await generateThreeView({
        projectId,
        character,
        theme,
        stylePrompt,
        ttiConfigId,
        onProgress: (progress, step) => {
          setLoading({ type: 'threeView', progress, step: step || '' });
        },
      });

      if (result.success && result.paths) {
        onUpdate({ threeViewPaths: result.paths });
      } else {
        setError(result.error || '生成失败');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(null);
    }
  }, [projectId, character, theme, stylePrompt, ttiConfigId, onUpdate]);

  // 生成预览视频
  const handleGenerateVideo = useCallback(async () => {
    if (!character.costumePhotoPath) {
      setError('请先生成定妆照');
      return;
    }

    setLoading({ type: 'video', progress: 0, step: '准备中...' });
    setError(null);

    try {
      const result = await generateCharacterPreviewVideo({
        projectId,
        character,
        itvConfigId,
        onProgress: (progress, step) => {
          setLoading({ type: 'video', progress, step: step || '' });
        },
      });

      if (result.success && result.path) {
        onUpdate({ previewVideoPath: result.path });
      } else {
        setError(result.error || '生成失败');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(null);
    }
  }, [projectId, character, itvConfigId, onUpdate]);

  // 提取角色
  const handleExtractCharacter = useCallback(async () => {
    if (!character.previewVideoPath) {
      setError('请先生成预览视频');
      return;
    }

    setLoading({ type: 'extract', progress: 0, step: '提取角色中...' });
    setError(null);

    try {
      const result = await extractAndBindCharacter(projectId, character, itvConfigId);
      if (result.success && result.characterId) {
        onUpdate({ sora2CharacterId: result.characterId });
      } else {
        setError(result.error || '提取失败');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(null);
    }
  }, [projectId, character, itvConfigId, onUpdate]);

  // 一键生成所有资产
  const handleGenerateAll = useCallback(async () => {
    await handleGenerateCostume();
    if (character.costumePhotoPath) {
      await handleGenerateThreeView();
      await handleGenerateVideo();
    }
  }, [handleGenerateCostume, handleGenerateThreeView, handleGenerateVideo, character.costumePhotoPath]);

  const containerStyle: React.CSSProperties = {
    padding: '16px',
    backgroundColor: 'var(--bg-secondary, #f5f5f5)',
    borderRadius: '8px',
  };

  const headerStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '16px',
  };

  const gridStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '16px',
  };

  const assetCardStyle: React.CSSProperties = {
    padding: '12px',
    backgroundColor: 'var(--bg-primary, white)',
    borderRadius: '8px',
    textAlign: 'center',
  };

  const imageStyle: React.CSSProperties = {
    width: '100%',
    height: '150px',
    objectFit: 'cover',
    borderRadius: '4px',
    backgroundColor: '#eee',
  };

  const buttonStyle: React.CSSProperties = {
    marginTop: '8px',
    padding: '6px 12px',
    fontSize: '12px',
    cursor: 'pointer',
    border: 'none',
    borderRadius: '4px',
    backgroundColor: 'var(--color-primary, #1976d2)',
    color: 'white',
  };

  const isLoading = loading !== null;

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>
        <h3 style={{ margin: 0 }}>{character.name} - 资产管理</h3>
        <button
          style={buttonStyle}
          onClick={handleGenerateAll}
          disabled={isLoading}
        >
          一键生成全部
        </button>
      </div>

      {error && (
        <div style={{ color: 'red', marginBottom: '12px', fontSize: '14px' }}>
          {error}
        </div>
      )}

      {loading && (
        <div style={{ marginBottom: '12px' }}>
          <div style={{ fontSize: '14px', marginBottom: '4px' }}>{loading.step}</div>
          <div style={{ height: '4px', backgroundColor: '#ddd', borderRadius: '2px' }}>
            <div
              style={{
                height: '100%',
                width: `${loading.progress}%`,
                backgroundColor: 'var(--color-primary, #1976d2)',
                borderRadius: '2px',
                transition: 'width 0.3s',
              }}
            />
          </div>
        </div>
      )}

      <div style={gridStyle}>
        {/* 定妆照 */}
        <div style={assetCardStyle}>
          <h4 style={{ margin: '0 0 8px 0', fontSize: '14px' }}>定妆照</h4>
          {character.costumePhotoPath ? (
            <img src={character.costumePhotoPath} alt="定妆照" style={imageStyle} />
          ) : (
            <div style={{ ...imageStyle, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999' }}>
              未生成
            </div>
          )}
          <button
            style={buttonStyle}
            onClick={handleGenerateCostume}
            disabled={isLoading}
          >
            {character.costumePhotoPath ? '重新生成' : '生成定妆照'}
          </button>
        </div>

        {/* 三视图 */}
        <div style={assetCardStyle}>
          <h4 style={{ margin: '0 0 8px 0', fontSize: '14px' }}>三视图</h4>
          <div style={{ display: 'flex', gap: '4px' }}>
            {['front', 'side', 'back'].map(view => (
              <div key={view} style={{ flex: 1, textAlign: 'center' }}>
                {character.threeViewPaths?.[view as 'front' | 'side' | 'back'] ? (
                  <img
                    src={character.threeViewPaths[view as 'front' | 'side' | 'back']}
                    alt={view}
                    style={{ ...imageStyle, height: '80px' }}
                  />
                ) : (
                  <div style={{ ...imageStyle, height: '80px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', color: '#999' }}>
                    {view === 'front' ? '正面' : view === 'side' ? '侧面' : '背面'}
                  </div>
                )}
              </div>
            ))}
          </div>
          <button
            style={buttonStyle}
            onClick={handleGenerateThreeView}
            disabled={isLoading}
          >
            生成三视图
          </button>
        </div>

        {/* 预览视频 */}
        <div style={assetCardStyle}>
          <h4 style={{ margin: '0 0 8px 0', fontSize: '14px' }}>预览视频</h4>
          {character.previewVideoPath ? (
            <video
              src={character.previewVideoPath}
              controls
              style={{ ...imageStyle, objectFit: 'contain' }}
            />
          ) : (
            <div style={{ ...imageStyle, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999' }}>
              未生成
            </div>
          )}
          <button
            style={buttonStyle}
            onClick={handleGenerateVideo}
            disabled={isLoading || !character.costumePhotoPath}
          >
            生成预览视频
          </button>
        </div>

        {/* 角色提取 */}
        <div style={assetCardStyle}>
          <h4 style={{ margin: '0 0 8px 0', fontSize: '14px' }}>Sora2 角色绑定</h4>
          <div style={{ ...imageStyle, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
            {character.sora2CharacterId ? (
              <>
                <div style={{ fontSize: '12px', color: '#4caf50' }}>已绑定</div>
                <div style={{ fontSize: '10px', color: '#666', marginTop: '4px', wordBreak: 'break-all' }}>
                  {character.sora2CharacterId}
                </div>
              </>
            ) : (
              <div style={{ color: '#999' }}>未绑定</div>
            )}
          </div>
          <button
            style={buttonStyle}
            onClick={handleExtractCharacter}
            disabled={isLoading || !character.previewVideoPath}
          >
            {character.sora2CharacterId ? '重新提取' : '提取角色'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CharacterAssetEditor;

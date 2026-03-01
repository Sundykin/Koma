/**
 * Script Stage 组件
 * Clip 编辑器 + Assets 面板
 */

import React, { useState, useCallback } from 'react';
import { ClipList } from './ClipList';
import { AssetsPanel } from './AssetsPanel';
import type { Clip, Character, Location } from '../types';
import './ScriptStage.css';

interface ScriptStageProps {
  projectId: string;
  clips: Clip[];
  characters: Character[];
  locations: Location[];
  onClipUpdate?: (clipId: string, updates: Partial<Clip>) => Promise<void>;
  onCharacterUpdate?: (characterId: string, updates: Partial<Character>) => Promise<void>;
  onLocationUpdate?: (locationId: string, updates: Partial<Location>) => Promise<void>;
  onGenerateStoryboard?: () => Promise<void>;
}

export function ScriptStage({
  projectId,
  clips,
  characters,
  locations,
  onClipUpdate,
  onCharacterUpdate,
  onLocationUpdate,
  onGenerateStoryboard,
}: ScriptStageProps) {
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const handleClipEdit = useCallback((clip: Clip) => {
    // TODO: 打开 Clip 编辑弹窗
    console.log('[ScriptStage] Edit clip:', clip);
  }, []);

  const handleCharacterEdit = useCallback((character: Character) => {
    // TODO: 打开角色编辑弹窗
    console.log('[ScriptStage] Edit character:', character);
  }, []);

  const handleCharacterGenerateImage = useCallback((character: Character) => {
    // TODO: 生成角色图片
    console.log('[ScriptStage] Generate character image:', character);
  }, []);

  const handleLocationEdit = useCallback((location: Location) => {
    // TODO: 打开场景编辑弹窗
    console.log('[ScriptStage] Edit location:', location);
  }, []);

  const handleLocationGenerateImage = useCallback((location: Location) => {
    // TODO: 生成场景图片
    console.log('[ScriptStage] Generate location image:', location);
  }, []);

  const handleAICreateCharacter = useCallback(() => {
    // TODO: AI 生成角色
    console.log('[ScriptStage] AI create character');
  }, []);

  const handleAICreateLocation = useCallback(() => {
    // TODO: AI 生成场景
    console.log('[ScriptStage] AI create location');
  }, []);

  const handleGenerateStoryboard = async () => {
    if (clips.length === 0) {
      alert('请先生成 Clip');
      return;
    }

    setIsGenerating(true);
    try {
      await onGenerateStoryboard?.();
    } catch (error) {
      console.error('[ScriptStage] Generate storyboard failed:', error);
      alert('生成分镜失败');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="script-stage">
      <div className="script-header">
        <div className="header-info">
          <h2>剧本编辑</h2>
          <p className="header-subtitle">
            编辑 Clip 内容，管理角色和场景资产
          </p>
        </div>
        <button
          className="btn-generate-storyboard"
          onClick={handleGenerateStoryboard}
          disabled={clips.length === 0 || isGenerating}
        >
          {isGenerating ? (
            <>
              <span className="spinner">⟳</span>
              生成中...
            </>
          ) : (
            <>
              <span className="icon">🎬</span>
              生成分镜
            </>
          )}
        </button>
      </div>

      <div className="script-content">
        <div className="script-main">
          <ClipList
            clips={clips}
            selectedClipId={selectedClipId}
            onClipSelect={setSelectedClipId}
            onClipEdit={handleClipEdit}
          />
        </div>

        <div className="script-sidebar">
          <AssetsPanel
            projectId={projectId}
            characters={characters}
            locations={locations}
            onCharacterEdit={handleCharacterEdit}
            onCharacterGenerateImage={handleCharacterGenerateImage}
            onLocationEdit={handleLocationEdit}
            onLocationGenerateImage={handleLocationGenerateImage}
            onAICreateCharacter={handleAICreateCharacter}
            onAICreateLocation={handleAICreateLocation}
          />
        </div>
      </div>
    </div>
  );
}

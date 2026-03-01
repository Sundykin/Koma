/**
 * Character Section 组件
 * 角色资源管理区域
 */

import React, { useState } from 'react';
import { CharacterCard } from './CharacterCard';
import type { Character } from '../types';
import './CharacterSection.css';

interface CharacterSectionProps {
  projectId: string;
  characters: Character[];
  onCreate: () => void;
  onUpdate: (characterId: string, updates: Partial<Character>) => void;
  onDelete: (characterId: string) => void;
  onGenerateImage: (characterId: string) => void;
}

export function CharacterSection({
  projectId,
  characters,
  onCreate,
  onUpdate,
  onDelete,
  onGenerateImage,
}: CharacterSectionProps) {
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  return (
    <div className="character-section">
      {/* Toolbar */}
      <div className="section-toolbar">
        <h3>角色列表</h3>
        <button className="btn-primary" onClick={onCreate}>
          + 添加角色
        </button>
      </div>

      {/* Character Grid */}
      {characters.length === 0 ? (
        <div className="empty-state">
          <p>暂无角色</p>
          <button className="btn-secondary" onClick={onCreate}>
            创建第一个角色
          </button>
        </div>
      ) : (
        <div className="character-grid">
          {characters.map((character) => (
            <CharacterCard
              key={character.id}
              character={character}
              onUpdate={(updates) => onUpdate(character.id, updates)}
              onDelete={() => onDelete(character.id)}
              onGenerateImage={() => onGenerateImage(character.id)}
              onImageClick={setPreviewImage}
            />
          ))}
        </div>
      )}

      {/* Image Preview Modal */}
      {previewImage && (
        <div className="image-preview-modal" onClick={() => setPreviewImage(null)}>
          <div className="preview-content">
            <img src={previewImage} alt="Preview" />
            <button className="close-button" onClick={() => setPreviewImage(null)}>
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

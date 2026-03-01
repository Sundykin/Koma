/**
 * Character Card 组件
 * 角色卡片
 */

import React from 'react';
import type { Character } from '../types';
import './CharacterCard.css';

interface CharacterCardProps {
  character: Character;
  onEdit?: () => void;
  onGenerateImage?: () => void;
}

export function CharacterCard({
  character,
  onEdit,
  onGenerateImage,
}: CharacterCardProps) {
  return (
    <div className="character-card">
      <div className="character-image">
        {character.imageUrl ? (
          <img src={character.imageUrl} alt={character.name} />
        ) : (
          <div className="character-placeholder">
            <span>{character.name.charAt(0)}</span>
          </div>
        )}
      </div>

      <div className="character-info">
        <div className="character-name">{character.name}</div>
        {character.description && (
          <div className="character-description">{character.description}</div>
        )}
      </div>

      <div className="character-actions">
        <button className="btn-icon" onClick={onEdit} title="编辑">
          ✏️
        </button>
        {!character.imageUrl && (
          <button className="btn-icon" onClick={onGenerateImage} title="生成图片">
            🎨
          </button>
        )}
      </div>
    </div>
  );
}

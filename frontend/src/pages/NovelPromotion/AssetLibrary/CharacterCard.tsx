/**
 * Character Card 组件
 * 单个角色卡片
 */

import React, { useState } from 'react';
import type { Character } from '../types';
import './CharacterCard.css';

interface CharacterCardProps {
  character: Character;
  onUpdate: (updates: Partial<Character>) => void;
  onDelete: () => void;
  onGenerateImage: () => void;
  onImageClick: (imageUrl: string) => void;
}

export function CharacterCard({
  character,
  onUpdate,
  onDelete,
  onGenerateImage,
  onImageClick,
}: CharacterCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    name: character.name,
    description: character.description,
    appearance: character.appearance,
    personality: character.personality,
  });

  const handleSave = () => {
    onUpdate(editForm);
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditForm({
      name: character.name,
      description: character.description,
      appearance: character.appearance,
      personality: character.personality,
    });
    setIsEditing(false);
  };

  return (
    <div className="character-card">
      {/* Image Section */}
      <div className="character-image-section">
        {character.imageUrl ? (
          <img
            src={character.imageUrl}
            alt={character.name}
            className="character-image"
            onClick={() => onImageClick(character.imageUrl!)}
          />
        ) : (
          <div className="character-image-placeholder">
            <span>暂无图片</span>
          </div>
        )}

        <button className="generate-image-btn" onClick={onGenerateImage}>
          生成图片
        </button>
      </div>

      {/* Info Section */}
      <div className="character-info-section">
        {!isEditing ? (
          <>
            <div className="character-header">
              <h4>{character.name}</h4>
              <div className="action-buttons">
                <button className="btn-icon" onClick={() => setIsEditing(true)}>
                  ✏️
                </button>
                <button className="btn-icon" onClick={onDelete}>
                  🗑️
                </button>
              </div>
            </div>

            <div className="character-details">
              <div className="detail-item">
                <label>描述</label>
                <p>{character.description || '暂无描述'}</p>
              </div>
              <div className="detail-item">
                <label>外貌</label>
                <p>{character.appearance || '暂无外貌描述'}</p>
              </div>
              <div className="detail-item">
                <label>性格</label>
                <p>{character.personality || '暂无性格描述'}</p>
              </div>
            </div>
          </>
        ) : (
          <div className="edit-form">
            <input
              type="text"
              value={editForm.name}
              onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
              placeholder="角色名称"
            />
            <textarea
              value={editForm.description}
              onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
              placeholder="角色描述"
              rows={2}
            />
            <textarea
              value={editForm.appearance}
              onChange={(e) => setEditForm({ ...editForm, appearance: e.target.value })}
              placeholder="外貌特征"
              rows={2}
            />
            <textarea
              value={editForm.personality}
              onChange={(e) => setEditForm({ ...editForm, personality: e.target.value })}
              placeholder="性格特点"
              rows={2}
            />
            <div className="edit-actions">
              <button className="btn-secondary" onClick={handleCancel}>
                取消
              </button>
              <button className="btn-primary" onClick={handleSave}>
                保存
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

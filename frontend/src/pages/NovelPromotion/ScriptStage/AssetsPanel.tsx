/**
 * Assets Panel 组件
 * 角色和场景资产面板
 */

import React from 'react';
import { CharacterCard } from './CharacterCard';
import type { Character, Location } from '../types';
import './AssetsPanel.css';

interface AssetsPanelProps {
  projectId: string;
  characters: Character[];
  locations: Location[];
  onCharacterEdit?: (character: Character) => void;
  onCharacterGenerateImage?: (character: Character) => void;
  onLocationEdit?: (location: Location) => void;
  onLocationGenerateImage?: (location: Location) => void;
  onAICreateCharacter?: () => void;
  onAICreateLocation?: () => void;
}

export function AssetsPanel({
  characters,
  locations,
  onCharacterEdit,
  onCharacterGenerateImage,
  onLocationEdit,
  onLocationGenerateImage,
  onAICreateCharacter,
  onAICreateLocation,
}: AssetsPanelProps) {
  return (
    <div className="assets-panel">
      <div className="assets-section">
        <div className="section-header">
          <h3>角色</h3>
          <span className="asset-count">{characters.length}</span>
        </div>

        <div className="assets-list">
          {characters.length === 0 ? (
            <div className="assets-empty">
              <p>暂无角色</p>
            </div>
          ) : (
            characters.map((character) => (
              <CharacterCard
                key={character.id}
                character={character}
                onEdit={() => onCharacterEdit?.(character)}
                onGenerateImage={() => onCharacterGenerateImage?.(character)}
              />
            ))
          )}
        </div>

        <button className="btn-add-asset" onClick={onAICreateCharacter}>
          <span className="icon">✨</span>
          AI 生成角色
        </button>
      </div>

      <div className="assets-section">
        <div className="section-header">
          <h3>场景</h3>
          <span className="asset-count">{locations.length}</span>
        </div>

        <div className="assets-list">
          {locations.length === 0 ? (
            <div className="assets-empty">
              <p>暂无场景</p>
            </div>
          ) : (
            locations.map((location) => (
              <div key={location.id} className="location-card">
                <div className="location-image">
                  {location.imageUrl ? (
                    <img src={location.imageUrl} alt={location.name} />
                  ) : (
                    <div className="location-placeholder">📍</div>
                  )}
                </div>
                <div className="location-info">
                  <div className="location-name">{location.name}</div>
                  {location.description && (
                    <div className="location-description">{location.description}</div>
                  )}
                </div>
                <div className="location-actions">
                  <button className="btn-icon" onClick={() => onLocationEdit?.(location)} title="编辑">
                    ✏️
                  </button>
                  {!location.imageUrl && (
                    <button className="btn-icon" onClick={() => onLocationGenerateImage?.(location)} title="生成图片">
                      🎨
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        <button className="btn-add-asset" onClick={onAICreateLocation}>
          <span className="icon">✨</span>
          AI 生成场景
        </button>
      </div>
    </div>
  );
}

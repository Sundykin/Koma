/**
 * Asset Library 组件
 * 资源库 - 管理角色、场景等素材
 */

import React, { useState } from 'react';
import { CharacterSection } from './CharacterSection';
import { LocationSection } from './LocationSection';
import type { Character, Location } from '../types';
import './AssetLibrary.css';

interface AssetLibraryProps {
  projectId: string;
  characters: Character[];
  locations: Location[];
  onCharacterCreate: () => void;
  onCharacterUpdate: (characterId: string, updates: Partial<Character>) => void;
  onCharacterDelete: (characterId: string) => void;
  onLocationCreate: () => void;
  onLocationUpdate: (locationId: string, updates: Partial<Location>) => void;
  onLocationDelete: (locationId: string) => void;
  onGenerateImage: (type: 'character' | 'location', id: string) => void;
}

export function AssetLibrary({
  projectId,
  characters,
  locations,
  onCharacterCreate,
  onCharacterUpdate,
  onCharacterDelete,
  onLocationCreate,
  onLocationUpdate,
  onLocationDelete,
  onGenerateImage,
}: AssetLibraryProps) {
  const [activeTab, setActiveTab] = useState<'characters' | 'locations'>('characters');

  const totalAssets = characters.length + locations.length;

  return (
    <div className="asset-library">
      {/* Header */}
      <div className="asset-library-header">
        <div className="header-title">
          <h2>资源库</h2>
          <span className="asset-count">{totalAssets} 个资源</span>
        </div>

        {/* Tab Navigation */}
        <div className="tab-navigation">
          <button
            className={`tab-button ${activeTab === 'characters' ? 'active' : ''}`}
            onClick={() => setActiveTab('characters')}
          >
            角色 ({characters.length})
          </button>
          <button
            className={`tab-button ${activeTab === 'locations' ? 'active' : ''}`}
            onClick={() => setActiveTab('locations')}
          >
            场景 ({locations.length})
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="asset-library-content">
        {activeTab === 'characters' && (
          <CharacterSection
            projectId={projectId}
            characters={characters}
            onCreate={onCharacterCreate}
            onUpdate={onCharacterUpdate}
            onDelete={onCharacterDelete}
            onGenerateImage={(id) => onGenerateImage('character', id)}
          />
        )}

        {activeTab === 'locations' && (
          <LocationSection
            projectId={projectId}
            locations={locations}
            onCreate={onLocationCreate}
            onUpdate={onLocationUpdate}
            onDelete={onLocationDelete}
            onGenerateImage={(id) => onGenerateImage('location', id)}
          />
        )}
      </div>
    </div>
  );
}

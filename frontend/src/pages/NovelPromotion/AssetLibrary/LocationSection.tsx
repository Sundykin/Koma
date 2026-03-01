/**
 * Location Section 组件
 * 场景资源管理区域
 */

import React, { useState } from 'react';
import { LocationCard } from './LocationCard';
import type { Location } from '../types';
import './LocationSection.css';

interface LocationSectionProps {
  projectId: string;
  locations: Location[];
  onCreate: () => void;
  onUpdate: (locationId: string, updates: Partial<Location>) => void;
  onDelete: (locationId: string) => void;
  onGenerateImage: (locationId: string) => void;
}

export function LocationSection({
  projectId,
  locations,
  onCreate,
  onUpdate,
  onDelete,
  onGenerateImage,
}: LocationSectionProps) {
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  return (
    <div className="location-section">
      {/* Toolbar */}
      <div className="section-toolbar">
        <h3>场景列表</h3>
        <button className="btn-primary" onClick={onCreate}>
          + 添加场景
        </button>
      </div>

      {/* Location Grid */}
      {locations.length === 0 ? (
        <div className="empty-state">
          <p>暂无场景</p>
          <button className="btn-secondary" onClick={onCreate}>
            创建第一个场景
          </button>
        </div>
      ) : (
        <div className="location-grid">
          {locations.map((location) => (
            <LocationCard
              key={location.id}
              location={location}
              onUpdate={(updates) => onUpdate(location.id, updates)}
              onDelete={() => onDelete(location.id)}
              onGenerateImage={() => onGenerateImage(location.id)}
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

/**
 * Location Card 组件
 * 单个场景卡片
 */

import React, { useState } from 'react';
import type { Location } from '../types';
import './LocationCard.css';

interface LocationCardProps {
  location: Location;
  onUpdate: (updates: Partial<Location>) => void;
  onDelete: () => void;
  onGenerateImage: () => void;
  onImageClick: (imageUrl: string) => void;
}

export function LocationCard({
  location,
  onUpdate,
  onDelete,
  onGenerateImage,
  onImageClick,
}: LocationCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    name: location.name,
    description: location.description,
  });

  const handleSave = () => {
    onUpdate(editForm);
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditForm({
      name: location.name,
      description: location.description,
    });
    setIsEditing(false);
  };

  return (
    <div className="location-card">
      {/* Image Section */}
      <div className="location-image-section">
        {location.imageUrl ? (
          <img
            src={location.imageUrl}
            alt={location.name}
            className="location-image"
            onClick={() => onImageClick(location.imageUrl!)}
          />
        ) : (
          <div className="location-image-placeholder">
            <span>暂无图片</span>
          </div>
        )}

        <button className="generate-image-btn" onClick={onGenerateImage}>
          生成图片
        </button>
      </div>

      {/* Info Section */}
      <div className="location-info-section">
        {!isEditing ? (
          <>
            <div className="location-header">
              <h4>{location.name}</h4>
              <div className="action-buttons">
                <button className="btn-icon" onClick={() => setIsEditing(true)}>
                  ✏️
                </button>
                <button className="btn-icon" onClick={onDelete}>
                  🗑️
                </button>
              </div>
            </div>

            <div className="location-details">
              <div className="detail-item">
                <label>描述</label>
                <p>{location.description || '暂无描述'}</p>
              </div>
            </div>
          </>
        ) : (
          <div className="edit-form">
            <input
              type="text"
              value={editForm.name}
              onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
              placeholder="场景名称"
            />
            <textarea
              value={editForm.description}
              onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
              placeholder="场景描述"
              rows={3}
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

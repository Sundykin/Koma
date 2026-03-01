/**
 * Episode Manager 组件
 * Episode 选择与管理
 */

import React, { useState } from 'react';
import type { Episode } from '../types';
import './EpisodeManager.css';

interface EpisodeManagerProps {
  projectId: string;
  episodes: Episode[];
  currentEpisodeId: string | null;
  onEpisodeSelect: (episodeId: string) => void;
  onEpisodeCreate: (name: string) => Promise<void>;
  onEpisodeRename: (episodeId: string, name: string) => Promise<void>;
  onEpisodeDelete: (episodeId: string) => Promise<void>;
}

export function EpisodeManager({
  episodes,
  currentEpisodeId,
  onEpisodeSelect,
  onEpisodeCreate,
  onEpisodeRename,
  onEpisodeDelete,
}: EpisodeManagerProps) {
  const [isCreating, setIsCreating] = useState(false);
  const [newEpisodeName, setNewEpisodeName] = useState('');
  const [isRenaming, setIsRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const handleCreate = async () => {
    if (!newEpisodeName.trim()) return;

    try {
      await onEpisodeCreate(newEpisodeName.trim());
      setNewEpisodeName('');
      setIsCreating(false);
    } catch (error) {
      console.error('Failed to create episode:', error);
    }
  };

  const handleRename = async (episodeId: string) => {
    if (!renameValue.trim()) return;

    try {
      await onEpisodeRename(episodeId, renameValue.trim());
      setIsRenaming(null);
      setRenameValue('');
    } catch (error) {
      console.error('Failed to rename episode:', error);
    }
  };

  const handleDelete = async (episodeId: string) => {
    if (!confirm('确定要删除这个 Episode 吗？')) return;

    try {
      await onEpisodeDelete(episodeId);
    } catch (error) {
      console.error('Failed to delete episode:', error);
    }
  };

  const currentEpisode = episodes.find(ep => ep.id === currentEpisodeId);

  return (
    <div className="episode-manager">
      <div className="episode-selector">
        <label>Episode:</label>
        <select
          value={currentEpisodeId || ''}
          onChange={(e) => onEpisodeSelect(e.target.value)}
          disabled={episodes.length === 0}
        >
          {episodes.length === 0 && (
            <option value="">无 Episode</option>
          )}
          {episodes.map((episode) => (
            <option key={episode.id} value={episode.id}>
              {episode.name}
            </option>
          ))}
        </select>
      </div>

      <div className="episode-actions">
        {!isCreating ? (
          <button
            className="btn-create"
            onClick={() => setIsCreating(true)}
          >
            + 新建 Episode
          </button>
        ) : (
          <div className="episode-create-form">
            <input
              type="text"
              value={newEpisodeName}
              onChange={(e) => setNewEpisodeName(e.target.value)}
              placeholder="Episode 名称"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreate();
                if (e.key === 'Escape') {
                  setIsCreating(false);
                  setNewEpisodeName('');
                }
              }}
            />
            <button onClick={handleCreate}>创建</button>
            <button onClick={() => {
              setIsCreating(false);
              setNewEpisodeName('');
            }}>
              取消
            </button>
          </div>
        )}

        {currentEpisode && (
          <>
            {isRenaming === currentEpisode.id ? (
              <div className="episode-rename-form">
                <input
                  type="text"
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  placeholder="新名称"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleRename(currentEpisode.id);
                    if (e.key === 'Escape') {
                      setIsRenaming(null);
                      setRenameValue('');
                    }
                  }}
                />
                <button onClick={() => handleRename(currentEpisode.id)}>确定</button>
                <button onClick={() => {
                  setIsRenaming(null);
                  setRenameValue('');
                }}>
                  取消
                </button>
              </div>
            ) : (
              <>
                <button
                  className="btn-rename"
                  onClick={() => {
                    setIsRenaming(currentEpisode.id);
                    setRenameValue(currentEpisode.name);
                  }}
                >
                  重命名
                </button>
                <button
                  className="btn-delete"
                  onClick={() => handleDelete(currentEpisode.id)}
                >
                  删除
                </button>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

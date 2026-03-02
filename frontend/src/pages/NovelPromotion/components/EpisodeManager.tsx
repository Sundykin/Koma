/**
 * Episode Manager 兼容适配层
 * 复用 components/project/EpisodeManager 主实现
 */

import React from 'react';
import { EpisodeManager as ProjectEpisodeManager } from '../../../components/project/EpisodeManager';
import type { Episode as ProjectEpisode } from '../../../types';
import type { Episode as NovelEpisode } from '../types';

interface EpisodeManagerProps {
  projectId: string;
  episodes: NovelEpisode[];
  currentEpisodeId: string | null;
  onEpisodeSelect: (episodeId: string) => void;
  onEpisodeCreate: (name: string) => Promise<void>;
  onEpisodeRename: (episodeId: string, name: string) => Promise<void>;
  onEpisodeDelete: (episodeId: string) => Promise<void>;
}

const toProjectEpisode = (episode: NovelEpisode, index: number): ProjectEpisode => ({
  id: episode.id,
  projectId: episode.projectId,
  number: index + 1,
  title: episode.name,
  scriptText: episode.novelText,
  status: episode.novelText?.trim() ? 'script' : 'draft',
  createdAt: episode.createdAt,
  updatedAt: episode.updatedAt,
});

export function EpisodeManager({
  projectId,
  episodes,
  currentEpisodeId,
  onEpisodeSelect,
  onEpisodeCreate,
  onEpisodeRename,
  onEpisodeDelete,
}: EpisodeManagerProps) {
  const mappedEpisodes = episodes.map(toProjectEpisode);

  return (
    <ProjectEpisodeManager
      projectId={projectId}
      episodes={mappedEpisodes}
      selectedEpisodeId={currentEpisodeId || undefined}
      loading={false}
      compactMode
      emptyDescription="无 Episode"
      createButtonText="+ 新建 Episode"
      createWithInput
      showScriptEditor={false}
      onEpisodeSelect={(episode) => onEpisodeSelect(episode.id)}
      onCreateEpisode={async ({ title }) => {
        await onEpisodeCreate(title);
      }}
      onUpdateEpisode={async (episodeId, updates) => {
        if (updates.title !== undefined) {
          await onEpisodeRename(episodeId, updates.title);
        }
      }}
      onDeleteEpisode={onEpisodeDelete}
    />
  );
}

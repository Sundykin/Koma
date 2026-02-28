/**
 * 剧集管理
 */
import { v4 as uuidv4 } from 'uuid';
import { electronService } from '../../services/electronService';
import type { Episode } from '../../types';
import { persistenceClient } from '../../utils/ipcRenderer';

export async function createEpisode(
  projectId: string,
  episode: Omit<Episode, 'id' | 'projectId' | 'createdAt' | 'updatedAt'>
): Promise<Episode> {
  if (!electronService.isElectron()) {
    throw new Error('仅支持 Electron 环境');
  }

  const episodeId = uuidv4();
  const now = Date.now();

  const newEpisode: Episode = {
    id: episodeId,
    projectId,
    number: episode.number,
    title: episode.title,
    scriptText: episode.scriptText,
    status: episode.status || 'draft',
    createdAt: now,
    updatedAt: now,
  };

  await persistenceClient.save(projectId, 'episode', newEpisode);
  return newEpisode;
}

export async function loadEpisode(
  projectId: string,
  episodeId: string
): Promise<Episode | null> {
  if (!electronService.isElectron()) return null;

  try {
    return await persistenceClient.findById<Episode>(projectId, 'episode', episodeId);
  } catch {
    return null;
  }
}

export async function saveEpisode(
  projectId: string,
  episodeId: string,
  updates: Partial<Episode>
): Promise<Episode | null> {
  if (!electronService.isElectron()) return null;

  const episode = await loadEpisode(projectId, episodeId);
  if (!episode) return null;

  const updatedEpisode: Episode = {
    ...episode,
    ...updates,
    updatedAt: Date.now(),
  };

  await persistenceClient.save(projectId, 'episode', updatedEpisode);
  return updatedEpisode;
}

export async function deleteEpisode(
  projectId: string,
  episodeId: string
): Promise<boolean> {
  if (!electronService.isElectron()) return false;

  try {
    const result = await persistenceClient.delete(projectId, 'episode', episodeId);
    return result.success;
  } catch {
    return false;
  }
}

export async function listEpisodes(projectId: string): Promise<Episode[]> {
  if (!electronService.isElectron()) return [];

  try {
    const episodes = await persistenceClient.list<Episode>(projectId, 'episode');
    return [...episodes].sort((a, b) => a.number - b.number);
  } catch {
    return [];
  }
}

/**
 * 剧集管理
 */
import { v4 as uuidv4 } from 'uuid';
import { electronService } from '../../services/electronService';
import type { Episode } from '../../types';
import { getProjectPath } from './core';

export async function createEpisode(
  projectId: string,
  episode: Omit<Episode, 'id' | 'projectId' | 'createdAt' | 'updatedAt'>
): Promise<Episode> {
  if (!electronService.isElectron()) {
    throw new Error('仅支持 Electron 环境');
  }

  const episodeId = uuidv4();
  const now = Date.now();
  const projectPath = await getProjectPath(projectId);
  const episodePath = `${projectPath}/episodes/${episodeId}`;

  await electronService.fs.mkdir(episodePath);
  await electronService.fs.mkdir(`${episodePath}/assets`);

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

  await electronService.fs.writeFile(
    `${episodePath}/meta.json`,
    JSON.stringify(newEpisode, null, 2)
  );

  if (episode.scriptText) {
    await electronService.fs.writeFile(
      `${episodePath}/script.txt`,
      episode.scriptText
    );
  }

  return newEpisode;
}

export async function loadEpisode(
  projectId: string,
  episodeId: string
): Promise<Episode | null> {
  if (!electronService.isElectron()) return null;

  try {
    const projectPath = await getProjectPath(projectId);
    const data = await electronService.fs.readFile(
      `${projectPath}/episodes/${episodeId}/meta.json`
    );
    return JSON.parse(data);
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

  const projectPath = await getProjectPath(projectId);
  const episodePath = `${projectPath}/episodes/${episodeId}`;

  const updatedEpisode: Episode = {
    ...episode,
    ...updates,
    updatedAt: Date.now(),
  };

  await electronService.fs.writeFile(
    `${episodePath}/meta.json`,
    JSON.stringify(updatedEpisode, null, 2)
  );

  if (updates.scriptText !== undefined) {
    await electronService.fs.writeFile(
      `${episodePath}/script.txt`,
      updates.scriptText || ''
    );
  }

  return updatedEpisode;
}

export async function deleteEpisode(
  projectId: string,
  episodeId: string
): Promise<boolean> {
  if (!electronService.isElectron()) return false;

  try {
    const projectPath = await getProjectPath(projectId);
    await electronService.fs.remove(`${projectPath}/episodes/${episodeId}`);
    return true;
  } catch {
    return false;
  }
}

export async function listEpisodes(projectId: string): Promise<Episode[]> {
  if (!electronService.isElectron()) return [];

  try {
    const projectPath = await getProjectPath(projectId);
    const episodesPath = `${projectPath}/episodes`;

    const exists = await electronService.fs.exists(episodesPath);
    if (!exists) return [];

    const dirs = await electronService.fs.readdir(episodesPath);
    const episodes: Episode[] = [];

    for (const dir of dirs) {
      const episode = await loadEpisode(projectId, dir);
      if (episode) {
        episodes.push(episode);
      }
    }

    return episodes.sort((a, b) => a.number - b.number);
  } catch {
    return [];
  }
}

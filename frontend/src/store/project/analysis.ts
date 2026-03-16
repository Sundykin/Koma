/**
 * 剧集解析结果存储
 */
import { electronService } from '../../services/electronService';
import type { EpisodeAnalysis, Shot } from '../../types';
import type { TimelineData } from '../../types/editor';
import { getProjectPath } from './core';
import { saveEpisode } from './episodes';

export async function saveEpisodeAnalysis(
  projectId: string,
  episodeId: string,
  analysis: Omit<EpisodeAnalysis, 'episodeId' | 'createdAt' | 'updatedAt'>
): Promise<EpisodeAnalysis> {
  if (!electronService.isElectron()) {
    throw new Error('仅支持 Electron 环境');
  }

  const projectPath = await getProjectPath(projectId);
  const episodePath = `${projectPath}/episodes/${episodeId}`;
  const now = Date.now();

  const existing = await loadEpisodeAnalysis(projectId, episodeId);
  const result: EpisodeAnalysis = {
    episodeId,
    characterRefs: analysis.characterRefs,
    sceneRefs: analysis.sceneRefs,
    propRefs: analysis.propRefs,
    shots: analysis.shots,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };

  await electronService.fs.writeFile(
    `${episodePath}/analysis.json`,
    JSON.stringify(result, null, 2)
  );

  await saveEpisode(projectId, episodeId, { hasAnalysis: true });

  return result;
}

export async function loadEpisodeAnalysis(
  projectId: string,
  episodeId: string
): Promise<EpisodeAnalysis | null> {
  if (!electronService.isElectron()) return null;

  try {
    const projectPath = await getProjectPath(projectId);
    const filePath = `${projectPath}/episodes/${episodeId}/analysis.json`;
    const exists = await electronService.fs.exists(filePath);
    if (!exists) return null;
    const data = await electronService.fs.readFile(filePath);
    return JSON.parse(data);
  } catch {
    return null;
  }
}

export async function loadEpisodeShots(
  projectId: string,
  episodeId: string
): Promise<Shot[]> {
  const analysis = await loadEpisodeAnalysis(projectId, episodeId);
  return Array.isArray(analysis?.shots) ? analysis.shots.filter(Boolean) : [];
}

export async function saveEpisodeShots(
  projectId: string,
  episodeId: string,
  shots: Shot[]
): Promise<void> {
  if (!electronService.isElectron()) return;

  const projectPath = await getProjectPath(projectId);
  const episodePath = `${projectPath}/episodes/${episodeId}`;
  const now = Date.now();

  let analysis = await loadEpisodeAnalysis(projectId, episodeId);
  if (!analysis) {
    analysis = {
      episodeId,
      characterRefs: [],
      sceneRefs: [],
      propRefs: [],
      shots: [],
      createdAt: now,
      updatedAt: now,
    };
  }

  analysis.shots = shots;
  analysis.updatedAt = now;

  await electronService.fs.mkdir(episodePath);
  await electronService.fs.writeFile(
    `${episodePath}/analysis.json`,
    JSON.stringify(analysis, null, 2)
  );

  await saveEpisode(projectId, episodeId, { hasAnalysis: true });
}

export async function loadEpisodeTimeline(
  projectId: string,
  episodeId: string
): Promise<TimelineData | null> {
  if (!electronService.isElectron()) return null;

  const projectPath = await getProjectPath(projectId);
  const timelinePath = `${projectPath}/episodes/${episodeId}/timeline.json`;

  try {
    const exists = await electronService.fs.exists(timelinePath);
    if (!exists) return null;
    const content = await electronService.fs.readFile(timelinePath);
    return JSON.parse(content) as TimelineData;
  } catch {
    return null;
  }
}

export async function saveEpisodeTimeline(
  projectId: string,
  episodeId: string,
  data: Omit<TimelineData, 'updatedAt'>
): Promise<void> {
  if (!electronService.isElectron()) return;

  const projectPath = await getProjectPath(projectId);
  const episodePath = `${projectPath}/episodes/${episodeId}`;

  const timelineData: TimelineData = {
    ...data,
    updatedAt: Date.now(),
  };

  await electronService.fs.mkdir(episodePath);
  await electronService.fs.writeFile(
    `${episodePath}/timeline.json`,
    JSON.stringify(timelineData, null, 2)
  );
}

export async function updateShot(
  projectId: string,
  episodeId: string,
  shotId: string,
  updates: Partial<Shot>
): Promise<Shot | null> {
  const shots = await loadEpisodeShots(projectId, episodeId);
  const index = shots.findIndex(s => s.id === shotId);
  if (index === -1) return null;

  const updatedShot = { ...shots[index], ...updates };
  shots[index] = updatedShot;
  await saveEpisodeShots(projectId, episodeId, shots);

  return updatedShot;
}

export async function deleteEpisodeAnalysis(
  projectId: string,
  episodeId: string
): Promise<boolean> {
  if (!electronService.isElectron()) return false;

  try {
    const projectPath = await getProjectPath(projectId);
    const filePath = `${projectPath}/episodes/${episodeId}/analysis.json`;
    const exists = await electronService.fs.exists(filePath);
    if (exists) {
      await electronService.fs.remove(filePath);
      await saveEpisode(projectId, episodeId, { hasAnalysis: false });
    }
    return true;
  } catch {
    return false;
  }
}

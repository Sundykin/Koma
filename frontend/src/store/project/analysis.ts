/**
 * 剧集解析结果存储
 */
import { electronService } from '../../services/electronService';
import type { EpisodeAnalysis, Shot } from '../../types';
import type { TimelineData } from '../../types/editor';
import { persistenceClient } from '../../utils/ipcRenderer';
import { saveEpisode } from './episodes';

export async function saveEpisodeAnalysis(
  projectId: string,
  episodeId: string,
  analysis: Omit<EpisodeAnalysis, 'episodeId' | 'createdAt' | 'updatedAt'>
): Promise<EpisodeAnalysis> {
  if (!electronService.isElectron()) {
    throw new Error('仅支持 Electron 环境');
  }

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

  await persistenceClient.save(projectId, 'episodeAnalysis', result);
  await saveEpisode(projectId, episodeId, { hasAnalysis: true });

  return result;
}

export async function loadEpisodeAnalysis(
  projectId: string,
  episodeId: string
): Promise<EpisodeAnalysis | null> {
  if (!electronService.isElectron()) return null;

  try {
    return await persistenceClient.findById<EpisodeAnalysis>(projectId, 'episodeAnalysis', episodeId);
  } catch {
    return null;
  }
}

export async function loadEpisodeShots(
  projectId: string,
  episodeId: string
): Promise<Shot[]> {
  const analysis = await loadEpisodeAnalysis(projectId, episodeId);
  const shots = analysis?.shots || [];

  // 运行时兼容：旧数据迁移 + 新字段默认值
  return shots.map(shot => ({
    ...shot,
    // 提示词兼容
    imagePrompt: shot.imagePrompt || shot.description || '',
    videoPrompt: shot.videoPrompt || shot.description || '',
    // 参考图默认值
    referenceImages: Array.isArray(shot.referenceImages) ? shot.referenceImages : [],
    selectedReferenceIndex: typeof shot.selectedReferenceIndex === 'number' ? shot.selectedReferenceIndex : 0,
    // 场景默认值
    scenes: Array.isArray(shot.scenes) ? shot.scenes : [],
  }));
}

export async function saveEpisodeShots(
  projectId: string,
  episodeId: string,
  shots: Shot[]
): Promise<void> {
  if (!electronService.isElectron()) return;

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

  await persistenceClient.save(projectId, 'episodeAnalysis', analysis);
  await saveEpisode(projectId, episodeId, { hasAnalysis: true });
}

export async function loadEpisodeTimeline(
  projectId: string,
  episodeId: string
): Promise<TimelineData | null> {
  if (!electronService.isElectron()) return null;

  try {
    return await persistenceClient.findById<TimelineData>(projectId, 'episodeTimeline', episodeId);
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

  const timelineData: TimelineData = {
    ...data,
    updatedAt: Date.now(),
  };

  await persistenceClient.save(projectId, 'episodeTimeline', {
    ...timelineData,
    episodeId,
  });
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
    const result = await persistenceClient.delete(projectId, 'episodeAnalysis', episodeId);
    if (result.success) {
      await saveEpisode(projectId, episodeId, { hasAnalysis: false });
    }
    return true;
  } catch {
    return false;
  }
}
